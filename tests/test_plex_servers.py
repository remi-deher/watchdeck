"""Plusieurs serveurs Plex : gestion des serveurs et inventaire multi-serveurs."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async as get_db
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import LibraryItem, LibraryItemLocation, PlexServer, Settings
from tests.async_support import make_test_session

_LIBS = '[{"name": "Films", "kind": "movie"}]'


def _client_with_db(db):
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=False)


def _cleanup():
    app.dependency_overrides.pop(require_auth, None)
    app.dependency_overrides.pop(require_admin, None)
    app.dependency_overrides.pop(get_db, None)


def _primary(db) -> PlexServer:
    primary = db.query(PlexServer).filter(PlexServer.is_primary).first()
    if primary is None:
        primary = PlexServer(name="Serveur principal", is_primary=True, enabled=True)
        db.add(primary)
        db.commit()
    return primary


def _movie(guid: str, key: str, title: str | None = None, tmdb: str | None = None) -> dict:
    # Titre derive du guid : deux films de meme titre et annee seraient rapproches.
    return {
        "title": title or f"Film {guid}",
        "year": 2024,
        "media_type": "movie",
        "plex_guid": guid,
        "rating_key": key,
        "tmdb_id": tmdb,
        "tvdb_id": None,
        "imdb_id": None,
        "poster_url": None,
        "overview": None,
        "added_at": None,
    }


def test_list_includes_primary_from_settings_without_exposing_token(async_db):
    async_db.add(Settings(plex_url="http://plex:32400", plex_token="secret"))
    async_db.commit()
    client = _client_with_db(async_db)
    try:
        resp = client.get("/api/plex-servers")
        assert resp.status_code == 200
        data = resp.json()
        primary = next(s for s in data if s["is_primary"])
        assert primary["url"] == "http://plex:32400"
        assert primary["token_configured"] is True
        assert "secret" not in resp.text
    finally:
        _cleanup()


def test_create_update_and_delete_secondary_server(async_db):
    _primary(async_db)
    client = _client_with_db(async_db)
    try:
        with patch("app.routers.plex_servers_api.fetch_identity", new=AsyncMock(return_value="abc123")):
            resp = client.post(
                "/api/plex-servers",
                json={"name": "Plex 4K", "url": "http://plex4k:32400/", "token": "tok4k", "libraries": ""},
            )
        assert resp.status_code == 200, resp.text
        created = resp.json()
        assert created["url"] == "http://plex4k:32400"
        assert created["machine_identifier"] == "abc123"
        assert created["token"] != "tok4k"

        # Jeton masque renvoye tel quel : le jeton enregistre est conserve.
        with patch("app.routers.plex_servers_api.fetch_identity", new=AsyncMock(return_value="abc123")):
            resp = client.put(
                f"/api/plex-servers/{created['id']}",
                json={
                    "name": "Plex UHD",
                    "url": "http://plex4k:32400",
                    "token": created["token"],
                    "libraries": '[{"name": "Films 4K", "kind": "movie"}]',
                },
            )
        assert resp.status_code == 200, resp.text
        server = async_db.query(PlexServer).filter(PlexServer.id == created["id"]).one()
        assert server.name == "Plex UHD"
        assert server.token == "tok4k"
        assert "Films 4K" in server.libraries

        assert client.patch(f"/api/plex-servers/{created['id']}/toggle").json()["enabled"] is False
        assert client.delete(f"/api/plex-servers/{created['id']}").status_code == 200
        assert async_db.query(PlexServer).filter(PlexServer.id == created["id"]).first() is None
    finally:
        _cleanup()


def test_primary_server_cannot_be_deleted_or_disabled(async_db):
    primary = _primary(async_db)
    client = _client_with_db(async_db)
    try:
        assert client.delete(f"/api/plex-servers/{primary.id}").status_code == 400
        assert client.patch(f"/api/plex-servers/{primary.id}/toggle").status_code == 400
    finally:
        _cleanup()


def test_create_requires_url_and_token(async_db):
    client = _client_with_db(async_db)
    try:
        resp = client.post("/api/plex-servers", json={"name": "Sans jeton", "url": "http://x:32400"})
        assert resp.status_code == 422
    finally:
        _cleanup()


async def _run_full_sync(db, scans: dict[str, list[dict]]):
    from app.services import plex_sync

    def fake_scan(plex_url, plex_token, libs):
        return scans[plex_url]

    plex_sync.plex_sync_state["status"] = "idle"
    with (
        patch("app.services.plex_finder.sync_plex_library_blocking", side_effect=fake_scan),
        patch("app.services.plex_sync.AsyncSessionLocal", return_value=db),
        patch("app.services.plex_sync.get_all_movies", return_value=[]),
        patch("app.services.plex_sync.get_all_series", return_value=[]),
        patch("app.services.vff_scanner.check_vf_statuses"),
    ):
        await plex_sync.sync_plex_media()


@pytest.mark.asyncio
async def test_full_sync_merges_same_media_across_servers():
    db = make_test_session()
    db.add(Settings(plex_url="http://main", plex_token="t", vff_enabled=True, vff_libraries=_LIBS))
    primary = _primary(db)
    second = PlexServer(name="Plex 4K", url="http://uhd", token="t2")
    db.add(second)
    db.commit()

    await _run_full_sync(
        db,
        {
            "http://main": [_movie("plex://movie/1", "10", "Dune", tmdb="438631"), _movie("plex://movie/2", "11")],
            "http://uhd": [_movie("plex://movie/1", "500", "Dune (4K)", tmdb="438631")],
        },
    )

    dune = db.query(LibraryItem).filter(LibraryItem.plex_guid == "plex://movie/1").all()
    assert len(dune) == 1
    # Le principal fait foi pour les metadonnees descriptives.
    assert dune[0].title == "Dune"
    locations = db.query(LibraryItemLocation).filter(LibraryItemLocation.library_item_id == dune[0].id).all()
    assert {(loc.server_id, loc.rating_key) for loc in locations} == {(primary.id, "10"), (second.id, "500")}


@pytest.mark.asyncio
async def test_media_removed_from_primary_but_still_on_secondary_is_kept():
    db = make_test_session()
    db.add(Settings(plex_url="http://main", plex_token="t", vff_enabled=True, vff_libraries=_LIBS))
    _primary(db)
    second = PlexServer(name="Plex 4K", url="http://uhd", token="t2")
    db.add(second)
    db.commit()

    # Le 4K utilise un agent local : autre guid, meme film (rapproche par TMDB).
    secondary = [_movie("local://77", "501", title="Matrix", tmdb="603")]
    await _run_full_sync(
        db,
        {
            "http://main": [_movie("plex://movie/1", "10"), _movie("plex://movie/2", "11", title="Matrix", tmdb="603")],
            "http://uhd": secondary,
        },
    )
    assert db.query(LibraryItem).filter(LibraryItem.tmdb_id == "603").count() == 1

    # Retire du principal seulement : toujours present sur le 4K.
    await _run_full_sync(db, {"http://main": [_movie("plex://movie/1", "10")], "http://uhd": secondary})
    assert db.query(LibraryItem).filter(LibraryItem.tmdb_id == "603").count() == 1


@pytest.mark.asyncio
async def test_unreachable_server_never_purges_library():
    db = make_test_session()
    db.add(Settings(plex_url="http://main", plex_token="t", vff_enabled=True, vff_libraries=_LIBS))
    _primary(db)
    db.add(PlexServer(name="Plex 4K", url="http://uhd", token="t2"))
    db.commit()

    await _run_full_sync(
        db, {"http://main": [_movie("plex://movie/1", "10")], "http://uhd": [_movie("plex://movie/9", "900")]}
    )
    # Le 4K ne repond plus : son film ne doit pas etre supprime.
    await _run_full_sync(db, {"http://main": [_movie("plex://movie/1", "10")], "http://uhd": []})
    assert db.query(LibraryItem).filter(LibraryItem.plex_guid == "plex://movie/9").count() == 1


@pytest.mark.asyncio
async def test_media_gone_from_every_server_is_removed():
    db = make_test_session()
    db.add(Settings(plex_url="http://main", plex_token="t", vff_enabled=True, vff_libraries=_LIBS))
    _primary(db)
    db.add(PlexServer(name="Plex 4K", url="http://uhd", token="t2"))
    db.commit()

    await _run_full_sync(
        db, {"http://main": [_movie("plex://movie/1", "10")], "http://uhd": [_movie("plex://movie/9", "900")]}
    )
    await _run_full_sync(
        db, {"http://main": [_movie("plex://movie/1", "10")], "http://uhd": [_movie("plex://movie/1", "901")]}
    )
    assert db.query(LibraryItem).filter(LibraryItem.plex_guid == "plex://movie/9").count() == 0
    assert db.query(LibraryItemLocation).filter(LibraryItemLocation.rating_key == "900").count() == 0


@pytest.mark.asyncio
async def test_disabled_secondary_server_is_not_scanned():
    db = make_test_session()
    db.add(Settings(plex_url="http://main", plex_token="t", vff_enabled=True, vff_libraries=_LIBS))
    _primary(db)
    db.add(PlexServer(name="Plex 4K", url="http://uhd", token="t2", enabled=False))
    db.commit()

    await _run_full_sync(db, {"http://main": [_movie("plex://movie/1", "10")]})
    assert db.query(LibraryItem).count() == 1


def test_library_filters_by_server_and_lists_servers(async_db):
    primary = _primary(async_db)
    second = PlexServer(name="Plex 4K", url="http://uhd", token="t2")
    async_db.add(second)
    shared = LibraryItem(title="Dune", year=2021, media_type="movie", plex_guid="plex://movie/1")
    only_main = LibraryItem(title="Alien", year=1979, media_type="movie", plex_guid="plex://movie/2")
    async_db.add_all([shared, only_main])
    async_db.commit()
    async_db.add_all(
        [
            LibraryItemLocation(library_item_id=shared.id, server_id=primary.id, rating_key="1"),
            LibraryItemLocation(library_item_id=shared.id, server_id=second.id, rating_key="2"),
            LibraryItemLocation(library_item_id=only_main.id, server_id=primary.id, rating_key="3"),
        ]
    )
    async_db.commit()
    client = _client_with_db(async_db)
    try:
        titles = [row["title"] for row in client.get(f"/api/library?server_id={second.id}").json()]
        assert titles == ["Dune"]
        rows = {row["title"]: row for row in client.get("/api/library").json()}
        assert rows["Dune"]["server_ids"] == sorted([primary.id, second.id])
        servers = client.get("/api/library-servers").json()
        assert [s["name"] for s in servers] == ["Serveur principal", "Plex 4K"]
        assert servers[1]["item_count"] == 1
    finally:
        _cleanup()
