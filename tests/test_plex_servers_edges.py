"""Plusieurs serveurs Plex : cas limites des connexions, de l'API et des écouteurs websocket."""

import asyncio
import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async as get_db
from app.dependencies import require_admin
from app.main import app
from app.models import PlexServer, Settings
from app.services import plex_activity_ws, plex_api, plex_servers
from app.services.plex_servers import PlexServerConnection
from tests.async_support import make_test_session


def _primary(db) -> PlexServer:
    primary = db.query(PlexServer).filter(PlexServer.is_primary).first()
    if primary is None:
        primary = PlexServer(name="Serveur principal", is_primary=True)
        db.add(primary)
        db.commit()
    return primary


# --- services/plex_servers ------------------------------------------------------------


def test_parse_libraries_keeps_only_valid_entries():
    assert plex_servers.parse_libraries(None) == []
    assert plex_servers.parse_libraries("{pas du json") == []
    assert plex_servers.parse_libraries(json.dumps({"name": "Films"})) == []
    raw = json.dumps(
        [
            "texte",
            {"name": " Films 4K ", "kind": "MOVIE"},
            {"name": "", "kind": "movie"},
            {"name": "Photos", "kind": "photo"},
        ]
    )
    assert plex_servers.parse_libraries(raw) == [{"name": "Films 4K", "kind": "movie"}]


@pytest.mark.asyncio
async def test_connections_skip_incomplete_servers_and_list_hosts(async_db):
    async_db.add(Settings(id=1, plex_url="http://Main:32400", plex_token="tok"))
    _primary(async_db)
    async_db.add(PlexServer(name="Sans jeton", url="http://notoken:32400"))
    async_db.add(PlexServer(name="Sans URL", token="t"))
    uhd = PlexServer(name="Plex 4K", url="http://uhd:32400", token="tok2")
    async_db.add(uhd)
    async_db.commit()

    connections = await plex_servers.active_connections(async_db)
    assert [conn.name for conn in connections] == ["Serveur principal", "Plex 4K"]
    assert await plex_servers.configured_hosts(async_db) == {"main": "tok", "notoken": None, "uhd": "tok2"}
    assert await plex_servers.connection_for(async_db, 999_999) is None
    assert await plex_servers.servers_by_item(async_db, []) == {}
    primary = await plex_servers.connection_for_item(async_db, None)
    assert primary is not None and primary.is_primary


def test_pick_item_connection_falls_back_to_the_primary():
    primary = PlexServerConnection(1, "Principal", True, "http://main", "t", [])
    uhd = PlexServerConnection(2, "4K", False, "http://uhd", "t2", [])
    # Seul un serveur desactive (absent des connexions) porte le media.
    assert plex_servers.pick_item_connection({3}, [primary, uhd]) is primary
    assert plex_servers.pick_item_connection({2}, [primary, uhd]) is uhd
    assert plex_servers.pick_item_connection({2}, [uhd]) is uhd


# --- services/plex_api.fetch_identity -------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_identity_reads_the_machine_identifier():
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"MediaContainer": {"machineIdentifier": "abc"}}
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.get = AsyncMock(return_value=response)
    with patch.object(plex_api.httpx, "AsyncClient", return_value=client):
        assert await plex_api.fetch_identity("http://uhd:32400/", "tok") == "abc"
    assert client.get.call_args.args[0] == "http://uhd:32400/identity"

    client.get = AsyncMock(side_effect=plex_api.httpx.ConnectError("down"))
    with patch.object(plex_api.httpx, "AsyncClient", return_value=client):
        assert await plex_api.fetch_identity("http://uhd:32400", "tok") is None
    assert await plex_api.fetch_identity("", "tok") is None


# --- routers/plex_servers_api ---------------------------------------------------------


@pytest.fixture
def api_client():
    db = make_test_session()
    db.add(Settings(id=1, plex_url="http://main:32400", plex_token="main-token"))
    db.commit()
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app, raise_server_exceptions=False), db
    finally:
        app.dependency_overrides.pop(require_admin, None)
        app.dependency_overrides.pop(get_db, None)
        db.close()


def test_servers_api_protects_the_primary_and_validates_input(api_client):
    client, db = api_client
    servers = client.get("/api/plex-servers").json()
    primary = next(server for server in servers if server["is_primary"])
    assert primary["url"] == "http://main:32400" and primary["token"] == "••••••••"

    assert client.patch(f"/api/plex-servers/{primary['id']}/toggle").status_code == 400
    assert client.delete(f"/api/plex-servers/{primary['id']}").status_code == 400
    renamed = client.put(f"/api/plex-servers/{primary['id']}", json={"name": "Salon"})
    assert renamed.status_code == 200 and renamed.json()["name"] == "Salon"
    assert client.put(f"/api/plex-servers/{primary['id']}", json={"name": " "}).status_code == 422
    assert client.get("/api/plex-servers/999999").status_code == 404

    assert client.post("/api/plex-servers", json={"name": "4K", "url": "http://uhd"}).status_code == 422
    bad = {"name": "4K", "url": "http://uhd", "token": "t", "libraries": "{pas du json"}
    assert client.post("/api/plex-servers", json=bad).status_code == 422


def test_servers_api_lifecycle_of_a_secondary(api_client):
    client, db = api_client
    with patch("app.routers.plex_servers_api.fetch_identity", new=AsyncMock(return_value="machine-1")):
        created = client.post(
            "/api/plex-servers",
            json={"name": "4K", "url": "http://uhd:32400/", "token": "t", "libraries": "[]"},
        ).json()
        assert created["url"] == "http://uhd:32400" and created["machine_identifier"] == "machine-1"
        assert created["libraries"] == ""
        assert client.get(f"/api/plex-servers/{created['id']}").json()["token_configured"] is True
        assert client.put(f"/api/plex-servers/{created['id']}", json={"name": "4K", "url": ""}).status_code == 422
        updated = client.put(
            f"/api/plex-servers/{created['id']}",
            json={"name": "4K", "url": "http://uhd2:32400", "token": "t2", "enabled": False},
        ).json()
    assert updated["url"] == "http://uhd2:32400" and updated["enabled"] is False
    assert client.patch(f"/api/plex-servers/{created['id']}/toggle").json() == {"id": created["id"], "enabled": True}

    with patch("app.routers.plex_servers_api.check_connection", new=AsyncMock(return_value=(True, "ok"))) as check:
        # Jeton masque : c'est le jeton enregistre qui est teste.
        result = client.post("/api/test/plex-server", json={"id": created["id"], "token": "••••••••"}).json()
        assert result == {"success": True, "message": "ok"}
        assert check.call_args.args == ("http://uhd2:32400", "t2")
        primary_id = next(s["id"] for s in client.get("/api/plex-servers").json() if s["is_primary"])
        client.post("/api/test/plex-server", json={"id": primary_id})
        assert check.call_args.args == ("http://main:32400", "main-token")
        client.post("/api/test/plex-server", json={"url": "http://new", "token": "••••••••"})
        assert check.call_args.args == ("http://new", "")

    assert client.delete(f"/api/plex-servers/{created['id']}").json() == {"status": "deleted"}
    assert db.query(PlexServer).filter_by(id=created["id"]).first() is None


# --- services/plex_activity_ws : ecouteurs des serveurs supplementaires ---------------


@pytest.mark.asyncio
async def test_secondary_connection_follows_settings_and_server_state(async_db):
    async_db.add(Settings(id=1, live_activity_enabled=True, plex_url="http://main:32400", plex_token="tok"))
    uhd = PlexServer(name="Plex 4K", url="http://uhd:32400", token="tok2")
    async_db.add(uhd)
    async_db.commit()
    with patch.object(plex_activity_ws, "AsyncSessionLocal", return_value=async_db):
        _settings, conn = await plex_activity_ws._secondary_connection(uhd.id)
        assert conn is not None and conn.url == "http://uhd:32400"
        async_db.query(Settings).first().live_activity_enabled = False
        async_db.commit()
        _settings, conn = await plex_activity_ws._secondary_connection(uhd.id)
        assert conn is None


@pytest.mark.asyncio
async def test_listen_once_tags_events_with_the_secondary_server():
    conn = PlexServerConnection(4, "Plex 4K", False, "http://uhd:32400", "tok2", [])
    settings = Settings(plex_url="http://main:32400", plex_token="tok", plex_verify_ssl=True)

    class _Socket:
        def __aiter__(self):
            async def _messages():
                yield "evenement"

            return _messages()

    @asynccontextmanager
    async def _connect(url, **kwargs):
        assert url.startswith("ws://uhd:32400/")
        yield _Socket()

    handled = []

    async def _handle(raw, server_id=None):
        handled.append((raw, server_id))

    on_connected = AsyncMock()
    with (
        patch.object(plex_activity_ws.websockets, "connect", _connect),
        patch.object(plex_activity_ws, "_handle_message", side_effect=_handle),
        patch.object(plex_activity_ws, "_HEALTHY_CONNECTION_SECONDS", 0),
    ):
        await plex_activity_ws._listen_once(settings, on_connected, conn)
    on_connected.assert_awaited_once()
    assert handled == [("evenement", 4)]


@pytest.mark.asyncio
async def test_secondary_listener_reconnects_then_stops_and_releases_its_lock():
    conn = PlexServerConnection(4, "Plex 4K", False, "http://uhd:32400", "tok2", [])
    settings = Settings(plex_url="http://main:32400", plex_token="tok")
    states = iter([(settings, conn), (settings, conn), (settings, None)])
    listen = AsyncMock(side_effect=[ConnectionError("coupure"), None])
    release = AsyncMock()
    with (
        patch.object(plex_activity_ws, "_secondary_connection", new=AsyncMock(side_effect=lambda _id: next(states))),
        patch.object(plex_activity_ws, "acquire_distributed_lock", new=AsyncMock(return_value="lock-token")) as acquire,
        patch.object(plex_activity_ws, "release_distributed_lock", new=release),
        patch.object(plex_activity_ws, "_listen_once", new=listen),
        patch.object(plex_activity_ws, "_BACKOFF_MIN", 0),
    ):
        await plex_activity_ws._run_secondary_listener(4)

    assert listen.await_count == 2
    assert acquire.await_args.args[0] == "watchdeck:locks:playback-websocket:4"
    release.assert_awaited_once_with("watchdeck:locks:playback-websocket:4", "lock-token")


@pytest.mark.asyncio
async def test_supervisor_starts_one_listener_per_enabled_secondary(async_db):
    _primary(async_db)
    uhd = PlexServer(name="Plex 4K", url="http://uhd:32400", token="t")
    off = PlexServer(name="Ancien", url="http://old:32400", token="t", enabled=False)
    async_db.add_all([uhd, off])
    async_db.commit()
    started = []

    async def _listener(server_id):
        started.append(server_id)
        await asyncio.sleep(3600)

    with (
        patch.object(plex_activity_ws, "AsyncSessionLocal", return_value=async_db),
        patch.object(plex_activity_ws, "_run_secondary_listener", side_effect=_listener),
        patch.object(plex_activity_ws, "_SETTINGS_RECHECK_INTERVAL", 0.01),
    ):
        task = asyncio.create_task(plex_activity_ws._supervise_secondary_listeners())
        await asyncio.sleep(0.05)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    assert set(started) == {uhd.id}
