"""FileFlows : appels HTTP, rapprochement par catalogue *arr, routes d'action et tache planifiee."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app import jobs
from app.database import get_db_async
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import ArrInstance, LibraryItem
from app.services import fileflows, fileflows_monitor
from tests.async_support import make_test_session

UID_A = "11111111-1111-1111-1111-111111111111"
UID_B = "22222222-2222-2222-2222-222222222222"
FLOW = {"Uid": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "Name": "Flow V2"}


def _http(status=200, content=b""):
    return httpx.Response(status, content=content)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response", "kwargs", "expected"),
    [
        (_http(200, b'{"a": 1}'), {}, {"a": 1}),
        (_http(200, b"  "), {}, {}),
        (_http(200, b"\xef\xbb\xbfjournal"), {"text": True}, "journal"),
    ],
)
async def test_call_decodes_responses(response, kwargs, expected):
    with patch("app.services.fileflows.ArrClient._request", new=AsyncMock(return_value=response)) as request:
        assert await fileflows._call("http://ff", "tok", "GET", "/status", **kwargs) == expected
    assert request.call_args.args[:2] == ("GET", "/api/status")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response", "message"),
    [
        (_http(401), "refuse l'accès"),
        (_http(500), "a répondu 500"),
        (_http(200, b"<!DOCTYPE html><html>"), "Route FileFlows inconnue"),
        (_http(200, b"{pas du json"), "illisible"),
        (RuntimeError("down"), "injoignable"),
    ],
)
async def test_call_errors(response, message):
    mock = AsyncMock(side_effect=response) if isinstance(response, Exception) else AsyncMock(return_value=response)
    with patch("app.services.fileflows.ArrClient._request", new=mock):
        with pytest.raises(fileflows.FileFlowsError, match=message):
            await fileflows._call("http://ff", None, "GET", "status")


def test_client_sends_token_only_when_configured():
    assert "x-token" not in fileflows._client("http://ff", None).headers
    assert fileflows._client("http://ff", "k").headers["x-token"] == "k"


@pytest.mark.asyncio
async def test_check_connection():
    with patch.object(fileflows, "_call", new=AsyncMock(return_value=[{"Version": "26.08"}])):
        assert await fileflows.check_connection("http://ff") == (True, "FileFlows connecté (v26.08)")
    with patch.object(fileflows, "_call", new=AsyncMock(side_effect=fileflows.FileFlowsError("KO"))):
        assert await fileflows.check_connection("http://ff") == (False, "KO")


@pytest.mark.asyncio
async def test_dashboard_lists_and_pause():
    answers = {
        "status": {
            "queue": 4,
            "processing": 1,
            "processed": 2,
            "time": "1:30",
            "processingFiles": [
                {
                    "name": "/m/F (2009)/f.mkv",
                    "relativePath": "F (2009)/f.mkv",
                    "library": "Films",
                    "step": "Enc",
                    "stepPercent": 12,
                }
            ],
        },
        "settings": {"IsPaused": True, "PausedUntil": "2026-10-09T10:00:00Z", "MaxPageSize": 250},
        "library-file/status": [{"Status": 1, "StatusCount": 49}, {"Status": 4, "StatusCount": 3}],
    }
    calls = []

    async def fake_call(url, api_key, method, path, **kwargs):
        calls.append((method, path, kwargs))
        if path in answers:
            return answers[path]
        return [{"u": UID_A, "dn": "F (2009)/f.mkv", "s": 1}, "bruit"]

    with patch.object(fileflows, "_call", new=fake_call):
        state = await fileflows.dashboard("http://ff", None)
        rows = await fileflows.list_files("http://ff", None, 1, page=2, search="F")
        found = await fileflows.search_files("http://ff", None, "F (2009)")
        await fileflows.set_paused("http://ff", None, 999_999)
    assert state["queue"] == 4 and state["processed"] == 49 and state["failed"] == 3
    assert state["paused"] is True and state["paused_until"] and state["page_size"] == 250
    assert state["runners"][0]["name"] == "F (2009)/f.mkv" and state["runners"][0]["percent"] == 12
    assert [r["uid"] for r in rows] == [UID_A] and [r["uid"] for r in found] == [UID_A]
    pause = calls[-1]
    assert pause[1] == "system/pause" and pause[2]["params"]["duration"] == fileflows.PAUSE_MAX_MINUTES


@pytest.mark.asyncio
async def test_files_for_item_keeps_only_the_folder():
    rows = [
        fileflows.normalize_file({"u": UID_A, "dn": "F (2009)/f.mkv", "s": 1, "dt": "2026-01-01"}),
        fileflows.normalize_file({"u": UID_B, "dn": "F (2009) bis/f.mkv", "s": 1, "dt": "2026-02-01"}),
    ]
    with patch.object(fileflows, "search_files", new=AsyncMock(return_value=rows)):
        assert [r["uid"] for r in await fileflows.files_for_item("http://ff", None, "f (2009)")] == [UID_A]


@pytest.mark.asyncio
async def test_reprocess_errors():
    async def call_with(libraries, detail, fail_post=False):
        async def fake_call(url, api_key, method, path, **kwargs):
            if path == "library":
                return libraries
            if method == "GET":
                return detail
            if fail_post:
                raise fileflows.FileFlowsError("boom")
            return {}

        return fake_call

    with patch.object(fileflows, "_call", new=await call_with([], {"Status": 1, "LibraryUid": "x"})):
        with pytest.raises(ValueError, match="introuvable"):
            await fileflows.reprocess("http://ff", None, [UID_A])
    no_flow = [{"Uid": "x", "Name": "Films", "Flow": {"Uid": "00000000-0000-0000-0000-000000000000"}}]
    with patch.object(fileflows, "_call", new=await call_with(no_flow, {"Status": 1, "LibraryUid": "x"})):
        with pytest.raises(ValueError, match="Aucun flow"):
            await fileflows.reprocess("http://ff", None, [UID_A])
    ok = [{"Uid": "x", "Name": "Films", "Enabled": True, "Flow": FLOW}]
    with patch.object(fileflows, "_call", new=await call_with(ok, {"Status": 1, "LibraryUid": "x"}, fail_post=True)):
        with pytest.raises(fileflows.FileFlowsError, match="boom"):
            await fileflows.reprocess("http://ff", None, [UID_A])
    with pytest.raises(ValueError):
        await fileflows.reprocess("http://ff", None, [])


@pytest.mark.asyncio
async def test_media_folder_and_index_use_arr_catalog():
    db = make_test_session()
    try:
        radarr = ArrInstance(name="Radarr", arr_type="radarr", url="http://r", api_key="k")
        db.add(radarr)
        db.commit()
        item = LibraryItem(title="Twilight 2", year=2009, media_type="movie", arr_instance_id=radarr.id, arr_id=7)
        bare = LibraryItem(title="Sans dossier", media_type="movie")
        db.add_all([item, bare])
        db.commit()
        catalog = [{"id": 7, "path": "/movies/The Twilight Saga - New Moon (2009)"}, {"id": 8, "path": "/movies/X"}]
        fileflows._index_cache = None
        with patch.object(fileflows.arr_catalog, "get_catalog", new=AsyncMock(return_value=catalog)) as get_catalog:
            assert await fileflows.media_folder(db, item) == "The Twilight Saga - New Moon (2009)"
            assert await fileflows.media_folder(db, bare) == "Sans dossier"
            index = await fileflows.folder_index(db)
            assert index["the twilight saga - new moon (2009)"]["id"] == item.id and "x" not in index
            calls = get_catalog.await_count
            assert await fileflows.folder_index(db) is index  # servi depuis le cache
            assert get_catalog.await_count == calls
        fileflows._index_cache = None
        db.delete(radarr)
        db.commit()
        assert await fileflows._build_folder_index(db) == {}
    finally:
        fileflows._index_cache = None
        db.close()


@pytest.mark.asyncio
async def test_rescan_counts_successes_and_skips_failures():
    db = make_test_session()
    try:
        scan = AsyncMock(side_effect=[{"status": "ok"}, RuntimeError("absent de Plex")])
        with (
            patch.object(fileflows_monitor, "AsyncSessionLocal", return_value=db),
            patch("app.routers.vff_api.library_vff_scan", new=scan),
        ):
            assert await fileflows_monitor._rescan([1, 2]) == 1
        assert scan.call_args.kwargs["force"] is True
    finally:
        db.close()


@pytest.mark.asyncio
async def test_monitor_without_fileflows_and_job():
    db = make_test_session()
    try:
        with patch.object(fileflows_monitor, "AsyncSessionLocal", return_value=db):
            assert await fileflows_monitor.check_fileflows() == {"status": "not_configured"}
    finally:
        db.close()
    with patch.object(jobs, "_run", new=AsyncMock(return_value={"status": "ok"})) as run:
        assert await jobs.cron_fileflows_monitor({}) == {"status": "ok"}
    assert run.call_args.args[1] == "fileflows-monitor" and run.call_args.kwargs["interval_seconds"] == 300


@pytest.fixture
def client_db():
    db = make_test_session()
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: db
    db.add(ArrInstance(name="FF", arr_type="fileflows", url="http://ff", api_key=""))
    db.commit()
    try:
        with (
            patch("app.routers.fileflows_api.cache.get_json", new=AsyncMock(return_value=None)),
            patch("app.routers.fileflows_api.cache.set_json", new=AsyncMock()),
            patch("app.routers.fileflows_api.cache.delete", new=AsyncMock(side_effect=RuntimeError("redis"))),
            patch("app.routers.fileflows_api.publish", new=AsyncMock()),
        ):
            yield TestClient(app, raise_server_exceptions=False), db
    finally:
        for dep in (require_auth, require_admin, get_db_async):
            app.dependency_overrides.pop(dep, None)
        db.close()


def test_action_routes(client_db):
    client, _ = client_db
    state = {"page_size": 1}
    rows = [fileflows.normalize_file({"u": UID_A, "dn": "F (2009)/f.mkv", "s": 4})]
    result = {"queued": 1, "skipped": 0, "warnings": []}
    with (
        patch.object(fileflows, "list_files", new=AsyncMock(return_value=rows)),
        patch.object(fileflows, "dashboard", new=AsyncMock(return_value=state)),
        patch.object(fileflows, "folder_index", new=AsyncMock(return_value={})),
        patch.object(fileflows, "file_log", new=AsyncMock(return_value="ligne")),
        patch.object(fileflows, "reprocess", new=AsyncMock(return_value=result)),
        patch.object(fileflows, "set_paused", new=AsyncMock()) as paused,
    ):
        listed = client.get("/api/fileflows/files?status=4").json()
        assert listed["has_more"] is True and listed["files"][0]["media"] is None
        assert listed["files"][0]["work"]["state"] == "blocked"
        assert listed["files"][0]["work"]["source"] == "encoding"
        assert client.get("/api/fileflows/files?status=99").status_code == 422
        assert client.get(f"/api/fileflows/files/{UID_A}/log").json() == {"text": "ligne"}
        assert client.post("/api/fileflows/reprocess", json={"uids": [UID_A]}).json() == result
        assert client.post("/api/fileflows/pause", json={"minutes": 60}).json() == {"paused": True}
        assert paused.call_args.args[2] == 60
        assert client.post("/api/fileflows/pause", json={"minutes": -1}).status_code == 422


def test_routes_map_fileflows_errors(client_db):
    client, _ = client_db
    with (
        patch.object(fileflows, "file_log", new=AsyncMock(side_effect=ValueError("Identifiant invalide"))),
        patch.object(fileflows, "reprocess", new=AsyncMock(side_effect=fileflows.FileFlowsError("injoignable"))),
        patch.object(fileflows, "dashboard", new=AsyncMock(side_effect=fileflows.FileFlowsError("down"))),
        patch.object(fileflows, "list_files", new=AsyncMock(return_value=[])),
    ):
        assert client.get(f"/api/fileflows/files/{UID_A}/log").status_code == 422
        failed = client.post("/api/fileflows/reprocess", json={"uids": [UID_A]})
        assert failed.status_code == 502 and failed.json()["detail"] == "injoignable"
        status = client.get("/api/fileflows/status?refresh=true").json()
        assert status["connected"] is False and status["error"] == "down"
    assert client.get("/api/fileflows/media/999999").status_code == 404


def test_status_served_from_cache(client_db):
    client, _ = client_db
    with patch(
        "app.routers.fileflows_api.cache.get_json", new=AsyncMock(return_value={"configured": True, "queue": 9})
    ):
        assert client.get("/api/fileflows/status").json()["queue"] == 9


def test_media_route_without_fileflows():
    db = make_test_session()
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: db
    try:
        client = TestClient(app, raise_server_exceptions=False)
        assert client.get("/api/fileflows/media/1").json() == {"configured": False, "files": []}
    finally:
        for dep in (require_auth, require_admin, get_db_async):
            app.dependency_overrides.pop(dep, None)
        db.close()
