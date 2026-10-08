"""État réel de chaque connexion, pour l'écran Connexions de l'administration.

`/api/health` ne vérifie que l'instance par défaut de chaque type : avec deux Radarr, celui
qui tombe peut passer inaperçu. Ici, chaque connexion configurée est vérifiée une à une
(Plex, chaque instance Sonarr/Radarr/Prowlarr/Bazarr, TMDB, Seer, Tracearr, Tautulli), en
parallèle et avec un délai borné. Le résultat est gardé une minute ; `refresh=true` le
relance (bouton « Tout tester »).
"""

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..cache import cache
from ..database import get_db_async
from ..dependencies import require_admin
from ..models import ArrInstance, Settings
from ..services import bazarr, prowlarr, radarr, sonarr
from ..services import service_health_details as health_details
from ..utils import now_utc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/connections", tags=["connections"], dependencies=[Depends(require_admin)])

CACHE_KEY = "watchdeck:connections"
CACHE_TTL_SECONDS = 60
CHECK_TIMEOUT_SECONDS = 10.0


def entry(key: str, kind: str, name: str, state: str, message: str = "", **extra: Any) -> dict[str, Any]:
    """Une ligne de l'écran : `state` vaut `ok`, `error` ou `off` (désactivée ou non configurée)."""
    return {"key": key, "kind": kind, "name": name, "state": state, "message": message, **extra}


async def timed(check: Awaitable[Any]) -> tuple[bool, str, float | None]:
    """Résultat `(ok, message, latence_ms)` d'un contrôle, sans jamais lever.

    Les contrôles existants répondent `(ok, message)` ou un simple booléen (Prowlarr).
    """
    started = time.monotonic()
    try:
        result = await asyncio.wait_for(check, timeout=CHECK_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        return False, f"Pas de réponse en {int(CHECK_TIMEOUT_SECONDS)} s", None
    except Exception as exc:  # noqa: BLE001 -- une connexion en panne est un résultat, pas une erreur
        return False, str(exc) or exc.__class__.__name__, None
    elapsed = round((time.monotonic() - started) * 1000)
    if isinstance(result, tuple):
        ok, message = bool(result[0]), str(result[1] or "")
    else:
        ok, message = bool(result), ""
    return ok, message or ("Joignable" if ok else "Connexion impossible"), elapsed


_ARR_CHECKS: dict[str, Callable[[str, str], Awaitable[Any]]] = {
    "sonarr": sonarr.check_connection,
    "radarr": radarr.check_connection,
    "prowlarr": prowlarr.check_connection,
    "bazarr": bazarr.check_connection,
}
_ARR_DETAILS_VERSION = {"sonarr": "v3", "radarr": "v3", "prowlarr": "v1"}


async def arr_entry(inst: ArrInstance) -> dict[str, Any]:
    base = {"instance_id": inst.id, "url": inst.url, "is_default": bool(inst.is_default)}
    key = f"arr-{inst.id}"
    if not inst.enabled:
        return entry(key, inst.arr_type, inst.name, "off", "Instance désactivée", **base)
    check = _ARR_CHECKS.get(inst.arr_type)
    if check is None:
        return entry(key, inst.arr_type, inst.name, "off", f"Type inconnu : {inst.arr_type}", **base)
    api_version = _ARR_DETAILS_VERSION.get(inst.arr_type)
    details_job = (
        health_details.arr_details(inst.url, inst.api_key, api_version=api_version)
        if api_version
        else asyncio.sleep(0, result={})
    )
    (ok, message, ms), details = await asyncio.gather(timed(check(inst.url, inst.api_key)), details_job)
    extra = {**base, "response_ms": ms}
    if ok:
        extra.update({k: v for k, v in (details or {}).items() if k in ("version", "issues", "issue_count")})
    return entry(key, inst.arr_type, inst.name, "ok" if ok else "error", message, **extra)


async def plex_entry(s: Settings | None) -> dict[str, Any]:
    from ..services.plex_api import check_connection as plex_test

    if not s or not s.plex_url or not s.plex_token:
        return entry("plex", "plex", "Plex", "off", "URL ou jeton Plex manquant")
    (ok, message, ms), details = await asyncio.gather(
        timed(plex_test(s.plex_url, s.plex_token, verify_ssl=s.plex_verify_ssl)),
        health_details.plex_details(s.plex_url, s.plex_token, verify_ssl=s.plex_verify_ssl),
    )
    extra: dict[str, Any] = {"url": s.plex_url, "response_ms": ms}
    if ok:
        extra.update({k: v for k, v in (details or {}).items() if k in ("version", "instance_name", "sessions")})
    return entry("plex", "plex", "Plex", "ok" if ok else "error", message, **extra)


async def seer_entry(s: Settings | None) -> dict[str, Any]:
    from ..services.seer import check_connection as seer_test

    if not s or not s.seer_enabled:
        return entry("seer", "seer", "Seer", "off", "Seer n'est pas activé")
    if not s.seer_url or not s.seer_api_key:
        return entry("seer", "seer", "Seer", "off", "URL ou clé API Seer manquante")
    ok, message, ms = await timed(seer_test(s.seer_url, s.seer_api_key))
    return entry("seer", "seer", "Seer", "ok" if ok else "error", message, url=s.seer_url, response_ms=ms)


async def tmdb_entry(db: AsyncSession, s: Settings | None = None) -> dict[str, Any]:
    from ..services import tmdb as tmdb_service

    if s is not None and not getattr(s, "tmdb_enabled", True):
        return entry("tmdb", "tmdb", "TMDB", "off", "TMDB n'est pas activé")
    try:
        key = await tmdb_service._api_key(db)
    except Exception:  # noqa: BLE001
        key = None
    if not key:
        return entry("tmdb", "tmdb", "TMDB", "off", "Clé API TMDB non configurée")
    ok, message, ms = await timed(tmdb_service.check_connection(db, api_key=key))
    return entry("tmdb", "tmdb", "TMDB", "ok" if ok else "error", message, response_ms=ms)


async def activity_entry(kind: str, s: Settings | None) -> dict[str, Any]:
    name = "Tracearr" if kind == "tracearr" else "Tautulli"
    enabled = bool(s and getattr(s, f"{kind}_enabled", False))
    url = getattr(s, f"{kind}_url", None) if s else None
    api_key = getattr(s, f"{kind}_api_key", None) if s else None
    if not enabled:
        return entry(kind, kind, name, "off", f"{name} n'est pas activé")
    if not url or not api_key:
        return entry(kind, kind, name, "off", f"URL ou clé API {name} manquante")
    if kind == "tracearr":
        from ..services.tracearr import test_tracearr as check
    else:
        from ..services.playback_activity import test_tautulli as check  # type: ignore[no-redef]
    ok, message, ms = await timed(check(url, api_key))
    return entry(kind, kind, name, "ok" if ok else "error", message, url=url, response_ms=ms)


async def collect(db: AsyncSession) -> dict[str, Any]:
    s = (await db.execute(select(Settings))).scalars().first()
    instances = (await db.execute(select(ArrInstance).order_by(ArrInstance.arr_type, ArrInstance.id))).scalars().all()
    # La session SQLAlchemy ne se partage pas entre tâches concurrentes : TMDB (qui lit la
    # base) passe à part, les autres contrôles n'ont besoin que des réglages déjà lus.
    tmdb = await tmdb_entry(db, s)
    others = await asyncio.gather(
        plex_entry(s),
        *(arr_entry(inst) for inst in instances),
        seer_entry(s),
        activity_entry("tracearr", s),
        activity_entry("tautulli", s),
    )
    items = [others[0], *others[1:], tmdb]
    return {"checked_at": now_utc().isoformat(), "items": items}


@router.get("/status")
async def connections_status(refresh: bool = False, db: AsyncSession = Depends(get_db_async)):
    if not refresh:
        cached = await cache.get_json(CACHE_KEY)
        if cached:
            return cached
    payload = await collect(db)
    try:
        await cache.set_json(CACHE_KEY, payload, ttl_seconds=CACHE_TTL_SECONDS)
    except Exception:  # noqa: BLE001 -- sans cache, on revérifie au prochain appel
        logger.debug("Cache des connexions indisponible", exc_info=True)
    return payload
