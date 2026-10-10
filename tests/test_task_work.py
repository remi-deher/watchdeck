import pytest

from app.services.work_ref import WorkRecord, task_work


@pytest.mark.parametrize(
    "status,expected",
    [("running", "running"), ("complete", "completed"), ("failed", "blocked"), ("unexpected", "unknown")],
)
def test_execution_is_observed_not_inferred_from_percent(status, expected):
    work = task_work("watchlist", {"status": status, "progress": 100})
    assert work["state"] == expected
    assert work["progress"]["percent"] is None
    WorkRecord.model_validate({"work": work})


def test_scan_zero_unknown_and_finished_step():
    assert task_work("vff", {"status": "running", "total_items": 0}, scan=True)["progress"]["percent"] is None
    zero = task_work("vff", {"status": "running", "total_items": 10, "items_scanned": 0}, scan=True)
    assert zero["progress"]["percent"] == 0
    complete_step = task_work("vff", {"status": "running", "total_items": 10, "items_scanned": 10}, scan=True)
    assert complete_step["state"] == "running"
    assert complete_step["key"] == zero["key"]


def test_idle_error_is_not_success():
    row = {"status": "idle", "finished_at": "2026-10-10", "error": "Run interrompu"}
    assert task_work("plex", row, scan=True)["state"] == "blocked"
    assert task_work("plex", row, scan=True)["reason"] == "Run interrompu"


def test_expired_execution_is_unknown_and_keeps_identity():
    row = {"status": "running", "progress": 100, "stale": True}
    work = task_work("watchlist", row)
    assert work["state"] == "unknown"
    assert work["stale"] is True
    assert work["progress"]["percent"] is None
    assert work["key"] == task_work("watchlist", {"status": "running"})["key"]
