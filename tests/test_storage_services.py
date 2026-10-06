from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.models import ArrInstance, StorageLocation
from app.routers import storage_api as api
from app.storage import planning, service
from app.utils import now_utc_naive


@pytest.mark.parametrize("mode", ["selection", "release_space", "minimum_free"])
def test_capacity_selection_rules(mode):
    items = [dict(key=str(i), size_bytes=size) for i, size in enumerate([30, 20, 10, 0])]
    plan = planning.choose_candidates(items, mode, 40, 5, 100, 2, {"0", "1", "2", "3"})
    assert len(plan["items"]) <= 2 and plan["planned_bytes"] <= 100
    assert plan["excluded"]
    assert planning.relative_path("/data/other", "/data/films") is None
    assert planning.relative_path("/data/films", "/data/films") is None


@pytest.mark.asyncio
async def test_preview_and_transfer_serialization(monkeypatch):
    monkeypatch.setattr(
        service,
        "resolve_mapping",
        AsyncMock(
            side_effect=lambda db, body: dict(
                comparison={"status": "sample_matched"},
                candidates=[
                    dict(
                        mount_path="/storage/data1" if body.arr_root == "/data/FILMS" else "/storage/usb",
                        subdirectory="FILMS",
                        matched=True,
                    )
                ],
            )
        ),
    )
    mapping = dict(
        arr_instance_id=1, arr_root="/data/FILMS", plex_root="/media/FILMS", plex_section_id="3", subdirectory="FILMS"
    )
    src = StorageLocation(
        id=1,
        name="DATA1",
        mount_path="/storage/data1",
        mappings=[mapping],
        reserve_bytes=0,
        free_bytes=1000,
        total_bytes=2000,
        enabled=True,
        health="ok",
        checked_at=now_utc_naive(),
    )
    target = {**mapping, "arr_root": "/usb/FILMS", "plex_root": "/usb/MEDIA/FILMS"}
    dst = StorageLocation(
        id=2,
        name="USB",
        mount_path="/storage/usb",
        mappings=[target],
        reserve_bytes=0,
        free_bytes=1000,
        total_bytes=2000,
        enabled=True,
        health="ok",
        checked_at=now_utc_naive(),
    )
    instance = NS(id=1, enabled=True, arr_type="radarr")

    async def get(model, id):
        return instance if model is ArrInstance else src if id == 1 else dst

    result = NS(scalar=lambda: 0, all=lambda: [])
    db = NS(get=get, execute=AsyncMock(return_value=result))
    monkeypatch.setattr(
        service,
        "arr_request",
        AsyncMock(
            return_value=[
                dict(id=1, title="Film", path="/data/FILMS/Film", sizeOnDisk=100, tmdbId=10),
                dict(id=2, title="Other", path="/elsewhere/Other", sizeOnDisk=100),
            ]
        ),
    )
    body = api.PreviewBody.model_construct(
        transfer_mode="rsync", source_id=1, destination_id=2, goal_gb=1, selection=["1:1"]
    )
    plan = await service.preview(db, body)
    assert plan["items"][0]["snapshot"]["destination_mount"] == "/storage/usb/FILMS"
    assert plan["items"][0]["snapshot"]["destination_arr"] == "/usb/FILMS/Film"
    src.health = "unavailable"
    with pytest.raises(ValueError):
        await service.preview(db, body)
    src.enabled = False
    with pytest.raises(ValueError):
        await service.preview(db, body)
    body.destination_id = 1
    with pytest.raises(ValueError):
        await service.preview(db, body)


@pytest.mark.asyncio
async def test_location_save_and_commands(monkeypatch):
    instance = NS(id=1, arr_type="radarr")
    existing = StorageLocation(id=1, virtual_key="1:/data/FILMS")
    db = NS(
        get=AsyncMock(return_value=instance),
        execute=AsyncMock(return_value=NS(scalars=lambda: [])),
        flush=AsyncMock(),
        commit=AsyncMock(),
        refresh=AsyncMock(),
        add=lambda obj: None,
    )
    roots = {"arr_roots": ["/data/FILMS"], "plex_roots": [{"path": "/media/FILMS", "section_id": "3"}]}
    monkeypatch.setattr(service, "discover_instance_roots", AsyncMock(return_value=roots))
    body = api.LocationBody(
        name="DATA1",
        mount_path="/storage/data1",
        mappings=[dict(arr_instance_id=1, arr_root="/data/FILMS", plex_root="/media/FILMS", plex_section_id="3")],
    )
    saved = await api.save_location(db, body, existing)
    assert saved["mount_path"] == "/storage/data1" and saved["health"] == "not_checked"
    assert saved["virtual"] is False and existing.virtual_key is None
    await api.create_location(body, db)
    job = NS(status="paused", desired_state="pause")
    db.get = AsyncMock(return_value=job)
    monkeypatch.setattr(service, "transfer_json", AsyncMock(return_value={"id": 2}))
    for action in ["resume", "pause", "stop", "retry"]:
        await api.command(2, api.CommandBody(action=action), db)
    assert job.desired_state == "run" and job.status == "queued"
    job.status = "completed"
    with pytest.raises(HTTPException):
        await api.command(2, api.CommandBody(action="resume"), db)
    db.get = AsyncMock(return_value=None)
    with pytest.raises(HTTPException):
        await api.command(2, api.CommandBody(action="resume"), db)


@pytest.mark.asyncio
async def test_job_creation_does_not_trust_client_selection(monkeypatch):
    added = []

    async def flush():
        added[0].id = 1

    db = NS(execute=AsyncMock(), add=added.append, flush=flush, commit=AsyncMock())
    item = dict(key="1:1", arr_instance_id=1, arr_id=1, title="Film", media_type="movie", size_bytes=100, snapshot={})
    monkeypatch.setattr(
        service, "preview", AsyncMock(return_value={"items": [item], "source": {"id": 1}, "destination": {"id": 2}})
    )
    monkeypatch.setattr(service, "transfer_json", AsyncMock(return_value={"id": 1}))
    body = api.PreviewBody.model_construct(transfer_mode="rsync", source_id=1, destination_id=2, selection=["1:1"])
    assert await api.create_transfer(body, db) == {"id": 1}
    assert len(added) == 2 and added[1].size_bytes == 100
    assert added[0].status == "queued"
    body.start_immediately = False
    await api.create_transfer(body, db)
    assert added[2].status == "draft" and added[2].desired_state == "pause"
    assert "task_id" not in added[2].params

    body.selection = ["9:9"]
    with pytest.raises(HTTPException) as exc:
        await api.create_transfer(body, db)
    assert exc.value.status_code == 409
    body.selection = []
    with pytest.raises(HTTPException):
        await api.create_transfer(body, db)


@pytest.mark.asyncio
async def test_discovery_and_http_shapes(monkeypatch):
    import httpx

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def request(self, *args, **kwargs):
            return httpx.Response(200, json=[], request=httpx.Request("GET", "http://test"))

        async def get(self, *args, **kwargs):
            return httpx.Response(
                200,
                json={
                    "MediaContainer": {
                        "Directory": [
                            {"key": 3, "title": "Films", "type": "movie", "Location": [{"path": "/media/FILMS"}]},
                            {"key": 4, "title": "Series", "type": "show", "Location": [{"path": "/media/SERIES"}]},
                        ]
                    }
                },
                request=httpx.Request("GET", "http://test"),
            )

    monkeypatch.setattr(service.httpx, "AsyncClient", lambda **kwargs: Client())
    instance = NS(id=1, url="http://test", api_key="dummy", plex_server_id=1, arr_type="radarr", name="Radarr")
    assert await service.arr_request(instance, "GET", "rootfolder") == []
    monkeypatch.setattr(service, "arr_request", AsyncMock(return_value=[{"path": "/data/FILMS/"}]))
    monkeypatch.setattr(service, "connection_for", AsyncMock(return_value=NS(id=1, url="http://test", token="dummy")))
    roots = await service.discover_instance_roots(None, instance)
    assert roots["arr_roots"] == ["/data/FILMS"] and len(roots["plex_roots"]) == 1


@pytest.mark.asyncio
async def test_read_only_checks_error_codes(monkeypatch):
    db = NS(get=AsyncMock(return_value=NS(mappings=[{}])))
    mapping = api.MappingBody(arr_instance_id=1, arr_root="/data/FILMS", plex_root="/media/FILMS", plex_section_id="3")
    monkeypatch.setattr(service, "check_mapping", AsyncMock(return_value={"status": "sample_matched"}))
    assert (await api.check_draft_mapping(mapping, db))["status"] == "sample_matched"
    assert (await api.check_mapping(1, 0, db))["status"] == "sample_matched"
    for failure, code in [(ValueError("bad root"), 422), (RuntimeError("offline"), 502)]:
        monkeypatch.setattr(service, "check_mapping", AsyncMock(side_effect=failure))
        for fn, args in [(api.check_draft_mapping, (mapping, db)), (api.check_mapping, (1, 0, db))]:
            with pytest.raises(HTTPException) as exc:
                await fn(*args)
            assert exc.value.status_code == code
    with pytest.raises(HTTPException):
        await api.check_mapping(1, 2, db)


@pytest.mark.asyncio
async def test_migration_guard_requires_live_worker():
    from sqlalchemy.dialects import postgresql

    from app.storage import migration_guard

    captured = []

    async def execute(query):
        captured.append(query)
        return NS(scalars=lambda: [7])

    db = NS(execute=execute)
    assert await migration_guard.guarded_library_ids(db, []) == set()
    assert await migration_guard.guarded_library_ids(db, [7, 8]) == {7}
    compiled = str(captured[0].compile(dialect=postgresql.dialect()))
    assert "worker_seen_at" in compiled and "storage_transfers.status" in compiled


@pytest.mark.asyncio
async def test_saved_job_payload_preserves_telemetry(monkeypatch):
    item = NS(
        id=1,
        title="Film",
        media_type="movie",
        size_bytes=100,
        status="copying",
        reason=None,
        progress={"copied_bytes": 50},
        snapshot={},
        updated_at=now_utc_naive(),
        created_at=now_utc_naive(),
    )
    job = NS(
        id=1,
        source_id=1,
        destination_id=2,
        status="running",
        desired_state="run",
        auto_resume=True,
        params={},
        error=None,
        created_at=now_utc_naive(),
        updated_at=now_utc_naive(),
        worker_seen_at=now_utc_naive(),
    )
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: [item]))))
    data = await service.transfer_json(db, job)
    assert data["planned_bytes"] == 100 and data["released_bytes"] == 0
    assert data["items"][0]["progress"]["copied_bytes"] == 50


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["radarr", "sonarr"])
@pytest.mark.parametrize("has_media", [False, True])
async def test_empty_arr_or_plex_root_is_not_a_mismatch(monkeypatch, kind, has_media):
    from app.storage import worker

    instance = NS(enabled=True, arr_type=kind, plex_server_id=1)
    mapping = dict(arr_instance_id=1, arr_root="/usb/MEDIA", plex_root="/usb/MEDIA", plex_section_id="3")
    db = NS(get=AsyncMock(return_value=instance))
    monkeypatch.setattr(
        service,
        "discover_instance_roots",
        AsyncMock(
            return_value={"arr_roots": ["/usb/MEDIA"], "plex_roots": [{"path": "/usb/MEDIA", "section_id": "3"}]}
        ),
    )
    monkeypatch.setattr(service, "connection_for", AsyncMock(return_value=NS()))
    media = dict(id=1, title="Title", path="/usb/MEDIA/Title", hasFile=True, statistics={"episodeFileCount": 1})
    request = AsyncMock(return_value=[media] if has_media else [])
    monkeypatch.setattr(service, "arr_request", request)
    catalog = AsyncMock(return_value={})
    monkeypatch.setattr(worker, "plex_files", catalog)
    result = await service.check_mapping(db, NS(mappings=[mapping]), 0)
    assert result["status"] == "empty"
    assert result["empty_reason"] == ("plex_empty" if has_media else "arr_empty")
    assert result["checked_titles"] == 0
    assert request.await_count == 1
    assert catalog.await_count == int(has_media)


@pytest.mark.asyncio
async def test_draft_cannot_be_launched_without_new_preview():
    db = NS(get=AsyncMock(return_value=NS(status="draft")), commit=AsyncMock())
    with pytest.raises(HTTPException) as exc:
        await api.command(1, api.CommandBody(action="resume"), db)
    assert exc.value.status_code == 409
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_started_task_cannot_be_edited():
    from unittest.mock import Mock

    result = Mock()
    result.scalar_one_or_none.return_value = NS(status="running")
    db = NS(execute=AsyncMock(return_value=result))
    with pytest.raises(HTTPException) as exc:
        await api.draft_task(db, 1)
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_draft_launch_revalidates_and_replaces_snapshot(monkeypatch):
    job = NS(id=12, status="draft")
    monkeypatch.setattr(api, "draft_task", AsyncMock(return_value=job))
    item = dict(
        key="1:7",
        arr_instance_id=1,
        arr_id=7,
        title="Film",
        media_type="movie",
        size_bytes=123,
        snapshot={"destination_arr": "/usb/FILMS/Film"},
    )
    refresh = AsyncMock(return_value={"items": [item], "source": {"id": 1}, "destination": {"id": 2}})
    monkeypatch.setattr(service, "preview", refresh)
    monkeypatch.setattr(service, "transfer_json", AsyncMock(return_value={"id": 12}))
    added = []
    db = NS(execute=AsyncMock(), add=added.append, flush=AsyncMock(), commit=AsyncMock())
    body = api.PreviewBody(arr_instance_id=1, selection=["1:7"], start_immediately=True)
    await api.update_transfer(12, body, db)
    refresh.assert_awaited_once_with(db, body)
    assert body.task_id == 12 and job.status == "queued" and job.desired_state == "run"
    assert added[0].snapshot == item["snapshot"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_only_draft_and_release_reservations(monkeypatch):
    job = NS(id=14, status="draft")
    db = NS(execute=AsyncMock(return_value=NS(scalar_one_or_none=lambda: job)), delete=AsyncMock(), commit=AsyncMock())
    assert await api.delete_draft(14, db) == {"deleted": 14}
    db.delete.assert_awaited_once_with(job)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["completed", "cancelled"])
async def test_delete_terminal_task_only_forgets_metadata(status):
    job = NS(id=14, status=status)
    db = NS(execute=AsyncMock(return_value=NS(scalar_one_or_none=lambda: job)), delete=AsyncMock(), commit=AsyncMock())
    assert await api.delete_draft(14, db) == {"deleted": 14}
    db.delete.assert_awaited_once_with(job)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["running", "paused", "stopped", "cancel_blocked"])
async def test_delete_active_task_persists_cleanup_before_forgetting(status):
    job = NS(id=14, status=status, params={"transfer_mode": "rsync_ssh"}, desired_state="run", auto_resume=True)
    db = NS(execute=AsyncMock(return_value=NS(scalar_one_or_none=lambda: job)), delete=AsyncMock(), commit=AsyncMock())
    assert await api.delete_draft(14, db) == {"deletion_pending": 14}
    assert job.status == "cancelling" and job.desired_state == "cancel" and not job.auto_resume
    assert job.params["delete_after_cancel"]
    db.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_unknown_task_is_404():
    db = NS(execute=AsyncMock(return_value=NS(scalar_one_or_none=lambda: None)))
    with pytest.raises(HTTPException) as caught:
        await api.delete_draft(404, db)
    assert caught.value.status_code == 404
