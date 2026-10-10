from types import SimpleNamespace

import pytest

from app.services.media_availability import media_availability
from app.services.operational_projection import request_operational_projection
from app.services.request_journey import RequestJourney


def journey(**kwargs):
    row = SimpleNamespace(id=8, source="rss", **kwargs)
    return request_operational_projection(row)["journey"]


def test_import_completed_without_plex_confirmation_waits_for_plex():
    result = journey(status="available", fulfillment_status="completed")
    assert result["status"] == "awaiting_plex"
    assert result["next_step"]["kind"] == "plex"
    assert result["tracking"]["kind"] == "importing"
    assert [step["key"] for step in result["steps"] if step["state"] == "current"] == ["awaiting_plex"]
    assert next(step for step in result["steps"] if step["key"] == "completed")["state"] == "upcoming"
    assert RequestJourney.model_validate(result).model_dump() == result


def test_confirmed_plex_completion_has_no_next_technical_step():
    result = journey(status="available", fulfillment_status="completed", library_item_id=7)
    assert result["status"] == "completed"
    assert result["next_step"] is None
    assert result["tracking"] is None
    assert all(step["state"] == "completed" for step in result["steps"])


@pytest.mark.parametrize("status", ["failed", "removed"])
def test_error_or_removed_has_reason_and_expected_recovery(status):
    result = journey(fulfillment_status=status, fulfillment_error="Service indisponible")
    assert result["blocker"]["label"] == "Service indisponible"
    assert result["next_step"] is not None
    assert result["steps"][-1]["state"] == "error"


def test_rejected_request_does_not_offer_a_next_technical_step():
    result = journey(status="rejected", fulfillment_status="not_submitted")
    assert result["status"] == "rejected"
    assert result["next_step"] is None
    assert [step["key"] for step in result["steps"]] == ["requested", "rejected"]


def test_arr_origin_does_not_invent_request_or_approval():
    row = SimpleNamespace(id=8, source="arr_sync", fulfillment_status="downloading")
    result = request_operational_projection(row)["journey"]
    assert result["origin"]["kind"] == "arr"
    assert not {"requested", "approval"} & {step["key"] for step in result["steps"]}
    assert all(step["occurred_at"] is None for step in result["steps"])


def test_arr_origin_without_historical_fulfillment_does_not_wait_for_approval():
    row = SimpleNamespace(id=8, source="arr_sync", fulfillment_status=None)
    result = request_operational_projection(row)["journey"]
    assert result["status"] == "submitted"
    assert result["next_step"]["kind"] == "release"


def test_plex_origin_without_current_confirmation_does_not_invent_approval():
    row = SimpleNamespace(id=8, source="plex_sync", fulfillment_status=None)
    result = request_operational_projection(row)["journey"]
    assert result["status"] == "awaiting_plex"
    assert [step["key"] for step in result["steps"] if step["state"] == "current"] == ["awaiting_plex"]


def test_not_yet_submitted_request_does_not_claim_a_release_was_not_found():
    result = journey(status="pending", fulfillment_status="awaiting_submission")
    assert result["tracking"]["kind"] == "submission"
    assert result["blocker"] is None
    assert result["next_step"]["kind"] == "submission"


def test_partial_show_up_to_date_waits_for_future_episodes():
    result = journey(
        status="partially_available",
        fulfillment_status="partially_available",
        library_item_id=7,
        episodes_available_count=8,
        episodes_aired_count=8,
        episodes_total_count=12,
    )
    assert result["blocker"] is None
    assert result["next_step"]["label"] == "Attendre les prochains épisodes"


def test_explicit_absence_overrides_stale_library_link():
    row = SimpleNamespace(id=8, source="rss", status="available", fulfillment_status="completed", library_item_id=7)
    result = request_operational_projection(row, availability=media_availability(row, plex_present=False))["journey"]
    assert result["status"] == "awaiting_plex"


def test_partial_show_unknown_coverage_does_not_invent_missing_episodes():
    result = journey(status="partially_available", fulfillment_status="partially_available", library_item_id=7)
    assert result["blocker"] is None
    assert result["next_step"]["label"] == "Vérifier la couverture des épisodes"


def test_failed_fulfillment_remains_blocked_despite_old_available_status():
    result = journey(status="available", fulfillment_status="failed", library_item_id=7)
    assert result["status"] == "failed"
    assert result["tracking"]["kind"] == "failed"
    assert result["blocker"] is not None


def test_active_download_is_not_hidden_by_old_available_status():
    result = journey(status="available", fulfillment_status="downloading", library_item_id=7)
    assert result["status"] == "downloading"
    assert result["availability"]["plex"] == "present"
    assert result["tracking"]["kind"] == "downloading"


def test_live_download_progress_is_part_of_complete_journey():
    row = SimpleNamespace(id=8, source="rss", status="sent_to_arr", fulfillment_status="downloading")
    result = request_operational_projection(
        row, queue_entry={"status": "downloading", "progress": 42, "timeleft": "00:15:00"}
    )["journey"]
    assert result["tracking"]["download"] == {"progress": 42, "timeleft": "00:15:00"}


def test_paginated_endpoint_has_required_journey_and_consistent_availability(async_db):
    from app.models import MediaRequest, RequestStatus, FulfillmentStatus
    from tests.test_library_filters import _client, _cleanup

    async_db.add(
        MediaRequest(
            title="Import terminé",
            media_type="movie",
            plex_user_id="alice",
            status=RequestStatus.available,
            fulfillment_status=FulfillmentStatus.completed,
        )
    )
    async_db.commit()
    try:
        response = _client(async_db).get("/api/requests-list")
        assert response.status_code == 200
        item = response.json()["items"][0]
        assert item["journey"]["availability"] == item["availability"]
        assert item["journey"]["request_id"] == item["id"]
        assert item["journey"]["status"] == "awaiting_plex"
        client = _client(async_db)
        full = client.get("/api/requests")
        assert full.status_code == 200
        assert full.json()[0]["journey"]["status"] == "awaiting_plex"
        detail = client.get(f"/api/requests/{item['id']}")
        assert detail.status_code == 200
        assert detail.json()["journey"]["status"] == "awaiting_plex"
    finally:
        _cleanup()
