"""Chemins secondaires des correctifs de l'audit de securite du 2026-09-30.

Complete tests/test_security_audit.py : resynchronisation des sessions, defis WebAuthn
a usage unique, code d'installation, appels plex.tv et repli du compte administrateur."""

import logging
import subprocess
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app import backup_restore
from app.database import get_db_async
from app.dependencies import require_admin
from app.main import _warn_if_database_superuser, app
from app.models import PlexUser, Settings
from app.services import plex_api, session_security, setup_code
from app.services.auth import hash_password
from app.services.session_security import REVOKED

# --- Resynchronisation des sessions ---------------------------------------------------------


class _Result:
    def __init__(self, value):
        self._value = value

    def scalars(self):
        return self

    def first(self):
        return self._value


class _FakeDb:
    """Session async minimale : renvoie dans l'ordre les valeurs prevues pour chaque requete."""

    def __init__(self, *values):
        self.values = list(values)
        self.queries = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, *args, **kwargs):
        self.queries += 1
        return _Result(self.values.pop(0) if self.values else None)


def _user(**overrides):
    values = {"id": 7, "plex_user_id": "alice", "role": "user", "enabled": True, "can_login": True}
    values["session_version"] = 0
    values.update(overrides)
    return PlexUser(**values)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("plex_user_id", "username"),
    [("alice", None), (None, "alice")],
)
async def test_session_state_is_found_without_user_id(monkeypatch, plex_user_id, username):
    monkeypatch.setattr("app.database.AsyncSessionLocal", lambda: _FakeDb(_user()))
    state = await session_security.resolve_session_state(plex_user_id, username, None, 0)
    assert state == {"role": "user", "is_owner": False, "user_id": 7, "plex_user_id": "alice"}


@pytest.mark.asyncio
async def test_historic_admin_session_survives_until_its_mirror_account_exists(monkeypatch):
    settings = Settings(id=1, auth_username="admin")
    monkeypatch.setattr("app.database.AsyncSessionLocal", lambda: _FakeDb(None, settings))
    assert await session_security.resolve_session_state(None, "admin", None, 0) == {"role": "admin", "is_owner": True}
    monkeypatch.setattr("app.database.AsyncSessionLocal", lambda: _FakeDb(None, settings))
    assert await session_security.resolve_session_state(None, "intrus", None, 0) == REVOKED


@pytest.mark.asyncio
async def test_session_state_is_cached_then_reread_after_invalidation(monkeypatch):
    session_security.invalidate_session_cache()
    resolve = AsyncMock(return_value={"role": "user"})
    monkeypatch.setattr(session_security, "resolve_session_state", resolve)
    assert await session_security.cached_session_state("alice", None, 7, 0, ttl=60) == {"role": "user"}
    assert await session_security.cached_session_state("alice", None, 7, 0, ttl=60) == {"role": "user"}
    assert resolve.await_count == 1
    session_security.invalidate_session_cache()
    await session_security.cached_session_state("alice", None, 7, 0, ttl=60)
    assert resolve.await_count == 2
    session_security.invalidate_session_cache()


def test_revoking_sessions_keeps_the_current_one_valid():
    user = _user(session_version=3)
    request = MagicMock()
    request.session = {"user_id": 7, "sv": 3}
    session_security.revoke_user_sessions(user, request)
    assert user.session_version == 4
    assert request.session["sv"] == 4

    other = MagicMock()
    other.session = {"user_id": 8, "sv": 4}
    session_security.revoke_user_sessions(user, other)
    assert user.session_version == 5
    assert other.session["sv"] == 4


@pytest.mark.asyncio
async def test_webauthn_challenge_is_single_use():
    request = MagicMock()
    request.session = {}
    await session_security.store_challenge(request, "auth", b"defi-secret")
    copied_cookie = dict(request.session)

    assert await session_security.consume_challenge(request, "auth") == b"defi-secret"
    # Rejouer une ancienne copie du cookie ne redonne pas le defi.
    request.session = copied_cookie
    assert await session_security.consume_challenge(request, "auth") is None
    assert await session_security.consume_challenge(request, "auth") is None


# --- Code d'installation ---------------------------------------------------------------------


def test_setup_code_is_generated_once_then_discarded(tmp_path, monkeypatch, caplog):
    monkeypatch.delenv("WATCHDECK_SETUP_CODE", raising=False)
    monkeypatch.setattr(setup_code, "_SETUP_CODE_FILE", str(tmp_path / "data" / ".setup_code"))

    code = setup_code.setup_code()
    assert len(code) == 14
    assert setup_code.setup_code() == code
    assert setup_code.verify_setup_code(f"  {code.lower()} ")
    assert not setup_code.verify_setup_code("0000-0000-0000")
    assert not setup_code.verify_setup_code(None)

    with caplog.at_level(logging.WARNING, logger="app.services.setup_code"):
        setup_code.announce_setup_code()
    assert code in caplog.text

    setup_code.discard_setup_code()
    setup_code.discard_setup_code()
    assert setup_code.setup_code() != code


# --- plex.tv ----------------------------------------------------------------------------------


_REAL_ASYNC_CLIENT = httpx.AsyncClient


def _plex_transport(monkeypatch, handler):
    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return _REAL_ASYNC_CLIENT(*args, **kwargs)

    monkeypatch.setattr(plex_api.httpx, "AsyncClient", factory)
    monkeypatch.setattr(plex_api, "_client_identifier", "instance-id")


@pytest.mark.asyncio
async def test_pin_check_sends_the_pin_code_and_instance_identifier(monkeypatch):
    seen = {}

    def handler(request):
        seen["code"] = request.url.params.get("code")
        seen["client"] = request.headers.get("X-Plex-Client-Identifier")
        return httpx.Response(200, json={"authToken": "tok"})

    _plex_transport(monkeypatch, handler)
    assert await plex_api.check_auth_pin(42, "abcd") == "tok"
    assert seen == {"code": "abcd", "client": "instance-id"}


@pytest.mark.asyncio
async def test_plex_owner_uuid_is_read_from_the_server_token(monkeypatch):
    _plex_transport(monkeypatch, lambda request: httpx.Response(200, json={"uuid": "owner-uuid"}))
    assert await plex_api.get_plex_owner_uuid("srv") == "owner-uuid"

    _plex_transport(monkeypatch, lambda request: httpx.Response(401))
    assert await plex_api.get_plex_owner_uuid("srv") is None

    def broken(request):
        raise httpx.ConnectError("plex.tv injoignable")

    _plex_transport(monkeypatch, broken)
    assert await plex_api.get_plex_owner_uuid("srv") is None


@pytest.mark.asyncio
async def test_server_access_trusts_the_uuid_over_a_reused_name(monkeypatch):
    def handler(request):
        if request.url.path == "/api/v2/user":
            return httpx.Response(200, json={"uuid": "owner-uuid", "username": "owner"})
        if request.url.path == "/api/v2/friends":
            return httpx.Response(200, json=[{"uuid": "friend-uuid", "username": "bob", "email": "bob@example.fr"}])
        return httpx.Response(500)

    _plex_transport(monkeypatch, handler)
    assert await plex_api.has_server_access("srv", "bob", None, "friend-uuid")
    # Meme nom, autre compte Plex : refuse.
    assert not await plex_api.has_server_access("srv", "bob", None, "other-uuid")
    # Sans UUID cote connexion, l'email suffit.
    assert await plex_api.has_server_access("srv", "nobody", "BOB@example.fr", None)
    assert not await plex_api.has_server_access("srv", "nobody", None, None)


def test_unwritable_data_dir_still_yields_a_client_identifier(tmp_path, monkeypatch):
    blocker = tmp_path / "file"
    blocker.write_text("")
    monkeypatch.setattr(plex_api, "_client_identifier", None)
    monkeypatch.setattr(plex_api, "_CLIENT_ID_FILE", str(blocker / "sub" / ".plex_client_id"))
    monkeypatch.delenv("WATCHDECK_PLEX_CLIENT_ID", raising=False)
    assert plex_api.client_identifier()


# --- Base de donnees et restauration ------------------------------------------------------------


@pytest.mark.asyncio
async def test_superuser_database_role_is_reported(caplog):
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=True)))
    with caplog.at_level(logging.WARNING):
        await _warn_if_database_superuser(db)
    assert "superutilisateur" in caplog.text

    caplog.clear()
    db.execute = AsyncMock(side_effect=RuntimeError("pas de pg_roles"))
    await _warn_if_database_superuser(db)
    assert "superutilisateur" not in caplog.text


def test_restore_refuses_a_dump_with_executable_objects(tmp_path, monkeypatch):
    monkeypatch.setattr(backup_restore.shutil, "which", lambda name: "/usr/bin/pg_restore")
    toc = "; Archive\n1; 0 0 FUNCTION public piege() watchdeck\n"
    run = MagicMock(return_value=subprocess.CompletedProcess([], 0, stdout=toc, stderr=""))
    monkeypatch.setattr(backup_restore.subprocess, "run", run)
    with pytest.raises(backup_restore.BackupRestoreError, match="Archive refusee"):
        backup_restore.restore_postgres_dump(tmp_path / "dump", "postgresql://u:p@h/db")
    assert run.call_count == 1

    run.side_effect = subprocess.CalledProcessError(1, "pg_restore", stderr="not an archive")
    with pytest.raises(backup_restore.BackupRestoreError, match="illisible"):
        backup_restore.restore_postgres_dump(tmp_path / "dump", "postgresql://u:p@h/db")


# --- Routes de connexion ------------------------------------------------------------------------


@pytest.fixture()
def client(async_db):
    app.dependency_overrides[get_db_async] = lambda: async_db
    yield TestClient(app, raise_server_exceptions=True, follow_redirects=False)
    app.dependency_overrides.pop(get_db_async, None)


def test_legacy_admin_without_mirror_account_can_still_log_in(client, async_db):
    async_db.add(Settings(id=1, auth_username="admin", auth_password_hash=hash_password("password123")))
    async_db.commit()
    response = client.post("/api/auth/login", json={"username": "admin", "password": "password123"})
    assert response.status_code == 200
    assert client.get("/api/auth/state").json()["authenticated"] is True


def test_session_reports_the_sign_in_methods_of_the_account(client, async_db):
    password_hash = hash_password("password123")
    async_db.add(Settings(id=1, auth_username="admin", auth_password_hash=password_hash))
    async_db.add(
        PlexUser(
            plex_user_id="admin",
            role="admin",
            can_login=True,
            enabled=True,
            source="local",
            password_hash=password_hash,
        )
    )
    async_db.commit()
    assert client.post("/api/auth/login", json={"username": "admin", "password": "password123"}).status_code == 200
    identity = client.get("/api/session").json()
    assert identity["has_local_password"] is True
    assert identity["totp_enabled"] is False


def test_passkey_login_needs_a_challenge_issued_to_this_browser(client, async_db):
    response = client.post("/api/webauthn/login/verify", json={"id": "inconnue"})
    assert response.status_code == 400

    options = client.post("/api/webauthn/login/options")
    assert options.status_code == 200
    assert options.json()["challenge"]
    response = client.post("/api/webauthn/login/verify", json={"id": "inconnue"})
    assert response.status_code == 401
    # Le defi a ete consomme par la tentative precedente.
    assert client.post("/api/webauthn/login/verify", json={"id": "inconnue"}).status_code == 400


def test_onboarding_plex_pin_is_bound_to_the_admin_browser(async_db):
    app.dependency_overrides[require_admin] = lambda: None
    try:
        browser = TestClient(app)
        other = TestClient(app)
        with patch(
            "app.services.plex_api.get_auth_pin",
            new_callable=AsyncMock,
            return_value={"id": 5, "code": "wxyz", "auth_url": "https://app.plex.tv/auth"},
        ):
            assert browser.post("/api/plex/sso/pin").status_code == 200
        with patch("app.services.plex_api.check_auth_pin", new_callable=AsyncMock, return_value="tok") as check:
            assert other.get("/api/plex/sso/check/5").status_code == 403
            response = browser.get("/api/plex/sso/check/5")
        assert response.json() == {"authenticated": True, "token": "tok"}
        check.assert_awaited_once_with(5, "wxyz")
        # Le PIN est consomme une fois le token lu.
        assert browser.get("/api/plex/sso/check/5").status_code == 403
    finally:
        app.dependency_overrides.pop(require_admin, None)
