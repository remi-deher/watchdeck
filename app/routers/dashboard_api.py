"""Dashboard sections prepared by the worker and shared through Redis.

The stream sends cached sections immediately, then replaces stale sections as their
refresh completes. Both HTTP routes share those entries; explicit event refreshes
bypass freshness without discarding the last successful value on a failure.
"""

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator, Callable
from weakref import WeakValueDictionary

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from ..cache import cache
from ..database import AsyncSessionLocal
from ..dependencies import require_admin
from ..pagination import PaginationParams
from . import calendar_api, metrics_api, notifications_api, onboarding_api, requests_api

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dashboard"], dependencies=[Depends(require_admin)])

_SECTION_PREFIX = "watchdeck:dashboard:section:v1:"
_SECTION_FRESH_SECONDS = 15
_SECTION_KEEP_SECONDS = 900
_section_locks: WeakValueDictionary[str, asyncio.Lock] = WeakValueDictionary()


async def _section(name: str, call: Callable, *, refresh: bool = False) -> object:
    key = _SECTION_PREFIX + name
    entry = await cache.get_json(key)
    if entry and not refresh and time.time() - entry["cached_at"] < _SECTION_FRESH_SECONDS:
        return entry["value"]
    # Un seul calcul par section dans ce processus, y compris à cache froid.
    lock = _section_locks.setdefault(name, asyncio.Lock())
    requested_at = time.time()
    async with lock:
        entry = await cache.get_json(key)
        if entry and (
            entry["cached_at"] >= requested_at
            or (not refresh and time.time() - entry["cached_at"] < _SECTION_FRESH_SECONDS)
        ):
            return entry["value"]
        async with asyncio.timeout(20):
            value = await _with_session(call)
        await cache.set_json(key, {"value": value, "cached_at": time.time()}, _SECTION_KEEP_SECONDS)
        return value


async def _with_session(call: Callable) -> object:
    async with AsyncSessionLocal() as db:
        return await call(db)


def _snapshot_calls() -> dict[str, Callable]:
    return {
        "counts": lambda db: metrics_api.stats_counts(db, allow_remote=False),
        "pending": lambda db: requests_api.list_pending_requests(db),
        "polls": lambda db: metrics_api.get_poll_history(limit=6, db=db),
        "timeline": lambda db: metrics_api.stats_timeline(db),
        "by_user": lambda db: metrics_api.stats_by_user(db),
        "onboarding": lambda db: onboarding_api.onboarding_status(db, None),
        "top_requested": lambda db: metrics_api.stats_top_requested(db, limit=5),
        "recently_available": lambda db: metrics_api.stats_recently_available(db, limit=5),
        "recent_requests": lambda db: metrics_api.stats_recent_requests(db, limit=10),
        "upcoming": lambda db: calendar_api.upcoming_releases(db=db, limit=8),
        # Appel direct, sans FastAPI : chaque parametre declare en `Query(...)` doit etre
        # passe explicitement, sinon il arrive comme objet Query (« KeyError: Query(date) »).
        "notifications": lambda db: notifications_api.list_notification_logs(
            pagination=PaginationParams(offset=0, limit=5), sort="date", direction="desc", db=db
        ),
    }


async def _compute_snapshot(sections: set[str] | None = None, *, refresh: bool = False) -> dict:
    all_calls = _snapshot_calls()
    calls = {name: call for name, call in all_calls.items() if sections is None or name in sections}
    results = await asyncio.gather(
        *(_section(name, call, refresh=refresh) for name, call in calls.items()), return_exceptions=True
    )
    payload: dict = {"errors": []}
    if sections is None or "next_poll" in sections:
        try:
            async with asyncio.timeout(3):
                payload["next_poll"] = await metrics_api.next_poll_info()
        except Exception:
            payload["errors"].append("next_poll")
    for name, result in zip(calls, results):
        if isinstance(result, Exception):
            payload["errors"].append(name)
        else:
            payload[name] = result
    return payload


def _frame(payload: dict) -> str:
    """Trame SSE. Le type `text/event-stream` n'est pas un detail cosmetique : c'est le
    seul que le GZipMiddleware de Starlette laisse passer sans le compresser, et donc sans
    le tamponner -- en NDJSON, gzip accumulerait les premieres sections et le flux
    arriverait d'un bloc, exactement ce qu'on cherche a eviter.
    """
    return f"data: {json.dumps(payload)}\n\n"


async def _stream_sections(sections: set[str] | None = None, *, refresh: bool = False) -> AsyncIterator[str]:
    calls = {name: call for name, call in _snapshot_calls().items() if sections is None or name in sections}

    async def named(name, call):
        try:
            return {name: await _section(name, call, refresh=refresh)}
        except Exception as exc:
            logger.warning("Section '%s' du tableau de bord indisponible : %s", name, exc)
            return {"errors": [name]}

    # Démarrer les calculs avant la lecture Redis du compte à rebours.
    pending = {}
    for name, call in calls.items():
        entry = await cache.get_json(_SECTION_PREFIX + name)
        if entry and not refresh:
            yield _frame({name: entry["value"]})
            if time.time() - entry["cached_at"] < _SECTION_FRESH_SECONDS:
                continue
        pending[name] = call

    async def countdown():
        try:
            async with asyncio.timeout(3):
                return {"next_poll": await metrics_api.next_poll_info()}
        except Exception:
            return {"errors": ["next_poll"]}

    # Le compte à rebours peut attendre Redis ; il ne retient aucune section prête.
    tasks = []
    if sections is None or "next_poll" in sections:
        tasks.append(asyncio.create_task(countdown()))
    tasks.extend(asyncio.create_task(named(name, call)) for name, call in pending.items())
    try:
        for completed in asyncio.as_completed(tasks):
            yield _frame(await completed)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def prepare_dashboard() -> dict:
    """Prépare les sections partagées dans Redis, indépendamment des visiteurs."""
    return await _compute_snapshot(refresh=True)


@router.get("/dashboard/snapshot/stream")
async def dashboard_snapshot_stream(sections: str | None = Query(None), refresh: bool = Query(False)):
    """Emet chaque section du tableau de bord des qu'elle est prete.

    Les dix lectures partent en parallele, comme avant ; ce qui change est qu'on n'attend
    plus la plus lente pour afficher les neuf autres.
    """
    requested = None
    if sections:
        allowed = set(_snapshot_calls()) | {"next_poll"}
        requested = {value.strip() for value in sections.split(",") if value.strip()} & allowed
    return StreamingResponse(
        _stream_sections(requested, refresh=refresh),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store",
            # nginx tamponne les reponses en amont par defaut, ce qui annulerait le
            # streaming sans rien signaler.
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/dashboard/snapshot")
async def dashboard_snapshot(
    refresh: bool = Query(False),
    sections: str | None = Query(None),
):
    requested = None
    if sections:
        allowed = set(_snapshot_calls()) | {"next_poll"}
        requested = {value.strip() for value in sections.split(",") if value.strip()} & allowed
    return await _compute_snapshot(requested, refresh=refresh)
