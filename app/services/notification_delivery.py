"""Stable email identity and an atomic, durable claim before network I/O."""

import json
from contextvars import ContextVar
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..models import NotificationDelivery
from ..utils import now_utc_naive

delivery_identity: ContextVar[dict | None] = ContextVar("notification_delivery", default=None)


class DeliveryUncertain(RuntimeError):
    """Acceptance may have happened: never automatically retry or fall back."""


class DeliveryRejected(RuntimeError):
    """Provider explicitly rejected the message before acceptance."""


def identity_for(req_id, event, recipient, context):
    # Exclude transient rendering data, ordering, and mutable recipient display names.
    payload = [str(req_id), event, recipient.strip().casefold()]
    payload += [
        context.get(k)
        for k in (
            "scope",
            "language",
            "season_number",
            "episode_number",
            "is_upgrade",
            "reason",
            "resend_id",
        )
    ]
    payload[7] = bool(payload[7])
    key = str(uuid5(NAMESPACE_URL, "watchdeck:notification:" + json.dumps(payload, sort_keys=True)))
    return dict(send_key=key, req_id=req_id, event=event, recipient=recipient.strip().casefold())


async def prepare(db, identity):
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    now = now_utc_naive()
    await db.execute(
        insert(NotificationDelivery)
        .values(
            **identity,
            state="prepared",
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_nothing(index_elements=["send_key"])
    )


async def claim(db, identity):
    await prepare(db, identity)
    result = await db.execute(
        update(NotificationDelivery)
        .where(
            NotificationDelivery.send_key == identity["send_key"],
            NotificationDelivery.state.in_(("prepared", "failed")),
        )
        .values(state="sending", updated_at=now_utc_naive())
        .returning(NotificationDelivery.send_key)
    )
    claimed = result.scalar_one_or_none() is not None
    await db.commit()
    if claimed:
        return True
    state = (
        await db.execute(
            select(NotificationDelivery.state).where(
                NotificationDelivery.send_key == identity["send_key"],
            )
        )
    ).scalar_one()
    if state == "sent":
        return False
    raise DeliveryUncertain("Envoi déjà réservé, annulé ou sans confirmation : vérification nécessaire")


async def finish(db, key, state, **values):
    await db.execute(
        update(NotificationDelivery)
        .where(NotificationDelivery.send_key == key)
        .values(
            state=state,
            updated_at=now_utc_naive(),
            **values,
        )
    )
    await db.commit()


async def recipient_status(db, req, settings, event, recipient, context):
    """Read-only eligibility, shared by preview and worker."""
    from .notification_orchestrator import _get_recipients, _resolve_requester_users, requester_has_receipt

    identity = identity_for(req.id, event, recipient, context)
    row = (
        await db.execute(
            select(NotificationDelivery).where(
                NotificationDelivery.send_key == identity["send_key"],
            )
        )
    ).scalar_one_or_none()
    if row and row.state in ("sent", "cancelled", "obsolete", "uncertain", "sending"):
        return "uncertain" if row.state == "sending" else row.state
    if req.notify_suppressed or not settings.email_enabled:
        return "obsolete"
    if event == "available":
        status = req.status.value if hasattr(req.status, "value") else str(req.status)
        if status not in ("available", "partially_available"):
            return "obsolete"
        if context.get("scope") in ("movie", "series_complete") and status != "available":
            return "obsolete"
    if event in ("request", "available") and not getattr(settings, "email_on_" + event):
        return "obsolete"
    if event == "available" and context.get("is_upgrade") and not settings.email_on_vf_available:
        return "obsolete"
    users = await _resolve_requester_users(req, db)
    ids = (context.get("requester_ids_by_recipient") or {}).get(recipient)
    if ids is not None:
        users = [u for u in users if u.plex_user_id in ids]
    if event == "available" and context.get("language") == "vf":
        from .notification_orchestrator import _user_wants_vf

        users = [u for u in users if _user_wants_vf(u, "movie" if req.media_type == "movie" else "series")]
    allowed = {r.casefold() for r in _get_recipients(users, settings, event)} if users else set()
    if context.get("admin_only"):
        from ..utils import parse_email_list

        allowed = {r.casefold() for r in parse_email_list(settings.admin_notification_email or "")}
    if recipient.casefold() not in allowed:
        return "obsolete"
    if ids and context.get("triggered_by") != "manual":
        if all([await requester_has_receipt(db, req.id, uid, event, context) for uid in ids]):
            return "sent"
    return "ready"
