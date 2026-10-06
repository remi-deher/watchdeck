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


@pytest.mark.asyncio
async def test_refresh_rejects_wrong_media_type_with_same_provider_id(monkeypatch):
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: []))))
    monkeypatch.setattr(
        worker,
        "plex_get",
        AsyncMock(return_value={"Metadata": [{"ratingKey": "7", "type": "show", "Guid": [{"id": "tmdb://42"}]}]}),
    )
    write = AsyncMock()
    monkeypatch.setattr(inventory, "record", write)
    with pytest.raises(ValueError, match="introuvable ou ambigu"):
        await inventory.refresh_plex_item(db, NS(id=2, url="http://plex", token="key"), "7", "movie", "42")
    write.assert_not_awaited()


@pytest.mark.asyncio
async def test_cache_database_failure_falls_back_without_touching_business_session(monkeypatch):
    from sqlalchemy.exc import SQLAlchemyError

    class Unavailable:
        async def __aenter__(self):
            raise SQLAlchemyError("cache unavailable")

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(inventory, "AsyncSessionLocal", Unavailable)
    db = NS(execute=AsyncMock())
    live = AsyncMock(return_value=[{"id": 17}])
    assert await inventory.arr_catalog(db, NS(id=2, url="http://arr", api_key="key"), live) == [{"id": 17}]
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_inventory_api_filters_sources_and_paginates(committed_async_database, monkeypatch):
    from app.routers import storage_api

    factory = committed_async_database.session_factory
    monkeypatch.setattr(inventory, "AsyncSessionLocal", factory)
    for source, endpoint in [("arr", 1), ("plex", 2)]:
        await inventory.record(
            source,
            endpoint,
            "rev",
            [
                dict(entity_id=str(i), media_type="movie", provider_id=str(i), data={"title": f"Film {i}"})
                for i in range(3)
            ],
        )
    async with factory() as db:
        rows = await storage_api.inventory_list(source="plex", endpoint_id=2, offset=1, limit=1, db=db)
        assert len(rows) == 1 and rows[0]["entity_id"] == "1"
        assert rows[0]["source"] == "plex" and rows[0]["present"] is True
        assert len(await storage_api.inventory_list(offset=-5, limit=999, db=db)) == 6
        assert await storage_api.inventory_list(source="arr", endpoint_id=2, db=db) == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case,expected",
    [("unknown", 404), ("arr", 404), ("disabled", 409), ("ambiguous", 409), ("offline", 503), ("ok", None)],
)
async def test_inventory_refresh_api_explains_recoverable_failures(monkeypatch, case, expected):
    from fastapi import HTTPException

    from app.routers import storage_api
    from app.services import plex_servers

    row = (
        None
        if case == "unknown"
        else NS(
            source="arr" if case == "arr" else "plex",
            endpoint_id=2,
            entity_id="7",
            media_type="movie",
            provider_id="42",
        )
    )
    db = NS(get=AsyncMock(return_value=row))
    conn = NS(id=2)
    monkeypatch.setattr(plex_servers, "connection_for", AsyncMock(return_value=None if case == "disabled" else conn))
    refresh = AsyncMock(return_value={"files": [{"path": "/new/a.mkv"}]})
    if case == "ambiguous":
        refresh.side_effect = ValueError("Ambiguous identity")
    if case == "offline":
        refresh.side_effect = httpx.ConnectError("offline")
    monkeypatch.setattr(inventory, "refresh_plex_item", refresh)
    if expected:
        with pytest.raises(HTTPException) as exc:
            await storage_api.inventory_refresh(17, db=db)
        assert exc.value.status_code == expected
        if case in ("unknown", "arr", "disabled"):
            refresh.assert_not_awaited()
    else:
        result = await storage_api.inventory_refresh(17, db=db)
        assert result["files"][0]["path"] == "/new/a.mkv"
        refresh.assert_awaited_once_with(db, conn, "7", "movie", "42")


@pytest.mark.asyncio
async def test_background_batches_continue_after_offline_sources(monkeypatch):
    from app.services import plex_servers
    from app.storage import service

    good = NS(id=1, arr_type="sonarr", url="http://arr", api_key="key")
    offline = NS(id=2, arr_type="radarr", url="http://offline", api_key="key")
    ignored = NS(id=3, arr_type="prowlarr")
    revision = inventory.arr_revision(good)
    first = NS(entity_id="1", endpoint_revision=revision)
    second = NS(entity_id="2", endpoint_revision=revision)
    obsolete = NS(entity_id="3", endpoint_revision="obsolete")
    locations = [
        (NS(server_id=2, rating_key=str(i)), NS(media_type=kind, tmdb_id="42", tvdb_id="43"))
        for i, kind in [(1, "movie"), (2, "show")]
    ]
    db = NS(
        execute=AsyncMock(
            side_effect=[
                NS(scalars=lambda: NS(all=lambda: [good, offline, ignored])),
                NS(all=lambda: [(first, good), (second, good), (obsolete, good)]),
                NS(all=lambda: locations),
            ]
        )
    )

    class Session:
        async def __aenter__(self):
            return db

        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(inventory, "AsyncSessionLocal", Session)
    request = AsyncMock(side_effect=[[{"id": 1}], httpx.ConnectError("offline")])
    monkeypatch.setattr(service, "arr_request", request)
    save = AsyncMock()
    monkeypatch.setattr(inventory, "safe_record_arr", save)
    arr_files = AsyncMock(side_effect=[httpx.ConnectError("offline"), {}])
    monkeypatch.setattr(inventory, "refresh_arr_files", arr_files)
    conn = NS(id=2)
    monkeypatch.setattr(plex_servers, "connection_for", AsyncMock(return_value=conn))
    plex_files = AsyncMock(side_effect=[httpx.ConnectError("offline"), {}])
    monkeypatch.setattr(inventory, "refresh_plex_item", plex_files)
    await inventory.refresh_background()
    save.assert_awaited_once_with(good, [{"id": 1}])
    assert request.await_count == 2
    assert arr_files.await_count == 2 and plex_files.await_count == 2
    assert plex_files.await_args.args[3:5] == ("series", "43")
    assert db.execute.await_count == 3


@pytest.mark.asyncio
async def test_cron_inventory_does_not_propagate_source_failure(monkeypatch):
    from app import jobs

    refresh = AsyncMock(side_effect=RuntimeError("source offline"))
    monkeypatch.setattr(inventory, "refresh_background", refresh)
    await jobs.cron_storage_inventory({})
    refresh.assert_awaited_once()


@pytest.mark.asyncio
async def test_series_refresh_pages_episodes_and_records_sizes(monkeypatch):
    db = NS(
        execute=AsyncMock(side_effect=[NS(scalars=lambda: NS(all=lambda: [])), NS(scalar_one_or_none=lambda: None)])
    )
    lookup = AsyncMock(
        side_effect=[
            {"Metadata": [{"ratingKey": "7", "type": "show", "title": "Show", "Guid": [{"id": "tvdb://42"}]}]},
            {
                "totalSize": 2,
                "Metadata": [{"ratingKey": "8", "Media": [{"Part": [{"file": "/shows/e01.mkv", "size": 120}]}]}],
            },
            {
                "totalSize": 2,
                "Metadata": [{"ratingKey": "9", "Media": [{"Part": [{"file": "/shows/e02.mkv", "size": 130}]}]}],
            },
        ]
    )
    monkeypatch.setattr(worker, "plex_get", lookup)
    write = AsyncMock()
    monkeypatch.setattr(inventory, "record", write)
    result = await inventory.refresh_plex_item(db, NS(id=2, url="http://plex", token="key"), "7", "series", "42")
    assert sum(file["size_bytes"] for file in result["files"]) == 250
    assert lookup.await_args.args[2]["X-Plex-Container-Start"] == 1
    write.assert_awaited_once()


@pytest.mark.asyncio
async def test_plex_only_inventory_keeps_missing_provider_id_optional(monkeypatch):
    write = AsyncMock()
    monkeypatch.setattr(inventory, "record", write)
    conn = NS(id=2, url="http://plex", token="key")
    await inventory.safe_record_plex(conn, [{"rating_key": "7", "media_type": "movie", "title": "Local film"}])
    assert write.await_args.args[3][0]["provider_id"] is None
    db = NS(execute=AsyncMock(return_value=NS(scalar_one_or_none=lambda: None)))
    monkeypatch.setattr(
        worker,
        "plex_get",
        AsyncMock(
            return_value={
                "Metadata": [
                    {
                        "ratingKey": "7",
                        "type": "movie",
                        "title": "Local film",
                        "Media": [{"Part": [{"file": "/films/local.mkv", "size": 100}]}],
                    }
                ]
            }
        ),
    )
    result = await inventory.refresh_plex_item(db, conn, "7", "movie", None)
    assert result["files"][0]["path"] == "/films/local.mkv"
    assert write.await_args.args[3][0]["provider_id"] is None
