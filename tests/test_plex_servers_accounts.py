"""Plusieurs serveurs Plex : connexion Plex et utilisateurs de chaque compte proprietaire."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async as get_db
from app.main import app
from app.models import PlexServer, Settings
from app.services import plex_api, plex_servers
from tests.async_support import make_test_session


def _setup(db) -> None:
    db.add(Settings(id=1, plex_token="main-token"))
    if not db.query(PlexServer).filter(PlexServer.is_primary).first():
        db.add(PlexServer(name="Serveur principal", is_primary=True))
    db.add(PlexServer(name="Plex 4K", url="http://uhd:32400", token="uhd-token"))
    # Meme compte que le principal : son jeton n'est pas interroge deux fois.
    db.add(PlexServer(name="Plex musique", url="http://music:32400", token="main-token"))
    db.add(PlexServer(name="Ancien", url="http://old:32400", token="old-token", enabled=False))
    db.commit()


@pytest.mark.asyncio
async def test_account_tokens_are_unique_and_skip_disabled_servers(async_db):
    _setup(async_db)
    assert await plex_servers.account_tokens(async_db) == ["main-token", "uhd-token"]


@pytest.mark.asyncio
async def test_users_of_every_account_are_merged():
    def user(name, relationship, uuid=None):
        return {"plex_user_id": name, "plex_account_uuid": uuid, "relationship": relationship}

    by_token = {
        "main-token": ([user("remi", "owner", "u-remi"), user("alice", "friend", "u-alice")], []),
        "uhd-token": ([user("bob", "owner", "u-bob"), user("alice", "friend", "u-alice")], ["home: 403"]),
    }
    with patch.object(plex_api, "get_server_users", new=AsyncMock(side_effect=lambda token: by_token[token])):
        users, warnings = await plex_api.get_users_for_tokens(["main-token", "uhd-token"])

    assert {u["plex_user_id"]: u["relationship"] for u in users} == {
        "remi": "owner",
        "alice": "friend",
        # Proprietaire du serveur 4K seulement : un utilisateur comme un autre ici.
        "bob": "friend",
    }
    assert warnings == ["serveur 2 : home: 403"]


def _request_pin(client):
    """Le PIN doit avoir ete demande par ce navigateur (voir login_plex_check)."""
    with patch("app.routers.auth.get_auth_pin", new_callable=AsyncMock) as get_pin:
        get_pin.return_value = {"id": 123, "code": "abcd", "auth_url": "https://app.plex.tv/auth"}
        assert client.post("/api/auth/plex/pin").status_code == 200


@patch("app.routers.auth.get_plex_owner_uuid", new_callable=AsyncMock, return_value="uuid-owner")
@patch("app.services.plex_api.check_auth_pin", new_callable=AsyncMock)
@patch("app.routers.auth.get_plex_account", new_callable=AsyncMock)
@patch("app.routers.auth.has_server_access", new_callable=AsyncMock)
def test_sso_accepts_a_guest_of_a_secondary_server_only(mock_has_access, mock_get_account, mock_check_pin, _owner):
    mock_check_pin.return_value = "token123"
    mock_get_account.return_value = {"uuid": "uuid-guest", "username": "guest", "email": None, "thumb": None}
    mock_has_access.side_effect = lambda admin_token, **kwargs: admin_token == "uhd-token"

    db = make_test_session()
    _setup(db)
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app, raise_server_exceptions=False)
    try:
        _request_pin(client)
        resp = client.get("/api/auth/plex/check/123")
        assert resp.status_code == 200
        assert resp.json()["authenticated"] is True
        assert [call.kwargs["admin_token"] for call in mock_has_access.call_args_list] == ["main-token", "uhd-token"]

        mock_has_access.side_effect = None
        mock_has_access.return_value = False
        _request_pin(client)
        assert client.get("/api/auth/plex/check/123").status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        db.close()
