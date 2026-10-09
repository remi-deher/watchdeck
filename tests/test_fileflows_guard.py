"""Pilotage FileFlows : correspondance Plex ↔ bibliothèques, pause pendant les lectures,
ordre de la file, runners automatiques, débit, et routes du centre de commande."""

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import ArrInstance, Settings
from app.routers import fileflows_control_api as control
from app.services import fileflows, fileflows_guard, fileflows_queue
from tests.async_support import make_test_session

UID = "11111111-1111-1111-1111-111111111111"
LIBS = [
    {"Uid": "L1", "Name": "Films — USB 1", "Path": "/usb/MEDIA/FILMS", "Enabled": True},
    {"Uid": "L2", "Name": "Films — USB 2", "Path": "/usb2/MEDIA/FILMS", "Enabled": True},
    {"Uid": "S2", "Name": "Séries — USB 2", "Path": "/usb2/MEDIA/SERIES", "Enabled": False},
    {"Uid": "N1", "Name": "Séries — NAS", "Path": "/media/SERIES", "Enabled": False},
]
PLEX = [{"path": "/data/usb/MEDIA/FILMS"}, {"path": "/data/usb2/MEDIA/FILMS"}, {"path": "/data/usb2/MEDIA/SERIES"}]


@pytest.mark.asyncio
async def test_guard_pauses_disk_of_a_disabled_library():
    """Une série lue sur usb2 (bibliothèque Séries désactivée) met quand même usb2 en pause."""
    db = make_test_session()
    try:
        db.add_all(
            [
                ArrInstance(name="FF", arr_type="fileflows", url="http://ff", api_key=""),
                Settings(fileflows_plex_pause="disk"),
            ]
        )
        db.commit()
        queue = [{"u": "a", "lu": "L2"}, {"u": "b", "lu": "L1"}]
        _, calls, patches = _guard_env(db, queue, {"processed": 1}, ["/data/usb2/MEDIA/SERIES/S/S01E01.mkv"])
        for p in patches:
            p.start()
        try:
            result = await fileflows_guard.run()
        finally:
            for p in patches:
                p.stop()
        assert result["paused_disks"] == ["usb2"]
        assert next(c for c in calls if c[1] == "library-file/move-to-top")[2]["Uids"] == ["b", "a"]
    finally:
        db.close()


def test_paths_and_suggestions():
    assert fileflows_guard.disk_of("/usb2/MEDIA/FILMS/x.mkv") == "usb2" and fileflows_guard.disk_of("") == ""
    assert fileflows_guard.suffix_score("/data/usb2/MEDIA/FILMS", "/usb2/MEDIA/FILMS") == 3
    suggested = fileflows_guard.suggest_locations(LIBS, PLEX)
    assert suggested == {
        "L1": "/data/usb/MEDIA/FILMS",
        "L2": "/data/usb2/MEDIA/FILMS",
        "S2": "/data/usb2/MEDIA/SERIES",
        "N1": None,  # /media/SERIES ≠ /MEDIA/SERIES : sensible à la casse
    }
    settings = Settings(fileflows_plex_locations=json.dumps({"L2": "", "N1": "/nas/SERIES"}))
    mapping = fileflows_guard.effective_locations(settings, suggested)
    assert mapping["L2"] is None and mapping["N1"] == "/nas/SERIES" and mapping["L1"]
    assert fileflows_guard.effective_locations(Settings(fileflows_plex_locations="[1]"), suggested) == suggested
    assert fileflows_guard.library_for_file("/data/usb/MEDIA/FILMS/A (2009)/A.mkv", mapping) == "L1"
    assert fileflows_guard.library_for_file("/data/usb2/MEDIA/FILMS/B/B.mkv", mapping) is None
    assert fileflows_guard.library_for_file("/autre/B.mkv", mapping) is None


@pytest.mark.asyncio
async def test_plex_locations_and_sessions():
    sections = (
        b'<MediaContainer><Directory type="movie" title="Films"><Location path="/data/usb/MEDIA/FILMS"/></Directory>'
        b'<Directory type="artist" title="Musique"><Location path="/music"/></Directory></MediaContainer>'
    )
    sessions = (
        b'<MediaContainer><Video><Media><Part file="/data/usb/MEDIA/FILMS/A/A.mkv"/></Media></Video></MediaContainer>'
    )
    conn = MagicMock(url="http://plex", token="t")
    conn.name = "Plex"

    async def fake_get(conn, path, verify):
        import xml.etree.ElementTree as ET

        return ET.fromstring(sections if path == "/library/sections" else sessions)

    with (
        patch.object(fileflows_guard.plex_servers, "active_connections", new=AsyncMock(return_value=[conn])),
        patch.object(fileflows_guard, "_plex_get", new=fake_get),
        patch.object(fileflows_guard.cache, "get_json", new=AsyncMock(return_value=None)),
        patch.object(fileflows_guard.cache, "set_json", new=AsyncMock()),
    ):
        locations = await fileflows_guard.plex_locations(None, None)
        assert locations == [{"server": "Plex", "library": "Films", "path": "/data/usb/MEDIA/FILMS"}]
        assert await fileflows_guard.playing_files(None, None) == ["/data/usb/MEDIA/FILMS/A/A.mkv"]
    with patch("httpx.AsyncClient.get", new=AsyncMock(side_effect=RuntimeError("down"))):
        assert await fileflows_guard._plex_get(conn, "/status/sessions", True) is None


@pytest.mark.asyncio
async def test_publish_pause_and_runners():
    calls = []

    async def call(url, key, method, path, **kwargs):
        calls.append((method, path, kwargs.get("json")))
        if path == "variable":
            return [{"Uid": "V", "Name": "WatchdeckPause", "Value": '{"a": 1}'}] if method == "GET" else {}
        if path == "node":
            return [{"Uid": "N"}] if method == "GET" else {}
        if path == "node/N":
            return {"Uid": "N", "FlowRunners": 2}
        return {}

    with patch.object(fileflows, "_call", new=call):
        await fileflows_guard.publish_pause("http://ff", None, {"a": 1})  # inchangé : pas d'écriture
        await fileflows_guard.publish_pause("http://ff", None, {"a": 2})
        assert await fileflows_guard.set_runners("http://ff", None, 9) == 2
        assert await fileflows_guard.set_runners("http://ff", None, 2) is None
    posts = [c for c in calls if c[0] == "POST"]
    assert posts[0] == ("POST", "variable", {"Uid": "V", "Name": "WatchdeckPause", "Value": '{"a": 2}'})
    assert posts[1][2]["FlowRunners"] == fileflows_guard.MAX_RUNNERS and len(posts) == 2


@pytest.mark.asyncio
async def test_throughput_from_samples():
    store = {}

    async def get_json(key):
        return store.get(key)

    async def set_json(key, value, ttl_seconds):
        store[key] = value

    with (
        patch.object(fileflows_guard.cache, "get_json", new=get_json),
        patch.object(fileflows_guard.cache, "set_json", new=set_json),
    ):
        assert (await fileflows_guard.throughput())["per_hour"] is None
        now = datetime.now(timezone.utc)
        store[fileflows_guard.SAMPLES_KEY] = {
            "items": [
                {"at": (now - timedelta(minutes=30)).isoformat(), "processed": 10},
                {"at": now.isoformat(), "processed": 16},
            ]
        }
        assert (await fileflows_guard.throughput())["per_hour"] == 12.0
        await fileflows_guard._record_sample(20)
        assert len(store[fileflows_guard.SAMPLES_KEY]["items"]) == 3


def test_desired_order_holds_paused_libraries():
    rows = [
        {"u": "r2", "lu": "L2", "fu": "f"},
        {"u": "a", "lu": "L2"},
        {"u": "b", "lu": "L1"},
        {"u": "c", "lu": "L1"},
    ]
    order, _, protected = fileflows_queue.desired_order(rows, set(), paused={"L2"}, relaunched_pass=False)
    assert order == ["b", "c", "r2", "a"] and protected == 0
    order, _, protected = fileflows_queue.desired_order(rows, set(), paused={"L2"}, relaunched_pass=True)
    assert order == ["r2", "b", "c", "a"] and protected == 1


def _guard_env(db, queue, status, playing):
    store: dict = {}
    calls: list = []

    async def get_json(key):
        return store.get(key)

    async def set_json(key, value, ttl_seconds):
        store[key] = value

    async def call(url, key, method, path, **kwargs):
        calls.append((method, path, kwargs.get("json")))
        if path == "library":
            return LIBS
        if path == "library-file/list-all":
            return queue
        if path == "status":
            return status
        if path == "variable":
            return [] if method == "GET" else {}
        if path == "node":
            return [{"Uid": "N"}] if method == "GET" else {}
        if path == "node/N":
            return {"Uid": "N", "FlowRunners": 3}
        return {}

    patches = [
        patch.object(fileflows_guard, "AsyncSessionLocal", return_value=db),
        patch.object(fileflows_guard.cache, "get_json", new=get_json),
        patch.object(fileflows_guard.cache, "set_json", new=set_json),
        patch.object(fileflows, "_call", new=call),
        patch.object(fileflows_guard, "plex_locations", new=AsyncMock(return_value=PLEX)),
        patch.object(fileflows_guard, "playing_files", new=AsyncMock(return_value=playing)),
    ]
    return store, calls, patches


@pytest.mark.asyncio
async def test_guard_pauses_the_played_disk_and_sets_runners():
    db = make_test_session()
    try:
        db.add_all(
            [
                ArrInstance(name="FF", arr_type="fileflows", url="http://ff", api_key=""),
                Settings(fileflows_plex_pause="disk", fileflows_runners_mode="auto", fileflows_plex_resume_minutes=5),
            ]
        )
        db.commit()
        queue = [{"u": "a", "lu": "L2"}, {"u": "b", "lu": "L1"}, {"u": "c", "lu": "L1"}]
        status = {"processed": 3, "processingFiles": []}
        store, calls, patches = _guard_env(db, queue, status, ["/data/usb2/MEDIA/FILMS/X/X.mkv"])
        for p in patches:
            p.start()
        try:
            result = await fileflows_guard.run()
            assert result["playing_disks"] == ["usb2"] and result["paused_disks"] == ["usb2"]
            variable = next(c for c in calls if c[:2] == ("POST", "variable"))[2]
            assert json.loads(variable["Value"])["disks"] == ["usb2"]
            moved = next(c for c in calls if c[1] == "library-file/move-to-top")[2]["Uids"]
            assert moved == ["b", "c", "a"]
            assert result["runners"] == {"from": 3, "to": 1}  # seul usb (usb2 en pause)
            # La lecture s'arrête : le disque reste en pause pendant le délai de reprise.
            fileflows_guard.playing_files.return_value = []
            assert (await fileflows_guard.run())["paused_disks"] == ["usb2"]
        finally:
            for p in patches:
                p.stop()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_guard_off_and_all_modes():
    db = make_test_session()
    try:
        assert (await _run_with(db, None)) == {"status": "not_configured"}
        db.add_all(
            [
                ArrInstance(name="FF", arr_type="fileflows", url="http://ff", api_key=""),
                Settings(fileflows_plex_pause="off"),
            ]
        )
        db.commit()
        result = await _run_with(db, [])
        assert result["paused_disks"] == [] and "reordered" not in result
        db.query(Settings).first().fileflows_plex_pause = "all"
        db.query(Settings).first().fileflows_plex_pause_relaunched = "ignore"
        db.commit()
        result = await _run_with(db, ["/anywhere/file.mkv"])
        assert result["paused_disks"] == ["media", "usb", "usb2"]  # tous les disques connus de FileFlows
    finally:
        db.close()


async def _run_with(db, playing):
    _, _, patches = _guard_env(db, [{"u": "x", "lu": "L1", "fu": "f"}], {"processed": 1}, playing or [])
    for p in patches:
        p.start()
    try:
        return await fileflows_guard.run()
    finally:
        for p in patches:
            p.stop()


@pytest.mark.asyncio
async def test_guard_reports_fileflows_errors():
    db = make_test_session()
    try:
        db.add_all([ArrInstance(name="FF", arr_type="fileflows", url="http://ff", api_key=""), Settings()])
        db.commit()
        with (
            patch.object(fileflows_guard, "AsyncSessionLocal", return_value=db),
            patch.object(fileflows, "_call", new=AsyncMock(side_effect=fileflows.FileFlowsError("down"))),
        ):
            assert await fileflows_guard.run() == {"status": "error", "error": "down"}
    finally:
        db.close()
    with patch.object(fileflows_guard.cache, "get_json", new=AsyncMock(return_value={"at": "x"})):
        assert await fileflows_guard.last_state() == {"at": "x"}


# --------------------------------------------------------------------------- routes


@pytest.fixture
def client_db():
    db = make_test_session()
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: db
    db.add_all([ArrInstance(name="FF", arr_type="fileflows", url="http://ff", api_key=""), Settings()])
    db.commit()
    try:
        with (
            patch.object(control, "publish", new=AsyncMock()),
            patch.object(control.cache, "get_json", new=AsyncMock(return_value=None)),
            patch.object(control.cache, "set_json", new=AsyncMock()),
            patch.object(control.cache, "delete", new=AsyncMock()),
        ):
            yield TestClient(app, raise_server_exceptions=False), db
    finally:
        for dep in (require_auth, require_admin, get_db_async):
            app.dependency_overrides.pop(dep, None)
        db.close()


FLOW_LIST = [{"Uid": UID, "Name": "V3", "Type": 0, "UsedBy": [{"Name": "Films — USB 1"}]}, {"Uid": "t", "Type": 1}]


async def _control_call(url, key, method, path, **kwargs):
    if path == "flow/list-all":
        return FLOW_LIST
    if path == f"flow/{UID}":
        return {
            "Uid": UID,
            "Name": "V3",
            "Revision": 9,
            "Parts": [{"Name": "0. Verrou"}, {"FlowElementUid": "a.VideoFile"}],
        }
    if path == "library":
        return LIBS
    if path.startswith("library/") and method == "GET":
        return {"Uid": "L1", "Name": "Films — USB 1", "Flow": {}}
    if path == "node":
        return [{"Uid": "N"}]
    if path == "node/N":
        return {"Uid": "N", "FlowRunners": 2, "Schedule": "1" * 671 + "0"}
    return {}


def test_overview_route(client_db):
    client, _ = client_db
    state = {
        "queue": 12,
        "processing": 2,
        "processed": 5,
        "failed": 0,
        "paused": False,
        "paused_until": None,
        "runners": [
            {"path": "/usb/MEDIA/FILMS/A/A.mkv", "name": "A/A.mkv", "step": "4. Assemblage", "percent": 0},
            {"path": "/usb/MEDIA/FILMS/B/B.mkv", "name": "B/B.mkv", "step": "0. Verrou du disque", "percent": 0},
        ],
    }
    with (
        patch.object(fileflows, "dashboard", new=AsyncMock(return_value=state)),
        patch.object(fileflows_queue, "_libraries", new=AsyncMock(return_value=LIBS[:2])),
        patch.object(fileflows_queue, "_queue", new=AsyncMock(return_value=[{"u": "q", "lu": "L2"}])),
        patch.object(fileflows, "folder_index", new=AsyncMock(return_value={})),
        patch.object(fileflows_guard, "last_state", new=AsyncMock(return_value={"paused_disks": ["usb2"]})),
        patch.object(fileflows_guard, "throughput", new=AsyncMock(return_value={"per_hour": 6.0})),
    ):
        data = client.get("/api/fileflows/overview").json()
    usb = next(d for d in data["disks"] if d["disk"] == "usb")
    assert len(usb["running"]) == 1 and usb["lock_waiting"] == 1
    assert next(d for d in data["disks"] if d["disk"] == "usb2")["waiting"] == 1
    assert data["eta_hours"] == 2.0 and data["automations"]["plex_pause"] == "off"


def test_library_routes(client_db):
    client, db = client_db
    posted = []

    async def call(url, key, method, path, **kwargs):
        if method in ("POST", "PUT"):
            posted.append((method, path, kwargs))
        return await _control_call(url, key, method, path, **kwargs)

    with (
        patch.object(fileflows, "_call", new=call),
        patch.object(fileflows_queue, "_queue", new=AsyncMock(return_value=[{"u": "q", "lu": "L1"}])),
        patch.object(fileflows_guard, "plex_locations", new=AsyncMock(return_value=PLEX)),
    ):
        data = client.get("/api/fileflows/libraries").json()
        l1 = next(row for row in data["libraries"] if row["uid"] == "L1")
        assert (
            l1["waiting"] == 1 and l1["plex_location"] == "/data/usb/MEDIA/FILMS" and not l1["plex_location_confirmed"]
        )
        assert data["flows"][0]["used_by"] == ["Films — USB 1"]
        lid = "22222222-2222-2222-2222-222222222222"
        assert (
            client.patch(
                f"/api/fileflows/libraries/{lid}", json={"flow_uid": UID, "enabled": False, "reorder": True}
            ).status_code
            == 200
        )
        assert client.patch(f"/api/fileflows/libraries/{lid}", json={"flow_uid": "nope"}).status_code == 422
        assert client.patch("/api/fileflows/libraries/bad", json={}).status_code == 422
        assert client.post(f"/api/fileflows/libraries/{lid}/rescan").json() == {"ok": True}
        assert client.put(f"/api/fileflows/libraries/{lid}/plex-location", json={"path": ""}).json() == {"ok": True}
    settings = db.query(Settings).first()
    assert json.loads(settings.fileflows_plex_locations) == {lid: ""}
    assert json.loads(settings.fileflows_reorder_libraries) == [lid]
    assert [p[1] for p in posted] == ["library", f"library/state/{lid}", "library/rescan"]
    assert client.put(f"/api/fileflows/libraries/{lid}/plex-location", json={"path": None}).json() == {"ok": True}
    assert json.loads(db.query(Settings).first().fileflows_plex_locations) == {}


def test_flow_and_control_routes(client_db):
    client, db = client_db
    posted = []

    async def call(url, key, method, path, **kwargs):
        if method == "POST":
            posted.append((path, kwargs.get("json")))
        return await _control_call(url, key, method, path, **kwargs)

    with (
        patch.object(fileflows, "_call", new=call),
        patch.object(fileflows_guard, "last_state", new=AsyncMock(return_value=None)),
    ):
        flows = client.get("/api/fileflows/flows").json()["flows"]
        assert flows[0]["steps"] == ["0. Verrou", "VideoFile"] and flows[0]["revision"] == 9
        sent = client.post("/api/fileflows/reprocess-with-flow", json={"uids": [UID], "flow_uid": UID}).json()
        assert sent == {"queued": 1, "flow": "V3"}
        assert (
            client.post("/api/fileflows/reprocess-with-flow", json={"uids": ["x"], "flow_uid": UID}).status_code == 422
        )
        assert (
            client.post("/api/fileflows/reprocess-with-flow", json={"uids": [UID], "flow_uid": "x"}).status_code == 422
        )
        assert client.post(f"/api/fileflows/files/{UID}/top").json() == {"ok": True}
        assert client.post("/api/fileflows/files/bad/top").status_code == 422
        control_state = client.get("/api/fileflows/control").json()
        assert control_state["runners"] == 2 and control_state["schedule_restricted"] is True
        body = {
            "runners_mode": "manual",
            "runners": 3,
            "plex_pause": "disk",
            "plex_pause_relaunched": "ignore",
            "plex_resume_minutes": 2,
            "reorder_enabled": True,
        }
        assert client.put("/api/fileflows/control", json=body).json() == {"ok": True}
        assert client.put("/api/fileflows/control", json={**body, "plex_pause": "x"}).status_code == 422
    settings = db.query(Settings).first()
    assert settings.fileflows_plex_pause == "disk" and settings.fileflows_reorder_enabled is True
    assert [p[0] for p in posted] == ["library-file/reprocess", "library-file/move-to-top", "node"]
    assert posted[-1][1]["FlowRunners"] == 3


def test_control_routes_without_fileflows():
    db = make_test_session()
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: db
    try:
        client = TestClient(app, raise_server_exceptions=False)
        assert client.get("/api/fileflows/overview").status_code == 404
        assert client.get("/api/fileflows/control").status_code == 404
    finally:
        for dep in (require_auth, require_admin, get_db_async):
            app.dependency_overrides.pop(dep, None)
        db.close()


def test_schedule_presets():
    night = fileflows_guard.schedule_for("night")
    assert len(night) == 672 and night[:32] == "1" * 32 and night[32:96] == "0" * 64
    assert night[96:128] == "1" * 32  # même plage chaque jour (lundi = 2e bloc après dimanche)
    assert fileflows_guard.preset_of(night) == "night"
    assert fileflows_guard.preset_of("") == "always" and fileflows_guard.preset_of("1" * 672) == "always"
    assert fileflows_guard.preset_of("0" + "1" * 671) == "custom"
    evening = fileflows_guard.schedule_for("not_evening")
    assert evening[72:96] == "0" * 24 and evening[71] == "1"


def test_control_applies_schedule_preset(client_db):
    client, _ = client_db
    posted = []

    async def call(url, key, method, path, **kwargs):
        if method == "POST":
            posted.append((path, kwargs.get("json")))
        return await _control_call(url, key, method, path, **kwargs)

    body = {
        "runners_mode": "auto",
        "runners": 1,
        "plex_pause": "off",
        "plex_pause_relaunched": "follow",
        "plex_resume_minutes": 5,
        "reorder_enabled": False,
        "alert_channels": ["ntfy"],
        "schedule_preset": "night",
    }
    with (
        patch.object(fileflows, "_call", new=call),
        patch.object(fileflows_guard, "last_state", new=AsyncMock(return_value=None)),
    ):
        assert client.put("/api/fileflows/control", json=body).json() == {"ok": True}
        assert client.put("/api/fileflows/control", json={**body, "schedule_preset": "custom"}).json() == {"ok": True}
        state = client.get("/api/fileflows/control").json()
    assert [p[0] for p in posted] == ["node"]
    assert posted[0][1]["Schedule"] == fileflows_guard.schedule_for("night")
    assert state["alert_channels"] == ["ntfy"] and state["schedule_preset"] == "custom"
