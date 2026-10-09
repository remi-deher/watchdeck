"""FileFlows : vraies durées de traitement (attente du disque exclue) et alternance de la file."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import ArrInstance, LibraryItem, Settings
from app.services import fileflows, fileflows_queue
from tests.async_support import make_test_session

UID_A = "11111111-1111-1111-1111-111111111111"
UID_B = "22222222-2222-2222-2222-222222222222"

DETAIL = {
    "Status": 1,
    "ProcessingEnded": "2026-10-09T01:20:00Z",
    "ProcessingTime": "00:09:48.8204114",
    "ExecutedNodes": [
        {"NodeName": "Fichier Vidéo", "ProcessingTime": "00:00:00.26", "Output": 1},
        {"NodeName": "0. Verrou du disque", "ProcessingTime": "00:05:06.30", "Output": 1},
        {"NodeName": "4. Assemblage MKVMerge et contrôles", "ProcessingTime": "00:02:08.03", "Output": 1},
        "bruit",
    ],
}


def test_timing_excludes_the_disk_wait():
    timing = fileflows.timing_from_detail(DETAIL)
    assert timing["total_seconds"] == 588.8
    assert timing["wait_seconds"] == 306.3
    assert timing["processing_seconds"] == 282.5
    assert [s["name"] for s in timing["steps"]] == [
        "Fichier Vidéo",
        "0. Verrou du disque",
        "4. Assemblage MKVMerge et contrôles",
    ]
    assert fileflows._seconds("1.02:00:00") == 93600
    assert fileflows._seconds("-00:04:27.5") == 267.5
    assert fileflows._seconds("n/a") == 0


@pytest.mark.asyncio
async def test_file_timing_caches_finished_files_only():
    store = {}

    async def get_json(key):
        return store.get(key)

    async def set_json(key, value, ttl_seconds):
        store[key] = value

    with (
        patch.object(fileflows.cache, "get_json", new=get_json),
        patch.object(fileflows.cache, "set_json", new=set_json),
        patch.object(fileflows, "file_detail", new=AsyncMock(return_value=DETAIL)),
    ):
        first = await fileflows.file_timing("http://ff", None, UID_A)
        assert first["processing_seconds"] == 282.5 and len(store) == 1
        assert await fileflows.file_timing("http://ff", None, UID_A) == first
    running = {**DETAIL, "Status": 2}
    with patch.object(fileflows, "file_detail", new=AsyncMock(return_value=running)):
        assert (await fileflows.file_timing("http://ff", None, UID_A))["wait_seconds"] == 306.3


@pytest.mark.asyncio
async def test_with_timings_limits_and_skips_errors():
    rows = [
        {"uid": UID_A, "status": 1},
        {"uid": UID_B, "status": 4},
        {"uid": "q", "status": 0},
        {"uid": "late", "status": 1},
    ]
    timing = AsyncMock(side_effect=[{"processing_seconds": 10}, fileflows.FileFlowsError("down")])
    with patch.object(fileflows, "file_timing", new=timing):
        out = await fileflows.with_timings("http://ff", None, rows, limit=3)
    assert out[0]["timing"] == {"processing_seconds": 10}
    assert "timing" not in out[1] and "timing" not in out[2] and "timing" not in out[3]
    assert timing.await_count == 2


def test_desired_order_keeps_relaunched_files_first():
    rows = [
        {"u": "a1", "lu": "A"},
        {"u": "a2", "lu": "A"},
        {"u": "r", "lu": "B", "fu": "flow"},
        {"u": "b1", "lu": "B"},
        {"u": "x", "lu": "X"},
        {"u": "c1", "lu": "C"},
    ]
    order, counts, protected = fileflows_queue.desired_order(rows, {"A", "B", "C"})
    assert order == ["r", "a1", "b1", "c1", "a2", "x"]
    assert counts == {"A": 2, "B": 1, "C": 1} and protected == 1
    assert fileflows_queue.parse_libraries('["A", 3, "B"]') == ["A", "B"]
    assert fileflows_queue.parse_libraries("{bad") == [] and fileflows_queue.parse_libraries('{"a": 1}') == []


def _fake_api(queue, libraries, moved):
    async def call(url, api_key, method, path, **kwargs):
        if path == "library":
            return libraries
        if path == "library-file/list-all":
            return queue
        if path == "library-file/move-to-top":
            moved.append(kwargs["json"]["Uids"])
            return {}
        raise AssertionError(path)

    return call


LIBRARIES = [
    {"Uid": "A", "Name": "Films — USB 1", "Path": "/usb", "Enabled": True},
    {"Uid": "B", "Name": "Films — USB 2", "Path": "/usb2", "Enabled": True},
    {"Uid": "Z", "Name": "Off", "Enabled": False},
]


@pytest.mark.asyncio
async def test_reorder_moves_only_when_needed():
    queue = [{"u": "a1", "lu": "A"}, {"u": "a2", "lu": "A"}, {"u": "b1", "lu": "B"}]
    moved: list = []
    with (
        patch.object(fileflows_queue.fileflows, "_call", new=_fake_api(queue, LIBRARIES, moved)),
    ):
        result = await fileflows_queue.reorder("http://ff", None, ["A", "B", "Z"])
        assert result["changed"] is True and moved == [["a1", "b1", "a2"]]
        queue[:] = [{"u": "a1", "lu": "A"}, {"u": "b1", "lu": "B"}, {"u": "a2", "lu": "A"}]
        assert (await fileflows_queue.reorder("http://ff", None, ["A", "B"]))["changed"] is False
        lone = await fileflows_queue.reorder("http://ff", None, ["A", "Z"])
        assert lone["changed"] is False and "1 bibliothèque" in lone["message"]
    assert len(moved) == 1


@pytest.fixture
def client_db():
    db = make_test_session()
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: db
    db.add_all(
        [
            ArrInstance(name="FF", arr_type="fileflows", url="http://ff", api_key=""),
            Settings(fileflows_reorder_enabled=False),
        ]
    )
    db.commit()
    try:
        with patch("app.routers.fileflows_api.publish", new=AsyncMock()):
            yield TestClient(app, raise_server_exceptions=False), db
    finally:
        for dep in (require_auth, require_admin, get_db_async):
            app.dependency_overrides.pop(dep, None)
        db.close()


def test_reorder_run_route(client_db):
    client, db = client_db
    settings = db.query(Settings).first()
    settings.fileflows_reorder_libraries = '["A", "B"]'
    db.commit()
    with patch.object(
        fileflows_queue, "reorder", new=AsyncMock(return_value={"changed": True, "message": "ok"})
    ) as run:
        assert client.post("/api/fileflows/reorder/run").json()["changed"] is True
    assert run.call_args.args[2] == ["A", "B"]


def test_timing_routes(client_db):
    client, db = client_db
    item = LibraryItem(title="Film", year=2009, media_type="movie")
    db.add(item)
    db.commit()
    rows = [fileflows.normalize_file({"u": UID_A, "dn": "Film (2009)/f.mkv", "s": 1})]
    timed = [{**rows[0], "timing": {"processing_seconds": 42}}]
    with (
        patch.object(fileflows, "file_timing", new=AsyncMock(return_value={"processing_seconds": 42})),
        patch.object(fileflows, "list_files", new=AsyncMock(return_value=rows)),
        patch.object(fileflows, "dashboard", new=AsyncMock(return_value={"page_size": 500})),
        patch.object(fileflows, "folder_index", new=AsyncMock(return_value={})),
        patch.object(fileflows, "files_for_item", new=AsyncMock(return_value=rows)),
        patch.object(fileflows, "with_timings", new=AsyncMock(return_value=timed)) as with_timings,
    ):
        assert client.get(f"/api/fileflows/files/{UID_A}/timing").json() == {"processing_seconds": 42}
        listed = client.get("/api/fileflows/files?status=1").json()
        assert listed["files"][0]["timing"]["processing_seconds"] == 42
        queued = client.get("/api/fileflows/files?status=0").json()
        assert "timing" not in queued["files"][0]
        media = client.get(f"/api/fileflows/media/{item.id}").json()
        assert media["files"][0]["timing"]["processing_seconds"] == 42
    assert with_timings.await_count == 2
