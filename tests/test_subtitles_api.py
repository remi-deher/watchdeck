"""Routes /api/subtitles et test de connexion d'une instance Bazarr."""

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin, require_auth, require_moderator
from app.main import app
from app.models import ArrInstance, LibraryItem
from tests.async_support import make_test_session


def _client(db):
    for dep in (require_auth, require_admin, require_moderator):
        app.dependency_overrides[dep] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: db
    return TestClient(app, raise_server_exceptions=False)


def _cleanup():
    for dep in (require_auth, require_admin, require_moderator, get_db_async):
        app.dependency_overrides.pop(dep, None)


def test_summary_search_and_batch_routes():
    db = make_test_session()
    try:
        db.add(ArrInstance(name="Bazarr", arr_type="bazarr", url="http://bazarr", api_key="b"))
        item = LibraryItem(title="Film", media_type="movie", sub_fr_status="absent", has_vf=False)
        track = LibraryItem(title="Morceau", media_type="track")
        db.add_all([item, track])
        db.commit()
        client = _client(db)

        wanted = {"connected": True, "movies": 3, "episodes": 9}
        with patch("app.services.bazarr.wanted_counts", new=AsyncMock(return_value=wanted)):
            summary = client.get("/api/subtitles/summary").json()
        assert summary["missing"] == 1 and summary["due"] == 1
        assert summary["provider"] == "auto" and summary["enabled"] is False
        assert summary["bazarr"]["movies"] == 3

        ok = {"success": True, "outcome": "requested", "message": "ok"}
        with patch("app.services.subtitle_search.search_for_item", new=AsyncMock(return_value=ok)) as search:
            assert client.post(f"/api/subtitles/library/{item.id}/search", json={"provider": "plex"}).status_code == 200
        assert search.call_args.kwargs["provider"] == "plex"

        assert client.post(f"/api/subtitles/library/{item.id}/search", json={"provider": "x"}).status_code == 400
        assert client.post(f"/api/subtitles/library/{track.id}/search").status_code == 400
        failed = {"success": False, "message": "Plex non configuré"}
        with patch("app.services.subtitle_search.search_for_item", new=AsyncMock(return_value=failed)):
            response = client.post(f"/api/subtitles/library/{item.id}/search")
        assert response.status_code == 502

        batch = {"processed": 0, "outcomes": {}}
        with patch("app.services.subtitle_search.search_missing_batch", new=AsyncMock(return_value=batch)):
            assert client.post("/api/subtitles/search-missing").json() == {"queued": False, **batch}
    finally:
        _cleanup()
        db.close()


def test_bazarr_instance_connection_test():
    db = make_test_session()
    try:
        client = _client(db)
        with patch("app.services.bazarr.check_connection", new=AsyncMock(return_value=(True, "Bazarr connecté"))):
            response = client.post(
                "/api/test/arr-instance", json={"url": "http://bazarr", "api_key": "k", "arr_type": "bazarr"}
            )
        assert response.json() == {"success": True, "message": "Bazarr connecté"}
    finally:
        _cleanup()
        db.close()
