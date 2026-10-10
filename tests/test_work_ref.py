import pytest
from pydantic import ValidationError

from app.services.work_ref import WorkRecord, download_work, encoding_work, transfer_work
from app.services.fileflows import WAIT_STEP_PREFIX
from app.services.arr_common import queue_progress
from app.services.arr_queue_common import classify_queue_record


@pytest.mark.parametrize("value, expected", [(None, None), (0, 0), (100, 100), (-5, 0), (125, 100), (float("nan"), None)])
def test_encoding_step_progress(value, expected):
    work = encoding_work({"path": "/a", "step": "Vidéo", "percent": value}, instance_id=1, runner=True)
    assert work["progress"]["percent"] == expected
    assert work["progress"]["scope"] == "step"
    assert work["state"] == "running"


def test_disk_lock_is_automatic_waiting():
    work = encoding_work({"path": "/a", "step": WAIT_STEP_PREFIX + " disque"}, instance_id=1, runner=True)
    assert work["state"] == "waiting"
    assert work["reason"]


@pytest.mark.parametrize("tracked,state", [("importPending", "waiting"), ("importing", "running"), ("imported", "completed"), (None, "waiting")])
def test_download_finished_does_not_certify_import(tracked, state):
    work = download_work({"arr_type": "sonarr", "instance_id": 1, "queue_id": 2, "progress": 100, "tracked_state": tracked})
    assert work["state"] == state
    assert work["progress"]["scope"] == "download"


def test_failed_and_stale_downloads():
    row = {"client_id": 2, "hash": "a", "status": "downloading", "progress": 0}
    assert download_work(row)["state"] == "running"
    stale = download_work({**row, "is_stale": True, "client_error": "Injoignable"})
    assert stale["state"] == "unknown"
    assert stale["progress"]["percent"] is None
    assert stale["key"] == download_work(row)["key"]
    assert download_work({**row, "status": "failed", "error": "Disque plein"})["state"] == "blocked"


def test_unknown_arr_measurement_is_not_zero_or_complete():
    assert queue_progress({"size": 100}) == (100, None, None)
    assert classify_queue_record({"size": 100, "status": "downloading"}).state == "downloading"
    assert download_work({"status": "new-provider-state"})["state"] == "unknown"


def test_copy_finished_still_requires_finalization_and_observed_pause():
    row = {"id": 1, "status": "finalizing", "desired_state": "pause", "items": [{"status": "plex_pending", "size_bytes": 100}]}
    work = transfer_work(row)
    assert work["state"] == "running"
    assert work["stage"] == "Finalisation Plex"
    assert work["progress"] == {"percent": 100, "scope": "copy", "label": "Copie uniquement"}
    assert transfer_work({**row, "status": "paused"})["state"] == "paused"
    assert transfer_work({**row, "status": "completed"})["state"] == "completed"
    assert transfer_work({"id": 1, "status": "queued", "items": []})["progress"]["percent"] is None


def test_work_contract_is_required_and_rejects_incomplete_projection():
    with pytest.raises(ValidationError):
        WorkRecord.model_validate({"status": "running"})
    with pytest.raises(ValidationError):
        WorkRecord.model_validate({"work": {"state": "running"}})


def test_external_arr_move_has_no_observed_copy_percentage():
    work = transfer_work({"id": 2, "status": "running", "params": {"transfer_mode": "arr"}, "items": [{"status": "arr_pending", "size_bytes": 100}]})
    assert work["progress"]["percent"] is None
    assert work["stage"] == "Déplacement confié à Arr"
