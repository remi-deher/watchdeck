"""Aperçu de l'administration : chiffres agrégés, cache d'images et derniers passages de maintenance."""

from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import (
    DownloadClient,
    MediaIssue,
    MediaRequest,
    NotificationLog,
    PlexUser,
    StorageConnection,
    StorageLocation,
    StorageTransfer,
)
from app.routers import admin_overview_api, image_proxy_api
from app.routers.admin_overview_api import daily_totals, scan_image_cache
from app.services import maintenance_history
from app.utils import now_utc_naive

# --- Parties pures ---------------------------------------------------------------------


def test_the_image_cache_is_counted_file_by_file(tmp_path):
    (tmp_path / "a.bin").write_bytes(b"x" * 10)
    (tmp_path / "a.meta").write_bytes(b"y" * 5)
    (tmp_path / "sous-dossier").mkdir()

    assert scan_image_cache(str(tmp_path)) == {"files": 2, "bytes": 15}


def test_a_missing_image_cache_counts_for_zero(tmp_path):
    assert scan_image_cache(str(tmp_path / "absent")) == {"files": 0, "bytes": 0}


@pytest.mark.asyncio
async def test_the_image_cache_scan_is_kept_for_a_minute(tmp_path, monkeypatch):
    monkeypatch.setattr(image_proxy_api, "_IMAGE_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(admin_overview_api, "_image_scan", None)
    (tmp_path / "a.bin").write_bytes(b"x" * 4)

    first = await admin_overview_api._images()
    (tmp_path / "b.bin").write_bytes(b"x" * 4)
    second = await admin_overview_api._images()

    # Le parcours coûte sur des dizaines de milliers de fichiers : le second appel relit le premier.
    assert first == second == {"files": 1, "bytes": 4}


def test_daily_totals_keep_the_time_scale_with_empty_days():
    today = date(2026, 10, 7)
    rows = [(today, 5), (today - timedelta(days=2), 3), (today - timedelta(days=30), 99)]

    # Du plus ancien au plus récent ; un jour sans envoi vaut zéro, un jour hors fenêtre est ignoré.
    assert daily_totals(rows, today) == [0, 0, 0, 0, 3, 0, 5]


@pytest.mark.asyncio
async def test_last_runs_survive_in_the_shared_cache_and_skip_unknown_actions():
    await maintenance_history.record_last_run("warm-images", "done", "2026-10-07T10:00:00+00:00", 3)

    assert await maintenance_history.last_run("warm-images") == {
        "status": "done",
        "finished_at": "2026-10-07T10:00:00+00:00",
        "log_count": 3,
    }
    assert await maintenance_history.last_run("retry-failed") is None
    assert list(await maintenance_history.last_runs(["warm-images", "retry-failed"])) == ["warm-images"]


@pytest.mark.asyncio
async def test_a_cache_outage_never_fails_the_action(monkeypatch):
    monkeypatch.setattr(maintenance_history.cache, "set_json", AsyncMock(side_effect=RuntimeError("redis")))
    monkeypatch.setattr(maintenance_history.cache, "get_json", AsyncMock(side_effect=RuntimeError("redis")))

    await maintenance_history.record_last_run("warm-images", "done", "x")  # ne lève rien
    assert await maintenance_history.last_run("warm-images") is None


# --- Endpoint --------------------------------------------------------------------------


@pytest.fixture()
def client(async_db, tmp_path, monkeypatch):
    monkeypatch.setattr(image_proxy_api, "_IMAGE_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(admin_overview_api, "_image_scan", None)
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: async_db
    yield TestClient(app, raise_server_exceptions=True)
    for dependency in (require_auth, require_admin, get_db_async):
        app.dependency_overrides.pop(dependency, None)


def _seed(db):
    now = now_utc_naive()
    db.add_all(
        [
            PlexUser(plex_user_id="alice", enabled=True, role="admin"),
            PlexUser(plex_user_id="bob", enabled=True, role="moderator"),
            PlexUser(plex_user_id="carol", enabled=True, role="user"),
            MediaRequest(plex_user_id="alice", title="A", media_type="movie", status="pending_approval"),
            MediaRequest(plex_user_id="alice", title="B", media_type="movie", status="pending_approval"),
            MediaRequest(plex_user_id="alice", title="C", media_type="show", status="failed"),
            # Demande d'un compte inconnu : un orphelin, donc un conflit.
            MediaRequest(plex_user_id="inconnu", title="D", media_type="movie", status="available"),
            MediaIssue(issue_type="other", title="Signalée", media_type="movie", status="open"),
            MediaIssue(issue_type="other", title="Close", media_type="movie", status="closed"),
            NotificationLog(event="available", recipient="a@x", success=True, sent_at=now),
            NotificationLog(event="available", recipient="b@x", success=True, sent_at=now - timedelta(days=1)),
            NotificationLog(event="available", recipient="c@x", success=False, sent_at=now),
            NotificationLog(event="available", recipient="d@x", success=True, sent_at=now - timedelta(days=20)),
            DownloadClient(name="Q", client_type="qbittorrent", url="http://q"),
            DownloadClient(name="T", client_type="transmission", url="http://t", enabled=False),
            StorageConnection(name="NAS", method="ssh", revision="1"),
        ]
    )
    db.commit()
    source = StorageLocation(name="Source", mount_path="/src")
    destination = StorageLocation(name="Dest", mount_path="/dst")
    db.add_all([source, destination])
    db.commit()
    for status in ("running", "blocked", "completed"):
        db.add(StorageTransfer(source_id=source.id, destination_id=destination.id, status=status))
    db.commit()


def _quiet(hold=False):
    """Neutralise ce qui lit des fichiers ou Redis : les ignorés de conflits, la suspension d'envoi."""
    return (
        patch("app.routers.conflicts_api._load_ignored", return_value=set()),
        patch("app.routers.admin_overview_api.notification_hold_enabled", new=AsyncMock(return_value=hold)),
    )


def test_the_overview_counts_every_block(client, async_db, tmp_path):
    _seed(async_db)
    (tmp_path / "a.bin").write_bytes(b"x" * 8)

    ignored, hold = _quiet(hold=True)
    with ignored, hold:
        body = client.get("/api/admin/overview").json()

    assert body["requests"] == {"pending_approval": 2, "failed": 1}
    assert body["conflicts"] == {"count": 1}
    assert body["issues"] == {"open": 1}
    assert body["users"] == {"total": 3, "admins": 1, "moderators": 1}
    assert body["download_clients"] == {"total": 2, "enabled": 1}
    assert body["storage"] == {"connections": 1, "running_transfers": 1, "blocked_transfers": 1}
    assert body["images"] == {"files": 1, "bytes": 8}
    notifications = body["notifications"]
    assert notifications["hold"] is True
    assert (notifications["sent_7d"], notifications["failed_7d"]) == (2, 1)
    # Aujourd'hui et hier, sur sept jours ; l'envoi d'il y a vingt jours est hors fenêtre.
    assert notifications["by_day"][-2:] == [1, 1]
    assert len(notifications["by_day"]) == 7


def test_an_empty_instance_gives_zeroes_and_no_failures(client):
    ignored, hold = _quiet()
    with ignored, hold:
        body = client.get("/api/admin/overview").json()

    assert body["requests"] == {"pending_approval": 0, "failed": 0}
    assert body["conflicts"] == {"count": 0}
    assert body["users"]["total"] == 0
    assert body["notifications"]["by_day"] == [0] * 7
    assert body["maintenance"] == {}


def test_the_conflict_count_is_kept_between_two_visits(client):
    found = {"tmdb_conflicts": [1, 2], "orphaned": [3], "long_pending": [], "library_link_conflicts": [4]}
    compute = AsyncMock(return_value=found)

    _ignored, hold = _quiet()
    with patch("app.routers.conflicts_api.compute_conflicts", new=compute), hold:
        first = client.get("/api/admin/overview").json()["conflicts"]
        second = client.get("/api/admin/overview").json()["conflicts"]

    # Les liens bibliothèque n'entrent pas dans le compte, comme dans l'onglet Conflits.
    assert first == second == {"count": 3}
    compute.assert_awaited_once()


def test_a_failing_block_becomes_null_without_taking_the_others_down(client):
    ignored, hold = _quiet()
    with (
        patch("app.routers.admin_overview_api._issues", new=AsyncMock(side_effect=RuntimeError("table absente"))),
        ignored,
        hold,
    ):
        body = client.get("/api/admin/overview").json()

    assert body["issues"] is None
    assert body["requests"] == {"pending_approval": 0, "failed": 0}


def test_the_overview_lists_the_last_maintenance_runs(client):
    runs = {"warm-images": {"status": "done", "finished_at": "x", "log_count": 1}}
    ignored, hold = _quiet()
    with patch("app.routers.admin_overview_api.last_runs", new=AsyncMock(return_value=runs)), ignored, hold:
        body = client.get("/api/admin/overview").json()

    assert body["maintenance"]["warm-images"]["status"] == "done"


def test_the_overview_is_reserved_to_admins():
    # La dépendance elle-même est couverte par test_auth_roles : on vérifie qu'elle garde cette route.
    route = next(r for r in admin_overview_api.router.routes if r.path == "/api/admin/overview")
    assert any(dep.call is require_admin for dep in route.dependant.dependencies)


def test_the_listed_actions_read_the_shared_last_run(client):
    from app.routers.maintenance import ACTIONS_META

    shared = {"status": "done", "finished_at": "x", "log_count": 2}
    with patch("app.routers.maintenance.last_run", new=AsyncMock(return_value=shared)):
        actions = client.get("/api/maintenance/actions").json()

    assert actions[next(iter(ACTIONS_META))]["last_run"] == shared
