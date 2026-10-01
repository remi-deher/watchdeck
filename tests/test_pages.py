"""Routing contracts for the root Vue SPA and public authentication pages."""

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin
from app.main import app
from app.models import PlexUser, Settings
from app.services.auth import hash_password


@pytest.fixture()
def db(async_db):
    return async_db


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db_async] = lambda: db
    app.dependency_overrides[require_admin] = lambda: None
    browser = TestClient(app, raise_server_exceptions=True, follow_redirects=False)
    yield browser
    app.dependency_overrides.pop(get_db_async, None)
    app.dependency_overrides.pop(require_admin, None)


def _seed_account(db, username="admin", password="password123"):
    password_hash = hash_password(password)
    db.add(Settings(id=1, auth_username=username, auth_password_hash=password_hash))
    db.add(
        PlexUser(
            plex_user_id=username,
            display_name="Administrateur",
            role="admin",
            can_login=True,
            enabled=True,
            source="local",
            password_hash=password_hash,
        )
    )
    db.commit()


def _login(client, username="admin", password="password123"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_root_redirects_anonymous_user_to_login(client):
    response = client.get("/")
    assert response.status_code == 302
    assert response.headers["location"] == "/login"


def test_spa_is_served_at_root_after_login(client, db):
    _seed_account(db)
    login = _login(client)
    assert login.status_code == 200

    response = client.get("/")
    assert response.status_code == 200
    assert '<div id="app"></div>' in response.text
    assert "/vue/assets/" in response.text


@pytest.mark.parametrize(
    "path",
    [
        "/dashboard",
        "/discover",
        "/downloads",
        "/requests",
        "/library",
        "/issues",
        "/calendar",
        "/users",
        "/notifications",
        "/logs",
        "/settings",
        "/maintenance",
        "/profile",
        "/releases/42",
    ],
)
def test_vue_history_routes_return_spa(client, db, path):
    _seed_account(db)
    _login(client)
    response = client.get(path)
    assert response.status_code == 200
    assert '<div id="app"></div>' in response.text


def test_old_app_prefix_redirects_to_root_route(client):
    response = client.get("/app/requests")
    assert response.status_code == 308
    assert response.headers["location"] == "/requests"


@pytest.mark.parametrize(
    ("path", "destination"),
    [
        ("/templates", "/settings?tab=templates"),
        ("/setup/wizard", "/settings?tab=connections"),
    ],
)
def test_old_page_bookmarks_redirect_to_vue(client, path, destination):
    response = client.get(path)
    assert response.status_code == 308
    assert response.headers["location"] == destination


def test_unknown_api_route_stays_404(client, db):
    _seed_account(db)
    _login(client)
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


def _is_spa(response):
    return response.status_code == 200 and '<div id="app"></div>' in response.text


def test_login_page_is_served_by_the_spa_without_session(client, db):
    _seed_account(db)
    assert _is_spa(client.get("/login"))


def test_login_page_sends_a_fresh_instance_to_setup(client):
    response = client.get("/login")
    assert response.status_code == 302
    assert response.headers["location"] == "/setup"


def test_login_page_forwards_an_open_session_to_next(client, db):
    _seed_account(db)
    _login(client)
    response = client.get("/login?next=/library")
    assert response.status_code == 302
    assert response.headers["location"] == "/library"


def test_login_page_never_forwards_to_another_host(client, db):
    _seed_account(db)
    _login(client)
    response = client.get("/login?next=//evil.example")
    assert response.status_code == 302
    assert response.headers["location"] == "/"


def test_setup_page_is_served_by_the_spa_on_empty_database(client):
    assert _is_spa(client.get("/setup"))


def test_setup_page_is_closed_once_an_account_exists(client, db):
    _seed_account(db)
    response = client.get("/setup")
    assert response.status_code == 302
    assert response.headers["location"] == "/"


def test_nested_public_paths_stay_unknown(client):
    assert client.get("/login/whatever").status_code == 404


def test_auth_state_reports_setup_and_session(client, db):
    assert client.get("/api/auth/state").json() == {"setup_required": True, "authenticated": False}
    _seed_account(db)
    _login(client)
    assert client.get("/api/auth/state").json() == {"setup_required": False, "authenticated": True}


@pytest.fixture(autouse=True)
def _setup_code(monkeypatch):
    monkeypatch.setenv("WATCHDECK_SETUP_CODE", "TEST-CODE")


def test_setup_creates_admin_and_opens_session(client, db):
    response = client.post(
        "/api/auth/setup",
        json={
            "username": " admin ",
            "password": "password123",
            "password_confirm": "password123",
            "setup_code": "TEST-CODE",
        },
    )
    assert response.status_code == 200
    assert response.json()["redirect"] == "/settings?tab=connections"
    settings = db.query(Settings).first()
    assert settings.auth_username == "admin"
    assert client.get("/api/auth/state").json()["authenticated"] is True


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"username": "  ", "password": "password123", "password_confirm": "password123"}, "ne peut pas être vide"),
        ({"username": "admin", "password": "short", "password_confirm": "short"}, "au moins 8 caractères"),
        ({"username": "admin", "password": "password123", "password_confirm": "password124"}, "ne correspondent pas"),
    ],
)
def test_setup_rejects_invalid_account(client, payload, message):
    response = client.post("/api/auth/setup", json={**payload, "setup_code": "TEST-CODE"})
    assert response.status_code == 400
    assert message in response.json()["detail"]


def test_setup_cannot_replace_an_existing_account(client, db):
    _seed_account(db)
    response = client.post(
        "/api/auth/setup", json={"username": "intrus", "password": "password123", "password_confirm": "password123"}
    )
    assert response.status_code == 403
    assert db.query(Settings).first().auth_username == "admin"


def test_login_rejects_wrong_password(client, db):
    _seed_account(db)
    response = _login(client, password="wrong-password")
    assert response.status_code == 401
    assert response.json()["detail"] == "Identifiants incorrects."
    assert client.get("/api/auth/state").json()["authenticated"] is False


def test_logout_returns_to_login(client, db):
    _seed_account(db)
    _login(client)
    response = client.post("/logout", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/login"
    assert client.get("/api/auth/state").json()["authenticated"] is False


def test_logout_refuses_get(client, db):
    """Un lien ou une image externe vers /logout ne doit plus deconnecter."""
    _seed_account(db)
    _login(client)
    client.get("/logout", follow_redirects=False)
    assert client.get("/api/auth/state").json()["authenticated"] is True


def test_privacy_page_is_public(client):
    assert _is_spa(client.get("/privacy"))


def test_privacy_data_without_gdpr_contact(client):
    """Sans contact RGPD configure, la page invite a se rapprocher de l'administrateur
    plutot que d'afficher un contact vide/casse (voir PrivacyView.vue)."""
    response = client.get("/api/privacy")
    assert response.status_code == 200
    data = response.json()
    assert data["gdpr_contact_email"] is None
    assert data["active_channels"] == []


def test_privacy_data_reflects_configured_gdpr_contact_and_live_settings(client, db):
    db.add(
        Settings(
            id=1,
            gdpr_contact_name="Jean Dupont",
            gdpr_contact_email="jean@example.fr",
            notification_log_retention_days=30,
            email_enabled=True,
        )
    )
    db.commit()

    data = client.get("/api/privacy").json()

    assert data["gdpr_contact_name"] == "Jean Dupont"
    assert data["gdpr_contact_email"] == "jean@example.fr"
    assert data["notification_retention_days"] == 30
    assert data["active_channels"] == ["Email"]
