import asyncio
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from app.models import DiagnosticEvent, FulfillmentStatus, MediaRequest, PlexUser, RequestStatus, Settings
from app.services.diagnostics import request_context, update_request_context
from app.services.notification_policy import (
    dispatch_transition_notification,
    has_transition_notification_intent,
    request_notification_is_eligible,
)
from app.services.request_lifecycle import transition_request


def _request(**kwargs):
    values = {
        "plex_user_id": "alice",
        "title": "Dune",
        "media_type": "movie",
        "status": RequestStatus.pending,
    }
    values.update(kwargs)
    return MediaRequest(**values)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "event", ["queued", "download_started", "import_started", "download_finished", "arr_imported", "plex_pending"]
)
async def test_stale_poll_cannot_overwrite_concurrent_availability(committed_async_database, monkeypatch, event):
    monkeypatch.setattr("app.realtime.publish_request_event", AsyncMock())
    sessions = committed_async_database.session_factory
    async with sessions() as seed:
        req = _request(status=RequestStatus.sent_to_arr, diagnostic_context='{"request_origin": "watchlist"}')
        seed.add(req)
        await seed.commit()
        request_id = req.id

    async with sessions() as poll, sessions() as webhook:
        stale = await poll.get(MediaRequest, request_id)
        current = await webhook.get(MediaRequest, request_id)
        stale.has_vf = True  # Les observations independantes du poll sont conservees.
        update_request_context(stale, arr_event="availability_detected")
        await transition_request(webhook, current, "available", source="plex")
        await webhook.commit()
        available_at = current.available_at

        assert await transition_request(poll, stale, event, source="arr") is False
        await poll.commit()

    async with sessions() as verify:
        result = await verify.get(MediaRequest, request_id)
        assert result.status == RequestStatus.available
        assert result.fulfillment_status == FulfillmentStatus.completed
        assert result.available_at == available_at
        assert result.has_vf is True
        context = request_context(result)
        assert context["lifecycle_event"] == "available"
        assert context["fulfillment_source"] == "plex"
        assert context["arr_event"] == "availability_detected"


@pytest.mark.asyncio
async def test_concurrent_availability_is_recorded_once(committed_async_database, monkeypatch):
    monkeypatch.setattr("app.realtime.publish_request_event", AsyncMock())
    sessions = committed_async_database.session_factory
    async with sessions() as seed:
        req = _request(status=RequestStatus.sent_to_arr)
        seed.add(req)
        await seed.commit()
        request_id = req.id

    async with sessions() as first, sessions() as second:
        first_request = await first.get(MediaRequest, request_id)
        second_request = await second.get(MediaRequest, request_id)

        async def confirm(db, item):
            changed = await transition_request(db, item, "available", source="plex")
            await db.commit()
            return changed

        results = await asyncio.wait_for(
            asyncio.gather(confirm(first, first_request), confirm(second, second_request)), timeout=5
        )
        assert sorted(results) == [False, True]

    async with sessions() as verify:
        count = await verify.scalar(
            select(func.count())
            .select_from(DiagnosticEvent)
            .where(DiagnosticEvent.request_id == request_id, DiagnosticEvent.action == "available")
        )
        assert count == 1


@pytest.mark.asyncio
async def test_transition_separates_business_and_fulfillment_state(async_db):
    req = _request()
    async_db.add(req)
    async_db.commit()

    await transition_request(async_db, req, "submitted", source="radarr")
    await transition_request(async_db, req, "download_started", source="radarr")
    await async_db.commit()

    assert req.status == RequestStatus.sent_to_arr
    assert req.fulfillment_status == FulfillmentStatus.downloading
    assert req.is_downloading is True
    assert req.arr_processed_at is not None


@pytest.mark.asyncio
async def test_available_transition_is_idempotent(async_db):
    req = _request(status=RequestStatus.sent_to_arr)
    async_db.add(req)
    async_db.commit()

    first = await transition_request(async_db, req, "available", source="plex")
    available_at = req.available_at
    second = await transition_request(async_db, req, "available", source="plex")

    assert first is True
    assert second is False
    assert req.status == RequestStatus.available
    assert req.fulfillment_status == FulfillmentStatus.completed
    assert req.available_at == available_at


@pytest.mark.asyncio
async def test_late_arr_event_cannot_regress_completed_request(async_db):
    req = _request(status=RequestStatus.available)
    async_db.add(req)
    async_db.commit()

    changed = await transition_request(async_db, req, "download_finished", source="sonarr")

    assert changed is False
    assert req.status == RequestStatus.available
    assert req.fulfillment_status == FulfillmentStatus.completed


@pytest.mark.asyncio
async def test_failure_and_retry_preserve_structured_error(async_db):
    req = _request(status=RequestStatus.sent_to_arr)
    async_db.add(req)
    async_db.commit()

    await transition_request(async_db, req, "failed", source="radarr", error="HTTP 503")
    assert req.status == RequestStatus.failed
    assert req.fulfillment_status == FulfillmentStatus.failed
    assert req.fulfillment_error == "HTTP 503"

    await transition_request(async_db, req, "retry", source="manual")
    assert req.status == RequestStatus.pending
    assert req.fulfillment_status == FulfillmentStatus.awaiting_submission
    assert req.fulfillment_error is None


@pytest.mark.asyncio
async def test_transition_produces_notification_intent_only_when_state_changes(async_db):
    req = _request(source="rss")
    async_db.add(req)
    async_db.commit()

    first = await transition_request(async_db, req, "submitted", source="radarr")
    second = await transition_request(async_db, req, "submitted", source="radarr")

    assert first is True
    assert second is False
    assert has_transition_notification_intent(req, "submitted") is True


@pytest.mark.asyncio
async def test_technical_origins_and_pseudo_requesters_cannot_notify(async_db):
    real_user = PlexUser(plex_user_id="alice", enabled=True)
    arr_origin = _request(plex_user_id="alice", source="arr_sync")
    pseudo = _request(plex_user_id="manual", source="manual_search")
    user_request = _request(plex_user_id="alice", source="rss")
    async_db.add_all([real_user, arr_origin, pseudo, user_request])
    async_db.commit()

    assert await request_notification_is_eligible(arr_origin, async_db) is False
    assert await request_notification_is_eligible(pseudo, async_db) is False
    assert await request_notification_is_eligible(user_request, async_db) is True


@pytest.mark.asyncio
async def test_dispatch_uses_transition_intent_and_origin_policy(async_db, monkeypatch):
    from unittest.mock import AsyncMock

    notify = AsyncMock()
    monkeypatch.setattr("app.services.notification_orchestrator._notify", notify)
    settings = Settings()
    user = PlexUser(plex_user_id="alice", enabled=True)
    req = _request(plex_user_id="alice", source="rss")
    async_db.add_all([settings, user, req])
    async_db.commit()

    await transition_request(async_db, req, "submitted", source="radarr")
    await async_db.commit()
    dispatched = await dispatch_transition_notification(settings, req, async_db, "submitted")
    dispatched_again = await dispatch_transition_notification(settings, req, async_db, "submitted")

    assert dispatched is True
    assert dispatched_again is False
    notify.assert_awaited_once()
