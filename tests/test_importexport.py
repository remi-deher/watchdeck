"""Tests unitaires pour routers/importexport.py (export et import de données)."""

import io
import json
import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db_async as get_db
from app.main import app
from app.models import (
    Base,
    EmailBranding,
    EmailProvider,
    EmailTemplate,
    MediaRequest,
    PlexUser,
    RequestSeasonStatus,
    Settings,
)
from app.routers.importexport import require_admin as ie_require_auth
from tests.async_support import TestSession

# ---------------------------------------------------------------------------
# Base de données en mémoire partagée entre les tests du module
# StaticPool : toutes les connexions (y compris le thread du TestClient)
# utilisent la même connexion SQLite → même DB en mémoire.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine)
    session = TestSession(Session())
    yield session
    session.rollback()
    session.close()


@pytest.fixture()
def client(db_session):
    app.dependency_overrides[ie_require_auth] = lambda: None
    app.dependency_overrides[get_db] = lambda: db_session
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    app.dependency_overrides.pop(ie_require_auth, None)
    app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# GET /api/export
# ---------------------------------------------------------------------------


def test_export_returns_json_with_version(client, db_session):
    r = client.get("/api/export")
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == 3
    assert "exported_at" in data
    assert "settings" in data
    assert "users" in data
    assert "requests" in data
    assert "email_providers" in data
    assert "email_branding" in data
    assert "email_templates" in data


def test_export_includes_settings(client, db_session):
    db_session.query(Settings).delete()
    s = Settings(id=1, smtp_from="noreply@example.com")
    db_session.add(s)
    db_session.commit()

    r = client.get("/api/export")
    assert r.status_code == 200
    data = r.json()
    assert data["settings"]["smtp_from"] == "noreply@example.com"


def test_export_includes_users(client, db_session):
    db_session.query(PlexUser).delete()
    u = PlexUser(plex_user_id="alice", display_name="Alice", enabled=True)
    db_session.add(u)
    db_session.commit()

    r = client.get("/api/export")
    users = r.json()["users"]
    assert any(u["plex_user_id"] == "alice" for u in users)


def test_export_content_disposition(client, db_session):
    r = client.get("/api/export")
    assert "attachment" in r.headers.get("content-disposition", "")
    assert ".json" in r.headers.get("content-disposition", "")


# ---------------------------------------------------------------------------
# POST /api/import — erreurs
# ---------------------------------------------------------------------------


def test_import_invalid_json_returns_400(client):
    r = client.post("/api/import", files={"file": ("export.json", b"NOT JSON", "application/json")})
    assert r.status_code == 400


def test_import_wrong_version_returns_400(client):
    payload = json.dumps({"version": 99, "settings": {}, "users": [], "requests": []}).encode()
    r = client.post("/api/import", files={"file": ("export.json", payload, "application/json")})
    assert r.status_code == 400
    assert "version" in r.json()["detail"].lower()


def test_inspect_legacy_sqlite_upload(client, tmp_path):
    path = tmp_path / "legacy.db"
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE settings (id INTEGER PRIMARY KEY);
            CREATE TABLE plex_users (id INTEGER PRIMARY KEY);
            CREATE TABLE media_requests (id INTEGER PRIMARY KEY);
            INSERT INTO settings VALUES (1);
            INSERT INTO plex_users VALUES (1);
            INSERT INTO media_requests VALUES (1);
            """
        )

    r = client.post(
        "/api/migration/sqlite/inspect",
        files={"file": ("legacy.db", path.read_bytes(), "application/octet-stream")},
    )

    assert r.status_code == 200
    assert r.json()["integrity"] == "ok"
    assert r.json()["total_rows"] == 3


def test_inspect_legacy_rejects_wrong_extension(client):
    r = client.post(
        "/api/migration/sqlite/inspect",
        files={"file": ("legacy.txt", b"not sqlite", "text/plain")},
    )

    assert r.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/import — succès
# ---------------------------------------------------------------------------


def test_import_creates_settings(client, db_session):
    db_session.query(Settings).delete()
    db_session.commit()

    payload = json.dumps(
        {
            "version": 1,
            "settings": {"smtp_from": "test@test.com", "plex_url": "http://plex.test.com"},
            "users": [],
            "requests": [],
        }
    ).encode()
    r = client.post("/api/import", files={"file": ("export.json", payload, "application/json")})
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["stats"]["settings"] is True

    s = db_session.query(Settings).first()
    assert s is not None
    assert s.smtp_from == "test@test.com"
    assert s.plex_url == "http://plex.test.com"


def test_import_upserts_users(client, db_session):
    db_session.query(PlexUser).delete()
    db_session.commit()

    payload = json.dumps(
        {
            "version": 1,
            "settings": {},
            "users": [
                {"plex_user_id": "bob", "display_name": "Bob", "enabled": True},
                {"plex_user_id": "carol", "display_name": "Carol", "enabled": False},
            ],
            "requests": [],
        }
    ).encode()
    r = client.post("/api/import", files={"file": ("export.json", payload, "application/json")})
    assert r.status_code == 200
    assert r.json()["stats"]["users_upserted"] == 2

    users = db_session.query(PlexUser).all()
    assert any(u.plex_user_id == "bob" for u in users)


def test_import_upserts_requests(client, db_session):
    db_session.query(MediaRequest).delete()
    db_session.query(PlexUser).delete()
    db_session.commit()

    payload = json.dumps(
        {
            "version": 1,
            "settings": {},
            "users": [],
            "requests": [
                {
                    "plex_user_id": "alice",
                    "title": "Dune",
                    "media_type": "movie",
                    "status": "sent_to_arr",
                }
            ],
        }
    ).encode()
    r = client.post("/api/import", files={"file": ("export.json", payload, "application/json")})
    assert r.status_code == 200
    assert r.json()["stats"]["requests_upserted"] == 1

    req = db_session.query(MediaRequest).filter(MediaRequest.title == "Dune").first()
    assert req is not None


def test_import_does_not_overwrite_secret_if_empty(client, db_session):
    """Un secret (colonne EncryptedText, ex: plex_token) n'est jamais écrasé par une valeur vide importée."""
    db_session.query(Settings).delete()
    s = Settings(id=1, plex_token="secret123")
    db_session.add(s)
    db_session.commit()

    payload = json.dumps(
        {
            "version": 1,
            "settings": {"plex_token": ""},
            "users": [],
            "requests": [],
        }
    ).encode()
    client.post("/api/import", files={"file": ("export.json", payload, "application/json")})

    db_session.expire_all()
    s = db_session.query(Settings).first()
    assert s.plex_token == "secret123"


def test_export_excludes_email_provider_secret_by_default(client, db_session):
    db_session.query(EmailProvider).delete()
    db_session.add(EmailProvider(name="Perso", provider_type="smtp", smtp_host="smtp.test.com", smtp_password="s3cret"))
    db_session.commit()

    r = client.get("/api/export")
    providers = r.json()["email_providers"]
    assert any(p["name"] == "Perso" and p["smtp_host"] == "smtp.test.com" for p in providers)
    assert all("smtp_password" not in p or not p["smtp_password"] for p in providers)


def test_import_upserts_email_provider(client, db_session):
    db_session.query(EmailProvider).delete()
    db_session.commit()

    payload = json.dumps(
        {
            "version": 3,
            "settings": {},
            "users": [],
            "requests": [],
            "email_providers": [
                {"name": "Perso", "provider_type": "smtp", "smtp_host": "smtp.test.com", "smtp_password": "s3cret"}
            ],
        }
    ).encode()
    r = client.post("/api/import", files={"file": ("export.json", payload, "application/json")})
    assert r.status_code == 200
    assert r.json()["stats"]["email_providers_upserted"] == 1

    provider = db_session.query(EmailProvider).filter(EmailProvider.name == "Perso").first()
    assert provider is not None
    assert provider.smtp_host == "smtp.test.com"
    assert provider.smtp_password == "s3cret"


def test_import_does_not_overwrite_email_provider_secret_if_empty(client, db_session):
    db_session.query(EmailProvider).delete()
    db_session.add(EmailProvider(name="Perso", provider_type="smtp", smtp_password="s3cret"))
    db_session.commit()

    payload = json.dumps(
        {
            "version": 3,
            "settings": {},
            "users": [],
            "requests": [],
            "email_providers": [{"name": "Perso", "provider_type": "smtp", "smtp_password": ""}],
        }
    ).encode()
    client.post("/api/import", files={"file": ("export.json", payload, "application/json")})

    db_session.expire_all()
    provider = db_session.query(EmailProvider).filter(EmailProvider.name == "Perso").first()
    assert provider.smtp_password == "s3cret"


def test_import_merges_email_branding(client, db_session):
    db_session.query(EmailBranding).delete()
    db_session.query(Settings).delete()
    db_session.commit()

    payload = json.dumps(
        {
            "version": 3,
            "settings": {},
            "users": [],
            "requests": [],
            "email_branding": {"header_brand": "Watchdeck", "brand_color": "#22d3ee"},
        }
    ).encode()
    r = client.post("/api/import", files={"file": ("export.json", payload, "application/json")})
    assert r.status_code == 200
    assert r.json()["stats"]["email_branding"] is True

    branding = db_session.query(EmailBranding).first()
    assert branding is not None
    assert branding.header_brand == "Watchdeck"
    assert branding.brand_color == "#22d3ee"


def test_import_upserts_email_template_by_event(client, db_session):
    db_session.query(EmailTemplate).delete()
    db_session.query(Settings).delete()
    db_session.commit()

    payload = json.dumps(
        {
            "version": 3,
            "settings": {},
            "users": [],
            "requests": [],
            "email_templates": [{"event": "available", "subject": "[Watchdeck] Disponible : {titre}"}],
        }
    ).encode()
    r = client.post("/api/import", files={"file": ("export.json", payload, "application/json")})
    assert r.status_code == 200
    assert r.json()["stats"]["email_templates_upserted"] == 1

    tpl = db_session.query(EmailTemplate).filter(EmailTemplate.event == "available").first()
    assert tpl is not None
    assert tpl.subject == "[Watchdeck] Disponible : {titre}"


def test_import_upserts_request_season_statuses(client, db_session):
    db_session.query(RequestSeasonStatus).delete()
    db_session.query(MediaRequest).delete()
    db_session.query(PlexUser).delete()
    db_session.commit()

    payload = json.dumps(
        {
            "version": 3,
            "settings": {},
            "users": [],
            "requests": [
                {
                    "plex_user_id": "alice",
                    "title": "The Wire",
                    "media_type": "tv",
                    "status": "sent_to_arr",
                    "season_statuses": [
                        {"season_number": 1, "episodes_available_count": 10, "episodes_total_count": 10, "status": "available"},
                        {"season_number": 2, "episodes_available_count": 3, "episodes_total_count": 12, "status": "partially_available"},
                    ],
                }
            ],
        }
    ).encode()
    r = client.post("/api/import", files={"file": ("export.json", payload, "application/json")})
    assert r.status_code == 200
    assert r.json()["stats"]["requests_upserted"] == 1
    assert r.json()["stats"]["season_statuses_upserted"] == 2

    req = db_session.query(MediaRequest).filter(MediaRequest.title == "The Wire").first()
    statuses = db_session.query(RequestSeasonStatus).filter(RequestSeasonStatus.request_id == req.id).order_by(RequestSeasonStatus.season_number).all()
    assert len(statuses) == 2
    assert statuses[0].status == "available"
    assert statuses[1].episodes_available_count == 3

    # Reimporter le meme payload met a jour en place plutot que dupliquer.
    client.post("/api/import", files={"file": ("export.json", payload, "application/json")})
    count = db_session.query(RequestSeasonStatus).filter(RequestSeasonStatus.request_id == req.id).count()
    assert count == 2


def test_export_roundtrips_request_with_season_statuses(client, db_session):
    db_session.query(RequestSeasonStatus).delete()
    db_session.query(MediaRequest).delete()
    db_session.commit()

    req = MediaRequest(plex_user_id="alice", title="The Wire", media_type="tv", status="sent_to_arr")
    db_session.add(req)
    db_session.commit()
    db_session.add(RequestSeasonStatus(request_id=req.id, season_number=1, status="available"))
    db_session.commit()

    r = client.get("/api/export")
    requests = r.json()["requests"]
    wire = next(item for item in requests if item["title"] == "The Wire")
    assert wire["season_statuses"] == [
        {"season_number": 1, "episodes_available_count": 0, "episodes_total_count": 0, "status": "available", "updated_at": wire["season_statuses"][0]["updated_at"]}
    ]


def test_import_idempotent_on_second_call(client, db_session):
    """Importer deux fois le même payload ne doit pas créer de doublons."""
    db_session.query(PlexUser).delete()
    db_session.commit()

    payload = json.dumps(
        {
            "version": 1,
            "settings": {},
            "users": [{"plex_user_id": "dave", "display_name": "Dave"}],
            "requests": [],
        }
    ).encode()

    client.post("/api/import", files={"file": ("export.json", payload, "application/json")})
    client.post("/api/import", files={"file": ("export.json", payload, "application/json")})

    count = db_session.query(PlexUser).filter(PlexUser.plex_user_id == "dave").count()
    assert count == 1
