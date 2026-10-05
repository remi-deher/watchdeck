import asyncio
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest

from app.routers.storage_api import PreviewBody
from app.storage import preview_jobs
from app.storage.preview_cache import inventory_cache, read_inventory


class Redis:
    def __init__(self):
        self.values = {}

    async def set(self, key, value, nx=False, ex=None):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    async def get(self, key):
        return self.values.get(key)

    async def delete(self, key):
        self.values.pop(key, None)

    async def eval(self, script, count, lock, key):
        if self.values.get(lock) == key:
            self.values.pop(lock)

    async def aclose(self):
        pass


@pytest.mark.asyncio
async def test_inventory_cache_is_scoped_and_does_not_share_mutated_results():
    fetch = AsyncMock(return_value={"files": ["episode"]})
    with inventory_cache():
        result = await read_inventory("root", fetch)
        result["files"].clear()
        assert await read_inventory("root", fetch) == {"files": ["episode"]}
        assert fetch.await_count == 1
    await read_inventory("root", fetch)
    assert fetch.await_count == 2
    with inventory_cache():
        await read_inventory("root", fetch)
    assert fetch.await_count == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [None, ValueError("Correspondance absente"), RuntimeError("secret")])
async def test_background_preview_returns_immediately_and_rolls_back(monkeypatch, error):
    redis = Redis()
    gate = asyncio.Event()
    db = NS(execute=AsyncMock(), rollback=AsyncMock(), commit=AsyncMock())

    @asynccontextmanager
    async def session():
        yield db

    async def preview(db, body):
        await gate.wait()
        if error:
            raise error
        return {"items": [], "planned_bytes": 123}

    monkeypatch.setattr(preview_jobs, "redis_client", lambda: redis)
    monkeypatch.setattr(preview_jobs, "AsyncSessionLocal", session)
    monkeypatch.setattr(preview_jobs.service, "preview", preview)
    job = await preview_jobs.start(PreviewBody())
    assert (await preview_jobs.status(job["id"]))["status"] == "running"
    with pytest.raises(ValueError, match="déjà"):
        await preview_jobs.start(PreviewBody())
    gate.set()
    await asyncio.gather(*preview_jobs._tasks)
    result = await preview_jobs.status(job["id"])
    assert result["status"] == ("failed" if error else "completed")
    if error:
        assert "secret" not in json.dumps(result)
    else:
        db.rollback.assert_awaited_once()
    db.commit.assert_not_awaited()
    assert preview_jobs.LOCK not in redis.values


@pytest.mark.asyncio
async def test_restart_and_expired_preview_are_reported(monkeypatch):
    redis = Redis()
    monkeypatch.setattr(preview_jobs, "redis_client", lambda: redis)
    await redis.set(preview_jobs.PREFIX + "lost", json.dumps({"status": "running"}))
    assert (await preview_jobs.status("lost"))["status"] == "failed"
    with pytest.raises(ValueError, match="expiré"):
        await preview_jobs.status("expired")


@pytest.mark.asyncio
async def test_only_selected_access_roots_are_revalidated(monkeypatch):
    from app.storage import access, arr_transfer

    chosen = dict(arr_instance_id=1, arr_root="/data/SERIES", path="/mnt/data/SERIES")
    other = dict(arr_instance_id=1, arr_root="/usb/SERIES", path="/mnt/usb/SERIES", identity=[1, 2])
    endpoint = NS(method="ssh", roots=[chosen, other], revision="revision", validation={"roots": [other]})
    db = NS(get=AsyncMock(return_value=NS(enabled=True, id=1)), flush=AsyncMock())
    monkeypatch.setattr(access, "config_for", AsyncMock(return_value={}))
    monkeypatch.setattr(access, "samples_for", AsyncMock(return_value=[]))
    monkeypatch.setattr(access, "access_json", lambda a: a.validation)
    monkeypatch.setattr(arr_transfer, "route", AsyncMock())
    monkeypatch.setattr(preview_jobs.service, "discover_instance_roots", AsyncMock(return_value={}))
    from app.storage import remote_fs

    monkeypatch.setattr(remote_fs, "remote_call", lambda *args: remote_result)
    remote_result = {"identity": [3, 4], "free_bytes": 100}
    result = await access.validate_access(db, endpoint, {(1, "/data/SERIES")})
    access.samples_for.assert_awaited_once_with(db, 1, "/data/SERIES")
    assert result["roots"][1] == other
    assert result["roots"][0]["identity"] == [3, 4]


@pytest.mark.asyncio
async def test_preview_http_routes_report_invalid_or_busy_jobs(monkeypatch):
    from fastapi import HTTPException

    from app.routers.storage_api import preview_status, start_preview

    monkeypatch.setattr(preview_jobs, "start", AsyncMock(side_effect=ValueError("déjà en cours")))
    with pytest.raises(HTTPException) as exc:
        await start_preview(PreviewBody())
    assert exc.value.status_code == 409
    with pytest.raises(HTTPException) as exc:
        await preview_status("../invalid")
    assert exc.value.status_code == 404
    monkeypatch.setattr(preview_jobs, "status", AsyncMock(side_effect=ValueError("expiré")))
    with pytest.raises(HTTPException) as exc:
        await preview_status("a" * 32)
    assert exc.value.status_code == 404
    monkeypatch.setattr(preview_jobs, "start", AsyncMock(return_value={"id": "a" * 32}))
    assert (await start_preview(PreviewBody()))["id"] == "a" * 32
    monkeypatch.setattr(preview_jobs, "status", AsyncMock(return_value={"status": "completed"}))
    assert (await preview_status("a" * 32))["status"] == "completed"


@pytest.mark.asyncio
async def test_preview_reuses_reads_but_never_caches_arr_writes(monkeypatch):
    from app.storage import service, worker

    arr = AsyncMock(return_value=[{"path": "/data"}])
    plex = AsyncMock(return_value={"Metadata": []})
    monkeypatch.setattr(service, "_arr_request", arr)
    monkeypatch.setattr(worker, "_plex_get", plex)
    instance = NS(id=1, url="http://arr")
    conn = NS(url="http://plex", token="private")

    async def calculate(db, body):
        for _ in range(2):
            await service.arr_request(instance, "GET", "rootfolder")
            await worker.plex_get(conn, "/library/all", {"type": 4})
            await service.arr_request(instance, "POST", "command", {})
        return {"items": []}

    monkeypatch.setattr(service, "_preview", calculate)
    assert await service.preview(None, None) == {"items": []}
    assert arr.await_count == 3
    assert plex.await_count == 1
    await worker.plex_get(conn, "/library/all", {"type": 4})
    assert plex.await_count == 2
