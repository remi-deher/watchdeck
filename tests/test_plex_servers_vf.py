"""Plusieurs serveurs Plex : analyse VF, fiches et tâches sur le serveur qui porte le média."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import LibraryItem, LibraryItemLocation, MediaRequest, PlexServer, Settings
from app.services import availability_service, plex_servers, vff_scanner


def _setup(db) -> tuple[PlexServer, PlexServer]:
    db.add(
        Settings(
            id=1,
            vff_enabled=True,
            plex_url="http://main:32400",
            plex_token="tok",
            vff_libraries=json.dumps([{"name": "Films", "kind": "movie"}]),
        )
    )
    primary = db.query(PlexServer).filter(PlexServer.is_primary).first()
    if primary is None:
        primary = PlexServer(name="Serveur principal", is_primary=True)
        db.add(primary)
    second = PlexServer(
        name="Plex 4K",
        url="http://uhd:32400",
        token="tok2",
        libraries=json.dumps([{"name": "Films 4K", "kind": "movie"}]),
    )
    db.add(second)
    db.commit()
    return primary, second


def _item(db, title: str, *servers: PlexServer) -> LibraryItem:
    item = LibraryItem(title=title, year=2024, media_type="movie", plex_guid=f"plex://movie/{title}")
    db.add(item)
    db.flush()
    for index, server in enumerate(servers):
        db.add(LibraryItemLocation(library_item_id=item.id, server_id=server.id, rating_key=f"{title}-{index}"))
    db.commit()
    return item


@pytest.mark.asyncio
async def test_pick_item_connection_prefers_the_primary(async_db):
    primary, second = _setup(async_db)
    both = _item(async_db, "Both", primary, second)
    only_uhd = _item(async_db, "Uhd", second)
    legacy = _item(async_db, "Legacy")

    for item, expected in ((both, "http://main:32400"), (only_uhd, "http://uhd:32400"), (legacy, "http://main:32400")):
        conn = await plex_servers.connection_for_item(async_db, item.id)
        assert conn is not None and conn.url == expected
    conn = await plex_servers.connection_for_item(async_db, only_uhd.id)
    assert conn.libraries == [{"name": "Films 4K", "kind": "movie"}]


@pytest.mark.asyncio
async def test_vf_scan_reads_each_item_on_its_own_server(async_db):
    primary, second = _setup(async_db)
    on_main = _item(async_db, "Main", primary)
    on_uhd = _item(async_db, "Uhd", second)
    settings = async_db.query(Settings).first()
    calls = []

    async def fake_group(db, settings, source_type, payloads, libs, state, now, known, since, context, conn=None):
        calls.append(([p["id"] for p in payloads], conn.url if conn else None, libs, since, context))
        return {p["id"]: {"id": p["id"], "found": True, "has_vf": True} for p in payloads}

    secondary_context = object()
    with (
        patch.object(vff_scanner, "_scan_candidate_group", side_effect=fake_group),
        patch.object(vff_scanner, "_build_scan_context_blocking", return_value=secondary_context) as build,
        patch.object(vff_scanner, "_known_episodes_for_show_rows", new=AsyncMock(return_value={})),
    ):
        results = await vff_scanner._scan_library_by_server(
            async_db, settings, [on_uhd, on_main], [{"name": "Films", "kind": "movie"}], {}, None, "since", "ctx"
        )

    assert set(results) == {on_main.id, on_uhd.id}
    # Principal d'abord, avec son index et son filigrane ; le 4K ensuite, sans filigrane.
    assert calls[0] == ([on_main.id], None, [{"name": "Films", "kind": "movie"}], "since", "ctx")
    assert calls[1] == (
        [on_uhd.id],
        "http://uhd:32400",
        [{"name": "Films 4K", "kind": "movie"}],
        None,
        secondary_context,
    )
    assert build.call_args.args[:4] == ("http://uhd:32400", "tok2", [{"name": "Films 4K", "kind": "movie"}], None)


@pytest.mark.asyncio
async def test_vf_scan_skips_an_unreachable_secondary(async_db):
    _primary, second = _setup(async_db)
    on_uhd = _item(async_db, "Uhd", second)
    settings = async_db.query(Settings).first()
    group = AsyncMock(return_value={})
    with (
        patch.object(vff_scanner, "_scan_candidate_group", new=group),
        patch.object(vff_scanner, "_build_scan_context_blocking", return_value=None),
        patch.object(vff_scanner, "_known_episodes_for_show_rows", new=AsyncMock(return_value={})),
    ):
        results = await vff_scanner._scan_library_by_server(async_db, settings, [on_uhd], [], {}, None, None, None)
    assert results == {}
    group.assert_not_awaited()


@pytest.mark.asyncio
async def test_live_availability_proof_looks_on_every_server(async_db):
    _setup(async_db)
    settings = async_db.query(Settings).first()
    req = MediaRequest(title="Dune", year=2024, media_type="movie")
    seen = []

    def fake_find(url, token, library_names, request):
        seen.append((url, library_names))
        return url == "http://uhd:32400"

    with patch.object(availability_service, "_find_item_live_blocking", side_effect=fake_find):
        assert await availability_service._live_plex_proof(settings, req, async_db) is True
    assert seen == [("http://main:32400", ["Films"]), ("http://uhd:32400", ["Films 4K"])]


@pytest.mark.asyncio
async def test_plex_tasks_are_listed_per_server_and_cancelled_on_theirs(async_db):
    from app.services import playback_activity

    _primary, second = _setup(async_db)
    requests = []

    def response(payload):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.status_code = 200
        resp.json = MagicMock(return_value=payload)
        return resp

    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)

    async def get(url, **kwargs):
        requests.append(("GET", url, kwargs["headers"]["X-Plex-Token"]))
        return response({"MediaContainer": {"Activity": [{"uuid": "same", "title": "Analyse", "cancellable": True}]}})

    async def delete(url, **kwargs):
        requests.append(("DELETE", url, kwargs["headers"]["X-Plex-Token"]))
        return response({})

    client.get = AsyncMock(side_effect=get)
    client.delete = AsyncMock(side_effect=delete)
    with patch.object(playback_activity.httpx, "AsyncClient", return_value=client):
        tasks = await playback_activity.plex_server_activities(async_db)
        await playback_activity.cancel_plex_activity("same", async_db, second.id)

    assert [(task["server_id"], task["server_name"]) for task in tasks] == [
        (None, "Serveur principal"),
        (second.id, "Plex 4K"),
    ]
    assert requests[-1] == ("DELETE", "http://uhd:32400/activities/same", "tok2")
