"""Tests unitaires pour les routes de sauvegarde/restauration complète (reprise après sinistre).

Les garde-fous (confirmation, compte déjà existant, session validée avant la restauration)
sont vérifiés ici avec une restauration simulée. Le chemin réel (pg_dump/pg_restore
effectifs) est vérifié manuellement avec des conteneurs jetables, pas sous pytest.
"""

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async as get_db
from app.main import app
from app.models import Settings
from app.routers import auth as auth_router
from app.routers.backup_api import require_admin as backup_require_admin
from tests.async_support import make_test_session


@pytest.fixture()
def db_session():
    session = make_test_session()
    yield session
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


def test_full_restore_requires_confirm_phrase(admin_client):
    """Une confirmation incorrecte est refusée avant toute action destructrice."""
    r = admin_client.post(
        "/api/backup/full/restore",
        files={"file": ("backup.zip", b"fake", "application/zip")},
        data={"confirm": "yes please"},
    )
    assert r.status_code == 400
    assert "REMPLACER" in r.json()["detail"]


def test_setup_restore_refuses_when_account_already_exists(anon_client, db_session):
    db_session.query(Settings).delete()
    db_session.add(Settings(id=1, auth_username="admin", auth_password_hash="hash"))
    db_session.commit()

    r = anon_client.post("/api/auth/setup/restore", files={"file": ("backup.zip", b"fake", "application/zip")})
    assert r.status_code == 403


# --- Regression : auto-blocage de la restauration -----------------------------
#
# Incident reel : la session de la requete restait ouverte pendant toute la duree de
# perform_full_restore. PostgreSQL la voyait "idle in transaction" et elle retenait des
# verrous de lecture (Settings -> email_templates) que le `pg_restore --clean` doit
# obtenir en exclusif pour ses DROP. La restauration attendait donc un verrou que la
# requete elle-meme detenait : blocage de 13 minutes, jusqu'a tuer la session a la main.


def _restore_probe(monkeypatch, module, db_session):
    """Instrumente la route : enregistre si la session est validee AVANT la restauration."""
    observed = {}
    committed = []

    real_commit = db_session.commit
    monkeypatch.setattr(db_session, "commit", lambda *a, **k: (committed.append(1), real_commit(*a, **k))[1])

    async def fake_restore(*_args, **_kwargs):
        observed["committed_before_restore"] = bool(committed)
        return {"status": "ok", "safety_backup": "/tmp/x.dump", "restored_data_files": []}

    monkeypatch.setattr(module, "perform_full_restore", fake_restore)
    # La route programme os._exit pour redemarrer le conteneur : sans neutralisation,
    # elle tuerait le processus pytest deux secondes plus tard.
    monkeypatch.setattr(module.os, "_exit", lambda _code: None)
    return observed


def test_full_restore_commits_session_before_touching_the_database(admin_client, db_session, monkeypatch):
    from app.routers import backup_api

    observed = _restore_probe(monkeypatch, backup_api, db_session)

    r = admin_client.post(
        "/api/backup/full/restore",
        files={"file": ("backup.zip", b"fake", "application/zip")},
        data={"confirm": "REMPLACER"},
    )

    assert r.status_code == 200
    assert observed["committed_before_restore"], (
        "La session doit etre validee AVANT perform_full_restore : sinon elle reste "
        "'idle in transaction' et bloque le pg_restore sur ses propres verrous."
    )


def test_setup_restore_commits_session_before_touching_the_database(anon_client, db_session, monkeypatch):
    db_session.query(Settings).delete()
    db_session.commit()

    observed = _restore_probe(monkeypatch, auth_router, db_session)

    r = anon_client.post("/api/auth/setup/restore", files={"file": ("backup.zip", b"fake", "application/zip")})

    assert r.status_code == 200
    assert observed["committed_before_restore"], (
        "Meme regression que /api/backup/full/restore, sur le chemin d'installation initiale."
    )
