"""Plusieurs serveurs Plex : Tautulli par serveur et serveur cible de chaque *arr."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async as get_db
from app.dependencies import require_admin
from app.main import app
from app.models import ArrInstance, PlaybackSession, PlexServer, Settings
from app.services import playback_activity, vff_scanner
from tests.async_support import make_test_session


def _history(*rows) -> MagicMock:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"response": {"result": "success", "data": {"data": list(rows)}}}
    return response


def _row(row_id: str, title: str) -> dict:
    return {
        "row_id": row_id,
        "title": title,
        "media_type": "movie",
        "started": 1_786_000_000,
        "stopped": 1_786_003_600,
        "play_duration": 3600,
    }


@pytest.mark.asyncio
async def test_tautulli_history_is_imported_from_each_server(async_db):
    async_db.add(Settings(id=1, tautulli_url="http://tautulli-main", tautulli_api_key="k1"))
    second = PlexServer(
        name="Plex 4K", url="http://uhd:32400", token="t", tautulli_url="http://tautulli-uhd", tautulli_api_key="k2"
    )
    async_db.add(second)
    async_db.commit()

    by_host = {"tautulli-main": _history(_row("7", "Film principal")), "tautulli-uhd": _history(_row("7", "Film 4K"))}
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.get = AsyncMock(side_effect=lambda url, **kwargs: next(r for h, r in by_host.items() if h in url))

    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        patch.object(playback_activity.httpx, "AsyncClient", return_value=client),
        patch.object(playback_activity, "publish", new=AsyncMock()),
    ):
        result = await playback_activity.import_tautulli_history(length=10)
        again = await playback_activity.import_tautulli_history(length=10)

    assert result["imported"] == 2 and result["received"] == 2
    assert again["imported"] == 0
    rows = {row.source_session_id: row for row in async_db.query(PlaybackSession).all()}
    # Meme numero de ligne dans les deux Tautulli : deux lectures distinctes.
    assert rows["7"].title == "Film principal" and rows["7"].server_id is None
    assert rows[f"{second.id}:7"].title == "Film 4K" and rows[f"{second.id}:7"].server_id == second.id


@pytest.mark.asyncio
async def test_tautulli_still_requires_a_configuration(async_db):
    async_db.add(Settings(id=1))
    async_db.commit()
    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        pytest.raises(ValueError, match="pas configuré"),
    ):
        await playback_activity.import_tautulli_history()


@pytest.mark.asyncio
async def test_arr_import_refreshes_the_server_it_feeds(async_db):
    async_db.add(
        Settings(
            id=1,
            vff_enabled=True,
            plex_url="http://main:32400",
            plex_token="tok",
            vff_libraries=json.dumps([{"name": "Films", "kind": "movie"}]),
        )
    )
    second = PlexServer(
        name="Plex 4K",
        url="http://uhd:32400",
        token="tok2",
        libraries=json.dumps([{"name": "Films", "kind": "movie"}]),
    )
    async_db.add(second)
    async_db.commit()
    settings = async_db.query(Settings).first()
    vff_scanner._last_section_refresh.clear()

    with (
        patch.object(vff_scanner, "AsyncSessionLocal", return_value=async_db),
        patch.object(vff_scanner.plex_finder, "refresh_sections_blocking") as refresh,
    ):
        await vff_scanner.trigger_plex_library_refresh(settings, "movie", plex_server_id=second.id)
        # Meme nom de section sur le principal : l'anti-rebond du 4K ne le bloque pas.
        await vff_scanner.trigger_plex_library_refresh(settings, "movie")

    assert [call.args for call in refresh.call_args_list] == [
        ("http://uhd:32400", "tok2", ["Films"]),
        ("http://main:32400", "tok", ["Films"]),
    ]
    vff_scanner._last_section_refresh.clear()


def test_arr_instance_api_stores_the_primary_as_null():
    db = make_test_session()
    primary = db.query(PlexServer).filter(PlexServer.is_primary).first()
    if primary is None:
        primary = PlexServer(name="Serveur principal", is_primary=True)
        db.add(primary)
    second = PlexServer(name="Plex 4K", url="http://uhd:32400", token="t")
    db.add(second)
    db.commit()
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app, raise_server_exceptions=False)
    body = {"name": "Radarr 4K", "arr_type": "radarr", "url": "http://radarr", "api_key": "k", "enabled": False}
    try:
        created = client.post("/api/arr-instances", json={**body, "plex_server_id": second.id})
        assert created.status_code == 200 and created.json()["plex_server_id"] == second.id
        instance_id = created.json()["id"]
        updated = client.put(f"/api/arr-instances/{instance_id}", json={**body, "plex_server_id": primary.id})
        assert updated.status_code == 200 and updated.json()["plex_server_id"] is None
        assert client.put(f"/api/arr-instances/{instance_id}", json={**body, "plex_server_id": 9999}).status_code == 422
        assert db.query(ArrInstance).filter_by(id=instance_id).one().plex_server_id is None
    finally:
        app.dependency_overrides.pop(require_admin, None)
        app.dependency_overrides.pop(get_db, None)
        db.close()


def test_plex_server_api_masks_the_tautulli_key():
    db = make_test_session()
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app, raise_server_exceptions=False)
    body = {"name": "Plex 4K", "url": "http://uhd:32400", "token": "t"}
    try:
        with patch("app.routers.plex_servers_api.fetch_identity", new=AsyncMock(return_value=None)):
            created = client.post(
                "/api/plex-servers", json={**body, "tautulli_url": "http://tautulli-uhd/", "tautulli_api_key": "secret"}
            ).json()
            assert created["tautulli_url"] == "http://tautulli-uhd"
            assert created["tautulli_api_key"] == "••••••••" and created["tautulli_api_key_configured"] is True
            # La clé masquée renvoyée par le formulaire ne remplace pas la vraie.
            client.put(
                f"/api/plex-servers/{created['id']}",
                json={
                    **body,
                    "token": "••••••••",
                    "tautulli_url": "http://tautulli-uhd",
                    "tautulli_api_key": "••••••••",
                },
            )
            assert db.query(PlexServer).filter_by(id=created["id"]).one().tautulli_api_key == "secret"
            # Sans URL, le Tautulli du serveur est retiré.
            client.put(f"/api/plex-servers/{created['id']}", json={**body, "token": "••••••••", "tautulli_url": ""})
            db.expire_all()
            server = db.query(PlexServer).filter_by(id=created["id"]).one()
            assert server.tautulli_url is None and server.tautulli_api_key is None
    finally:
        app.dependency_overrides.pop(require_admin, None)
        app.dependency_overrides.pop(get_db, None)
        db.close()
