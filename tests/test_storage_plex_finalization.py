import asyncio
import threading
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import httpx
import pytest

from app.models import ArrInstance, StorageLocation, StorageTransfer, StorageTransferItem
from app.storage import plex_finalization as finalizer
from app.storage import worker
from app.storage.locks import item_paths, mutation_lock


class Context:
    def __init__(self, value):
        self.value = value

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, *args):
        return False


def item_state():
    return NS(
        id=1,
        transfer_id=3,
        arr_instance_id=2,
        status="plex_pending",
        reason=None,
        progress={},
        snapshot={
            "source_mount": "/data",
            "destination_mount": "/usb",
            "relative": "Film",
            "plex_machine": "server",
            "plex_section_id": "3",
            "destination_plex": "/usb/Film",
            "source_plex": "/data/Film",
        },
    )


@pytest.mark.parametrize(
    "states,expected",
    [
        (["completed"], "completed"),
        (["completed", "plex_pending"], "finalizing"),
        (["plex_pending", "cleaning"], "finalizing"),
        (["completed", "blocked", "plex_pending"], "blocked"),
    ],
)
def test_pending_confirmation_is_not_a_copy_failure(states, expected):
    assert finalizer.transfer_status([NS(status=s) for s in states]) == expected


@pytest.mark.asyncio
async def test_targeted_scans_are_deduplicated_and_survive_restart(monkeypatch):
    item = item_state()
    db = NS(get=AsyncMock(return_value=NS(enabled=True, plex_server_id=1)), commit=AsyncMock())
    monkeypatch.setattr(finalizer, "connection_for", AsyncMock(return_value=NS()))
    scan = AsyncMock()
    monkeypatch.setattr(worker, "plex_get", scan)
    await finalizer.request_scan(db, item, {}, 1000)
    assert scan.await_args.args[1:] == ("/library/sections/3/refresh", {"path": "/usb/Film"})
    assert item.progress["plex_scan_requested_at"] == 1000
    restored = {finalizer.scan_key(item): item.progress["plex_scan_requested_at"]}
    await finalizer.request_scan(db, item, restored, 1001)
    scan.assert_awaited_once()
    await finalizer.request_scan(db, item, restored, 1301)
    assert scan.await_count == 2


@pytest.fixture
def context(monkeypatch):
    item = item_state()
    job = NS(id=3, desired_state="run", status="finalizing")
    db = NS(
        get=AsyncMock(side_effect=lambda model, id: item if model is StorageTransferItem else job), commit=AsyncMock()
    )
    monkeypatch.setattr(finalizer, "AsyncSessionLocal", lambda: Context(db))
    monkeypatch.setattr(finalizer, "request_scan", AsyncMock())
    monkeypatch.setattr(finalizer, "settle_job", AsyncMock())
    monkeypatch.setattr(worker, "process_item", AsyncMock())
    return NS(item=item, job=job, db=db, lease=NS(execute=AsyncMock()), shutdown=threading.Event())


@pytest.mark.asyncio
@pytest.mark.parametrize("desired", ["pause", "stop", "cancel"])
async def test_durable_commands_prevent_scans_and_cleanup(context, desired):
    context.job.desired_state = desired
    await finalizer.finalize_item(1, {}, context.lease, context.shutdown)
    worker.process_item.assert_not_awaited()
    finalizer.request_scan.assert_not_awaited()


@pytest.mark.asyncio
async def test_scan_continues_during_copy_but_cleanup_never_overlaps(context):
    async with mutation_lock(item_paths(context.item)):
        await finalizer.finalize_item(1, {}, context.lease, context.shutdown)
    finalizer.request_scan.assert_awaited_once()
    worker.process_item.assert_not_awaited()


@pytest.mark.asyncio
async def test_finalization_uses_existing_copy_and_records_periodic_checks(context):
    await finalizer.finalize_item(1, {}, context.lease, context.shutdown)
    assert worker.process_item.await_args.kwargs == {"finalize_only": True}
    assert context.item.progress["plex_checks"] == 1
    assert context.item.progress["plex_checked_at"] > 0
    await finalizer.finalize_item(1, {}, context.lease, context.shutdown)
    worker.process_item.assert_awaited_once()


@pytest.mark.asyncio
async def test_temporary_plex_failure_retries_without_touching_original(context):
    finalizer.request_scan.side_effect = httpx.ConnectError("unavailable")
    await finalizer.finalize_item(1, {}, context.lease, context.shutdown)
    assert context.item.status == "plex_pending"
    assert "automatiquement" in context.item.reason
    worker.process_item.assert_not_awaited()


@pytest.mark.asyncio
async def test_lease_loss_stops_cleanup(context):
    context.lease.execute.side_effect = RuntimeError("lost")

    async def process(db, job, item, stop, **kwargs):
        for _ in range(10):
            await asyncio.sleep(0)
            if stop.is_set():
                raise worker.Interrompu()
        pytest.fail("Lease loss must stop finalization")

    worker.process_item.side_effect = process
    with pytest.raises(RuntimeError, match="Verrou"):
        await finalizer.finalize_item(1, {}, context.lease, context.shutdown)


@pytest.mark.asyncio
async def test_source_refresh_is_grouped_only_after_cleanup(monkeypatch):
    a, b = item_state(), item_state()
    a.status = b.status = "completed"
    a.progress = b.progress = {"plex_source_refresh_pending": True}
    results = [NS(scalars=lambda: NS(all=lambda: [a, b])), NS(scalars=lambda: NS(all=lambda: []))]
    db = NS(
        execute=AsyncMock(side_effect=results),
        get=AsyncMock(return_value=NS(enabled=True, plex_server_id=1)),
        commit=AsyncMock(),
    )
    monkeypatch.setattr(finalizer, "AsyncSessionLocal", lambda: Context(db))
    monkeypatch.setattr(finalizer, "connection_for", AsyncMock(return_value=NS()))
    scan = AsyncMock()
    monkeypatch.setattr(worker, "plex_get", scan)
    await finalizer.refresh_sources()
    assert scan.await_count == 1
    assert scan.await_args.args[2] == {"path": "/data"}
    assert not a.progress["plex_source_refresh_pending"] and not b.progress["plex_source_refresh_pending"]


@pytest.mark.asyncio
async def test_persisted_finalization_settles_without_overwriting_pause(async_database):
    async with async_database.session_factory() as db:
        source, destination = (
            StorageLocation(name="Source", mount_path="/source"),
            StorageLocation(name="Target", mount_path="/target"),
        )
        instance = ArrInstance(name="Arr", url="http://arr", api_key="test", arr_type="radarr", enabled=True)
        db.add_all([source, destination, instance])
        await db.flush()
        job = StorageTransfer(source_id=source.id, destination_id=destination.id, status="blocked", desired_state="run")
        db.add(job)
        await db.flush()
        item = StorageTransferItem(
            transfer_id=job.id,
            arr_instance_id=instance.id,
            arr_id=1,
            title="Film",
            media_type="movie",
            size_bytes=10,
            status="plex_pending",
        )
        db.add(item)
        await db.commit()
        await finalizer.settle_job(db, job.id)
        assert job.status == "finalizing"
        job.status, job.desired_state = "paused", "pause"
        item.status = "completed"
        await db.commit()
        await finalizer.settle_job(db, job.id)
        assert job.status == "paused" and job.desired_state == "pause"
        job.status, job.desired_state = "finalizing", "run"
        await db.commit()
        await finalizer.settle_job(db, job.id)
        assert job.status == "completed"


@pytest.mark.asyncio
@pytest.mark.parametrize("paths", [("/B/Other", "/C/Other"), ("/data/Other", "/usb/Other")])
async def test_finalization_continues_during_unrelated_copy(context, paths):
    async with mutation_lock(paths):
        await finalizer.finalize_item(1, {}, context.lease, context.shutdown)
        worker.process_item.assert_awaited_once()
        assert worker.process_item.await_args.kwargs == {"finalize_only": True}
