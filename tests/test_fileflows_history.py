"""Historique FileFlows : résumé avant/après, enregistrement sans doublon, statistiques."""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import ArrInstance, FileflowsProcessing, LibraryItem, Settings
from app.services import fileflows, fileflows_history
from tests.async_support import make_test_session

UID = "11111111-1111-1111-1111-111111111111"
DETAIL = {
    "Status": 1,
    "Name": "/usb2/MEDIA/FILMS/Film (2009)/Film (2009).mkv",
    "RelativePath": "Film (2009)/Film (2009).mkv",
    "LibraryName": "Films — USB 2",
    "FlowName": "V3",
    "ProcessingStarted": "2026-10-09T01:00:00Z",
    "ProcessingEnded": "2026-10-09T01:05:00Z",
    "ProcessingTime": "00:05:00",
    "OriginalSize": 4000,
    "FinalSize": 3000,
    "FailureReason": "",
    "OriginalMetadata": {
        "Duration": "01:30:00",
        "Video Codec": "h264",
        "Video Resolution": "1920x1080",
        "Audio Codec": "eac3",
        "Audio Channels": 5.1,
        "Audio 2 Codec": "aac",
        "Subtitle Codec": "subrip",
        "Subtitle Forced": True,
    },
    "ExecutedNodes": [
        {"NodeName": "0. Verrou du disque", "ProcessingTime": "00:01:00", "Output": 1},
        {"NodeName": "1. Sous-titres (préparation)", "ProcessingTime": "00:00:40", "Output": 1},
        {"NodeName": "4. Assemblage MKVMerge et contrôles", "ProcessingTime": "00:02:00", "Output": 1},
    ],
}
LOG = 'x\nINFO -> WATCHDECK_RESULT {"kind": "rewrite", "before": {"size": 4000}, "after": {"size": 3000}}\nfin'


def test_parse_result_and_metadata_summary():
    assert fileflows_history.parse_result(LOG) == {"kind": "rewrite", "before": {"size": 4000}, "after": {"size": 3000}}
    assert fileflows_history.parse_result("rien") is None
    assert fileflows_history.parse_result("WATCHDECK_RESULT {pas du json") is None
    summary = fileflows_history.summary_from_metadata(DETAIL["OriginalMetadata"], 4000)
    assert summary["video"] == {"codec": "h264", "width": 1920, "height": 1080, "pix_fmt": None}
    assert [a["codec"] for a in summary["audio"]] == ["eac3", "aac"]
    assert summary["subtitles"] == [{"codec": "subrip", "forced": True}]
    assert summary["duration"] == 5400 and summary["size"] == 4000
    assert fileflows_history.summary_from_metadata({}, 1) is None
    assert fileflows_history._datetime("0001-01-01T00:00:00Z") is None


@pytest.mark.asyncio
async def test_record_once_per_run_and_statistics():
    db = make_test_session()
    try:
        item = LibraryItem(title="Film", year=2009, media_type="movie")
        db.add(item)
        db.commit()
        index = {"film (2009)": {"id": item.id}}
        with (
            patch.object(fileflows, "file_detail", new=AsyncMock(return_value=DETAIL)),
            patch.object(fileflows, "file_log", new=AsyncMock(return_value=LOG)),
        ):
            row = await fileflows_history.record(db, "http://ff", None, UID, index)
            assert row is not None and row.kind == "rewrite" and row.disk == "usb2"
            assert row.after == {"size": 3000} and row.library_item_id == item.id
            assert row.processing_seconds == 240 and row.wait_seconds == 60
            assert await fileflows_history.record(db, "http://ff", None, UID, index) is None  # même passage
        failed = {**DETAIL, "Status": 4, "ProcessingEnded": "2026-10-09T02:00:00Z", "FailureReason": "ApiKey=abc"}
        with patch.object(fileflows, "file_detail", new=AsyncMock(return_value=failed)):
            row = await fileflows_history.record(db, "http://ff", None, UID, index, with_log=False)
            assert row.status == "failed" and row.failure_reason == "ApiKey=[masqué]" and row.after is None
            assert row.before["video"]["codec"] == "h264"
        with patch.object(fileflows, "file_detail", new=AsyncMock(return_value={**DETAIL, "Status": 0})):
            assert await fileflows_history.record(db, "http://ff", None, "q", index) is None
        stats = await fileflows_history.statistics(db, 3650)
        assert stats["processed"] == 1 and stats["failed"] == 1 and stats["saved_bytes"] == 1000
        assert stats["kinds"] == {"rewrite": 1} and stats["disks"][0]["average_wait_seconds"] == 60
        assert [s["name"] for s in stats["steps"]] == [
            "4. Assemblage MKVMerge et contrôles",
            "1. Sous-titres (préparation)",
        ]
        recent = await fileflows_history.recent(db)
        assert [r["status"] for r in recent] == ["failed", "processed"]
    finally:
        db.close()


@pytest.mark.asyncio
async def test_record_many_survives_errors():
    db = make_test_session()
    try:
        with (
            patch("app.database.AsyncSessionLocal", return_value=db),
            patch.object(fileflows, "folder_index", new=AsyncMock(return_value={})),
            patch.object(
                fileflows, "file_detail", new=AsyncMock(side_effect=[fileflows.FileFlowsError("down"), DETAIL])
            ),
            patch.object(fileflows, "file_log", new=AsyncMock(return_value=LOG)),
        ):
            assert await fileflows_history.record_many("http://ff", None, ["a", UID]) == 1
    finally:
        db.close()


def test_history_route():
    db = make_test_session()
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: db
    try:
        db.add_all([ArrInstance(name="FF", arr_type="fileflows", url="http://ff", api_key=""), Settings()])
        db.add(
            FileflowsProcessing(
                file_uid=UID,
                status="processed",
                kind="in_place",
                path="F/f.mkv",
                disk="usb",
                ended_at=datetime(2026, 10, 9, 1, 0),
                processing_seconds=2,
                steps=[],
            )
        )
        db.commit()
        client = TestClient(app, raise_server_exceptions=False)
        data = client.get("/api/fileflows/history?days=99999").json()
        assert data["stats"]["days"] == 36500 and data["stats"]["kinds"] == {"in_place": 1}
        assert data["recent"][0]["kind"] == "in_place"
        # La période précédente (décalée de toute la période) ne contient pas ce passage.
        previous = client.get("/api/fileflows/history?days=36500&offset=36500").json()
        assert previous["stats"]["processed"] == 0 and previous["stats"]["kinds"] == {}
    finally:
        for dep in (require_auth, require_admin, get_db_async):
            app.dependency_overrides.pop(dep, None)
        db.close()
