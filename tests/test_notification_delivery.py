"""Delivery guarantees with a real database; no live email provider is contacted."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Base, EmailProvider, MediaRequest, NotificationDelivery, PlexUser, Settings
from app.services.email_providers import send_with_fallback
from app.services.notification_delivery import (
    DeliveryUncertain,
    claim,
    delivery_identity,
    finish,
    identity_for,
    prepare,
    recipient_status,
)


@pytest_asyncio.fixture
async def sessions(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'delivery.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


def test_stable_key_normalizes_recipient_and_ignores_rendering():
    a = identity_for(1, "available", "Bob@example.com", {"scope": "movie", "language": "vf"})
    b = identity_for(
        1,
        "available",
        "bob@example.com",
        {
            "scope": "movie",
            "language": "vf",
            "is_upgrade": False,
            "_plex_deep_link": "changed",
        },
    )
    assert a == b
    assert a != identity_for(1, "available", "bob@example.com", {"scope": "movie", "language": "vo"})
    assert a != identity_for(
        1, "available", "bob@example.com", {"scope": "movie", "language": "vf", "resend_id": "explicit"}
    )


@pytest.mark.asyncio
async def test_only_one_concurrent_claim_and_durable_success(sessions):
    identity = identity_for(1, "request", "bob@example.com", {})

    async def worker():
        async with sessions() as db:
            try:
                return await claim(db, identity)
            except DeliveryUncertain:
                return "blocked"

    assert sorted(await asyncio.gather(worker(), worker()), key=str) == [True, "blocked"]
    async with sessions() as db:
        await finish(db, identity["send_key"], "sent")
    async with sessions() as db:
        assert await claim(db, identity) is False


@pytest.mark.asyncio
async def test_provider_timeout_never_falls_back_or_retries(sessions):
    async with sessions() as db:
        db.add_all(
            [
                EmailProvider(name="first", provider_type="smtp", enabled=True, priority=1),
                EmailProvider(name="second", provider_type="smtp", enabled=True, priority=2),
            ]
        )
        await db.commit()
    identity = identity_for(1, "request", "bob@example.com", {})
    token = delivery_identity.set(identity)
    try:
        with patch("app.services.email_providers.send_via_provider", new=AsyncMock(side_effect=TimeoutError)) as send:
            for _ in range(2):
                async with sessions() as db:
                    with pytest.raises(DeliveryUncertain):
                        await send_with_fallback(db, "sender@example.com", "bob@example.com", "subject", "html")
            assert send.await_count == 1
        async with sessions() as db:
            row = await db.get(NotificationDelivery, identity["send_key"])
            assert row.state == "uncertain"
    finally:
        delivery_identity.reset(token)


@pytest.mark.asyncio
async def test_cancellation_survives_queue_removal(sessions):
    identity = identity_for(1, "request", "bob@example.com", {})
    async with sessions() as db:
        await prepare(db, identity)
        await finish(db, identity["send_key"], "cancelled")
    async with sessions() as db:
        with pytest.raises(DeliveryUncertain):
            await claim(db, identity)


@pytest.mark.asyncio
async def test_revalidate_membership_preferences_and_current_availability(sessions):
    async with sessions() as db:
        req = MediaRequest(
            plex_user_id="alice",
            title="Dune",
            media_type="movie",
            status="available",
            extra_requesters='[{"plex_user_id":"bob"}]',
        )
        user = PlexUser(plex_user_id="bob", enabled=True, notification_email="bob@example.com")
        settings = Settings(email_enabled=True, email_on_available=True)
        db.add_all([req, user, settings])
        await db.commit()
        context = {"scope": "movie", "requester_ids_by_recipient": {"bob@example.com": ["bob"]}}
        assert await recipient_status(db, req, settings, "available", "bob@example.com", context) == "ready"
        user.notify_on_available = False
        assert await recipient_status(db, req, settings, "available", "bob@example.com", context) == "obsolete"
        user.notify_on_available = True
        req.extra_requesters = "[]"
        assert await recipient_status(db, req, settings, "available", "bob@example.com", context) == "obsolete"
        req.extra_requesters = '[{"plex_user_id":"bob"}]'
        req.status = "sent_to_arr"
        assert await recipient_status(db, req, settings, "available", "bob@example.com", context) == "obsolete"


@pytest.mark.asyncio
async def test_prepared_key_rollback_is_atomic(sessions):
    identity = identity_for(1, "request", "bob@example.com", {})
    async with sessions() as db:
        await prepare(db, identity)
        await db.rollback()
    async with sessions() as db:
        assert (await db.execute(select(NotificationDelivery))).scalars().all() == []


@pytest.mark.asyncio
async def test_catch_up_failure_rolls_back_membership_and_both_notifications(sessions):
    from app.models import PendingNotification
    from app.notification_queue import persist_pending_notification
    from app.services.watchlist_poller import _process_watchlist_item

    async with sessions() as db:
        req = MediaRequest(plex_user_id="alice", title="Dune", media_type="movie", status="available")
        settings = Settings(email_enabled=True, email_on_request=True, email_on_available=True)
        db.add_all([req, settings, PlexUser(plex_user_id="bob", enabled=True, notification_email="bob@example.com")])
        await db.commit()
        req_id = req.id
        item = {"title": "Dune", "media_type": "movie", "plex_user_id": "bob"}

        async def persist_then_fail(db, event, *args, **kwargs):
            if event == "available":
                raise RuntimeError("database interruption")
            return await persist_pending_notification(db, event, *args, **kwargs)

        with (
            patch("app.services.watchlist_poller._ensure_tmdb_id", new=AsyncMock(return_value=item)),
            patch("app.services.watchlist_poller._find_global_request", new=AsyncMock(return_value=req)),
            patch("app.notification_queue.persist_pending_notification", side_effect=persist_then_fail),
            patch("app.notification_queue.notification_hold_enabled", new=AsyncMock(return_value=False)),
        ):
            with pytest.raises(RuntimeError, match="database interruption"):
                await _process_watchlist_item(item, settings, db, {}, set(), False)
    async with sessions() as db:
        assert not (await db.get(MediaRequest, req_id)).extra_requesters
        assert (await db.execute(select(PendingNotification))).scalars().all() == []
        assert (await db.execute(select(NotificationDelivery))).scalars().all() == []


@pytest.mark.asyncio
async def test_smtp_has_same_message_id_on_same_identity():
    from app.services.email_providers import send_via_provider

    provider = EmailProvider(
        provider_type="smtp", smtp_host="smtp.example.com", smtp_user="user", smtp_password="secret"
    )
    identity = identity_for(1, "request", "bob@example.com", {})
    token = delivery_identity.set(identity)
    try:
        with patch("app.services.email_providers.aiosmtplib.send", new=AsyncMock()) as send:
            for _ in range(2):
                await send_via_provider(provider, "sender@example.com", "bob@example.com", "subject", "html")
            assert [call.args[0]["Message-ID"] for call in send.call_args_list] == [
                f"<{identity['send_key']}@watchdeck.local>"
            ] * 2
    finally:
        delivery_identity.reset(token)


@pytest.mark.asyncio
async def test_brevo_receives_stable_key():
    from app.services.email_providers import send_via_provider

    identity = identity_for(1, "request", "bob@example.com", {})
    token = delivery_identity.set(identity)
    try:
        provider = EmailProvider(provider_type="brevo", brevo_api_key="test")
        with patch(
            "app.services.email_providers.brevo_email.send_transactional_email", new=AsyncMock(return_value="message-1")
        ) as send:
            await send_via_provider(provider, "sender@example.com", "bob@example.com", "subject", "html")
            assert send.call_args.kwargs["send_key"] == identity["send_key"]
            assert identity["provider_message_id"] == "message-1"
    finally:
        delivery_identity.reset(token)
