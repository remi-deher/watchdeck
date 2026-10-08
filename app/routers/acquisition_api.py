"""Zone Acquisition de l'administration : état réel des clients et test d'une release.

- `GET /api/download-clients/status` : chaque client actif est contacté (version, nombre de
  téléchargements en cours et en partage), en parallèle et avec un délai borné. Gardé une
  minute ; `refresh=true` le relance (« Tout tester »).
- `POST /api/acquisition/release-check` : juge un nom de release avec les règles réellement
  appliquées par la recherche automatique (`services/release_rules.py`), règle par règle.
"""

import asyncio
import logging
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..cache import cache
from ..database import get_db_async
from ..dependencies import require_admin
from ..models import DownloadClient, Settings
from ..services import download_clients
from ..services.release_rules import release_checks, rules_for
from ..utils import now_utc
from .connections_api import timed

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["acquisition"], dependencies=[Depends(require_admin)])

CLIENTS_CACHE_KEY = "watchdeck:download-clients:status"
CLIENTS_CACHE_TTL_SECONDS = 60
DOWNLOADING_STATES = {"downloading", "stalleddl", "metadl", "forceddl", "queueddl", "download-waiting", "checkingdl"}
SEEDING_STATES = {"uploading", "stalledup", "forcedup", "queuedup", "seeding", "seed-waiting"}


def torrent_counts(torrents: list[dict]) -> dict[str, int]:
    """Téléchargements en cours et en partage, à partir des états qBittorrent ou Transmission."""
    states = [str(torrent.get("state") or "").lower() for torrent in torrents]
    return {
        "downloading": sum(state in DOWNLOADING_STATES for state in states),
        "seeding": sum(state in SEEDING_STATES for state in states),
        "total": len(states),
    }


async def client_status(client: DownloadClient) -> dict[str, Any]:
    base = {"id": client.id, "name": client.name, "client_type": client.client_type}
    if not client.enabled:
        return {**base, "state": "off", "message": "Client désactivé"}
    ok, message, ms = await timed(
        download_clients.check_client_connection(client.client_type, client.url, client.username, client.password)
    )
    line: dict[str, Any] = {**base, "state": "ok" if ok else "error", "message": message, "response_ms": ms}
    if ok and client.client_type in ("qbittorrent", "transmission"):
        try:
            torrents = await asyncio.wait_for(
                download_clients.list_client_torrents(client.client_type, client.url, client.username, client.password),
                timeout=10,
            )
            line.update(torrent_counts(torrents))
        except Exception:  # noqa: BLE001 -- les compteurs sont un plus : le client reste joignable
            logger.debug("Compteurs du client %s indisponibles", client.name, exc_info=True)
    return line


@router.get("/download-clients/status")
async def download_clients_status(refresh: bool = False, db: AsyncSession = Depends(get_db_async)):
    if not refresh:
        cached = await cache.get_json(CLIENTS_CACHE_KEY)
        if cached:
            return cached
    clients = (await db.execute(select(DownloadClient).order_by(DownloadClient.id))).scalars().all()
    items = await asyncio.gather(*(client_status(client) for client in clients))
    payload = {"checked_at": now_utc().isoformat(), "items": list(items)}
    try:
        await cache.set_json(CLIENTS_CACHE_KEY, payload, ttl_seconds=CLIENTS_CACHE_TTL_SECONDS)
    except Exception:  # noqa: BLE001
        logger.debug("Cache des clients indisponible", exc_info=True)
    return payload


class ReleaseCheckBody(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    size_gb: Optional[float] = Field(default=None, ge=0)
    media_type: Literal["movie", "show"] = "movie"


@router.post("/acquisition/release-check")
async def release_check(body: ReleaseCheckBody, db: AsyncSession = Depends(get_db_async)):
    settings = (await db.execute(select(Settings))).scalars().first()
    checks = release_checks(body.title, body.size_gb, rules_for(settings, body.media_type))
    return {"accepted": all(check["ok"] for check in checks), "checks": checks}
