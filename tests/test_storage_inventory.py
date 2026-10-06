from datetime import timedelta
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import select

from app.models import StorageInventory, StorageInventoryScope
from app.storage import inventory, worker
from app.utils import now_utc_naive


@pytest.mark.asyncio
async def test_complete_and_partial_observations_preserve_independent_sources(committed_async_database, monkeypatch):
    factory = committed_async_database.session_factory
    monkeypatch.setattr(inventory, "AsyncSessionLocal", factory)
    rows = [dict(entity_id="1", media_type="movie", provider_id="42", data={"title": "Film", "path": "/arr/Film"})]
    await inventory.record("arr", 1, "rev", rows, complete=True)
    await inventory.record(
        "plex",
        1,
        "rev",
        [
            dict(
                entity_id="1",
                media_type="movie",
                provider_id="42",
                data={"files": [{"path": "/plex/Film/a.mkv", "size_bytes": 100, "present": True}]},
            )
        ],
    )
    await inventory.record("arr", 1, "rev", [], complete=False)
    async with factory() as db:
        assert all(r.present for r in (await db.execute(select(StorageInventory))).scalars())
    await inventory.record("arr", 1, "rev", [], complete=True)
    async with factory() as db:
        records = {r.source: r for r in (await db.execute(select(StorageInventory))).scalars()}
        assert not records["arr"].present and records["plex"].present
        assert records["plex"].data["files"][0]["path"] == "/plex/Film/a.mkv"


@pytest.mark.asyncio
async def test_catalogue_cache_fresh_empty_stale_and_changed_endpoint(committed_async_database, monkeypatch):
    factory = committed_async_database.session_factory
    monkeypatch.setattr(inventory, "AsyncSessionLocal", factory)
    instance = NS(id=1, url="http://arr", api_key="key", arr_type="radarr")
    live = AsyncMock(return_value=[{"id": 9}])
    await inventory.record("arr", 1, inventory.arr_revision(instance), [], complete=True)
    async with factory() as db:
        assert await inventory.arr_catalog(db, instance, live) == []
        live.assert_not_awaited()
    async with factory() as db:
        scope = (await db.execute(select(StorageInventoryScope))).scalar_one()
        scope.observed_at = now_utc_naive() - timedelta(hours=1)
        await db.commit()
    async with factory() as db:
        assert await inventory.arr_catalog(db, instance, live) == [{"id": 9}]
    await inventory.record("arr", 1, inventory.arr_revision(instance), [], complete=True)
    instance.api_key = "changed"
    async with factory() as db:
        assert await inventory.arr_catalog(db, instance, live) == [{"id": 9}]
    assert live.await_count == 2


@pytest.mark.asyncio
async def test_metadata_only_sync_does_not_refresh_file_age(committed_async_database, monkeypatch):
    factory = committed_async_database.session_factory
    monkeypatch.setattr(inventory, "AsyncSessionLocal", factory)
    await inventory.record(
        "plex",
        1,
        "rev",
        [dict(entity_id="2", media_type="series", data={"files": [], "files_observed_at": "2020-01-01T00:00:00"})],
    )
    await inventory.record("plex", 1, "rev", [dict(entity_id="2", media_type="series", data={"title": "New name"})])
    async with factory() as db:
        row = (await db.execute(select(StorageInventory))).scalar_one()
        assert row.data["files_observed_at"] == "2020-01-01T00:00:00"
        assert row.data["title"] == "New name"


@pytest.mark.asyncio
async def test_observation_failure_is_not_a_business_failure(monkeypatch):
    monkeypatch.setattr(inventory, "record", AsyncMock(side_effect=RuntimeError("inventory unavailable")))
    await inventory.safe_record_arr(
        NS(id=1, url="http://arr", api_key="key", arr_type="radarr"), [{"id": 1, "tmdbId": 42}]
    )
    await inventory.safe_record_plex(
        NS(id=2, url="http://plex", token="key"),
        [{"rating_key": "1", "media_type": "movie", "title": "Film", "tmdb_id": "42"}],
    )


@pytest.mark.asyncio
async def test_targeted_plex_refresh_recovers_moved_file_without_arr(monkeypatch):
    old = NS(data={"files": [{"path": "/old/Film/a.mkv", "rating_key": "7", "size_bytes": 100, "present": True}]})
    db = NS(execute=AsyncMock(side_effect=[NS(scalars=lambda: NS(all=lambda: [])), NS(scalar_one_or_none=lambda: old)]))
    lookup = AsyncMock(
        return_value={
            "Metadata": [
                {
                    "ratingKey": "7",
                    "type": "movie",
                    "title": "Film",
                    "librarySectionID": "3",
                    "Guid": [{"id": "tmdb://42"}],
                    "Media": [{"Part": [{"file": "/new/Film/a.mkv", "size": 120}]}],
                }
            ]
        }
    )
    monkeypatch.setattr(worker, "plex_get", lookup)
    write = AsyncMock()
    monkeypatch.setattr(inventory, "record", write)
    data = await inventory.refresh_plex_item(db, NS(id=2, url="http://plex", token="key"), "7", "movie", "42")
    assert data["files"][0]["path"] == "/new/Film/a.mkv"
    assert data["files"][0]["size_bytes"] == 120
    assert data["files"][1]["present"] is False
    lookup.assert_awaited_once()
    assert lookup.await_args.args[1] == "/library/metadata/7"
    write.assert_awaited_once()


@pytest.mark.asyncio
async def test_recreated_fiche_uses_local_provider_id_and_rejects_ambiguity(monkeypatch):
    request = httpx.Request("GET", "http://plex/library/metadata/old")
    missing = httpx.HTTPStatusError("missing", request=request, response=httpx.Response(404, request=request))
    db = NS(
        execute=AsyncMock(
            side_effect=[NS(scalars=lambda: NS(all=lambda: ["new"])), NS(scalar_one_or_none=lambda: None)]
        )
    )
    lookup = AsyncMock(
        side_effect=[
            missing,
            {
                "Metadata": [
                    {
                        "ratingKey": "new",
                        "type": "movie",
                        "librarySectionID": "3",
                        "Guid": [{"id": "tmdb://42"}],
                        "Media": [],
                    }
                ]
            },
        ]
    )
    monkeypatch.setattr(worker, "plex_get", lookup)
    monkeypatch.setattr(inventory, "record", AsyncMock())
    await inventory.refresh_plex_item(db, NS(id=2, url="http://plex", token="key"), "old", "movie", "42")
    assert lookup.await_args.args[1] == "/library/metadata/new"
    db.execute = AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: ["a", "b"])))
    lookup.side_effect = [missing]
    with pytest.raises(ValueError, match="Plusieurs fiches"):
        await inventory.refresh_plex_item(db, NS(id=2, url="http://plex", token="key"), "old", "movie", "42")


@pytest.mark.asyncio
async def test_unavailable_plex_does_not_erase_inventory(monkeypatch):
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: []))))
    monkeypatch.setattr(worker, "plex_get", AsyncMock(side_effect=httpx.ConnectError("offline")))
    write = AsyncMock()
    monkeypatch.setattr(inventory, "record", write)
    with pytest.raises(httpx.ConnectError):
        await inventory.refresh_plex_item(db, NS(id=2), "7", "movie", "42")
    write.assert_not_awaited()


@pytest.mark.asyncio
async def test_arr_file_enrichment_is_targeted_and_preserves_history(monkeypatch):
    from app.storage import service

    instance = NS(id=2, arr_type="sonarr", url="http://sonarr", api_key="key")
    observation = NS(
        entity_id="17",
        media_type="series",
        provider_id="42",
        data={"path": "/series/Show", "files": [{"path": "/old/Show/old.mkv", "size_bytes": 50, "present": True}]},
    )
    request = AsyncMock(
        return_value=[
            {
                "id": 3,
                "relativePath": "Season 1/e01.mkv",
                "size": 120,
                "dateAdded": "2026-10-06T12:00:00Z",
                "quality": {"quality": {"name": "HDTV"}},
            }
        ]
    )
    monkeypatch.setattr(service, "arr_request", request)
    write = AsyncMock()
    monkeypatch.setattr(inventory, "record", write)
    data = await inventory.refresh_arr_files(instance, observation)
    assert data["files"][0]["path"] == "/series/Show/Season 1/e01.mkv"
    assert data["files"][0]["size_bytes"] == 120
    assert data["files"][1]["present"] is False
    request.assert_awaited_once_with(instance, "GET", "episodefile?seriesId=17")
    assert "complete" not in write.await_args.kwargs


@pytest.mark.asyncio
async def test_arr_file_enrichment_failure_does_not_write(monkeypatch):
    from app.storage import service

    monkeypatch.setattr(service, "arr_request", AsyncMock(side_effect=httpx.ConnectError("offline")))
    write = AsyncMock()
    monkeypatch.setattr(inventory, "record", write)
    with pytest.raises(httpx.ConnectError):
        await inventory.refresh_arr_files(NS(id=2, arr_type="sonarr"), NS(entity_id="17"))
    write.assert_not_awaited()


@pytest.mark.asyncio
async def test_worker_refreshes_known_key_and_reports_external_move(monkeypatch):
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: []))))
    conn = NS(id=2, url="http://plex", token="key")
    monkeypatch.setattr(inventory, "candidate_keys", AsyncMock(return_value=["7"]))
    record = AsyncMock()
    monkeypatch.setattr(inventory, "safe_record_plex", record)
    lookup = AsyncMock(
        return_value={
            "Metadata": [
                {
                    "ratingKey": "7",
                    "librarySectionID": "3",
                    "title": "Film",
                    "Guid": [{"id": "tmdb://42"}],
                    "Media": [{"Part": [{"file": "/new/Film/a.mkv", "size": 120}]}],
                }
            ]
        }
    )
    monkeypatch.setattr(worker, "plex_get", lookup)
    with pytest.raises(ValueError, match="nouvel emplacement.*?/new/Film/a.mkv"):
        await worker.plex_files(conn, "3", "/old/Film", "movie", snapshot={"tmdb_id": "42"}, title="Film", db=db)
    assert lookup.await_args_list[0].args[1] == "/library/metadata/7"
    assert record.await_args.args[1][0]["storage_files"][0]["path"] == "/new/Film/a.mkv"
