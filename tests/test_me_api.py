"""Page Profil : le compte de l'appelant (/api/me), ouvert a tous les roles mais
limite a son propre compte et a ses preferences de notification."""

from fastapi.testclient import TestClient

from app.database import get_db_async as get_db
from app.dependencies import current_user, require_auth
from app.main import app
from app.models import MediaRequest, PasskeyCredential, PlexUser, RequestStatus
from tests.async_support import make_test_session


def _setup():
    db = make_test_session()
    alice = PlexUser(plex_user_id="alice", display_name="Alice", role="user", notify_digest=False)
    bob = PlexUser(plex_user_id="bob", display_name="Bob", role="user")
    db.add_all([alice, bob])
    db.commit()
    db.add_all(
        [
            MediaRequest(title="Dune", media_type="movie", plex_user_id="alice", status=RequestStatus.available),
            MediaRequest(
                title="Anora", media_type="movie", plex_user_id="alice", status=RequestStatus.pending_approval
            ),
            MediaRequest(title="Shogun", media_type="show", plex_user_id="alice", status=RequestStatus.sent_to_arr),
            MediaRequest(title="Autre", media_type="movie", plex_user_id="bob", status=RequestStatus.available),
            PasskeyCredential(user_id=alice.id, credential_id="cred-a", public_key="pk", name="Clé"),
        ]
    )
    db.commit()
    db.refresh(alice)
    db.refresh(bob)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[require_auth] = lambda: None
    return db, alice, bob


def _as(user):
    app.dependency_overrides[current_user] = lambda: {
        "id": user.id,
        "role": user.role,
        "plex_user_id": user.plex_user_id,
    }


def teardown_function():
    app.dependency_overrides.clear()


def test_me_returns_own_account_for_a_plain_user():
    _db, alice, _bob = _setup()
    _as(alice)
    resp = TestClient(app).get("/api/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == alice.id
    assert data["display_name"] == "Alice"
    assert data["passkey_count"] == 1
    assert data["stats"]["total"] == 3
    assert data["stats"]["available"] == 1
    assert data["stats"]["pending_approval"] == 1
    assert data["stats"]["sent"] == 1
    assert {row["title"] for row in data["recent_requests"]} == {"Dune", "Anora", "Shogun"}
    # Pas d'identifiants techniques ni de secrets dans la page d'un simple utilisateur.
    assert "details" not in data["recent_requests"][0]
    assert "password_hash" not in data and "totp_secret" not in data


def test_me_without_linked_account_is_404():
    _setup()
    app.dependency_overrides[current_user] = lambda: {"id": None, "role": "admin", "is_owner": True}
    assert TestClient(app).get("/api/me").status_code == 404


def test_preferences_update_only_touches_notification_fields():
    db, alice, _bob = _setup()
    _as(alice)
    resp = TestClient(app).put(
        "/api/me/preferences",
        json={"notify_digest": True, "notification_email": " alice@exemple.fr ,", "role": "admin"},
    )
    assert resp.status_code == 200
    db.refresh(alice)
    assert alice.notify_digest is True
    assert alice.notification_email == "alice@exemple.fr"
    assert alice.role == "user"


def test_preferences_reject_invalid_email():
    _db, alice, _bob = _setup()
    _as(alice)
    resp = TestClient(app).put("/api/me/preferences", json={"notification_email": "pas-un-email"})
    assert resp.status_code == 400


def test_revoke_other_sessions_bumps_session_version():
    db, alice, _bob = _setup()
    _as(alice)
    before = alice.session_version or 0
    assert TestClient(app).post("/api/me/sessions/revoke-others").status_code == 200
    db.refresh(alice)
    assert alice.session_version == before + 1


def test_data_export_is_scoped_to_the_caller():
    _db, alice, _bob = _setup()
    _as(alice)
    resp = TestClient(app).get("/api/me/data-export")
    assert resp.status_code == 200
    assert "attachment" in resp.headers["content-disposition"]
    assert "Autre" not in resp.text


def test_me_requires_authentication():
    app.dependency_overrides.clear()
    assert TestClient(app).get("/api/me").status_code == 401
