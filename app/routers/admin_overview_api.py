"""Chiffres de l'aperçu de l'administration, en un seul appel.

L'aperçu affiche l'état de toute l'instance : demandes à approuver, conflits, signalements,
notifications, comptes, clients, stockage, cache d'images. Les lire par les endpoints de
chaque écran coûterait une dizaine de requêtes dont plusieurs lourdes (`/api/users` calcule
des statistiques par utilisateur, `/api/conflicts` charge toutes les demandes). Ici, ce ne
sont que des comptages.

Chaque bloc est indépendant : une table indisponible laisse son bloc vide (`null`) sans
priver l'aperçu du reste.
"""

import asyncio
import logging
import os
import time
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..cache import cache
from ..database import get_db_async
from ..dependencies import require_admin
from ..job_queue import notification_hold_enabled
from ..models import (
    DownloadClient,
    MediaIssue,
    MediaRequest,
    NotificationLog,
    PendingNotification,
    PlexUser,
    StorageConnection,
    StorageTransfer,
)
from ..services.maintenance_history import last_runs
from ..utils import now_utc_naive

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

#: Fenetre de la courbe de notifications, en jours (aujourd'hui compris).
NOTIFICATION_DAYS = 7
#: Les comptages couteux (conflits, dossier d'images) sont gardes aussi longtemps.
HEAVY_TTL = 60
#: Actions de maintenance dont l'aperçu montre le dernier passage.
TRACKED_ACTIONS = ("warm-images", "retry-failed", "clear-image-cache", "check-arr-statuses")
#: Etats d'un transfert de stockage qui demandent l'attention d'un administrateur.
TRANSFER_RUNNING = ("running", "finalizing")
TRANSFER_BLOCKED = ("blocked",)

_image_scan: tuple[float, dict] | None = None


def scan_image_cache(directory: str) -> dict:
    """Nombre de fichiers et octets du cache d'images ; un dossier absent compte pour zero."""
    files = total = 0
    if os.path.isdir(directory):
        for entry in os.scandir(directory):
            if not entry.is_file():
                continue
            try:
                total += entry.stat().st_size
            except OSError:
                continue
            files += 1
    return {"files": files, "bytes": total}


async def _images() -> dict:
    """Le parcours du dossier n'est pas gratuit sur des dizaines de milliers de fichiers."""
    global _image_scan
    from . import image_proxy_api

    now = time.monotonic()
    if _image_scan is None or now - _image_scan[0] > HEAVY_TTL:
        _image_scan = (now, await asyncio.to_thread(scan_image_cache, image_proxy_api._IMAGE_CACHE_DIR))
    return _image_scan[1]


def daily_totals(rows: list[tuple], today, days: int = NOTIFICATION_DAYS) -> list[int]:
    """Totaux par jour sur `days` jours finissant a `today`, du plus ancien au plus recent.

    `rows` : couples (date, nombre). Un jour sans envoi vaut zero, pour que la courbe garde
    son echelle de temps.
    """
    by_day = {day: int(count) for day, count in rows}
    return [by_day.get(today - timedelta(days=offset), 0) for offset in range(days - 1, -1, -1)]


async def _count(db: AsyncSession, query) -> int:
    return int((await db.execute(query)).scalar() or 0)


async def _requests(db: AsyncSession) -> dict:
    rows = (
        await db.execute(
            select(MediaRequest.status, func.count())
            .where(MediaRequest.status.in_(("pending_approval", "failed")))
            .group_by(MediaRequest.status)
        )
    ).all()
    counts = {status: int(count) for status, count in rows}
    return {"pending_approval": counts.get("pending_approval", 0), "failed": counts.get("failed", 0)}


async def _notifications(db: AsyncSession) -> dict:
    today = now_utc_naive().date()
    since = now_utc_naive() - timedelta(days=NOTIFICATION_DAYS)
    day = func.date(NotificationLog.sent_at)
    rows = (
        await db.execute(
            select(day, NotificationLog.success, func.count())
            .where(NotificationLog.sent_at >= since)
            .group_by(day, NotificationLog.success)
        )
    ).all()
    sent = [(d, n) for d, ok, n in rows if ok]
    failed = sum(int(n) for _d, ok, n in rows if not ok)
    return {
        "queue": await _count(db, select(func.count()).select_from(PendingNotification)),
        "hold": bool(await notification_hold_enabled()),
        "sent_7d": sum(int(n) for _d, n in sent),
        "failed_7d": failed,
        "by_day": daily_totals(sent, today),
    }


async def _users(db: AsyncSession) -> dict:
    rows = (await db.execute(select(PlexUser.role, func.count()).group_by(PlexUser.role))).all()
    by_role = {role: int(count) for role, count in rows}
    return {
        "total": sum(by_role.values()),
        "admins": by_role.get("admin", 0),
        "moderators": by_role.get("moderator", 0),
    }


async def _download_clients(db: AsyncSession) -> dict:
    return {
        "total": await _count(db, select(func.count()).select_from(DownloadClient)),
        "enabled": await _count(
            db, select(func.count()).select_from(DownloadClient).where(DownloadClient.enabled.is_(True))
        ),
    }


async def _storage(db: AsyncSession) -> dict:
    return {
        "connections": await _count(db, select(func.count()).select_from(StorageConnection)),
        "running_transfers": await _count(
            db, select(func.count()).select_from(StorageTransfer).where(StorageTransfer.status.in_(TRANSFER_RUNNING))
        ),
        "blocked_transfers": await _count(
            db, select(func.count()).select_from(StorageTransfer).where(StorageTransfer.status.in_(TRANSFER_BLOCKED))
        ),
    }


async def _conflicts(db: AsyncSession) -> dict:
    """Meme regle de comptage que l'onglet Conflits (les liens bibliotheque n'en font pas partie)."""
    key = "watchdeck:admin-overview:conflicts"
    cached = await cache.get_json(key)
    if cached is not None:
        return cached
    from .conflicts_api import compute_conflicts

    found = await compute_conflicts(db)
    value = {"count": len(found["tmdb_conflicts"]) + len(found["orphaned"]) + len(found["long_pending"])}
    await cache.set_json(key, value, ttl_seconds=HEAVY_TTL)
    return value


async def _issues(db: AsyncSession) -> dict:
    return {"open": await _count(db, select(func.count()).select_from(MediaIssue).where(MediaIssue.status == "open"))}


async def _safe(db: AsyncSession, name: str, produce):
    """Un bloc en panne devient `null` : l'aperçu garde tout le reste."""
    try:
        return await produce()
    except Exception:
        logger.warning("Aperçu de l'administration : bloc « %s » indisponible", name, exc_info=True)
        # Une requete en echec laisse la transaction inutilisable : sans cela, tous les blocs
        # suivants echoueraient avec elle.
        await db.rollback()
        return None


@router.get("/overview")
async def admin_overview(db: AsyncSession = Depends(get_db_async), _: None = Depends(require_admin)):
    """État de l'instance pour l'aperçu de l'administration."""
    # Une seule session : ses requetes se suivent, elles ne peuvent pas se chevaucher.
    return {
        "requests": await _safe(db, "requests", lambda: _requests(db)),
        "conflicts": await _safe(db, "conflicts", lambda: _conflicts(db)),
        "issues": await _safe(db, "issues", lambda: _issues(db)),
        "notifications": await _safe(db, "notifications", lambda: _notifications(db)),
        "users": await _safe(db, "users", lambda: _users(db)),
        "download_clients": await _safe(db, "download_clients", lambda: _download_clients(db)),
        "storage": await _safe(db, "storage", lambda: _storage(db)),
        "images": await _safe(db, "images", _images),
        "maintenance": await _safe(db, "maintenance", lambda: last_runs(TRACKED_ACTIONS)),
    }
