"""API d'activité Plex en direct, historique et statistiques."""

from datetime import date, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
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
    PlaybackActionError,
    _rebuild_daily_aggregates,
    activity_history,
    activity_snapshot,
    activity_statistics,
    cancel_plex_activity,
    collect_plex_activity,
    import_tautulli_history,
    live_activity_snapshot,
    normalize_tautulli_history,
    playback_session_detail,
    plex_server_activities,
    recalculate_playback_locations,
    terminate_playback,
    test_tautulli,
)
from ..services.tracearr import TracearrError, import_tracearr_history, test_tracearr
from ..utils import now_utc_naive
from .image_proxy_api import image_proxy

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


@router.get("/sessions/{session_id}")
async def get_playback_session(session_id: int, db: AsyncSession = Depends(get_db_async)):
    """Detail d'une session, pour ouvrir sa fiche depuis un lien ou apres un rechargement."""
    session = await playback_session_detail(session_id, db=db)
    if session is None:
        raise HTTPException(404, "Session introuvable.")
    return session


class TerminateRequest(BaseModel):
    reason: str = ""


@router.post("/sessions/{session_id}/terminate")
async def terminate_playback_session(
    session_id: int, payload: TerminateRequest, db: AsyncSession = Depends(get_db_async)
):
    """Arrête une lecture en cours ; le message s'affiche sur le lecteur de l'utilisateur."""
    try:
        await terminate_playback(session_id, payload.reason[:300], db)
    except PlaybackActionError as exc:
        raise HTTPException(409, str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Plex injoignable : {exc}") from exc
    await publish("activity.updated", {"terminated": session_id}, admin_only=True)
    return {"status": "terminated"}


@router.get("/server-activities")
async def get_plex_server_activities(db: AsyncSession = Depends(get_db_async)):
    """Tâches en cours sur le serveur Plex (miniatures, analyses, scans)."""
    try:
        return {"activities": await plex_server_activities(db)}
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Plex injoignable : {exc}") from exc


@router.delete("/server-activities/{uuid}")
async def cancel_plex_server_activity(
    uuid: str, server: Optional[int] = None, db: AsyncSession = Depends(get_db_async)
):
    try:
        await cancel_plex_activity(uuid, db, server)
    except PlaybackActionError as exc:
        raise HTTPException(409, str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Plex injoignable : {exc}") from exc
    return {"status": "cancelled"}


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
    server: int | None = Query(None, description="Serveur Plex (identifiant de /api/plex-servers)."),
    sort: str = Query(
        "recent",
        pattern="^(recent|oldest|longest|(title|user|device|method|date|duration)_(asc|desc))$",
        description="Colonne et sens : title_asc, duration_desc... (recent, oldest, longest restent acceptés).",
    ),
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
        sort=sort,
        server=server,
    )


@router.get("/thumb")
async def playback_thumb(
    request: Request,
    path: str,
    width: Optional[int] = Query(None, ge=32, le=2560),
    server: Optional[int] = Query(None, description="Serveur Plex supplémentaire de la lecture."),
    settings: Settings = Depends(get_settings_or_404),
):
    """Sert une vignette Plex sans exposer le token Plex dans l'URL du navigateur.

    Passe par le proxy d'images commun : cache disque, chemin `/thumb/<ts>` perime
    rattrape, et 404 (non 502) pour une vignette absente de Plex -- media supprime depuis
    la lecture, ou bande-annonce dont Plex n'a jamais genere la vignette."""
    if not path.startswith("/library/metadata/") or "://" in path or ".." in path:
        raise HTTPException(400, "Chemin de vignette Plex invalide.")
    if server is None and (not settings.plex_url or not settings.plex_token):
        raise HTTPException(404, "Plex n'est pas configuré.")
    return await image_proxy(
        # Redimensionnee cote serveur quand la vue donne sa taille : une capture de 1800 px
        # reduite 7 fois par le navigateur sortait crenelee dans une vignette.
        request=request,
        url=None,
        plex_path=path,
        width=width,
        height=None,
        quality=90 if width else 82,
        image_format="webp" if width else "original",
        plex_server=server,
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
