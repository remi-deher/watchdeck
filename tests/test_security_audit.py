"""Correctifs de l'audit de securite du 2026-09-30 (un test par faille corrigee)."""

import time
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.backup_restore import forbidden_dump_entries
from app.database import get_db_async
from app.dependencies import require_api_scope, require_auth
from app.log_buffer import redact_secrets
from app.main import app
from app.models import LoginAttempt, PlexUser, Settings
from app.routers.auth import _MAX_ATTEMPTS_PER_ACCOUNT, _can_link_by_username, _is_rate_limited
from app.routers.requests_api import _caller_plex_user_id
from app.services import session_security
from app.services.auth import hash_password
from app.services.email_service import render_subject, render_template
from app.services.session_security import REVOKED, _user_session_state, open_user_session
from app.utils import now_utc_naive
from tests.async_support import make_test_session


def _request(session: dict | None = None, api_key: str | None = None):
    request = MagicMock()
    request.session = session if session is not None else {}
    request.headers = {"X-Api-Key": api_key} if api_key else {}
    return request


USER_SESSION = {"authenticated": True, "role": "user", "is_owner": False, "plex_user_id": "alice", "user_id": 2}
MODERATOR_SESSION = {"authenticated": True, "role": "moderator", "is_owner": False, "plex_user_id": "mod"}
ADMIN_SESSION = {"authenticated": True, "role": "admin", "is_owner": True, "plex_user_id": "admin"}


# --- 1. /api/v1 ----------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["requests:read", "requests:write", "users:read", "system:read"])
async def test_simple_user_session_cannot_use_api_v1(scope):
    with pytest.raises(HTTPException) as exc:
        await require_api_scope(scope)(_request(dict(USER_SESSION)), None)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_moderator_session_reaches_request_scopes_only():
    await require_api_scope("requests:write")(_request(dict(MODERATOR_SESSION)), None)
    with pytest.raises(HTTPException) as exc:
        await require_api_scope("users:read")(_request(dict(MODERATOR_SESSION)), None)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_session_reaches_every_scope():
    for scope in ("requests:write", "users:read", "system:read"):
        await require_api_scope(scope)(_request(dict(ADMIN_SESSION)), None)


# --- 8. Scopes du token API ------------------------------------------------------------


@pytest.mark.asyncio
async def test_restricted_api_token_no_longer_opens_internal_routes():
    db = make_test_session()
    db.add(Settings(api_token="secret", api_token_scopes="system:read"))
    db.commit()
    with pytest.raises(HTTPException) as exc:
        await require_auth(_request(api_key="secret"), db)
    assert exc.value.status_code == 403
    db.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("scopes", [None, "*", "app:access,system:read"])
async def test_full_or_app_scoped_token_still_opens_internal_routes(scopes):
    db = make_test_session()
    db.add(Settings(api_token="secret", api_token_scopes=scopes))
    db.commit()
    await require_auth(_request(api_key="secret"), db)
    db.close()


# --- 2. et 3. Connexion Plex -------------------------------------------------------------


def _plex_client(db):
    app.dependency_overrides[get_db_async] = lambda: db
    return TestClient(app, raise_server_exceptions=False)


def test_plex_check_refuses_a_pin_this_browser_did_not_request(async_db):
    async_db.add(Settings(id=1, plex_token="srv"))
    async_db.commit()
    client = _plex_client(async_db)
    try:
        with patch("app.services.plex_api.check_auth_pin", new_callable=AsyncMock) as check:
            response = client.get("/api/auth/plex/check/123")
        assert response.status_code == 403
        check.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db_async, None)


def _start_pin(client, pin_id=123):
    with patch("app.routers.auth.get_auth_pin", new_callable=AsyncMock) as get_pin:
        get_pin.return_value = {"id": pin_id, "code": "abcd", "auth_url": "https://app.plex.tv/auth"}
        assert client.post("/api/auth/plex/pin").status_code == 200


def _sso(client, account, *, owner_uuid="owner-uuid", has_access=True):
    _start_pin(client)
    with (
        patch("app.services.plex_api.check_auth_pin", new_callable=AsyncMock, return_value="tok") as check,
        patch("app.routers.auth.get_plex_account", new_callable=AsyncMock, return_value=account),
        patch("app.routers.auth.has_server_access", new_callable=AsyncMock, return_value=has_access),
        patch("app.routers.auth.get_plex_owner_uuid", new_callable=AsyncMock, return_value=owner_uuid),
    ):
        response = client.get("/api/auth/plex/check/123")
    return response, check


def test_plex_check_passes_the_pin_code_to_plex(async_db):
    async_db.add(Settings(id=1, plex_token="srv"))
    async_db.commit()
    client = _plex_client(async_db)
    try:
        response, check = _sso(client, {"uuid": "u1", "username": "alice", "email": None, "thumb": None})
        assert response.status_code == 200
        check.assert_awaited_once_with(123, "abcd")
    finally:
        app.dependency_overrides.pop(get_db_async, None)


def test_plex_name_matching_the_local_admin_does_not_grant_admin(async_db):
    async_db.add(Settings(id=1, plex_token="srv", auth_username="remi", auth_password_hash=hash_password("x" * 12)))
    async_db.add(PlexUser(plex_user_id="remi", role="admin", source="local", password_hash=hash_password("x" * 12)))
    async_db.commit()
    client = _plex_client(async_db)
    try:
        response, _ = _sso(client, {"uuid": "intrus", "username": "remi", "email": None, "thumb": None})
        assert response.status_code == 403
        assert client.get("/api/auth/state").json()["authenticated"] is False
    finally:
        app.dependency_overrides.pop(get_db_async, None)


def test_plex_name_reused_by_another_account_does_not_inherit_it(async_db):
    async_db.add(Settings(id=1, plex_token="srv"))
    async_db.add(PlexUser(plex_user_id="bob", role="moderator", source="plex_sso", plex_account_uuid="old-bob"))
    async_db.commit()
    client = _plex_client(async_db)
    try:
        response, _ = _sso(client, {"uuid": "new-bob", "username": "bob", "email": None, "thumb": None})
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db_async, None)


def test_only_the_plex_server_owner_becomes_admin(async_db):
    async_db.add(Settings(id=1, plex_token="srv"))
    async_db.commit()
    client = _plex_client(async_db)
    try:
        response, _ = _sso(client, {"uuid": "owner-uuid", "username": "proprio", "email": None, "thumb": None})
        assert response.json()["role"] == "admin"
        client.cookies.clear()
        response, _ = _sso(client, {"uuid": "friend", "username": "ami", "email": None, "thumb": None})
        assert response.json()["role"] == "user"
    finally:
        app.dependency_overrides.pop(get_db_async, None)


def test_plex_login_requires_a_configured_server(async_db):
    async_db.add(Settings(id=1))
    async_db.commit()
    client = _plex_client(async_db)
    try:
        response, _ = _sso(client, {"uuid": "u", "username": "u", "email": None, "thumb": None})
        assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db_async, None)


def test_username_linking_is_reserved_to_accounts_without_identity():
    settings = Settings(auth_username="admin")
    assert _can_link_by_username(PlexUser(plex_user_id="legacy", source="api"), settings)
    assert not _can_link_by_username(PlexUser(plex_user_id="x", plex_account_uuid="u"), settings)
    assert not _can_link_by_username(PlexUser(plex_user_id="x", password_hash="h"), settings)
    assert not _can_link_by_username(PlexUser(plex_user_id="x", source="local"), settings)
    assert not _can_link_by_username(PlexUser(plex_user_id="admin", source="api"), settings)


def test_plex_client_identifier_is_specific_to_the_instance(tmp_path, monkeypatch):
    from app.services import plex_api

    monkeypatch.setattr(plex_api, "_client_identifier", None)
    monkeypatch.setattr(plex_api, "_CLIENT_ID_FILE", str(tmp_path / ".plex_client_id"))
    monkeypatch.delenv("WATCHDECK_PLEX_CLIENT_ID", raising=False)
    first = plex_api.client_identifier()
    assert first != "1c8e19c3-8824-4f2b-8a8b-3e5f2ea129a6"
    monkeypatch.setattr(plex_api, "_client_identifier", None)
    assert plex_api.client_identifier() == first


# --- 4. Comptes locaux ---------------------------------------------------------------------


def test_local_account_session_carries_its_identity():
    request = _request({})
    open_user_session(request, PlexUser(id=4, plex_user_id="carole", role="user", source=None))
    assert request.session["plex_user_id"] == "carole"


def test_user_without_identity_is_refused_instead_of_seeing_everything():
    session = {"authenticated": True, "role": "user", "is_owner": False, "plex_user_id": None}
    with pytest.raises(HTTPException) as exc:
        _caller_plex_user_id(_request(session), None)
    assert exc.value.status_code == 403
    assert _caller_plex_user_id(_request(dict(ADMIN_SESSION)), None) is None


# --- 5. Emails ----------------------------------------------------------------------------


def test_tag_values_are_neither_jinja_nor_html():
    html = render_template("Nouveau : {titre}", {"{titre}": "{{ 7*7 }} <a href='https://evil.example'>clic</a>"}, {})
    assert "49" not in html
    assert "<a href='https://evil.example'>" not in html
    assert "&lt;a href=" in html


def test_tags_still_work_inside_markdown_links():
    html = render_template("[Voir]({lien})", {"{lien}": "https://plex.example/web?a=1&b=2"}, {})
    assert 'href="https://plex.example/web?a=1&amp;b=2"' in html


def test_subject_cannot_carry_a_line_break():
    assert "\n" not in render_subject("Nouveau : {titre}", {"{titre}": "X\r\nBcc: a@b"}, fallback="f")


# --- 6. Revocation des sessions ---------------------------------------------------------------


def test_disabled_or_revoked_accounts_lose_their_session():
    active = PlexUser(id=1, plex_user_id="a", role="user", enabled=True, can_login=True, session_version=2)
    assert _user_session_state(active, 2)["role"] == "user"
    assert _user_session_state(active, 1) == REVOKED
    disabled = PlexUser(id=1, plex_user_id="a", role="user", enabled=False, can_login=True, session_version=0)
    assert _user_session_state(disabled, 0) == REVOKED
    blocked = PlexUser(id=1, plex_user_id="a", role="user", enabled=True, can_login=False, session_version=0)
    assert _user_session_state(blocked, 0) == REVOKED


@pytest.mark.asyncio
async def test_deleted_account_session_is_revoked(monkeypatch):
    class _Empty:
        def scalars(self):
            return self

        def first(self):
            return None

    class _Db:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def execute(self, *args, **kwargs):
            return _Empty()

    monkeypatch.setattr("app.database.AsyncSessionLocal", lambda: _Db())
    assert await session_security.resolve_session_state(None, "ghost", 99, 0) == REVOKED


# --- 9. Anti-bruteforce -------------------------------------------------------------------


@pytest.mark.asyncio
async def test_failures_against_one_account_block_it_from_any_ip(async_db):
    for index in range(_MAX_ATTEMPTS_PER_ACCOUNT):
        async_db.add(
            LoginAttempt(
                ip_address=f"198.51.100.{index}",
                username="victime",
                success=False,
                reason="bad_credentials",
                attempted_at=now_utc_naive() - timedelta(seconds=5),
            )
        )
    async_db.commit()
    assert await _is_rate_limited(async_db, "203.0.113.99", "victime")
    assert not await _is_rate_limited(async_db, "203.0.113.99", "autre")


def test_disabled_account_with_wrong_password_answers_like_any_bad_login(async_db):
    async_db.add(Settings(id=1, auth_username="admin", auth_password_hash=hash_password("password123")))
    async_db.add(
        PlexUser(plex_user_id="off", enabled=False, can_login=True, password_hash=hash_password("bonmotdepasse"))
    )
    async_db.commit()
    app.dependency_overrides[get_db_async] = lambda: async_db
    try:
        client = TestClient(app, raise_server_exceptions=False)
        response = client.post("/api/auth/login", json={"username": "off", "password": "mauvais"})
        assert response.status_code == 401
    finally:
        app.dependency_overrides.pop(get_db_async, None)


# --- 10. Re-authentification --------------------------------------------------------------


def _self_session_client(db, user_id, *, auth_at=None):
    from app.dependencies import current_user

    identity = {"id": user_id, "role": "user", "is_owner": False}
    app.dependency_overrides[get_db_async] = lambda: db
    app.dependency_overrides[current_user] = lambda: identity
    return TestClient(app, raise_server_exceptions=False)


def _clear_self_session():
    from app.dependencies import current_user

    app.dependency_overrides.pop(get_db_async, None)
    app.dependency_overrides.pop(current_user, None)


def test_changing_own_password_requires_the_current_one(async_db):
    user = PlexUser(plex_user_id="dora", password_hash=hash_password("ancienmotdepasse"))
    async_db.add(Settings(id=1))
    async_db.add(user)
    async_db.commit()
    client = _self_session_client(async_db, user.id)
    try:
        url = f"/api/users/{user.id}/password"
        assert client.post(url, json={"password": "nouveaumotdepasse"}).status_code == 403
        assert client.post(url, json={"password": "court", "current_password": "ancienmotdepasse"}).status_code == 400
        ok = client.post(url, json={"password": "nouveaumotdepasse", "current_password": "ancienmotdepasse"})
        assert ok.status_code == 200
        async_db.refresh(user)
        assert user.session_version == 1
    finally:
        _clear_self_session()


def test_disabling_own_totp_requires_a_code(async_db):
    from app.services.totp import generate_secret

    user = PlexUser(plex_user_id="eve", totp_secret=generate_secret(), totp_enabled=True)
    async_db.add(Settings(id=1))
    async_db.add(user)
    async_db.commit()
    client = _self_session_client(async_db, user.id)
    try:
        assert client.request("DELETE", f"/api/users/{user.id}/totp", json={"code": "000000"}).status_code == 403
        assert client.post(f"/api/users/{user.id}/totp/setup").status_code == 409
    finally:
        _clear_self_session()


# --- 12. CSRF -------------------------------------------------------------------------------


def test_cross_site_writes_are_refused():
    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/api/auth/login", json={}, headers={"Sec-Fetch-Site": "same-site"})
    assert response.status_code == 403
    assert client.get("/favicon.ico", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 204


# --- 11. En-tetes -----------------------------------------------------------------------------


def test_security_headers():
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/favicon.ico", headers={"X-Forwarded-Proto": "https"})
    csp = response.headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in csp and "object-src 'none'" in csp
    assert "Strict-Transport-Security" in response.headers
    assert "X-XSS-Protection" not in response.headers


# --- 14. Secrets lies aux URL ---------------------------------------------------------------


def test_changing_a_service_url_requires_its_secret_again(async_db):
    from app.dependencies import require_admin

    async_db.add(Settings(id=1, plex_url="http://plex.lan:32400", plex_token="secret-token"))
    async_db.commit()
    app.dependency_overrides[get_db_async] = lambda: async_db
    app.dependency_overrides[require_admin] = lambda: None
    try:
        client = TestClient(app, raise_server_exceptions=False)
        moved = client.put("/api/settings", json={"plex_url": "https://evil.example", "plex_token": "••••••••"})
        assert moved.status_code == 400
        same = client.put("/api/settings", json={"plex_url": "http://plex.lan:32400/", "plex_token": "••••••••"})
        assert same.status_code == 200
        assert "auth_password_hash" not in client.get("/api/settings").json()
    finally:
        app.dependency_overrides.pop(get_db_async, None)
        app.dependency_overrides.pop(require_admin, None)


# --- 16. et 17. Installation et restauration ------------------------------------------------


def test_setup_requires_the_installation_code(async_db, monkeypatch):
    monkeypatch.setenv("WATCHDECK_SETUP_CODE", "AAAA-BBBB")
    app.dependency_overrides[get_db_async] = lambda: async_db
    try:
        client = TestClient(app, raise_server_exceptions=False)
        body = {"username": "admin", "password": "password123", "password_confirm": "password123"}
        assert client.post("/api/auth/setup", json=body).status_code == 403
        assert client.post("/api/auth/setup", json={**body, "setup_code": "aaaa-bbbb"}).status_code == 200
    finally:
        app.dependency_overrides.pop(get_db_async, None)


def test_dumps_with_executable_objects_are_refused():
    toc = """;
; Archive created at 2026-10-01
;
215; 1259 16386 TABLE public plex_users watchdeck
3301; 0 16386 TABLE DATA public plex_users watchdeck
220; 1255 16400 FUNCTION public pwn() watchdeck
221; 2620 16401 TRIGGER public plex_users go watchdeck
"""
    assert forbidden_dump_entries(toc) == ["FUNCTION public pwn() watchdeck", "TRIGGER public plex_users go watchdeck"]
    assert forbidden_dump_entries("215; 1259 16386 TABLE public plex_users watchdeck") == []


# --- 18. Journaux ---------------------------------------------------------------------------


def test_url_secrets_are_masked_in_logs():
    line = 'POST /webhook/plex?secret=abc123&x=1 GET https://plex/lib?X-Plex-Token=tok"'
    redacted = redact_secrets(line)
    assert "abc123" not in redacted and "tok" not in redacted.split("X-Plex-Token=")[1][:3]
    assert "x=1" in redacted


def test_recent_auth_window_is_bounded():
    from app.routers.security_api import RECENT_AUTH_SECONDS, _require_recent_auth

    _require_recent_auth(_request({"auth_at": int(time.time())}))
    with pytest.raises(HTTPException):
        _require_recent_auth(_request({"auth_at": int(time.time()) - RECENT_AUTH_SECONDS - 5}))
