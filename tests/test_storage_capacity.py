from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app import jobs
from app.models import ArrInstance, StorageLocation
from app.routers import storage_api as api
from app.storage import service, worker
from app.utils import now_utc_naive


def mapping(root="/data/FILMS", instance=1):
    return dict(arr_instance_id=instance, arr_root=root, plex_root="/media/FILMS", plex_section_id="1")


def location(**kw):
    values = dict(id=1, name="DATA", mount_path="", mappings=[], virtual_key=None, checked_at=None)
    values.update(kw)
    return NS(**values)


def arr_db(instance=None):
    instance = instance or NS(id=1, enabled=True, arr_type="radarr")
    return NS(get=AsyncMock(return_value=instance), execute=AsyncMock(), commit=AsyncMock())


@pytest.mark.asyncio
async def test_local_mount_capacity(tmp_path, monkeypatch):
    monkeypatch.setattr(worker, "mounted_root", lambda path: Path(path))
    loc = location(mount_path=str(tmp_path))
    assert await service.refresh_location_capacity(arr_db(), loc) is True
    assert loc.health == "ok" and loc.total_bytes > 0 and loc.checked_at


@pytest.mark.asyncio
async def test_missing_mount_without_mappings_is_unavailable(monkeypatch):
    def missing(path):
        raise ValueError("absent")

    monkeypatch.setattr(worker, "mounted_root", missing)
    loc = location(mount_path="/absent", free_bytes=5)
    assert await service.refresh_location_capacity(arr_db(), loc) is False
    assert loc.health == "unavailable" and loc.free_bytes is None


@pytest.mark.asyncio
async def test_unconfigured_location_is_left_alone():
    loc = location()
    assert await service.refresh_location_capacity(arr_db(), loc) is False
    assert loc.checked_at is None


@pytest.mark.asyncio
async def test_arr_capacity_uses_rootfolder_and_diskspace(monkeypatch):
    async def request(instance, method, path, body=None):
        if path == "rootfolder":
            return [{"path": "/data/FILMS/", "freeSpace": 40}]
        return [{"path": "/data", "totalSpace": 100}]

    monkeypatch.setattr(service, "arr_request", request)
    loc = location(mappings=[mapping()])
    assert await service.refresh_location_capacity(arr_db(), loc) is True
    assert (loc.free_bytes, loc.total_bytes, loc.health) == (40, 100, "ok")


@pytest.mark.asyncio
async def test_arr_capacity_prefix_match_and_cache(monkeypatch):
    calls = []

    async def request(instance, method, path, body=None):
        calls.append(path)
        if path == "rootfolder":
            return [{"path": "/data", "freeSpace": 10, "totalSpace": 50}]
        raise RuntimeError("no diskspace")

    monkeypatch.setattr(service, "arr_request", request)
    cache = {}
    first = location(mappings=[mapping("/data/FILMS")])
    second = location(id=2, mappings=[mapping("/data/FILMS")])
    db = arr_db()
    await service.refresh_location_capacity(db, first, arr_cache=cache)
    await service.refresh_location_capacity(db, second, arr_cache=cache)
    assert first.free_bytes == 10 and first.total_bytes == 50
    assert second.free_bytes == 10
    assert calls.count("rootfolder") == 1


@pytest.mark.asyncio
async def test_arr_unreachable_falls_back_to_access_proofs(monkeypatch):
    monkeypatch.setattr(service, "arr_request", AsyncMock(side_effect=RuntimeError("down")))
    access = NS(
        validation={"roots": [{"arr_instance_id": 1, "arr_root": "/data/FILMS", "free_bytes": 7, "total_bytes": 70}]}
    )
    db = arr_db()
    db.execute = AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: [access])))
    loc = location(mappings=[mapping()])
    assert await service.refresh_location_capacity(db, loc) is True
    assert (loc.free_bytes, loc.total_bytes) == (7, 70)


@pytest.mark.asyncio
async def test_disabled_instance_and_no_proof_is_unavailable():
    db = arr_db(NS(id=1, enabled=False, arr_type="radarr"))
    db.execute = AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: [])))
    loc = location(mappings=[mapping()], free_bytes=3)
    assert await service.refresh_location_capacity(db, loc) is False
    assert loc.health == "unavailable" and loc.free_bytes is None


@pytest.mark.asyncio
async def test_access_proof_lookup_error_is_unavailable():
    db = arr_db(None)
    db.execute = AsyncMock(side_effect=RuntimeError("db"))
    loc = location(mappings=[mapping()])
    assert await service.refresh_location_capacity(db, loc) is False
    assert loc.health == "unavailable"


@pytest.mark.asyncio
async def test_refresh_all_locations_commits_and_publishes(monkeypatch):
    loc = location()
    db = arr_db()
    db.execute = AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: [loc])))
    refresh = AsyncMock(return_value=True)
    publish = AsyncMock()
    monkeypatch.setattr(service, "refresh_location_capacity", refresh)
    monkeypatch.setattr("app.realtime.publish", publish)
    assert await service.refresh_all_locations(db) == [loc]
    db.commit.assert_awaited_once()
    publish.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_all_locations_ignores_publish_failure(monkeypatch):
    db = arr_db()
    db.execute = AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: [])))
    monkeypatch.setattr("app.realtime.publish", AsyncMock(side_effect=RuntimeError("redis")))
    assert await service.refresh_all_locations(db) == []


def api_location(**kw):
    values = dict(
        id=1,
        name="DATA",
        mount_path="",
        mappings=[],
        reserve_bytes=0,
        reserve_percent=None,
        enabled=True,
        free_bytes=1,
        total_bytes=2,
        checked_at=now_utc_naive(),
        health="ok",
        virtual_key=None,
    )
    values.update(kw)
    return NS(**values)


def list_db(rows):
    return NS(
        execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: rows))), commit=AsyncMock(), get=AsyncMock()
    )


@pytest.mark.asyncio
async def test_locations_endpoint_fresh_does_not_refresh(monkeypatch):
    refresh = AsyncMock()
    monkeypatch.setattr(service, "refresh_all_locations", refresh)
    result = await api.locations(refresh=False, db=list_db([api_location()]))
    assert result[0]["name"] == "DATA"
    refresh.assert_not_awaited()


@pytest.mark.asyncio
async def test_locations_endpoint_refreshes_stale(monkeypatch):
    refresh = AsyncMock()
    monkeypatch.setattr(service, "refresh_all_locations", refresh)
    await api.locations(refresh=False, db=list_db([api_location(checked_at=None)]))
    refresh.assert_awaited_once()


@pytest.mark.asyncio
async def test_locations_endpoint_survives_refresh_failure(monkeypatch):
    monkeypatch.setattr(service, "refresh_all_locations", AsyncMock(side_effect=RuntimeError("boom")))
    result = await api.locations(refresh=True, db=list_db([api_location()]))
    assert len(result) == 1


@pytest.mark.asyncio
async def test_refresh_endpoints(monkeypatch):
    loc = api_location()
    monkeypatch.setattr(service, "refresh_all_locations", AsyncMock(return_value=[loc]))
    assert (await api.refresh_locations(db=list_db([loc])))[0]["id"] == 1

    monkeypatch.setattr(service, "refresh_all_locations", AsyncMock(side_effect=RuntimeError("x")))
    with pytest.raises(HTTPException) as err:
        await api.refresh_locations(db=list_db([loc]))
    assert err.value.status_code == 504

    monkeypatch.setattr(service, "refresh_location_capacity", AsyncMock(return_value=True))
    monkeypatch.setattr("app.realtime.publish", AsyncMock())
    db = list_db([loc])
    db.get = AsyncMock(return_value=loc)
    assert (await api.refresh_one_location(1, db=db))["id"] == 1

    db.get = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as missing:
        await api.refresh_one_location(9, db=db)
    assert missing.value.status_code == 404

    monkeypatch.setattr(service, "refresh_location_capacity", AsyncMock(side_effect=RuntimeError("x")))
    db.get = AsyncMock(return_value=loc)
    with pytest.raises(HTTPException) as timeout:
        await api.refresh_one_location(1, db=db)
    assert timeout.value.status_code == 504


@pytest.mark.asyncio
async def test_cron_storage_capacity(monkeypatch):
    class Context:
        async def __aenter__(self):
            return "db"

        async def __aexit__(self, *args):
            return False

    refresh = AsyncMock()
    monkeypatch.setattr("app.database.AsyncSessionLocal", lambda: Context())
    monkeypatch.setattr("app.storage.service.refresh_all_locations", refresh)
    await jobs.cron_storage_capacity({})
    refresh.assert_awaited_once_with("db")

    refresh.side_effect = RuntimeError("x")
    await jobs.cron_storage_capacity({})


def test_models_imported():
    assert ArrInstance and StorageLocation
