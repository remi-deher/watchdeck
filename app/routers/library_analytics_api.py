"""API des statistiques techniques de la médiathèque Plex."""

import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db_async
from ..dependencies import get_settings_or_404, require_admin
from ..models import Settings
from ..pagination import PaginationParams, pagination_params
from ..services.library_analytics import analytics_items_payload, analytics_payload, analytics_summary_payload

router = APIRouter(prefix="/api/library-analytics", tags=["library-analytics"], dependencies=[Depends(require_admin)])


def _filters(
    media_type,
    library,
    studio,
    viewer,
    artist,
    video_codec,
    audio_codec,
    audio_language,
    container,
    video_resolution,
    subtitle,
    subtitle_language,
    subtitle_type,
    watched,
    search,
    min_size_gb,
    max_size_gb,
):
    return locals()


async def _payload(
    db: AsyncSession,
    settings: Settings,
    media_type: Optional[str],
    library: Optional[str],
    studio: Optional[str],
    viewer: Optional[str],
    artist: Optional[str],
    video_codec: Optional[str],
    audio_codec: Optional[str],
    audio_language: Optional[str],
    container: Optional[str],
    video_resolution: Optional[str],
    subtitle: Optional[str],
    subtitle_language: Optional[str],
    subtitle_type: Optional[str],
    watched: Optional[str],
    search: Optional[str],
    min_size_gb: Optional[float],
    max_size_gb: Optional[float],
    refresh: bool = False,
):
    return await analytics_payload(
        settings,
        db,
        _filters(
            media_type=media_type,
            library=library,
            studio=studio,
            viewer=viewer,
            artist=artist,
            video_codec=video_codec,
            audio_codec=audio_codec,
            audio_language=audio_language,
            container=container,
            video_resolution=video_resolution,
            subtitle=subtitle,
            subtitle_language=subtitle_language,
            subtitle_type=subtitle_type,
            watched=watched,
            search=search,
            min_size_gb=min_size_gb,
            max_size_gb=max_size_gb,
        ),
        refresh,
    )


@router.get("")
async def get_library_analytics(
    media_type: Optional[str] = None,
    library: Optional[str] = None,
    studio: Optional[str] = None,
    viewer: Optional[str] = None,
    artist: Optional[str] = None,
    video_codec: Optional[str] = None,
    audio_codec: Optional[str] = None,
    audio_language: Optional[str] = None,
    container: Optional[str] = None,
    video_resolution: Optional[str] = None,
    subtitle: Optional[str] = Query(None, pattern="^(with|without)$"),
    subtitle_language: Optional[str] = None,
    subtitle_type: Optional[str] = None,
    watched: Optional[str] = Query(None, pattern="^(yes|no)$"),
    search: Optional[str] = None,
    min_size_gb: Optional[float] = Query(None, ge=0),
    max_size_gb: Optional[float] = Query(None, ge=0),
    refresh: bool = False,
    db: AsyncSession = Depends(get_db_async),
    settings: Settings = Depends(get_settings_or_404),
):
    filters = _filters(
        media_type=media_type,
        library=library,
        studio=studio,
        viewer=viewer,
        artist=artist,
        video_codec=video_codec,
        audio_codec=audio_codec,
        audio_language=audio_language,
        container=container,
        video_resolution=video_resolution,
        subtitle=subtitle,
        subtitle_language=subtitle_language,
        subtitle_type=subtitle_type,
        watched=watched,
        search=search,
        min_size_gb=min_size_gb,
        max_size_gb=max_size_gb,
    )
    return await analytics_summary_payload(settings, db, filters, refresh)


@router.get("/items")
async def get_library_analytics_items(
    media_type: Optional[str] = None,
    library: Optional[str] = None,
    studio: Optional[str] = None,
    viewer: Optional[str] = None,
    artist: Optional[str] = None,
    video_codec: Optional[str] = None,
    audio_codec: Optional[str] = None,
    audio_language: Optional[str] = None,
    container: Optional[str] = None,
    video_resolution: Optional[str] = None,
    subtitle: Optional[str] = Query(None, pattern="^(with|without)$"),
    subtitle_language: Optional[str] = None,
    subtitle_type: Optional[str] = None,
    watched: Optional[str] = Query(None, pattern="^(yes|no)$"),
    search: Optional[str] = None,
    min_size_gb: Optional[float] = Query(None, ge=0),
    max_size_gb: Optional[float] = Query(None, ge=0),
    pagination: PaginationParams = Depends(pagination_params(max_limit=500, default_limit=100)),
    insight_kind: Optional[str] = None,
    insight_field: Optional[str] = None,
    insight_value: Optional[str] = None,
    sort: Optional[str] = Query(
        None, pattern="^(title|library|studio|container|size_bytes|plays|watch_time|last_viewed|viewer)$"
    ),
    direction: str = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db_async),
    settings: Settings = Depends(get_settings_or_404),
):
    filters = _filters(
        media_type=media_type,
        library=library,
        studio=studio,
        viewer=viewer,
        artist=artist,
        video_codec=video_codec,
        audio_codec=audio_codec,
        audio_language=audio_language,
        container=container,
        video_resolution=video_resolution,
        subtitle=subtitle,
        subtitle_language=subtitle_language,
        subtitle_type=subtitle_type,
        watched=watched,
        search=search,
        min_size_gb=min_size_gb,
        max_size_gb=max_size_gb,
    )
    return await analytics_items_payload(
        settings,
        db,
        filters,
        offset=pagination.offset,
        limit=pagination.limit,
        insight_kind=insight_kind,
        insight_field=insight_field,
        insight_value=insight_value,
        sort=sort,
        direction=direction,
    )


@router.get("/export.csv")
async def export_library_analytics(
    media_type: Optional[str] = None,
    library: Optional[str] = None,
    studio: Optional[str] = None,
    viewer: Optional[str] = None,
    artist: Optional[str] = None,
    video_codec: Optional[str] = None,
    audio_codec: Optional[str] = None,
    audio_language: Optional[str] = None,
    container: Optional[str] = None,
    video_resolution: Optional[str] = None,
    subtitle: Optional[str] = None,
    subtitle_language: Optional[str] = None,
    subtitle_type: Optional[str] = None,
    watched: Optional[str] = None,
    search: Optional[str] = None,
    min_size_gb: Optional[float] = None,
    max_size_gb: Optional[float] = None,
    db: AsyncSession = Depends(get_db_async),
    settings: Settings = Depends(get_settings_or_404),
):
    payload = await _payload(
        db,
        settings,
        media_type=media_type,
        library=library,
        studio=studio,
        viewer=viewer,
        artist=artist,
        video_codec=video_codec,
        audio_codec=audio_codec,
        audio_language=audio_language,
        container=container,
        video_resolution=video_resolution,
        subtitle=subtitle,
        subtitle_language=subtitle_language,
        subtitle_type=subtitle_type,
        watched=watched,
        search=search,
        min_size_gb=min_size_gb,
        max_size_gb=max_size_gb,
    )
    output = io.StringIO()
    fields = [
        "title",
        "grandparent_title",
        "media_type",
        "library",
        "studio",
        "year",
        "size_bytes",
        "duration_ms",
        "container",
        "video_codec",
        "video_resolution",
        "audio_codec",
        "audio_channels",
        "audio_languages",
        "subtitle_languages",
        "subtitle_types",
        "audio_track_count",
        "subtitle_count",
        "play_count",
        "watch_time_ms",
        "viewers",
    ]
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in payload["items"]:
        clean = dict(row)
        for key in ("audio_languages", "subtitle_languages", "subtitle_types", "viewers"):
            clean[key] = " | ".join(clean.get(key) or [])
        writer.writerow(clean)
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="watchdeck-library-analytics.csv"'},
    )
