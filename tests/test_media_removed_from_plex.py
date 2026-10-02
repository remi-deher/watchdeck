"""Un média retiré de Plex disparaît dès qu'on le revérifie depuis sa fiche."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async as get_db
from app.dependencies import require_admin, require_auth, require_moderator
from app.main import app
from app.models import LibraryItem, LibraryItemLocation, MediaRequest, PlexServer, RequestStatus, Settings

_LIBS = '[{"name": "Séries", "kind": "series"}]'


@pytest.fixture()
def db(async_db):
    return async_db


@pytest.fixture()
def client(db):
    for dep in (require_auth, require_admin, require_moderator):
        app.dependency_overrides[dep] = lambda: None
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app, raise_server_exceptions=True)
    for dep in (require_auth, require_admin, require_moderator, get_db):
        app.dependency_overrides.pop(dep, None)


def _setup(db, *, secondary: bool = False):
    db.add(Settings(plex_url="http://main", plex_token="t", vff_enabled=True, vff_libraries=_LIBS))
    primary = db.query(PlexServer).filter(PlexServer.is_primary).first()
    if primary is None:
        primary = PlexServer(name="Serveur principal", is_primary=True, enabled=True)
        db.add(primary)
    second = None
    if secondary:
        second = PlexServer(name="Plex 4K", url="http://uhd", token="t2")
        db.add(second)
    item = LibraryItem(title="The Exorcist", year=2017, media_type="show", tvdb_id="306769", plex_guid="plex://show/1")
    db.add(item)
    db.commit()
    db.add(LibraryItemLocation(library_item_id=item.id, server_id=primary.id, rating_key="42"))
    req = MediaRequest(
        plex_user_id="alice",
        plex_user="Alice",
        title="The Exorcist",
        media_type="show",
        status=RequestStatus.available,
        library_item_id=item.id,
    )
    db.add(req)
    db.commit()
    return item.id, req.id, second


def _presence(by_url: dict):
    def fake(plex_url, *args, **kwargs):
        result = by_url[plex_url]
        if isinstance(result, Exception):
            raise result
        return result

    return patch("app.services.plex_finder.is_item_in_libraries_strict", side_effect=fake)


def test_recheck_removes_media_absent_from_every_server(db, client):
    item_id, req_id, _ = _setup(db, secondary=True)

    with _presence({"http://main": False, "http://uhd": False}):
        resp = client.post(f"/api/media/recheck-plex?library_id={item_id}")

    assert resp.status_code == 200
    assert resp.json() == {"found": False, "removed": True, "title": "The Exorcist"}
    db.expire_all()
    assert db.query(LibraryItem).filter(LibraryItem.id == item_id).first() is None
    req = db.query(MediaRequest).filter(MediaRequest.id == req_id).one()
    assert req.library_item_id is None
    assert req.status != RequestStatus.available


def test_recheck_keeps_media_still_on_a_secondary_server(db, client):
    item_id, _, _ = _setup(db, secondary=True)

    with _presence({"http://main": False, "http://uhd": True}):
        resp = client.post(f"/api/media/recheck-plex?library_id={item_id}")

    assert resp.json()["found"] is True
    assert db.query(LibraryItem).filter(LibraryItem.id == item_id).first() is not None


def test_recheck_never_removes_when_a_server_cannot_answer(db, client):
    item_id, _, _ = _setup(db, secondary=True)

    with _presence({"http://main": False, "http://uhd": ConnectionError("timeout")}):
        resp = client.post(f"/api/media/recheck-plex?library_id={item_id}")

    assert resp.status_code == 502
    assert db.query(LibraryItem).filter(LibraryItem.id == item_id).first() is not None


def test_recheck_never_removes_media_located_on_a_disabled_server(db, client):
    item_id, _, second = _setup(db, secondary=True)
    second.enabled = False
    db.add(LibraryItemLocation(library_item_id=item_id, server_id=second.id, rating_key="900"))
    db.commit()

    with _presence({"http://main": False}):
        resp = client.post(f"/api/media/recheck-plex?library_id={item_id}")

    assert resp.status_code == 502
    assert db.query(LibraryItem).filter(LibraryItem.id == item_id).first() is not None


def test_vf_scan_of_a_media_gone_from_plex_removes_it(db, client):
    item_id, _, _ = _setup(db)

    with (
        patch("app.routers.vff_api.vff_svc.connect"),
        patch("app.routers.vff_api.vff_svc.scan_media_vf", return_value={"found": False}),
        patch("app.routers.vff_api._sonarr_episode_numbers_for", new=AsyncMock(return_value=None)),
        _presence({"http://main": False}),
    ):
        resp = client.post(f"/api/library/{item_id}/vff-scan")

    assert resp.status_code == 410
    assert "The Exorcist" in resp.json()["detail"]
    db.expire_all()
    assert db.query(LibraryItem).filter(LibraryItem.id == item_id).first() is None


def test_vf_scan_plex_error_keeps_media(db, client):
    item_id, _, _ = _setup(db)

    with (
        patch("app.routers.vff_api.vff_svc.connect", side_effect=ConnectionError("down")),
        patch("app.routers.vff_api._sonarr_episode_numbers_for", new=AsyncMock(return_value=None)),
    ):
        resp = client.post(f"/api/library/{item_id}/vff-scan")

    assert resp.status_code == 404
    assert db.query(LibraryItem).filter(LibraryItem.id == item_id).first() is not None
