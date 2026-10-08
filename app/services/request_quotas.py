"""Quotas de demandes par utilisateur, a la maniere d'Overseerr.

Une limite de films et une limite de series sur une periode glissante (7 jours par
defaut). Le reglage global vaut pour tout le monde ; chaque compte peut le surcharger :
`None` suit le reglage global, `0` leve la limite pour ce compte. Les administrateurs et
moderateurs ne sont jamais limites.

Le decompte reprend les demandes creees par le compte sur la periode, hors demandes
refusees et hors demandes creees par Watchdeck lui-meme (synchro *arr, import manuel...).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models import MediaRequest, PlexUser, RequestStatus, Settings
from ..utils import APP_TIMEZONE, now_utc_naive
from .notification_policy import TECHNICAL_ORIGINS

DEFAULT_PERIOD_DAYS = 7
QUOTA_MEDIA_TYPES = ("movie", "show")


@dataclass(frozen=True)
class QuotaState:
    media_type: str
    limit: Optional[int]  # None = illimite
    used: int
    period_days: int
    next_slot_at: Optional[datetime]

    @property
    def exceeded(self) -> bool:
        return self.limit is not None and self.used >= self.limit

    @property
    def remaining(self) -> Optional[int]:
        return None if self.limit is None else max(self.limit - self.used, 0)

    def as_dict(self) -> dict:
        return {
            "media_type": self.media_type,
            "limit": self.limit,
            "used": self.used,
            "remaining": self.remaining,
            "period_days": self.period_days,
            "exceeded": self.exceeded,
            "next_slot_at": self.next_slot_at.isoformat() if self.next_slot_at else None,
        }


def period_days(settings: Optional[Settings]) -> int:
    days = getattr(settings, "quota_period_days", None) if settings else None
    return days if days and days > 0 else DEFAULT_PERIOD_DAYS


def effective_limit(settings: Optional[Settings], user: Optional[PlexUser], media_type: str) -> Optional[int]:
    """Limite applicable a un compte pour un type de media ; None = illimite."""
    field = "quota_movie_limit" if media_type == "movie" else "quota_show_limit"
    override = getattr(user, field, None) if user else None
    value = override if override is not None else (getattr(settings, field, None) if settings else None)
    return value if value and value > 0 else None


def is_exempt(user: Optional[PlexUser], caller: Optional[dict] = None) -> bool:
    """Admins, moderateurs et appels techniques (jeton API, proprietaire) ne sont pas limites."""
    if caller is not None and (caller.get("is_owner") or caller.get("role") in ("admin", "moderator")):
        return True
    return bool(user and (user.role or "user") in ("admin", "moderator"))


async def quota_state(
    db: AsyncSession,
    settings: Optional[Settings],
    user: Optional[PlexUser],
    plex_user_id: str,
    media_type: str,
    now: Optional[datetime] = None,
) -> QuotaState:
    period = period_days(settings)
    limit = effective_limit(settings, user, media_type)
    if limit is None:
        return QuotaState(media_type, None, 0, period, None)
    now = now or now_utc_naive()
    cutoff = now - timedelta(days=period)
    conditions = (
        MediaRequest.plex_user_id == plex_user_id,
        MediaRequest.media_type == media_type,
        MediaRequest.requested_at >= cutoff,
        MediaRequest.status != RequestStatus.rejected,
        func.coalesce(MediaRequest.source, "").notin_(TECHNICAL_ORIGINS),
    )
    used = (await db.execute(select(func.count()).select_from(MediaRequest).filter(*conditions))).scalar() or 0
    next_slot_at = None
    if used >= limit:
        # La plus ancienne demande comptee sort de la fenetre en premier : c'est elle qui
        # libere la prochaine place (les suivantes suivent dans l'ordre).
        dates = (
            (
                await db.execute(
                    select(MediaRequest.requested_at)
                    .filter(*conditions)
                    .order_by(MediaRequest.requested_at.asc())
                    .limit(used - limit + 1)
                )
            )
            .scalars()
            .all()
        )
        if dates:
            next_slot_at = dates[-1] + timedelta(days=period)
    return QuotaState(media_type, limit, int(used), period, next_slot_at)


async def user_quotas(
    db: AsyncSession,
    settings: Optional[Settings],
    user: Optional[PlexUser],
    plex_user_id: Optional[str],
    caller: Optional[dict] = None,
) -> dict:
    """Etat des deux quotas d'un compte, pour l'affichage (Decouvrir, fiche utilisateur)."""
    period = period_days(settings)
    exempt = user is None or not plex_user_id or is_exempt(user, caller)
    out: dict = {"exempt": exempt, "period_days": period}
    for media_type in QUOTA_MEDIA_TYPES:
        if exempt:
            out[media_type] = QuotaState(media_type, None, 0, period, None).as_dict()
        else:
            out[media_type] = (await quota_state(db, settings, user, plex_user_id, media_type)).as_dict()
    return out


def exceeded_message(state: QuotaState) -> str:
    kind = "films" if state.media_type == "movie" else "séries"
    message = f"Quota atteint : {state.limit} {kind} par période de {state.period_days} jours."
    if state.next_slot_at:
        local = state.next_slot_at.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(APP_TIMEZONE))
        message += f" Prochaine demande possible le {local.strftime('%d/%m/%Y à %H:%M')}."
    return message


def account_name(user: PlexUser) -> str:
    return user.custom_name or user.display_name or user.plex_user_id


def needs_approval(settings: Optional[Settings], user: Optional[PlexUser]) -> bool:
    """Règle d'approbation d'un compte, sans les cas particuliers (média supprimé, rôle).

    « Toujours soumis à approbation » l'emporte sur tout ; sinon l'auto-approbation lève
    l'approbation générale.
    """
    if user is not None and getattr(user, "always_require_approval", False):
        return True
    if not (settings and getattr(settings, "require_approval", False)):
        return False
    return not (user is not None and user.auto_approve)


def quota_exception(user: PlexUser) -> dict | None:
    """Ce qui distingue un compte des règles générales, ou None s'il les suit."""
    custom = user.quota_movie_limit is not None or user.quota_show_limit is not None
    always = bool(getattr(user, "always_require_approval", False))
    if not custom and not user.auto_approve and not always:
        return None
    return {
        "user_id": user.id,
        "name": account_name(user),
        "role": user.role or "user",
        "quota_movie_limit": user.quota_movie_limit,
        "quota_show_limit": user.quota_show_limit,
        "auto_approve": bool(user.auto_approve) and not always,
        "always_require_approval": always,
    }


async def quotas_overview(db: AsyncSession, settings: Optional[Settings], limit: int = 5) -> dict:
    """Écran Demandes & quotas : qui approche de son quota, et quels comptes ont une exception.

    Un seul décompte groupé par compte et par type, avec les mêmes conditions que
    `quota_state` : l'écran montre exactement ce que le contrôle appliquera.
    """
    period = period_days(settings)
    cutoff = now_utc_naive() - timedelta(days=period)
    rows = (
        await db.execute(
            select(MediaRequest.plex_user_id, MediaRequest.media_type, func.count())
            .filter(
                MediaRequest.requested_at >= cutoff,
                MediaRequest.status != RequestStatus.rejected,
                func.coalesce(MediaRequest.source, "").notin_(TECHNICAL_ORIGINS),
                MediaRequest.media_type.in_(QUOTA_MEDIA_TYPES),
            )
            .group_by(MediaRequest.plex_user_id, MediaRequest.media_type)
        )
    ).all()
    used: dict[str, dict[str, int]] = {}
    for plex_user_id, media_type, count in rows:
        used.setdefault(plex_user_id, {})[media_type] = int(count)

    users = (await db.execute(select(PlexUser).filter(PlexUser.enabled))).scalars().all()
    usage = []
    exceptions = []
    for user in users:
        exception = quota_exception(user)
        if exception:
            exceptions.append(exception)
        if is_exempt(user):
            continue
        entry: dict = {"user_id": user.id, "name": account_name(user)}
        ratio = 0.0
        for media_type in QUOTA_MEDIA_TYPES:
            cap = effective_limit(settings, user, media_type)
            count = used.get(user.plex_user_id, {}).get(media_type, 0)
            entry[media_type] = {"used": count, "limit": cap}
            if cap:
                ratio = max(ratio, count / cap)
        if ratio > 0:
            entry["ratio"] = round(ratio, 3)
            usage.append(entry)
    usage.sort(key=lambda item: item["ratio"], reverse=True)
    exceptions.sort(key=lambda item: item["name"].casefold())
    return {
        "period_days": period,
        "limits": {media_type: effective_limit(settings, None, media_type) for media_type in QUOTA_MEDIA_TYPES},
        "usage": usage[:limit],
        "exceptions": exceptions,
    }
