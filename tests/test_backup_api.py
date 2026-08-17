"""Tests unitaires pour les routes de sauvegarde/restauration complète (reprise après sinistre).

DATABASE_URL est SQLite sous pytest (voir pytest.ini / app.database) : les deux routes
refusent donc systématiquement avant toute action destructrice (`_require_postgres`),
ce qui est justement le comportement à vérifier ici. Le chemin PostgreSQL réel (pg_dump/
pg_restore effectifs) est vérifié manuellement avec des conteneurs jetables, pas sous pytest.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db_async as get_db
from app.main import app
from app.models import Base, Settings
from app.routers import auth as auth_router
from app.routers.backup_api import require_admin as backup_require_admin
from tests.async_support import TestSession


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
def admin_client(db_session):
    app.dependency_overrides[backup_require_admin] = lambda: None
    app.dependency_overrides[get_db] = lambda: db_session
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    app.dependency_overrides.pop(backup_require_admin, None)
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture()
def anon_client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    c = TestClient(app, raise_server_exceptions=False)
    yield c
    app.dependency_overrides.pop(get_db, None)


def test_full_backup_download_refuses_on_sqlite(admin_client):
    r = admin_client.get("/api/backup/full")
    assert r.status_code == 409


def test_full_restore_requires_confirm_phrase(admin_client, monkeypatch):
    """Sous PostgreSQL, une confirmation incorrecte est refusée avant toute action destructrice."""
    monkeypatch.setattr("app.routers.backup_api.DATABASE_URL", "postgresql://fake")
    r = admin_client.post(
        "/api/backup/full/restore",
        files={"file": ("backup.zip", b"fake", "application/zip")},
        data={"confirm": "yes please"},
    )
    assert r.status_code == 400
    assert "REMPLACER" in r.json()["detail"]


def test_full_restore_refuses_on_sqlite_even_with_correct_confirm(admin_client):
    r = admin_client.post(
        "/api/backup/full/restore",
        files={"file": ("backup.zip", b"fake", "application/zip")},
        data={"confirm": "REMPLACER"},
    )
    assert r.status_code == 409


def test_setup_restore_refuses_on_sqlite(anon_client, db_session):
    db_session.query(Settings).delete()
    db_session.commit()

    r = anon_client.post("/setup/restore", files={"file": ("backup.zip", b"fake", "application/zip")})
    assert r.status_code == 409


def test_setup_restore_refuses_when_account_already_exists(anon_client, db_session, monkeypatch):
    monkeypatch.setattr(auth_router, "DATABASE_URL", "postgresql://fake")
    db_session.query(Settings).delete()
    db_session.add(Settings(id=1, auth_username="admin", auth_password_hash="hash"))
    db_session.commit()

    r = anon_client.post("/setup/restore", files={"file": ("backup.zip", b"fake", "application/zip")})
    assert r.status_code == 403
