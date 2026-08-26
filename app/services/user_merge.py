"""Cas d'usage de fusion des profils utilisateurs."""

import json

import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..errors import ValidationError
from ..models import (
    MediaIssue,
    MediaRequest,
    NotificationMilestone,
    PasskeyCredential,
    PlexUser,
    RequesterNotificationReceipt,
)

MERGE_FILL_FIELDS = (
    "notification_email",
    "plex_email",
    "plex_account_uuid",
    "discord_webhook_url",
    "telegram_chat_id",
    "custom_name",
    "display_name",
    "avatar_url",
    "locale",
    "seer_user_id",
    "sonarr_instance_id",
    "radarr_instance_id",
    "last_login_at",
)


async def merge_user_records(db: AsyncSession, source: PlexUser, keeper: PlexUser) -> dict:
    """Déplace les données de ``source`` vers ``keeper`` sans gérer la transaction."""
    if source.id == keeper.id:
        raise ValidationError("Impossible de fusionner un utilisateur avec lui-même.")

    old = source.plex_user_id
    new = keeper.plex_user_id
    new_name = keeper.custom_name or keeper.display_name or new

    result = await db.execute(
        sqlalchemy.update(MediaRequest)
        .where(MediaRequest.plex_user_id == old)
        .values({"plex_user_id": new, "plex_user": new_name})
    )
    requests_moved = result.rowcount
    await db.execute(
        sqlalchemy.update(MediaRequest).where(MediaRequest.approved_by == old).values({"approved_by": new})
    )

    extras_updated = 0
    requests = (
        (await db.execute(select(MediaRequest).filter(MediaRequest.extra_requesters.like(f"%{old}%")))).scalars().all()
    )
    for request in requests:
        try:
            extras = json.loads(request.extra_requesters or "[]")
        except (TypeError, ValueError):
            extras = []
        if not extras:
            continue
        seen: set[str] = set()
        rebuilt: list[dict] = []
        changed = False
        for requester in extras:
            user_id = requester.get("plex_user_id")
            if user_id == old:
                user_id = new
                requester = {"plex_user_id": new, "display_name": new_name}
                changed = True
            if user_id == request.plex_user_id or user_id in seen:
                changed = True
                continue
            seen.add(user_id)
            rebuilt.append(requester)
        if changed:
            request.extra_requesters = json.dumps(rebuilt, ensure_ascii=False)
            extras_updated += 1

    keeper_keys = {
        (
            milestone.req_id,
            milestone.direction,
            milestone.milestone_type,
            milestone.season_number,
            milestone.episode_number,
        )
        for milestone in (
            await db.execute(select(NotificationMilestone).filter(NotificationMilestone.plex_user_id == new))
        )
        .scalars()
        .all()
    }
    milestones_moved = 0
    source_milestones = (
        (await db.execute(select(NotificationMilestone).filter(NotificationMilestone.plex_user_id == old)))
        .scalars()
        .all()
    )
    for milestone in source_milestones:
        key = (
            milestone.req_id,
            milestone.direction,
            milestone.milestone_type,
            milestone.season_number,
            milestone.episode_number,
        )
        if key in keeper_keys:
            await db.delete(milestone)
        else:
            milestone.plex_user_id = new
            keeper_keys.add(key)
            milestones_moved += 1

    keeper_receipt_keys = {
        (receipt.req_id, receipt.event_key)
        for receipt in (
            await db.execute(
                select(RequesterNotificationReceipt).filter(RequesterNotificationReceipt.plex_user_id == new)
            )
        )
        .scalars()
        .all()
    }
    receipts_moved = 0
    source_receipts = (
        (
            await db.execute(
                select(RequesterNotificationReceipt).filter(RequesterNotificationReceipt.plex_user_id == old)
            )
        )
        .scalars()
        .all()
    )
    for receipt in source_receipts:
        key = (receipt.req_id, receipt.event_key)
        if key in keeper_receipt_keys:
            await db.delete(receipt)
        else:
            receipt.plex_user_id = new
            keeper_receipt_keys.add(key)
            receipts_moved += 1

    await db.execute(
        sqlalchemy.update(MediaIssue)
        .where(MediaIssue.reporter_plex_user_id == old)
        .values({"reporter_plex_user_id": new})
    )
    await db.execute(
        sqlalchemy.update(PasskeyCredential)
        .where(PasskeyCredential.user_id == source.id)
        .values({"user_id": keeper.id})
    )

    for field in MERGE_FILL_FIELDS:
        if not getattr(keeper, field, None) and getattr(source, field, None):
            setattr(keeper, field, getattr(source, field))
    keeper.seer_active = keeper.seer_active or source.seer_active
    keeper.can_login = keeper.can_login or source.can_login
    keeper.auto_approve = keeper.auto_approve or source.auto_approve
    if source.role == "admin":
        keeper.role = "admin"
    if not keeper.source and source.source:
        keeper.source = source.source

    await db.delete(source)
    return {
        "status": "merged",
        "keeper_id": keeper.id,
        "keeper_plex_user_id": new,
        "requests_moved": requests_moved,
        "extra_requesters_updated": extras_updated,
        "milestones_moved": milestones_moved,
        "notification_receipts_moved": receipts_moved,
        "seer_user_id": keeper.seer_user_id,
    }


async def merge_users(db: AsyncSession, source: PlexUser, keeper: PlexUser) -> dict:
    """Exécute la fusion comme une unité transactionnelle."""
    try:
        result = await merge_user_records(db, source, keeper)
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise
