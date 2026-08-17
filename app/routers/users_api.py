import json
from datetime import timedelta
from typing import Optional

import sqlalchemy
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db_async
from ..dependencies import current_user, require_admin
from ..errors import ConflictError
from ..models import (
    MediaRequest,
    NotificationLog,
    PlexUser,
    Settings,
)
from ..serializers import format_datetime, request_status_value, serialize_plex_user
from ..services.email_service import _send as smtp_send
from ..services.gdpr import erase_user_data, export_user_data
from ..services.seer import get_user_requests as seer_get_user_requests
from ..services.seer import get_users as seer_get_users
from ..services.user_merge import merge_user_records as _merge_users
from ..services.user_merge import merge_users
from ..utils import async_get_or_404, now_utc_naive, wrap_image_proxy

# Réutilise la validation du mode de notification définie dans settings_api
from .settings_api import _validate_notify_settings

router = APIRouter(prefix="/api", tags=["users"], dependencies=[Depends(require_admin)])


class UserCreate(BaseModel):
    plex_user_id: str
    display_name: Optional[str] = None
    custom_name: Optional[str] = None
    plex_email: Optional[str] = None
    notification_email: Optional[str] = None
    enabled: bool = True
    notify_admin: bool = True
    notify_on_request: Optional[bool] = True
    notify_on_available: Optional[bool] = True
    notify_digest: Optional[bool] = False
    notify_vf_movie: Optional[bool] = True
    notify_vf_series: Optional[bool] = True
    discord_webhook_url: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    seer_active: Optional[bool] = None
    source: Optional[str] = None
    role: str = "user"
    can_login: bool = True
    auto_approve: bool = False
    sonarr_instance_id: Optional[int] = None
    radarr_instance_id: Optional[int] = None
    movie_notify_language: Optional[bool] = None
    series_notify_language: Optional[bool] = None
    series_notify_granularity: Optional[str] = None


class UserEnabledUpdate(BaseModel):
    enabled: bool


class BulkNotificationUpdate(BaseModel):
    user_ids: list[int]
    notify_admin: Optional[bool] = None
    notify_on_request: Optional[bool] = None
    notify_on_available: Optional[bool] = None
    notify_digest: Optional[bool] = None
    notify_vf_movie: Optional[bool] = None
    notify_vf_series: Optional[bool] = None
    movie_notify_language: Optional[bool] = None
    series_notify_language: Optional[bool] = None
    series_notify_granularity: Optional[str] = None


class BulkStatusUpdate(BaseModel):
    user_ids: list[int]
    enabled: bool


class BulkPermissionsUpdate(BaseModel):
    user_ids: list[int]
    can_login: Optional[bool] = None
    auto_approve: Optional[bool] = None
    role: Optional[str] = None


class BulkDeleteUpdate(BaseModel):
    user_ids: list[int]


def _user_source_label(user: PlexUser) -> str:
    if user.source == "local":
        return "Compte local"
    if user.source == "seer":
        return "Seer only"
    if user.source == "api" and user.seer_user_id:
        return "Plex API + Seer"
    if user.source == "api":
        return "Plex API"
    if user.seer_user_id:
        return "RSS + Seer"
    return "RSS"


def _validate_portal_profile(payload: dict) -> None:
    if payload.get("role") not in ("admin", "moderator", "user"):
        raise HTTPException(400, "Role utilisateur invalide.")


def _caller_user_id(request: Request, db: AsyncSession) -> Optional[int]:
    caller = current_user(request, db)
    return caller.get("id") if caller else None


def _guard_self_role_change(request: Request, db: AsyncSession, user_id: int, new_role: str) -> None:
    """Empêche un admin de se retirer lui-même son propre rôle admin par erreur — rien
    d'autre ne l'en empêchait jusque-là, avec un risque de verrouillage silencieux. Les
    autres modifications de son propre compte restent permises."""
    if new_role != "admin" and _caller_user_id(request, db) == user_id:
        raise HTTPException(400, "Vous ne pouvez pas retirer votre propre rôle administrateur.")


def _guard_self_delete(request: Request, db: AsyncSession, user_ids: list[int]) -> None:
    if _caller_user_id(request, db) in user_ids:
        raise HTTPException(400, "Vous ne pouvez pas supprimer votre propre compte.")


async def _build_user_diagnostic(user: PlexUser, stats: dict, db: AsyncSession) -> dict:
    settings = (await db.execute(select(Settings))).scalars().first()
    seer_configured = bool(settings and settings.seer_url and settings.seer_api_key)
    seer_requests_enabled = bool(
        settings and settings.seer_send_requests and settings.seer_url and settings.seer_api_key
    )
    rss_configured = bool(settings and settings.plex_rss_url)
    plex_api_configured = bool(settings and settings.plex_token)

    co_request_count = 0
    for (extra_requesters,) in (await db.execute(select(MediaRequest.extra_requesters).filter(MediaRequest.extra_requesters.isnot(None), MediaRequest.extra_requesters != "[]"))).all():
        try:
            extras = json.loads(extra_requesters or "[]")
        except Exception:
            extras = []
        if any(e.get("plex_user_id") == user.plex_user_id for e in extras):
            co_request_count += 1

    effects = [
        {
            "key": "discover",
            "label": "Visible dans Discover",
            "ok": bool(user.enabled),
            "detail": "Propose dans le selecteur de demandeur"
            if user.enabled
            else "Masque tant que l'utilisateur est desactive",
        },
        {
            "key": "automation",
            "label": "Watchlist traitee",
            "ok": bool(user.enabled),
            "detail": "Les nouvelles demandes peuvent etre traitees"
            if user.enabled
            else "Les automatisations ignorent cet utilisateur",
        },
        {
            "key": "seer_link",
            "label": "Liaison Seer",
            "ok": bool(user.seer_user_id),
            "detail": f"Compte Seer #{user.seer_user_id}" if user.seer_user_id else "Aucune liaison Seer",
        },
        {
            "key": "notifications",
            "label": "Notifications",
            "ok": bool(user.notification_email or user.plex_email or user.notify_admin),
            "detail": "Email ou notification admin disponible"
            if (user.notification_email or user.plex_email or user.notify_admin)
            else "Aucun destinataire connu",
        },
    ]

    warnings = []
    actions = []
    if not user.enabled:
        warnings.append("Utilisateur desactive : absent de Discover et ignore par les automatisations.")
        actions.append({"key": "enable", "label": "Activer", "style": "success"})
    else:
        actions.append({"key": "disable", "label": "Desactiver", "style": "outline-secondary"})
    if seer_configured and not user.seer_user_id and user.source != "seer":
        warnings.append("Seer est configure mais cet utilisateur n'est pas lie.")
        actions.append({"key": "automatch_seer", "label": "Lier Seer automatiquement", "style": "outline-info"})
    if user.seer_user_id and (not user.notification_email or not user.custom_name):
        actions.append({"key": "complete_seer", "label": "Completer depuis Seer", "style": "outline-warning"})
    if user.source == "seer":
        warnings.append("Utilisateur Seer-only : pas encore associe a un utilisateur Plex/RSS/API.")
    if not rss_configured and not plex_api_configured:
        warnings.append("Aucune source Plex watchlist configuree : seules les donnees Seer/manual peuvent apparaitre.")

    return {
        "source_label": _user_source_label(user),
        "discover_visible": bool(user.enabled),
        "automation_enabled": bool(user.enabled),
        "seer_configured": seer_configured,
        "seer_requests_enabled": seer_requests_enabled,
        "rss_configured": rss_configured,
        "plex_api_configured": plex_api_configured,
        "primary_request_count": stats.get("total", 0),
        "co_request_count": co_request_count,
        "effects": effects,
        "warnings": warnings,
        "actions": actions,
    }


def _activity_row(req: MediaRequest, role: str) -> dict:
    return {
        "id": req.id,
        "title": req.title,
        "year": req.year,
        "media_type": req.media_type,
        "status": request_status_value(req.status),
        "source": req.source,
        "role": role,
        "requested_at": format_datetime(req.requested_at),
        "available_at": format_datetime(req.available_at),
        "poster_url": wrap_image_proxy(req.poster_url),
        "details": {
            "request_id": req.id,
            "plex_user_id": req.plex_user_id,
            "plex_user": req.plex_user,
            "tmdb_id": req.tmdb_id,
            "tvdb_id": req.tvdb_id,
            "imdb_id": req.imdb_id,
            "plex_guid": req.plex_guid,
            "arr_id": req.arr_id,
            "arr_slug": req.arr_slug,
            "arr_instance_id": req.arr_instance_id,
            "download_client_id": req.download_client_id,
            "torrent_hash": req.torrent_hash,
            "extra_requesters": req.extra_requesters,
            "next_release_at": format_datetime(req.next_release_at),
            "next_release_label": req.next_release_label,
            "overview": req.overview,
        },
    }


async def _build_user_activity(user: PlexUser, db: AsyncSession, limit: int = 12) -> dict:
    rows: dict[int, dict] = {}
    primary = (await db.execute(select(MediaRequest).filter(MediaRequest.plex_user_id == user.plex_user_id).order_by(MediaRequest.requested_at.desc()).limit(limit * 2))).scalars().all()
    for req in primary:
        rows[req.id] = _activity_row(req, "primary")

    co_candidates = (
        (await db.execute(select(MediaRequest).filter(MediaRequest.extra_requesters.isnot(None), MediaRequest.extra_requesters != "[]"))).scalars().all()
    )
    for req in co_candidates:
        try:
            extras = json.loads(req.extra_requesters or "[]")
        except Exception:
            extras = []
        if any(e.get("plex_user_id") == user.plex_user_id for e in extras):
            rows.setdefault(req.id, _activity_row(req, "co_requester"))

    recent = sorted(rows.values(), key=lambda r: r.get("requested_at") or "", reverse=True)[:limit]
    return {"recent": recent, "limit": limit}


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db_async)):
    users = (await db.execute(select(PlexUser))).scalars().all()
    request_rows = (await db.execute(
        select(MediaRequest.plex_user_id, MediaRequest.status, func.count(), func.max(MediaRequest.requested_at))
        .group_by(MediaRequest.plex_user_id, MediaRequest.status)
    )).all()
    stats_by_user: dict[str, dict] = {}
    for plex_user_id, status, count, last_requested_at in request_rows:
        stats = stats_by_user.setdefault(plex_user_id, {"total": 0, "available": 0, "failed": 0, "sent": 0, "pending": 0, "pending_approval": 0, "last_requested_at": None})
        value = request_status_value(status)
        stats["total"] += count
        key = "sent" if value == "sent_to_arr" else value
        if key in stats:
            stats[key] += count
        if last_requested_at and (stats["last_requested_at"] is None or last_requested_at > stats["last_requested_at"]):
            stats["last_requested_at"] = last_requested_at

    failed_recipients = {(recipient or "").strip().lower() for recipient in (await db.execute(
        select(NotificationLog.recipient).filter(
            NotificationLog.success.is_(False),
            NotificationLog.sent_at >= now_utc_naive() - timedelta(days=30),
        )
    )).scalars().all()}
    payload = []
    for user in users:
        stats = stats_by_user.get(user.plex_user_id, {"total": 0, "available": 0, "failed": 0, "sent": 0, "pending": 0, "pending_approval": 0, "last_requested_at": None})
        data = serialize_plex_user(user, stats.copy())
        emails = {value.strip().lower() for raw in (user.notification_email, user.plex_email) for value in (raw or "").split(",") if value.strip()}
        data["has_notification_error"] = any((recipient or "").strip().lower() in emails for recipient in failed_recipients)
        payload.append(data)
    return payload


@router.get("/users/{user_id}")
async def get_user(user_id: int, db: AsyncSession = Depends(get_db_async)):
    """Détail complet d'un utilisateur + ses stats de demandes (pour la modale hub)."""
    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    rows = (await db.execute(select(MediaRequest.status, MediaRequest.requested_at).filter(MediaRequest.plex_user_id == user.plex_user_id))).all()
    stats = {"total": 0, "available": 0, "failed": 0, "sent": 0, "pending": 0, "last_requested_at": None}
    for status, req_at in rows:
        stats["total"] += 1
        s = status.value if hasattr(status, "value") else str(status)
        if s == "sent_to_arr":
            stats["sent"] += 1
        elif s in stats:
            stats[s] += 1
        if req_at and (stats["last_requested_at"] is None or req_at > stats["last_requested_at"]):
            stats["last_requested_at"] = req_at

    # Utilise le sérialiseur centralisé
    diagnostic = await _build_user_diagnostic(user, stats.copy(), db)
    activity = await _build_user_activity(user, db)
    data = serialize_plex_user(user, stats)
    data["diagnostic"] = diagnostic
    data["activity"] = activity
    emails = {value.strip().lower() for raw in (user.notification_email, user.plex_email) for value in (raw or "").split(",") if value.strip()}
    notification_logs = []
    if emails:
        logs = (await db.execute(
            select(NotificationLog)
            .filter(func.lower(NotificationLog.recipient).in_(emails))
            .order_by(NotificationLog.sent_at.desc())
            .limit(30)
        )).scalars().all()
        notification_logs = [{
            "id": log.id, "event": log.event, "channel": log.channel,
            "recipient": log.recipient, "sent_at": format_datetime(log.sent_at),
            "success": log.success, "error_msg": log.error_msg,
            "media_title": log.media_title, "req_id": log.req_id,
        } for log in logs]
    data["notification_history"] = notification_logs
    return data


@router.post("/users")
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db_async)):
    payload = data.model_dump()
    _validate_notify_settings(payload)
    _validate_portal_profile(payload)
    existing = (await db.execute(select(PlexUser).filter(PlexUser.plex_user_id == data.plex_user_id))).scalars().first()
    if existing:
        raise ConflictError("User already exists")
    user = PlexUser(**payload)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/users/{user_id}")
async def update_user(user_id: int, data: UserCreate, request: Request, db: AsyncSession = Depends(get_db_async)):
    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    payload = data.model_dump()
    _validate_notify_settings(payload)
    _validate_portal_profile(payload)
    _guard_self_role_change(request, db, user_id, payload["role"])
    for k, v in payload.items():
        setattr(user, k, v)
    # Propager le nouveau display_name sur les demandes existantes
    resolved = data.display_name or user.plex_user_id
    await db.execute(sqlalchemy.update(MediaRequest).where(MediaRequest.plex_user_id == user.plex_user_id).values({"plex_user": resolved}))
    await db.commit()
    return user


@router.put("/users/{user_id}/enabled")
async def update_user_enabled(user_id: int, data: UserEnabledUpdate, db: AsyncSession = Depends(get_db_async)):
    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    user.enabled = data.enabled
    await db.commit()
    await db.refresh(user)
    return {"status": "ok", "enabled": user.enabled}


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db_async)):
    _guard_self_delete(request, db, [user_id])
    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    # Effacement RGPD (Art. 17) : purge les données personnelles dispersées (demandes,
    # journaux de notification, jalons, signalements, passkeys) avant de retirer le compte.
    erased = await erase_user_data(db, user)
    await db.delete(user)
    await db.commit()
    return {"status": "deleted", "erased": erased}


@router.get("/users/{user_id}/data-export")
async def export_single_user_data(user_id: int, db: AsyncSession = Depends(get_db_async)):
    """Export RGPD (droit d'accès / portabilité, Art. 15 & 20) d'une seule personne.

    Contrairement à /api/export (toute l'instance), ne renvoie que le sous-ensemble
    rattaché à cette personne, sans secret — pour répondre à une demande d'accès."""
    import json

    from fastapi.responses import StreamingResponse

    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    payload = await export_user_data(db, user)
    content = json.dumps(payload, indent=2, default=str, ensure_ascii=False)
    filename = f"watchdeck-donnees-{user.plex_user_id}-{now_utc_naive().strftime('%Y%m%d')}.json"
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/seer/sync/users")
async def seer_sync_users():
    """Synchronise uniquement les liaisons utilisateurs Plex ↔ Seer."""
    from ..scheduler import sync_seer_users

    await sync_seer_users()
    return {"status": "ok"}


@router.post("/seer/sync/requests")
async def seer_sync_requests():
    """Synchronise uniquement les demandes Seer (titres, statuts, historique)."""
    from ..scheduler import sync_seer_requests

    await sync_seer_requests()
    return {"status": "ok"}


@router.post("/seer/sync")
async def seer_sync():
    """Déclenche manuellement la synchronisation Seer complète : utilisateurs + demandes."""
    from ..scheduler import sync_seer_requests, sync_seer_users

    await sync_seer_users()
    await sync_seer_requests()
    return {"status": "ok"}


@router.get("/seer/users")
async def list_seer_users(db: AsyncSession = Depends(get_db_async)):
    """Retourne la liste des utilisateurs Seer avec leur statut de liaison."""
    s = (await db.execute(select(Settings))).scalars().first()
    if not s or not s.seer_url or not s.seer_api_key:
        return {"seer_users": [], "error": "Seer non configuré"}

    seer_users = await seer_get_users(s.seer_url, s.seer_api_key)
    linked_ids = {u.seer_user_id for u in (await db.execute(select(PlexUser).filter(PlexUser.seer_user_id.isnot(None)))).scalars().all()}

    result = []
    for email, info in seer_users.items():
        result.append(
            {
                "id": info["id"],
                "email": email,
                "display_name": info["display_name"],
                "plex_username": info.get("plex_username", ""),
                "plex_id": info.get("plex_id"),
                "user_type": info.get("user_type", 1),
                "request_count": info["request_count"],
                "linked": info["id"] in linked_ids,
            }
        )
    result.sort(key=lambda x: (x["display_name"] or x["email"]).lower())
    return {"seer_users": result}


@router.put("/users/{user_id}/seer-link")
async def link_seer_user(user_id: int, data: dict, db: AsyncSession = Depends(get_db_async)):
    """Lie manuellement un PlexUser à un compte Seer."""
    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    seer_id = data.get("seer_user_id")
    seer_email = data.get("seer_email")
    if seer_id is None:
        raise HTTPException(400, "seer_user_id requis")
    user.seer_user_id = int(seer_id)
    if seer_email and not user.plex_email:
        user.plex_email = seer_email
    # Liaison Seer = désactiver les emails par défaut (Seer gère ses propres notifs)
    user.notify_on_request = False
    user.notify_on_available = False
    await db.commit()
    return {"status": "linked", "seer_user_id": user.seer_user_id}


@router.delete("/users/{user_id}/seer-link")
async def unlink_seer_user(user_id: int, db: AsyncSession = Depends(get_db_async)):
    """Supprime la liaison Seer d'un PlexUser."""
    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    user.seer_user_id = None
    user.seer_active = None
    await db.commit()
    return {"status": "unlinked"}


@router.post("/users/{user_id}/seer-automatch")
async def seer_automatch_user(user_id: int, db: AsyncSession = Depends(get_db_async)):
    """Lance l'automatch Seer (3 passes) pour un seul utilisateur."""
    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    s = (await db.execute(select(Settings))).scalars().first()
    if not s or not s.seer_url or not s.seer_api_key:
        raise HTTPException(400, "Seer non configuré")

    seer_users = await seer_get_users(s.seer_url, s.seer_api_key)
    if not seer_users:
        return {"matched": False, "method": None}

    matched_ids = {
        u.seer_user_id
        for u in (await db.execute(select(PlexUser).filter(PlexUser.id != user_id, PlexUser.seer_user_id.isnot(None)))).scalars().all()
    }
    by_plex_username = {
        (info.get("plex_username") or "").lower().strip(): info
        for info in seer_users.values()
        if info.get("plex_username")
    }

    info = None
    method = None

    email = (user.plex_email or "").lower().strip()
    if email and email in seer_users:
        cand = seer_users[email]
        if cand["id"] not in matched_ids:
            info, method = cand, "email"

    if not info:
        name = (user.display_name or "").lower().strip()
        if name and name in by_plex_username:
            cand = by_plex_username[name]
            if cand["id"] not in matched_ids:
                info, method = cand, "plex_username"

    if not info:
        rows = (
            (await db.execute(select(MediaRequest.tmdb_id).filter(MediaRequest.plex_user_id == user.plex_user_id, MediaRequest.tmdb_id.isnot(None)))).all()
        )
        user_tmdb_ids = {r[0] for r in rows}
        if len(user_tmdb_ids) >= 2:
            best_count = 0
            for seer_info in seer_users.values():
                if seer_info["id"] in matched_ids:
                    continue
                reqs = await seer_get_user_requests(s.seer_url, s.seer_api_key, seer_info["id"])
                common = len(user_tmdb_ids & {r["tmdb_id"] for r in reqs if r.get("tmdb_id")})
                if common >= 2 and common > best_count:
                    best_count, info = common, seer_info
                    method = f"media/{common}"

    if info:
        user.seer_user_id = info["id"]
        user.seer_active = info["request_count"] > 0
        await db.commit()
        return {"matched": True, "method": method, "seer_user_id": info["id"], "display_name": info["display_name"]}

    return {"matched": False, "method": None}




@router.post("/users/{source_id}/merge-into/{keeper_id}")
async def merge_users_endpoint(source_id: int, keeper_id: int, db: AsyncSession = Depends(get_db_async)):
    """Fusionne l'utilisateur `source_id` dans `keeper_id` (le keeper est conservé, la
    source supprimée). Fusion générale : fonctionne pour n'importe quels deux comptes
    (Seer-only, Plex API, RSS…), en préservant les données des deux côtés."""
    source = await async_get_or_404(db, PlexUser, source_id, "Utilisateur source introuvable")
    keeper = await async_get_or_404(db, PlexUser, keeper_id, "Utilisateur à conserver introuvable")
    return await merge_users(db, source, keeper)


@router.put("/users/{user_id}/custom-name")
async def update_custom_name(user_id: int, data: dict, db: AsyncSession = Depends(get_db_async)):
    """Met à jour le nom d'usage personnalisé d'un utilisateur."""
    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    user.custom_name = data.get("custom_name") or None
    await db.commit()
    return {"status": "ok", "custom_name": user.custom_name}


@router.post("/users/{user_id}/seer-complete")
async def seer_complete_user(user_id: int, db: AsyncSession = Depends(get_db_async)):
    """Complète les infos d'un PlexUser depuis son compte Seer lié."""
    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    if not user.seer_user_id:
        raise HTTPException(400, "Utilisateur non lié à Seer")
    s = (await db.execute(select(Settings))).scalars().first()
    if not s or not s.seer_url or not s.seer_api_key:
        raise HTTPException(400, "Seer non configuré")

    seer_users = await seer_get_users(s.seer_url, s.seer_api_key)
    seer_email = None
    seer_info = None
    for email, info in seer_users.items():
        if info["id"] == user.seer_user_id:
            seer_email = email
            seer_info = info
            break

    if not seer_info:
        raise HTTPException(404, "Compte Seer introuvable (id inconnu)")

    changes = {}
    if seer_info.get("display_name") and not user.custom_name:
        user.custom_name = seer_info["display_name"]
        changes["custom_name"] = user.custom_name
    if seer_email:
        if not user.plex_email:
            user.plex_email = seer_email
            changes["plex_email"] = user.plex_email
        if not user.notification_email:
            user.notification_email = seer_email
            changes["notification_email"] = user.notification_email
    await db.commit()
    return {"status": "ok", "changes": changes}


@router.post("/users/discover")
async def discover_users(db: AsyncSession = Depends(get_db_async)):
    """Scanne le flux RSS, auto-crée les nouveaux utilisateurs et retourne un résumé."""
    from ..scheduler import sync_users_from_feed
    from ..services.plex_rss import fetch_watchlist_rss

    s = (await db.execute(select(Settings))).scalars().first()
    if not s or not s.plex_rss_url:
        raise HTTPException(400, "URL RSS non configurée")

    known_before = {u.plex_user_id for u in (await db.execute(select(PlexUser))).scalars().all()}
    items = await fetch_watchlist_rss(s.plex_rss_url)
    await sync_users_from_feed(items, db)

    all_users = (await db.execute(select(PlexUser))).scalars().all()
    new_ids = {u.plex_user_id for u in all_users} - known_before

    return {
        "total": len(all_users),
        "added": len(new_ids),
        "users": [
            {"plex_user_id": u.plex_user_id, "display_name": u.display_name, "enabled": u.enabled} for u in all_users
        ],
    }


@router.post("/users/{user_id}/test-email")
async def send_test_email(user_id: int, db: AsyncSession = Depends(get_db_async)):
    user = await async_get_or_404(db, PlexUser, user_id, "User not found")
    settings = (await db.execute(select(Settings))).scalars().first()
    if not settings:
        raise HTTPException(500, "Settings manquants")
    recipient = user.notification_email or user.plex_email
    if not recipient:
        raise HTTPException(400, "Aucune adresse email configurée pour cet utilisateur")
    name = user.custom_name or user.display_name or user.plex_user_id
    html = f"""<!DOCTYPE html>
<html><body style="background:#141414;font-family:Arial,sans-serif;padding:32px">
<div style="max-width:480px;margin:auto;background:#1f1f1f;border-radius:10px;padding:28px;color:#fff">
  <h2 style="color:#e5a00d;margin:0 0 16px">Test de notification</h2>
  <p style="color:#ccc">Bonjour <strong>{name}</strong>,</p>
  <p style="color:#ccc">Cet email confirme que les notifications fonctionnent correctement pour ton compte Watchdeck.</p>
  <p style="color:#888;font-size:12px;margin-top:24px">Watchdeck — email de test</p>
</div>
</body></html>"""
    try:
        await smtp_send(settings, recipient, "[Watchdeck] Test de notification", html)
    except Exception as e:
        raise HTTPException(500, f"Échec SMTP : {e}")
    return {"status": "sent", "recipient": recipient}


@router.put("/users/bulk/notifications")
async def bulk_update_notifications(payload: BulkNotificationUpdate, db: AsyncSession = Depends(get_db_async)):
    if not payload.user_ids:
        raise HTTPException(400, "Aucun utilisateur sélectionné.")

    users = (await db.execute(select(PlexUser).filter(PlexUser.id.in_(payload.user_ids)))).scalars().all()
    if not users:
        raise HTTPException(404, "Aucun utilisateur trouvé pour ces identifiants.")

    update_fields = {}
    for field in [
        "notify_admin",
        "notify_on_request",
        "notify_on_available",
        "notify_digest",
        "notify_vf_movie",
        "notify_vf_series",
        "movie_notify_language",
        "series_notify_language",
        "series_notify_granularity"
    ]:
        val = getattr(payload, field, None)
        if val is not None:
            update_fields[field] = val

    if not update_fields:
        return {"updated": 0}

    for user in users:
        for field, value in update_fields.items():
            setattr(user, field, value)

    await db.commit()
    return {"updated": len(users)}


@router.put("/users/bulk/status")
async def bulk_update_status(payload: BulkStatusUpdate, db: AsyncSession = Depends(get_db_async)):
    if not payload.user_ids:
        raise HTTPException(400, "Aucun utilisateur sélectionné.")
    users = (await db.execute(select(PlexUser).filter(PlexUser.id.in_(payload.user_ids)))).scalars().all()
    if not users:
        raise HTTPException(404, "Aucun utilisateur trouvé.")
    for user in users:
        user.enabled = payload.enabled
    await db.commit()
    return {"updated": len(users)}


@router.put("/users/bulk/permissions")
async def bulk_update_permissions(payload: BulkPermissionsUpdate, request: Request, db: AsyncSession = Depends(get_db_async)):
    if not payload.user_ids:
        raise HTTPException(400, "Aucun utilisateur sélectionné.")
    users = (await db.execute(select(PlexUser).filter(PlexUser.id.in_(payload.user_ids)))).scalars().all()
    if not users:
        raise HTTPException(404, "Aucun utilisateur trouvé.")

    update_fields = {}
    if payload.can_login is not None:
        update_fields["can_login"] = payload.can_login
    if payload.auto_approve is not None:
        update_fields["auto_approve"] = payload.auto_approve
    if payload.role is not None:
        if payload.role not in ("admin", "moderator", "user"):
            raise HTTPException(400, "Role utilisateur invalide.")
        update_fields["role"] = payload.role
        if payload.role != "admin":
            caller_id = _caller_user_id(request, db)
            if caller_id is not None and caller_id in payload.user_ids:
                raise HTTPException(400, "Vous ne pouvez pas retirer votre propre rôle administrateur.")

    if not update_fields:
        return {"updated": 0}

    for user in users:
        for field, value in update_fields.items():
            setattr(user, field, value)
    await db.commit()
    return {"updated": len(users)}


@router.post("/users/bulk/delete")
async def bulk_delete_users(payload: BulkDeleteUpdate, request: Request, db: AsyncSession = Depends(get_db_async)):
    if not payload.user_ids:
        raise HTTPException(400, "Aucun utilisateur sélectionné.")
    _guard_self_delete(request, db, payload.user_ids)
    # Fetch them to trigger cascades if needed, or just delete
    users = (await db.execute(select(PlexUser).filter(PlexUser.id.in_(payload.user_ids)))).scalars().all()
    if not users:
        raise HTTPException(404, "Aucun utilisateur trouvé.")
    count = len(users)
    for user in users:
        # Effacement RGPD complet (demandes, notifs, jalons, signalements, passkeys),
        # pas seulement les credentials — voir services/gdpr.erase_user_data.
        await erase_user_data(db, user)
        await db.delete(user)
    await db.commit()
    return {"deleted": count}
