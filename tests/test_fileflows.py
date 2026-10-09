"""FileFlows : lecture de son API, relance, rapprochement avec les médias et suivi périodique."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import ArrInstance, LibraryItem, Settings
from app.services import fileflows, fileflows_monitor
from tests.async_support import make_test_session

UID_A = "11111111-1111-1111-1111-111111111111"
UID_B = "22222222-2222-2222-2222-222222222222"
UID_C = "33333333-3333-3333-3333-333333333333"
FLOW = {"Uid": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "Name": "Flow V2"}


def _row(uid, name, status=1, date="2026-10-08T15:00:00Z", **extra):
    return {"u": uid, "dn": name, "l": "Films", "fn": "Flow V2", "s": status, "pt": "-00:04:27.5", "dt": date, **extra}


def test_normalize_file_reads_short_keys_and_masks_secrets():
    row = fileflows.normalize_file(_row(UID_A, "Film (2009)/Film (2009).mkv", status=4, fr="X-Plex-Token=abc123 KO"))
    assert row["uid"] == UID_A and row["status_label"] == "Échec"
    assert row["duration"] == "00:04:27"
    assert row["failure_reason"] == "X-Plex-Token=[masqué] KO"
    assert fileflows.status_label(42) == "Statut 42"


def test_match_media_compares_folder_names_only():
    index = {"the twilight saga - new moon (2009)": {"id": 7, "media_type": "movie"}}
    assert fileflows.folders_of("Série (2007)/Saison 06/ep.mkv") == ["Série (2007)", "Saison 06"]
    assert fileflows.folder_name("/movies/Film (2009)/") == "Film (2009)"
    assert fileflows.match_media(index, "The Twilight Saga - New Moon (2009)/x.mkv")["id"] == 7
    assert fileflows.match_media(index, "FILMS/The Twilight Saga - New Moon (2009)/x.mkv")["id"] == 7
    # Un fichier qui porte le nom du dossier n'est pas le dossier.
    assert fileflows.match_media(index, "The Twilight Saga - New Moon (2009)") is None


@pytest.mark.asyncio
async def test_file_log_decodes_json_string_of_html():
    raw = '"<div class=\\"line\\">Start</div><div>ApiKey=secret</div><div>Done &amp; ok</div>"'
    with patch.object(fileflows, "_call", new=AsyncMock(return_value=raw)):
        text = await fileflows.file_log("http://ff", None, UID_A)
    assert text.splitlines() == ["Start", "ApiKey=[masqué]", "Done & ok"]
    with pytest.raises(ValueError):
        await fileflows.file_log("http://ff", None, "../etc")


@pytest.mark.asyncio
async def test_reprocess_groups_by_flow_and_skips_busy_files():
    calls = []
    details = {
        UID_A: {"Status": 1, "LibraryUid": "lib-1"},
        UID_B: {"Status": 0, "LibraryUid": "lib-1"},  # deja en file
        UID_C: {"Status": 4, "LibraryUid": "lib-2"},
    }
    libraries = [
        {"Uid": "lib-1", "Name": "Films", "Enabled": True, "Flow": FLOW},
        {"Uid": "lib-2", "Name": "Séries", "Enabled": False, "Flow": FLOW},
    ]

    async def fake_call(url, api_key, method, path, **kwargs):
        calls.append((method, path, kwargs.get("json")))
        if path == "library":
            return libraries
        if path.startswith("library-file/") and method == "GET":
            return details[path.split("/")[1]]
        return {}

    with patch.object(fileflows, "_call", new=fake_call):
        result = await fileflows.reprocess("http://ff", None, [UID_A, UID_B, UID_C, UID_A])
    assert result == {
        "queued": 2,
        "skipped": 1,
        "warnings": ["Bibliothèque désactivée dans FileFlows : Séries"],
    }
    posts = [body for method, path, body in calls if method == "POST"]
    assert len(posts) == 1 and posts[0]["Uids"] == [UID_A, UID_C] and posts[0]["Flow"] == FLOW
    with pytest.raises(ValueError):
        await fileflows.reprocess("http://ff", None, ["pas-un-uuid"])


def test_monitor_changes_and_alert_text():
    assert fileflows_monitor.changes({"a": "1", "b": "1"}, {"a": "1", "b": "2", "c": "1"}) == ["b", "c"]
    failed = [{"name": f"f{i}.mkv", "failure_reason": "boom" if i == 0 else ""} for i in range(12)]
    text = fileflows_monitor.alert_text("FileFlows", failed)
    assert "• f0.mkv — boom" in text and "• f9.mkv" in text and "f10.mkv" not in text
    assert "… et 2 autre(s)" in text


@pytest.mark.asyncio
async def test_check_fileflows_alerts_and_rescans_only_on_change():
    db = make_test_session()
    try:
        db.add_all(
            [
                Settings(email_enabled=False, discord_enabled=False),
                ArrInstance(name="FileFlows", arr_type="fileflows", url="http://ff", api_key=""),
            ]
        )
        db.commit()
        store: dict = {}

        async def get_json(key):
            return store.get(key)

        async def set_json(key, value, ttl_seconds):
            store[key] = value

        processed = [fileflows.normalize_file(_row(UID_A, "Film (2009)/Film (2009).mkv"))]
        failed: list = []

        async def list_files(url, api_key, status, **kwargs):
            return processed if status == fileflows.STATUS_PROCESSED else failed

        index = {"film (2009)": {"id": 5, "media_type": "movie"}}
        notify = AsyncMock(return_value=1)
        rescan = AsyncMock(return_value=1)
        with (
            patch.object(fileflows_monitor, "AsyncSessionLocal", return_value=db),
            patch.object(fileflows_monitor.cache, "get_json", new=get_json),
            patch.object(fileflows_monitor.cache, "set_json", new=set_json),
            patch.object(fileflows, "list_files", new=list_files),
            patch.object(fileflows, "folder_index", new=AsyncMock(return_value=index)),
            patch.object(fileflows_monitor, "_rescan", new=rescan),
            patch.object(fileflows_monitor.fileflows_history, "record_many", new=AsyncMock(return_value=1)),
            patch.object(fileflows_monitor, "publish", new=AsyncMock()),
            patch.object(fileflows_monitor.admin_alerts, "send", new=notify),
        ):
            first = await fileflows_monitor.check_fileflows()
            assert first["status"] == "initialized"
            rescan.assert_not_called()

            # Le meme fichier relance puis termine (date changee) et un nouvel echec.
            processed[0] = fileflows.normalize_file(_row(UID_A, "Film (2009)/Film (2009).mkv", date="2026-10-09"))
            failed.append(fileflows.normalize_file(_row(UID_B, "Autre (2001)/a.mkv", status=4, fr="crash")))
            second = await fileflows_monitor.check_fileflows()
            assert second["new_failed"] == 1 and second["new_processed"] == 1 and second["alerts"] == 1
            rescan.assert_awaited_once_with([5])
            assert "Autre (2001)/a.mkv — crash" in notify.call_args.args[2]

            third = await fileflows_monitor.check_fileflows()
            assert third["new_failed"] == 0 and third["new_processed"] == 0
            assert notify.await_count == 1 and rescan.await_count == 1
    finally:
        db.close()


@pytest.fixture
def client_db():
    db = make_test_session()
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: db
    try:
        yield TestClient(app, raise_server_exceptions=False), db
    finally:
        for dep in (require_auth, require_admin, get_db_async):
            app.dependency_overrides.pop(dep, None)
        db.close()


def test_status_route_without_fileflows(client_db):
    client, _ = client_db
    assert client.get("/api/fileflows/status").json() == {"configured": False}
    assert client.get("/api/fileflows/files").status_code == 404


def test_fileflows_instance_needs_no_api_key(client_db):
    client, db = client_db
    with patch.object(fileflows, "check_connection", new=AsyncMock(return_value=(True, "FileFlows connecté"))):
        tested = client.post("/api/test/arr-instance", json={"url": "http://ff", "arr_type": "fileflows"}).json()
    assert tested == {"success": True, "message": "FileFlows connecté"}
    created = client.post("/api/arr-instances", json={"name": "FF", "arr_type": "fileflows", "url": "http://ff"})
    assert created.status_code == 200 and created.json()["has_api_key"] is False
    missing = client.post("/api/arr-instances", json={"name": "R", "arr_type": "radarr", "url": "http://r"})
    assert missing.status_code == 422


def test_status_and_media_routes(client_db):
    client, db = client_db
    item = LibraryItem(title="Film", year=2009, media_type="movie")
    db.add_all([ArrInstance(name="FF", arr_type="fileflows", url="http://ff", api_key=""), item])
    db.commit()
    state = {
        "queue": 3,
        "processing": 1,
        "processed": 10,
        "failed": 1,
        "counts": {},
        "time": None,
        "paused": False,
        "paused_until": None,
        "page_size": 500,
        "runners": [{"path": "/m/Film (2009)/f.mkv", "name": "Film (2009)/f.mkv", "step": "Encodage", "percent": 40}],
    }
    failed = [fileflows.normalize_file(_row(UID_B, "Film (2009)/f.mkv", status=4))]
    index = {"film (2009)": {"id": item.id, "title": "Film", "media_type": "movie"}}

    async def list_files(url, api_key, status, **kwargs):
        return failed if status == fileflows.STATUS_FAILED else []

    with (
        patch.object(fileflows, "dashboard", new=AsyncMock(return_value=state)),
        patch.object(fileflows, "list_files", new=list_files),
        patch.object(fileflows, "folder_index", new=AsyncMock(return_value=index)),
        patch("app.routers.fileflows_api.cache.get_json", new=AsyncMock(return_value=None)),
        patch("app.routers.fileflows_api.cache.set_json", new=AsyncMock()),
    ):
        data = client.get("/api/fileflows/status").json()
    assert data["connected"] is True and data["queue"] == 3
    assert data["runners"][0]["media"]["id"] == item.id
    assert data["recent_failed"][0]["media"]["title"] == "Film"

    files = [fileflows.normalize_file(_row(UID_A, "Film (2009)/f.mkv"))]
    with (
        patch.object(fileflows, "files_for_item", new=AsyncMock(return_value=files)) as lookup,
        patch.object(
            fileflows, "reprocess", new=AsyncMock(return_value={"queued": 1, "skipped": 0, "warnings": []})
        ) as rp,
        patch("app.routers.fileflows_api.publish", new=AsyncMock()),
    ):
        media = client.get(f"/api/fileflows/media/{item.id}").json()
        assert media["folder"] == "Film (2009)" and media["files"][0]["uid"] == UID_A
        assert lookup.call_args.args[2] == "Film (2009)"
        assert client.post(f"/api/fileflows/media/{item.id}/reprocess").json()["queued"] == 1
        assert rp.call_args.args[2] == [UID_A]
        # Un identifiant etranger au media est ignore.
        foreign = client.post(f"/api/fileflows/media/{item.id}/reprocess", json={"uids": [UID_C]})
        assert foreign.status_code == 404
