"""Sous-titres français : recherche a la demande (Plex ou Bazarr) et etat du suivi."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db_async
from ..dependencies import require_moderator
from ..job_queue import arq_enabled, enqueue_job
from ..models import LibraryItem, Settings
from ..services import bazarr, subtitle_search
from ..utils import async_get_or_404

router = APIRouter(prefix="/api", tags=["subtitles"], dependencies=[Depends(require_moderator)])


class SubtitleSearchBody(BaseModel):
    provider: Optional[str] = None  # None = reglage global


@router.get("/subtitles/summary")
async def subtitles_summary(db: AsyncSession = Depends(get_db_async)):
    """Medias sans sous-titres FR, reglages du passage automatique et etat de Bazarr."""
    settings = (await db.execute(select(Settings))).scalars().first()
    instance = await subtitle_search.bazarr_instance(db)
    bazarr_state = None
    if instance:
        bazarr_state = {
            "instance_id": instance.id,
            "name": instance.name,
            **await bazarr.wanted_counts(instance.url, instance.api_key),
        }
    return {
        **await subtitle_search.count_missing(db),
        "enabled": bool(settings and settings.subtitle_search_enabled),
        "provider": (settings.subtitle_search_provider if settings else None) or "auto",
        "bazarr": bazarr_state,
    }


@router.post("/subtitles/library/{item_id}/search")
async def search_item_subtitles(
    item_id: int, body: SubtitleSearchBody | None = None, db: AsyncSession = Depends(get_db_async)
):
    item = await async_get_or_404(db, LibraryItem, item_id, "Média introuvable")
    if item.media_type not in ("movie", "show"):
        raise HTTPException(400, "Seuls les films et les séries ont des sous-titres à chercher.")
    provider = body.provider if body else None
    if provider is not None and provider not in subtitle_search.PROVIDERS:
        raise HTTPException(400, f"Fournisseur inconnu : {provider}")
    result = await subtitle_search.search_for_item(db, item, provider=provider)
    if not result.get("success"):
        raise HTTPException(502, result.get("message") or "Recherche impossible")
    return result


@router.post("/subtitles/search-missing")
async def search_missing_subtitles():
    """Lance tout de suite un lot de la tache planifiee « Sous-titres FR »."""
    if arq_enabled():
        job_id = await enqueue_job("job_subtitle_search", True)
        return {"queued": True, "job_id": job_id}
    return {"queued": False, **await subtitle_search.search_missing_batch()}
