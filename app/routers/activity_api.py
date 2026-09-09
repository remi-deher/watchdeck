"""API d'activité Plex en direct, historique et statistiques."""

from datetime import date, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db_async
from ..dependencies import get_settings_or_404, require_admin
from ..models import Settings
from ..pagination import PaginationParams, pagination_params
from ..realtime import publish
from ..services.playback_activity import (
    MAX_PERIOD_DAYS,
    _rebuild_daily_aggregates,
    activity_history,
    activity_snapshot,
    activity_statistics,
    collect_plex_activity,
    import_tautulli_history,
    live_activity_snapshot,
    normalize_tautulli_history,
    recalculate_playback_locations,
    test_tautulli,
)
from ..services.tracearr import TracearrError, import_tracearr_history, test_tracearr
from ..utils import now_utc_naive

router = APIRouter(prefix="/api/playback", tags=["activity"], dependencies=[Depends(require_admin)])


class TautulliImportRequest(BaseModel):
    length: int = 1000


@router.get("")
async def get_activity(
    days: int = Query(30, ge=1, le=MAX_PERIOD_DAYS),
    user: str | None = Query(None, max_length=200),
    db: AsyncSession = Depends(get_db_async),
):
    return await activity_snapshot(days, db=db, user=user)


@router.get("/live")
async def get_live_activity(db: AsyncSession = Depends(get_db_async)):
    return await live_activity_snapshot(db=db)


@router.get("/statistics")
async def get_activity_statistics(
    days: int = Query(30, ge=1, le=MAX_PERIOD_DAYS),
    refresh: bool = False,
    user: str | None = Query(None, max_length=200, description="Restreint tous les agrégats à ce spectateur."),
    db: AsyncSession = Depends(get_db_async),
):
    return await activity_statistics(days, db=db, refresh=refresh, user=user)


@router.get("/history")
async def get_activity_history(
    days: int = Query(30, ge=1, le=MAX_PERIOD_DAYS),
    user: str | None = Query(None, max_length=200),
    method: str | None = Query(None, max_length=50),
    media_type: str | None = Query(None, max_length=50),
    device: str | None = Query(None, max_length=200),
    query: str | None = Query(None, max_length=200),
    pagination: PaginationParams = Depends(pagination_params(max_limit=500, default_limit=100)),
    db: AsyncSession = Depends(get_db_async),
):
    """Historique filtré et paginé — le tri et les filtres sont appliqués en base."""
    return await activity_history(
        days,
        db=db,
        user=user,
        method=method,
        media_type=media_type,
        device=device,
        query=query,
        offset=pagination.offset,
        limit=pagination.limit,
    )


@router.get("/thumb")
async def playback_thumb(path: str, settings: Settings = Depends(get_settings_or_404)):
    """Sert une vignette Plex sans exposer le token Plex dans l'URL du navigateur."""
    if not path.startswith("/library/metadata/") or "://" in path or ".." in path:
        raise HTTPException(400, "Chemin de vignette Plex invalide.")
    if not settings.plex_url or not settings.plex_token:
        raise HTTPException(404, "Plex n'est pas configuré.")
    try:
        async with httpx.AsyncClient(timeout=15, verify=settings.plex_verify_ssl, follow_redirects=False) as client:
            response = await client.get(
                f"{settings.plex_url.rstrip('/')}{path}",
                headers={"X-Plex-Token": settings.plex_token},
            )
            response.raise_for_status()
    except Exception as exc:
        raise HTTPException(502, f"Vignette Plex inaccessible : {exc}") from exc
    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    if not content_type.startswith("image/"):
        raise HTTPException(415, "La ressource Plex n'est pas une image.")
    return Response(
        content=response.content,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.post("/refresh")
async def refresh_activity():
    try:
        await collect_plex_activity()
        statistics = await activity_statistics(30, refresh=True)
        live = await live_activity_snapshot()
        return {**statistics, **live}
    except Exception as exc:
        raise HTTPException(502, f"Lecture des sessions Plex impossible : {exc}") from exc


@router.post("/tautulli/test")
async def test_tautulli_connection(settings: Settings = Depends(get_settings_or_404)):
    ok, message = await test_tautulli(settings.tautulli_url or "", settings.tautulli_api_key or "")
    if not ok:
        raise HTTPException(502, message)
    return {"ok": True, "message": message}


@router.post("/tautulli/import")
async def import_tautulli(data: TautulliImportRequest):
    try:
        return await import_tautulli_history(length=data.length)
    except Exception as exc:
        raise HTTPException(502, f"Import Tautulli impossible : {exc}") from exc


@router.post("/tautulli/normalize")
async def normalize_tautulli(data: TautulliImportRequest):
    try:
        return await normalize_tautulli_history(length=data.length)
    except Exception as exc:
        raise HTTPException(502, f"Normalisation Tautulli impossible : {exc}") from exc


class TracearrImportRequest(BaseModel):
    """Fenêtre d'import. Sans `days`, tout l'historique Tracearr est parcouru."""

    days: Optional[int] = None


@router.post("/tracearr/test")
async def test_tracearr_connection(settings: Settings = Depends(get_settings_or_404)):
    ok, message = await test_tracearr(settings.tracearr_url or "", settings.tracearr_api_key or "")
    if not ok:
        raise HTTPException(502, message)
    return {"ok": True, "message": message}


@router.post("/tracearr/import")
async def import_tracearr(
    data: TracearrImportRequest,
    settings: Settings = Depends(get_settings_or_404),
    db: AsyncSession = Depends(get_db_async),
):
    """Importe l'historique Tracearr en enrichissant les lectures déjà connues.

    Rien n'est écrasé : le compte rendu distingue les lectures créées -- que Tracearr
    connaissait et nous pas -- de celles simplement complétées, dont la décision de
    lecture manquait.
    """
    if not settings.tracearr_url or not settings.tracearr_api_key:
        raise HTTPException(400, "Tracearr n'est pas configuré.")
    since = None
    if data.days:
        since = now_utc_naive() - timedelta(days=max(1, min(data.days, MAX_PERIOD_DAYS)))
    try:
        result = await import_tracearr_history(
            db,
            url=settings.tracearr_url,
            api_key=settings.tracearr_api_key,
            since=since,
        )
    except TracearrError as exc:
        raise HTTPException(502, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Import Tracearr impossible : {exc}") from exc

    # Les agrégats journaliers se recalculent d'eux-mêmes à la lecture suivante, mais les
    # reconstruire ici évite que la page reste sur des chiffres d'avant l'import.
    await _rebuild_daily_aggregates(db, {date.fromisoformat(day) for day in result["days"]})
    await publish("activity.updated", {"source": "tracearr", **result}, admin_only=True)
    return result


@router.post("/locations/recalculate")
async def recalculate_locations():
    try:
        return await recalculate_playback_locations()
    except Exception as exc:
        raise HTTPException(502, f"Recalcul des localisations impossible : {exc}") from exc
