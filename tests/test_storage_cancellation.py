import threading
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers.storage_api import CommandBody, command
from app.storage import cancellation, integrite, remote_agent, switch_guard, worker


def state(items, **params):
    job = NS(id=1, status="cancelling", desired_state="cancel", params=params, error=None)
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: items))), commit=AsyncMock())
    return db, job, NS(execute=AsyncMock())


@pytest.mark.asyncio
async def test_cancel_only_removes_recorded_partial_and_never_changes_arr_or_plex(tmp_path, monkeypatch):
    destination = tmp_path / "destination" / "Series"
    destination.mkdir(parents=True)
    completed = destination / "episode1.mkv"
    completed.write_bytes(b"complete")
    partial = destination / "episode2.mkv.partiel"
    partial.write_bytes(b"unfinished")
    unrelated = destination / "foreign.partiel"
    unrelated.write_bytes(b"unrelated")
    snap = dict(
        destination_mount=str(destination.parent),
        relative="Series",
        files=["episode1.mkv", "episode2.mkv"],
        temporary_files=["episode2.mkv"],
        source_arr="/data/SERIES/Series",
    )
    item = NS(status="copying", snapshot=snap, progress={}, reason=None)
    db, job, lease = state([item], transfer_mode="rsync")
    monkeypatch.setattr(worker, "local_media", lambda root, relative: Path(root) / relative)
    arr = AsyncMock()
    monkeypatch.setattr(cancellation, "arr_request", arr)
    assert await cancellation.cancel_transfer(db, job, lease)
    assert job.status == item.status == "cancelled"
    assert not partial.exists()
    assert completed.read_bytes() == b"complete"
    assert unrelated.read_bytes() == b"unrelated"
    assert snap["source_arr"] == "/data/SERIES/Series"
    arr.assert_not_awaited()
    # A restart after cleanup is harmless.
    await cancellation.cancel_transfer(db, job, lease)
    assert completed.exists()


@pytest.mark.parametrize("kind", ["media", "changed", "linked", "ancestor"])
def test_cleanup_refuses_published_changed_or_linked_files(tmp_path, kind):
    partial = tmp_path / ("episode.mkv" if kind == "media" else "episode.mkv.partiel")
    partial.write_bytes(b"original")
    signature = integrite.signature(partial)
    if kind == "changed":
        partial.write_bytes(b"changed contents")
    if kind == "linked":
        (tmp_path / "other").hardlink_to(partial)
    if kind == "ancestor":
        try:
            (tmp_path / "link").symlink_to(tmp_path, target_is_directory=True)
        except OSError:
            pytest.skip("Symlinks unavailable")
        partial = tmp_path / "link" / partial.name
    with pytest.raises(integrite.Arret):
        integrite.discard_partial(str(partial), signature)
    assert partial.exists()


def test_remote_cleanup_is_scoped_and_checks_destination_identity(tmp_path):
    partial = tmp_path / "episode.mkv.partiel"
    partial.write_bytes(b"partial")
    body = dict(op="discard_partial", roots=[str(tmp_path)], path=str(partial), signature=integrite.signature(partial))
    assert remote_agent.dispatch(body, {"discard_partial": integrite.discard_partial}, threading.Event())
    partial.write_bytes(b"changed")
    body["identities"] = {str(tmp_path): [0, 0]}
    with pytest.raises(ValueError, match="remplacé"):
        remote_agent.dispatch(body, {"discard_partial": integrite.discard_partial}, threading.Event())
    assert partial.exists()


@pytest.mark.asyncio
async def test_arr_cancellation_waits_without_blocking_other_jobs(monkeypatch):
    item = NS(status="arr_pending", arr_instance_id=1, snapshot={"arr_command_id": 17}, progress={})
    db, job, lease = state([item], transfer_mode="arr")
    db.get = AsyncMock(return_value=NS(enabled=True))
    arr = AsyncMock(return_value={"status": "started"})
    monkeypatch.setattr(cancellation, "arr_request", arr)
    assert await cancellation.cancel_transfer(db, job, lease) is False
    assert job.status == "cancelling"
    assert item.status == "arr_pending"
    arr.return_value = {"status": "completed"}
    assert await cancellation.cancel_transfer(db, job, lease)
    assert job.status == item.status == "cancelled"
    assert all(call.args[1] == "GET" for call in arr.await_args_list)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "destination,arr_files",
    [(["s1.mkv"], ["s1.mkv", "s2.mkv"]), (["s1.mkv", "s2.mkv"], ["s1.mkv", "s2.mkv", "new.mkv"])],
)
async def test_series_root_never_switches_for_incomplete_or_changed_inventory(destination, arr_files):
    snap = dict(files=["s1.mkv", "s2.mkv"], source_arr="/data/SERIES/Series")
    item = NS(media_type="series", arr_id=1)
    request = AsyncMock(side_effect=[{"path": snap["source_arr"]}, [{"relativePath": name} for name in arr_files]])
    with pytest.raises(ValueError):
        await switch_guard.confirm_complete(None, item, snap, snap["files"], destination, request)
    assert all(call.args[1] == "GET" for call in request.await_args_list)


@pytest.mark.asyncio
async def test_cancel_command_is_durable_and_cannot_resume(monkeypatch):
    from app.storage import service

    job = NS(status="running", auto_resume=True)
    db = NS(get=AsyncMock(return_value=job), commit=AsyncMock())
    monkeypatch.setattr(service, "transfer_json", AsyncMock(return_value={"status": "cancelling"}))
    await command(1, CommandBody(action="cancel"), db)
    assert job.desired_state == "cancel" and job.status == "cancelling" and not job.auto_resume
    with pytest.raises(HTTPException) as exc:
        await command(1, CommandBody(action="resume"), db)
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_invalid_partial_inventory_blocks_cleanup_without_removing_files(tmp_path, monkeypatch):
    destination = tmp_path / "Series"
    destination.mkdir()
    partial = destination / "episode.mkv.partiel"
    partial.write_bytes(b"keep")
    item = NS(
        status="copying",
        snapshot={
            "destination_mount": str(tmp_path),
            "relative": "Series",
            "files": ["episode.mkv"],
            "temporary_files": ["../episode.mkv"],
        },
        progress={},
    )
    db, job, lease = state([item], transfer_mode="rsync")
    monkeypatch.setattr(worker, "local_media", lambda root, relative: Path(root) / relative)
    assert await cancellation.cancel_transfer(db, job, lease)
    assert job.status == "cancel_blocked"
    assert item.status == "copying"
    assert partial.read_bytes() == b"keep"


@pytest.mark.asyncio
async def test_complete_series_guard_returns_current_arr_record_without_writing():
    snap = {"files": ["s1.mkv", "poster.jpg"], "source_arr": "/data/SERIES/Series"}
    media = {"path": snap["source_arr"], "title": "Series"}
    request = AsyncMock(side_effect=[media, [{"relativePath": "s1.mkv"}]])
    result = await switch_guard.confirm_complete(
        None, NS(media_type="series", arr_id=1), snap, snap["files"], snap["files"], request
    )
    assert result is media
    assert all(call.args[1] == "GET" for call in request.await_args_list)


@pytest.mark.asyncio
@pytest.mark.parametrize("peer", [True, False])
async def test_ssh_cleanup_uses_destination_endpoint_and_handles_missing_partials(monkeypatch, peer):
    from unittest.mock import Mock

    from app.storage.peer_fs import PeerFilesystem
    from app.storage.remote_fs import RemoteFilesystem

    source = RemoteFilesystem({}, ["/source"], "test")
    destination = RemoteFilesystem({}, ["/destination"], "test")
    source.call = Mock(side_effect=AssertionError("Never delete on source endpoint"))
    signature = ["/destination/Series/e.mkv.partiel", 12, 1, 2, 3, 4]

    def call(op, **kwargs):
        if op == "exists":
            return kwargs["path"].endswith("e.mkv.partiel")
        if op == "signature":
            return signature
        assert op == "discard_partial"
        return True

    destination.call = Mock(side_effect=call)
    fs = PeerFilesystem(source, destination) if peer else destination
    monkeypatch.setattr(cancellation, "filesystem_for", AsyncMock(return_value=fs))
    item = NS(
        status="copying",
        snapshot={
            "destination_mount": "/destination",
            "relative": "Series",
            "files": ["e.mkv", "missing.mkv"],
            "temporary_files": ["e.mkv", "missing.mkv"],
        },
        progress={},
    )
    db, job, lease = state([item], transfer_mode="rsync_ssh")
    await cancellation.cancel_transfer(db, job, lease)
    assert job.status == "cancelled"
    source.call.assert_not_called()
    assert [c for c in destination.call.call_args_list if c.args[0] == "discard_partial"][0].kwargs == {
        "path": "/destination/Series/e.mkv.partiel",
        "signature": signature,
    }


@pytest.mark.asyncio
async def test_uncertain_arr_submission_keeps_task_and_requires_review():
    item = NS(status="arr_pending", snapshot={"arr_submission_intent": True}, progress={})
    db, job, lease = state([item], transfer_mode="arr")
    await cancellation.cancel_transfer(db, job, lease)
    assert job.status == "cancel_blocked" and item.status == "arr_pending"
    assert "non identifiée" in job.error


def test_remote_cleanup_stops_before_deletion(tmp_path):
    partial = tmp_path / "e.mkv.partiel"
    partial.write_bytes(b"keep")
    stop = threading.Event()
    stop.set()
    with pytest.raises(ValueError, match="interrompue"):
        remote_agent.dispatch({"op": "discard_partial", "roots": [str(tmp_path)], "path": str(partial)}, {}, stop)
    assert partial.exists()


@pytest.mark.asyncio
async def test_deletion_intent_is_applied_only_after_safe_cleanup():
    db, job, lease = state([], transfer_mode="rsync", delete_after_cancel=True)
    db.delete = AsyncMock()
    assert await cancellation.cancel_transfer(db, job, lease)
    assert job.status == "cancelled"
    db.delete.assert_awaited_once_with(job)


@pytest.mark.asyncio
async def test_failed_cancellation_retains_deletion_intent_and_proofs(monkeypatch):
    item = NS(status="copying", snapshot={"arr_submission_intent": True}, progress={})
    db, job, lease = state([item], transfer_mode="arr", delete_after_cancel=True)
    db.delete = AsyncMock()
    assert await cancellation.cancel_transfer(db, job, lease)
    assert job.status == "cancel_blocked" and job.params["delete_after_cancel"]
    db.delete.assert_not_awaited()
