"""Le compte de l'appelant : ce que la page Profil affiche et ce qu'il peut regler lui-meme.

`/api/users/{id}` est reserve aux administrateurs (gestion des comptes). Un simple
utilisateur passe par ici, et seulement pour son propre compte : l'identifiant vient
de la session, jamais de l'URL.
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db_async
from ..dependencies import current_user, require_auth
from ..models import PasskeyCredential, PlexUser, Settings
from ..serializers import format_datetime
from ..services import request_quotas
from ..services.gdpr import export_user_data
from ..services.session_security import revoke_user_sessions
from ..utils import now_utc_naive, parse_email_list
from .users_api import _build_user_activity, _request_stats

router = APIRouter(prefix="/api/me", tags=["me"], dependencies=[Depends(require_auth)])

# Les seuls champs qu'un utilisateur peut changer sur son propre compte : ce qu'il
# recoit. Le role, l'acces, l'auto-approbation et les instances restent a l'admin.
SELF_PREFERENCES = (
    "notification_email",
    "notify_on_request",
    "notify_on_available",
    "notify_digest",
    "notify_newsletter",
    "notify_vf_movie",
    "notify_vf_series",
)


class PreferencesUpdate(BaseModel):
    notification_email: Optional[str] = None
    notify_on_request: Optional[bool] = None
    notify_on_available: Optional[bool] = None
    notify_digest: Optional[bool] = None
    notify_newsletter: Optional[bool] = None
    notify_vf_movie: Optional[bool] = None
    notify_vf_series: Optional[bool] = None


async def _own_account(curr: dict | None, db: AsyncSession) -> PlexUser:
    user_id = (curr or {}).get("id")
    if not user_id:
        # Compte de l'assistant initial (non rattache a un PlexUser) ou jeton d'API.
        raise HTTPException(status_code=404, detail="Aucun compte utilisateur rattaché à cette session.")
    user = await db.get(PlexUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Compte introuvable.")
    return user


@router.get("")
async def get_me(db: AsyncSession = Depends(get_db_async), curr: dict = Depends(current_user)):
    user = await _own_account(curr, db)
    stats = await _request_stats(user, db)
    last_requested_at = stats.pop("last_requested_at", None)
    activity = await _build_user_activity(user, db, limit=8)
    passkey_count = (
        await db.execute(select(func.count(PasskeyCredential.id)).filter(PasskeyCredential.user_id == user.id))
    ).scalar() or 0
    return {
        "id": user.id,
        "plex_user_id": user.plex_user_id,
        "display_name": user.custom_name or user.display_name or user.plex_user_id,
        "role": user.role or "user",
        "source": user.source,
        "avatar_url": user.avatar_url,
        "plex_email": user.plex_email,
        "created_at": format_datetime(user.created_at),
        "last_login_at": format_datetime(user.last_login_at),
        "has_local_password": bool(user.password_hash),
        "totp_enabled": bool(user.totp_enabled),
        "passkey_count": passkey_count,
        "preferences": {field: getattr(user, field) for field in SELF_PREFERENCES},
        "stats": {**stats, "last_requested_at": format_datetime(last_requested_at)},
        # Sous-ensemble volontaire de la ligne d'activite admin : pas d'identifiants
        # techniques (*arr, torrent) dans la page d'un simple utilisateur.
        "recent_requests": [
            {
                key: row.get(key)
                for key in ("id", "title", "year", "media_type", "status", "requested_at", "available_at", "poster_url")
            }
            for row in activity["recent"]
        ],
    }


@router.get("/quota")
async def get_my_quota(db: AsyncSession = Depends(get_db_async), curr: dict = Depends(current_user)):
    """Quotas de demandes de l'appelant (compteurs de la page Decouvrir)."""
    settings = (await db.execute(select(Settings))).scalars().first()
    user_id = (curr or {}).get("id")
    user = await db.get(PlexUser, user_id) if user_id else None
    # Sans compte rattache (assistant initial, jeton d'API), rien n'est limite.
    return await request_quotas.user_quotas(db, settings, user, user.plex_user_id if user else None, curr)


@router.put("/preferences")
async def update_preferences(
    payload: PreferencesUpdate, db: AsyncSession = Depends(get_db_async), curr: dict = Depends(current_user)
):
    user = await _own_account(curr, db)
    changes = payload.model_dump(exclude_unset=True)
    if "notification_email" in changes:
        raw = (changes["notification_email"] or "").strip()
        emails = parse_email_list(raw)
        if any("@" not in email or " " in email for email in emails):
            raise HTTPException(status_code=400, detail="Adresse email invalide.")
        changes["notification_email"] = ", ".join(emails) or None
    for field, value in changes.items():
        if field in SELF_PREFERENCES:
            setattr(user, field, value)
    await db.commit()
    return {field: getattr(user, field) for field in SELF_PREFERENCES}


@router.post("/sessions/revoke-others")
async def revoke_other_sessions(
    request: Request, db: AsyncSession = Depends(get_db_async), curr: dict = Depends(current_user)
):
    """Ferme toutes les sessions du compte sauf celle qui fait la demande."""
    user = await _own_account(curr, db)
    revoke_user_sessions(user, request)
    await db.commit()
    return {"success": True}


@router.get("/data-export")
async def export_my_data(db: AsyncSession = Depends(get_db_async), curr: dict = Depends(current_user)):
    """Export RGPD de ses propres donnees (droit d'acces, Art. 15 et 20)."""
    user = await _own_account(curr, db)
    payload = await export_user_data(db, user)
    content = json.dumps(payload, indent=2, default=str, ensure_ascii=False)
    filename = f"watchdeck-mes-donnees-{now_utc_naive().strftime('%Y%m%d')}.json"
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
