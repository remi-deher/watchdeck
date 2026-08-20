"""Suggestions d'upgrade VF (MULTI/VFF/TRUEFRENCH...) trouvées via la recherche
interactive Sonarr/Radarr -- voir services/vf_upgrade_scanner.py pour le scan lui-même
(tâche de fond + recherche ponctuelle par fiche média)."""

import json
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db_async
from ..dependencies import require_moderator
from ..job_queue import arq_enabled, enqueue_job
from ..models import (
    LibraryItem,
    MediaRequest,
    RequestStatus,
    Settings,
    VfEpisodeStatus,
    VfUpgradeScanRun,
    VfUpgradeSuggestion,
)
from ..realtime import publish
from ..services import radarr, sonarr
from ..services.request_lifecycle import transition_request
from ..services.vf_upgrade_scanner import (
    _season_vf_status,
    classify_vf_target,
    get_backoff_snapshot,
    scan_single_target,
    scan_vf_upgrades,
    vf_upgrade_scan_state,
)
from ..utils import now_utc_naive
from .arr_shared import _resolve_arr_instance

router = APIRouter(prefix="/api", tags=["vf-upgrades"], dependencies=[Depends(require_moderator)])
logger = logging.getLogger(__name__)
ACTIVE_UPGRADE_STATES = ("accepted", "downloading", "importing", "awaiting_verification")


def _payload(row: VfUpgradeSuggestion) -> dict:
    return {
        "id": row.id,
        "source_type": row.source_type,
        "source_id": row.source_id,
        "scope": row.scope,
        "season_number": row.season_number,
        "episode_number": row.episode_number,
        "status": row.status,
        "arr_message": row.arr_message,
        "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
        "queue_confirmed_at": row.queue_confirmed_at.isoformat() if row.queue_confirmed_at else None,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        "failed_at": row.failed_at.isoformat() if row.failed_at else None,
        "retry_count": row.retry_count,
        "releases": json.loads(row.releases_json) if row.releases_json else [],
        "current_release_titles": (
            json.loads(row.current_release_titles_json) if row.current_release_titles_json else []
        ),
        "origin": row.origin,
        "target_kind": row.target_kind,
        "scanned_at": row.scanned_at.isoformat() if row.scanned_at else None,
    }


def _media_payload(media, source_type: str) -> dict:
    poster_kind = {
        "library_item": "library",
        "request": "request",
    }.get(source_type)
    return {
        "id": media.id,
        "source_type": source_type,
        "title": media.title,
        "year": media.year,
        "media_type": media.media_type,
        # Le navigateur ne doit joindre Plex ni recevoir son URL signee directement :
        # le proxy interne contourne aussi les certificats LAN non valides/publiquement
        # reconnus et applique le cache/redimensionnement commun aux autres grilles.
        "poster_url": (
            f"/api/image-proxy/{poster_kind}/{media.id}?width=500&quality=82&format=webp"
            if media.poster_url and poster_kind
            else None
        ),
        "has_vf": media.has_vf,
        "vf_category": media.vf_category,
        "vf_granularity": getattr(media, "vf_granularity", None),
        "fr_is_default": media.fr_is_default,
        "sub_fr_status": getattr(media, "sub_fr_status", None),
        "forced_fr_status": getattr(media, "forced_fr_status", None),
    }


def _qualify_audit_issues(item) -> list[str]:
    """Identifie les anomalies et opportunités configurables sur Plex (Mode PASTA)."""
    issues = []
    # 1. Audio FR présent mais pas par défaut
    if item.has_vf is True and item.fr_is_default is False:
        issues.append("audio_secondary")

    # 2. Sous-titres FR présents mais pas par défaut sur VO
    if (item.has_vf is not True) and getattr(item, "sub_fr_status", None) in ("not_default", "forced_not_default"):
        issues.append("sub_fr_not_default")

    # 3. Sous-titre forcé présent mais pas sélectionné par défaut sur média VF
    if item.has_vf is True and getattr(item, "forced_fr_status", None) == "not_default":
        issues.append("forced_sub_not_default")

    # 4. Série avec granularité partielle (saison ou épisode VO au milieu d'une série VF)
    if getattr(item, "media_type", None) == "show" and getattr(item, "vf_granularity", None) in (
        "episode_partial",
        "season_partial",
    ):
        issues.append("partial_vf")

    return issues


def _queue_matches(item: dict, suggestion: VfUpgradeSuggestion, arr_id: int) -> bool:
    if item.get("arr_media_id") != arr_id:
        return False
    if suggestion.scope == "episode":
        return (
            item.get("season_number") == suggestion.season_number
            and item.get("episode_number") == suggestion.episode_number
        )
    return True


async def _scope_has_vf(db: AsyncSession, suggestion: VfUpgradeSuggestion, media, settings: Settings | None) -> bool:
    require_default = bool(
        settings and (settings.vf_upgrade_require_default is True or settings.vf_upgrade_accept_secondary is False)
    )
    if suggestion.scope == "movie":
        # Une VF deja presente avant le grab ne prouve pas que la nouvelle release a
        # ete importee: l'analyse doit etre posterieure a l'acceptation *arr.
        return bool(
            media.has_vf
            and (not require_default or media.fr_is_default is True)
            and suggestion.accepted_at
            and media.vf_checked_at
            and media.vf_checked_at >= suggestion.accepted_at
        )
    query = select(VfEpisodeStatus.has_vf, VfEpisodeStatus.fr_is_default, VfEpisodeStatus.checked_at).filter(
        VfEpisodeStatus.source_type == suggestion.source_type,
        VfEpisodeStatus.source_id == suggestion.source_id,
        VfEpisodeStatus.season_number == suggestion.season_number,
        VfEpisodeStatus.is_known_episode.is_(True),
    )
    if suggestion.scope == "episode":
        query = query.filter(VfEpisodeStatus.episode_number == suggestion.episode_number)
    values = list((await db.execute(query)).all())
    return (
        bool(values)
        and bool(suggestion.accepted_at)
        and all(
            has_vf
            and (not require_default or fr_is_default is True)
            and checked_at
            and checked_at >= suggestion.accepted_at
            for has_vf, fr_is_default, checked_at in values
        )
    )


async def _refresh_lifecycle(db: AsyncSession, suggestion: VfUpgradeSuggestion, media) -> None:
    if suggestion.status not in ACTIVE_UPGRADE_STATES:
        return
    settings = (await db.execute(select(Settings))).scalars().first()
    if await _scope_has_vf(db, suggestion, media, settings):
        suggestion.status = "verified"
        suggestion.completed_at = now_utc_naive()
        suggestion.arr_message = "VF confirmee apres import par l'analyse des pistes audio"
        return
    arr_type = "radarr" if suggestion.scope == "movie" else "sonarr"
    inst = await _resolve_arr_instance(db, media.arr_instance_id, arr_type)
    queue = await (radarr if arr_type == "radarr" else sonarr).get_queue(inst.url, inst.api_key)
    match = next((item for item in queue if _queue_matches(item, suggestion, media.arr_id)), None)
    if match:
        suggestion.status = "importing" if "import" in str(match.get("tracked_state", "")).lower() else "downloading"
        suggestion.queue_confirmed_at = suggestion.queue_confirmed_at or now_utc_naive()
        suggestion.arr_message = f"{inst.name} a confirme le telechargement ({match.get('progress', 0)} %)"
    elif suggestion.status in ("downloading", "importing"):
        suggestion.status = "awaiting_verification"
        suggestion.arr_message = "Telechargement termine; verification VF Plex en attente"
        if settings and settings.vf_upgrade_trigger_plex_scan:
            from ..services.vff_scanner import trigger_plex_library_refresh

            await trigger_plex_library_refresh(
                settings,
                media.media_type,
                arr_type=arr_type,
                arr_url=inst.url,
                arr_api_key=inst.api_key,
                cache_key=f"{arr_type}:{inst.id}",
            )
    elif (
        settings
        and settings.vf_upgrade_verify_after_import
        and suggestion.accepted_at
        and now_utc_naive() - suggestion.accepted_at
        > timedelta(minutes=max(15, settings.vf_upgrade_verification_timeout_minutes or 120))
    ):
        suggestion.status = "failed"
        suggestion.failed_at = now_utc_naive()
        suggestion.retry_count = (suggestion.retry_count or 0) + 1
        suggestion.arr_message = "VF non confirmee avant la fin du delai de validation"


@router.get("/vf-upgrades")
async def list_vf_upgrades(source_type: str, source_id: int, db: AsyncSession = Depends(get_db_async)):
    """Suggestions VF en attente (ou déjà traitées) pour un média -- toutes portées
    confondues (film/saison/épisode), affichées sur la fiche média correspondante."""
    rows = (
        (
            await db.execute(
                select(VfUpgradeSuggestion).filter(
                    VfUpgradeSuggestion.source_type == source_type,
                    VfUpgradeSuggestion.source_id == source_id,
                )
            )
        )
        .scalars()
        .all()
    )
    model = MediaRequest if source_type == "request" else LibraryItem
    media = (await db.execute(select(model).filter(model.id == source_id))).scalars().first()
    if media:
        for row in rows:
            try:
                await _refresh_lifecycle(db, row, media)
            except Exception as exc:
                logger.warning("Suivi upgrade VF indisponible pour suggestion %s: %s", row.id, exc)
        await db.commit()
    suggestions = []
    for row in rows:
        payload = _payload(row)
        payload["backoff"] = await get_backoff_snapshot(
            row.source_type, row.source_id, row.scope, row.season_number, row.episode_number
        )
        suggestions.append(payload)
    return {"suggestions": suggestions}


@router.get("/vf-upgrades/metrics")
async def vf_upgrade_metrics(db: AsyncSession = Depends(get_db_async)):
    rows = (
        await db.execute(
            select(VfUpgradeSuggestion.status, func.count(VfUpgradeSuggestion.id)).group_by(VfUpgradeSuggestion.status)
        )
    ).all()
    counts = {status: count for status, count in rows}

    # Nombre d'éléments bibliothèque sans VF et sans suggestion active
    active_suggestion_item_ids = set(
        (
            await db.execute(
                select(VfUpgradeSuggestion.source_id).filter(
                    VfUpgradeSuggestion.source_type == "library_item",
                    VfUpgradeSuggestion.status.in_(ACTIVE_UPGRADE_STATES + ("pending", "failed")),
                )
            )
        )
        .scalars()
        .all()
    )

    waiting_query = select(func.count(LibraryItem.id)).filter(
        LibraryItem.has_vf.is_(False),
    )
    if active_suggestion_item_ids:
        waiting_query = waiting_query.filter(LibraryItem.id.not_in(active_suggestion_item_ids))
    waiting_count = (await db.execute(waiting_query)).scalar() or 0

    counts["waiting_release"] = waiting_count

    return {
        "states": counts,
        "found": sum(v for k, v in counts.items() if k != "waiting_release"),
        "waiting_release": waiting_count,
        "accepted": sum(counts.get(s, 0) for s in ACTIVE_UPGRADE_STATES) + counts.get("verified", 0),
        "verified": counts.get("verified", 0),
        "failed": counts.get("failed", 0),
    }


@router.get("/vf-upgrades/dashboard")
async def vf_upgrade_dashboard(status: str | None = None, db: AsyncSession = Depends(get_db_async)):
    """Vue operationnelle globale des ameliorations VF, avec leur media parent."""
    # 1. Suggestions issues de *arr / suggestions enregistrées
    query = select(VfUpgradeSuggestion).order_by(VfUpgradeSuggestion.updated_at.desc())
    if status and status != "waiting_release":
        query = query.filter(VfUpgradeSuggestion.status == status)

    rows = list((await db.execute(query)).scalars().all()) if status != "waiting_release" else []
    request_ids = {row.source_id for row in rows if row.source_type == "request"}
    library_ids = {row.source_id for row in rows if row.source_type == "library_item"}
    requests = (
        {
            item.id: item
            for item in (await db.execute(select(MediaRequest).filter(MediaRequest.id.in_(request_ids))))
            .scalars()
            .all()
        }
        if request_ids
        else {}
    )
    library = (
        {
            item.id: item
            for item in (await db.execute(select(LibraryItem).filter(LibraryItem.id.in_(library_ids)))).scalars().all()
        }
        if library_ids
        else {}
    )
    items = []
    vf_status_cache: dict[tuple[str, int], dict[int, dict[int, bool]]] = {}
    active_library_item_ids = set()

    for row in rows:
        media = (requests if row.source_type == "request" else library).get(row.source_id)
        if not media:
            continue
        if row.source_type == "library_item":
            active_library_item_ids.add(row.source_id)
        # Une demande deja liee a un LibraryItem fait doublon avec lui
        if row.source_type == "request" and getattr(media, "library_item_id", None) is not None:
            continue
        if row.origin != "auto" and row.status == "pending":
            seasons = None
            if row.scope != "movie":
                cache_key = (row.source_type, row.source_id)
                if cache_key not in vf_status_cache:
                    vf_status_cache[cache_key] = await _season_vf_status(db, *cache_key)
                seasons = vf_status_cache[cache_key]
            target_kind = classify_vf_target(media, row.scope, row.season_number, row.episode_number, seasons)
            if target_kind not in {"vo", "mixed"}:
                continue
        if row.status in ACTIVE_UPGRADE_STATES:
            try:
                await _refresh_lifecycle(db, row, media)
            except Exception as exc:
                logger.warning("Suivi dashboard VF indisponible pour suggestion %s: %s", row.id, exc)
        releases = json.loads(row.releases_json) if row.releases_json else []
        items.append(
            {
                **_payload(row),
                "media": _media_payload(media, row.source_type),
                "release_count": len(releases),
                "backoff": await get_backoff_snapshot(
                    row.source_type, row.source_id, row.scope, row.season_number, row.episode_number
                ),
            }
        )

    # 2. Médias VO / sans VF sans suggestion active (en attente de release chez les indexeurs)
    if not status or status in ("all", "waiting_release"):
        waiting_stmt = (
            select(LibraryItem)
            .filter(
                LibraryItem.has_vf.is_(False),
            )
            .order_by(LibraryItem.title.asc())
        )

        waiting_media = list((await db.execute(waiting_stmt)).scalars().all())
        for media in waiting_media:
            if media.id in active_library_item_ids:
                continue
            scope = "movie" if media.media_type == "movie" else "show"
            target_kind = (
                "mixed" if getattr(media, "vf_granularity", None) in ("episode_partial", "season_partial") else "vo"
            )
            # Le backoff progressif (voir vf_upgrade_scanner._record_search_outcome) est
            # suivi par cible exacte (scope movie/season/episode) -- une serie ("show")
            # n'a pas de cle unique puisque le scanner traite chaque saison/episode
            # separement, seul le film a une correspondance directe ici.
            backoff = await get_backoff_snapshot("library_item", media.id, "movie") if scope == "movie" else None

            items.append(
                {
                    "id": f"waiting-{media.id}",
                    "source_type": "library_item",
                    "source_id": media.id,
                    "scope": scope,
                    "season_number": None,
                    "episode_number": None,
                    "status": "waiting_release",
                    "target_kind": target_kind,
                    "origin": "auto",
                    "arr_message": "Aucune release VF disponible pour le moment chez les indexeurs",
                    "scanned_at": media.vf_checked_at.isoformat() if media.vf_checked_at else None,
                    "updated_at": media.vf_checked_at.isoformat() if media.vf_checked_at else None,
                    "media": _media_payload(media, "library_item"),
                    "release_count": 0,
                    "releases_data": [],
                    "releases_json": "[]",
                    "current_release_titles": [],
                    "backoff": backoff,
                }
            )

    await db.commit()
    return {"items": items, "scan": vf_upgrade_scan_state}


@router.get("/vf-upgrades/audit")
async def vf_upgrade_audit(
    issue_type: str | None = None,
    media_type: str | None = None,
    query: str | None = None,
    db: AsyncSession = Depends(get_db_async),
):
    """Audit des flux audio & sous-titres de la bibliothèque Plex pour repérer les anomalies et opportunités."""
    stmt = select(LibraryItem).order_by(LibraryItem.title.asc())
    if media_type:
        stmt = stmt.filter(LibraryItem.media_type == media_type)
    if query:
        stmt = stmt.filter(LibraryItem.title.ilike(f"%{query.strip()}%"))

    rows = list((await db.execute(stmt)).scalars().all())

    # Suggestions actives en cours pour savoir si une recherche / un grab est déjà en attente
    active_suggestions_raw = list(
        (
            await db.execute(
                select(VfUpgradeSuggestion.source_id, VfUpgradeSuggestion.status).filter(
                    VfUpgradeSuggestion.source_type == "library_item"
                )
            )
        ).all()
    )
    active_by_id: dict[int, list[str]] = {}
    for sid, st in active_suggestions_raw:
        active_by_id.setdefault(sid, []).append(st)

    items = []
    counts = {
        "total": 0,
        "audio_secondary": 0,
        "sub_fr_not_default": 0,
        "forced_sub_not_default": 0,
        "partial_vf": 0,
    }

    for row in rows:
        issues = _qualify_audit_issues(row)
        if not issues:
            continue

        counts["total"] += 1
        for issue in issues:
            if issue in counts:
                counts[issue] += 1

        if issue_type and issue_type not in issues:
            continue

        item_payload = _media_payload(row, "library_item")
        items.append(
            {
                **item_payload,
                "issues": issues,
                "arr_id": row.arr_id,
                "arr_instance_id": row.arr_instance_id,
                "suggestions_status": active_by_id.get(row.id, []),
                "added_at": row.added_at.isoformat() if row.added_at else None,
            }
        )

    return {
        "items": items,
        "counts": counts,
    }


class FixStreamsRequest(BaseModel):
    users: list[str] | None = None
    include_home_users: bool = True
    # Couples [saison, épisode] pouvant couvrir plusieurs saisons ; absent/vide = série entière.
    episodes: list[list[int]] | None = None
    mode: str = "auto"  # "auto" | "custom"
    audio_stream_id: int | None = None
    audio_language: str | None = None
    subtitle_stream_id: int | None = None
    subtitle_language: str | None = None
    subtitle_forced: bool | None = None


class FixStreamsBatchRequest(BaseModel):
    item_ids: list[int] | None = None
    users: list[str] | None = None
    include_home_users: bool = True


@router.get("/vf-upgrades/audit/plex-users")
async def vf_upgrade_audit_plex_users(
    db: AsyncSession = Depends(get_db_async),
):
    """Retourne la liste des utilisateurs du Plex Home détectés."""
    import asyncio

    from ..services.plex_stream_aligner import get_plex_users_list

    settings = (await db.execute(select(Settings))).scalars().first()
    if not settings or not settings.plex_url or not settings.plex_token:
        return {"users": [{"id": "admin", "name": "Admin", "title": "Administrateur", "is_admin": True}]}

    users = await asyncio.to_thread(
        get_plex_users_list,
        plex_url=settings.plex_url,
        plex_token=settings.plex_token,
    )
    return {"users": users}


def _parse_episode_refs(raw: list[str] | None) -> list[tuple[int, int]] | None:
    """Parse une liste de refs "saison:episode" (query string) en couples (int, int)."""
    if not raw:
        return None
    refs = []
    for item in raw:
        try:
            s_str, e_str = item.split(":", 1)
            refs.append((int(s_str), int(e_str)))
        except (ValueError, AttributeError):
            continue
    return refs or None


@router.get("/vf-upgrades/audit/{library_item_id}/preview")
async def vf_upgrade_audit_preview(
    library_item_id: int,
    episodes: list[str] | None = Query(default=None, description="Couples 'saison:episode', ex: 1:2"),
    db: AsyncSession = Depends(get_db_async),
):
    """Prévisualise les flux actuels vs flux cibles et les utilisateurs Plex disponibles."""
    import asyncio

    from ..services.plex_stream_aligner import preview_media_item_streams_blocking

    item = (await db.execute(select(LibraryItem).filter(LibraryItem.id == library_item_id))).scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Média introuvable")

    settings = (await db.execute(select(Settings))).scalars().first()
    if not settings or not settings.plex_url or not settings.plex_token:
        raise HTTPException(status_code=400, detail="Plex non configuré")

    lib_names = []
    if settings.vff_libraries:
        try:
            raw = json.loads(settings.vff_libraries)
            lib_names = [x["name"] if isinstance(x, dict) else str(x) for x in raw]
        except Exception:
            pass

    res = await asyncio.to_thread(
        preview_media_item_streams_blocking,
        plex_url=settings.plex_url,
        plex_token=settings.plex_token,
        library_names=lib_names,
        title=item.title,
        year=item.year,
        media_type=item.media_type,
        tmdb_id=item.tmdb_id,
        tvdb_id=item.tvdb_id,
        imdb_id=item.imdb_id,
        plex_guid=item.plex_guid,
        episode_refs=_parse_episode_refs(episodes),
    )

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Erreur lors de la prévisualisation"))

    return res


@router.post("/vf-upgrades/audit/{library_item_id}/fix-streams")
async def vf_upgrade_audit_fix_streams(
    library_item_id: int,
    body: FixStreamsRequest | None = None,
    db: AsyncSession = Depends(get_db_async),
):
    """Réaligne les pistes audio et sous-titres Plex (mode PASTA) pour ce média."""
    import asyncio

    from ..services.plex_stream_aligner import align_media_item_streams_blocking

    item = (await db.execute(select(LibraryItem).filter(LibraryItem.id == library_item_id))).scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Média introuvable")

    settings = (await db.execute(select(Settings))).scalars().first()
    if not settings or not settings.plex_url or not settings.plex_token:
        raise HTTPException(status_code=400, detail="Plex non configuré")

    lib_names = []
    if settings.vff_libraries:
        try:
            raw = json.loads(settings.vff_libraries)
            lib_names = [x["name"] if isinstance(x, dict) else str(x) for x in raw]
        except Exception:
            pass

    selected_users = body.users if body and body.users else None
    include_home_users = body.include_home_users if body else True
    episode_refs = [(pair[0], pair[1]) for pair in body.episodes] if body and body.episodes else None
    is_partial_scope = bool(episode_refs)

    res = await asyncio.to_thread(
        align_media_item_streams_blocking,
        plex_url=settings.plex_url,
        plex_token=settings.plex_token,
        library_names=lib_names,
        title=item.title,
        year=item.year,
        media_type=item.media_type,
        tmdb_id=item.tmdb_id,
        tvdb_id=item.tvdb_id,
        imdb_id=item.imdb_id,
        plex_guid=item.plex_guid,
        include_home_users=include_home_users,
        selected_users=selected_users,
        episode_refs=episode_refs,
        mode=body.mode if body else "auto",
        audio_stream_id=body.audio_stream_id if body else None,
        audio_language=body.audio_language if body else None,
        subtitle_stream_id=body.subtitle_stream_id if body else None,
        subtitle_language=body.subtitle_language if body else None,
        subtitle_forced=body.subtitle_forced if body else None,
    )

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Erreur lors du réalignement"))

    # Statuts d'audit à l'échelle du média entier : ne les faire basculer à "ok" que si
    # l'alignement a bien couvert la série entière (une portée partielle laisse potentiellement
    # d'autres épisodes non alignés).
    if not is_partial_scope:
        if item.has_vf:
            item.fr_is_default = True
        if item.forced_fr_status == "not_default":
            item.forced_fr_status = "ok"
        if item.sub_fr_status in ("not_default", "forced_not_default"):
            item.sub_fr_status = "ok" if item.sub_fr_status == "not_default" else "forced_default"
    await db.commit()

    await publish(
        "vf_upgrade.updated",
        {
            "type": "streams_aligned",
            "item_id": library_item_id,
            "has_vf": item.has_vf,
            "fr_is_default": item.fr_is_default,
            "forced_fr_status": item.forced_fr_status,
            "sub_fr_status": item.sub_fr_status,
        },
    )

    return res


@router.post("/vf-upgrades/audit/fix-streams-batch")
async def vf_upgrade_audit_fix_streams_batch(
    body: FixStreamsBatchRequest | None = None,
    db: AsyncSession = Depends(get_db_async),
):
    """Réaligne les pistes audio et sous-titres Plex en masse pour une liste d'items ou toutes les anomalies éligibles."""
    import asyncio

    from ..services.plex_stream_aligner import align_media_item_streams_blocking

    settings = (await db.execute(select(Settings))).scalars().first()
    if not settings or not settings.plex_url or not settings.plex_token:
        raise HTTPException(status_code=400, detail="Plex non configuré")

    lib_names = []
    if settings.vff_libraries:
        try:
            raw = json.loads(settings.vff_libraries)
            lib_names = [x["name"] if isinstance(x, dict) else str(x) for x in raw]
        except Exception:
            pass

    stmt = select(LibraryItem)
    req_ids = body.item_ids if body and body.item_ids else None
    if req_ids:
        stmt = stmt.filter(LibraryItem.id.in_(req_ids))

    rows = list((await db.execute(stmt)).scalars().all())

    selected_users = body.users if body and body.users else None
    include_home_users = body.include_home_users if body else True

    processed = 0
    total_audio = 0
    total_subs = 0
    errors = []

    for item in rows:
        issues = _qualify_audit_issues(item)
        if not req_ids and not any(
            i in issues for i in ("audio_secondary", "forced_sub_not_default", "sub_fr_not_default")
        ):
            continue

        res = await asyncio.to_thread(
            align_media_item_streams_blocking,
            plex_url=settings.plex_url,
            plex_token=settings.plex_token,
            library_names=lib_names,
            title=item.title,
            year=item.year,
            media_type=item.media_type,
            tmdb_id=item.tmdb_id,
            tvdb_id=item.tvdb_id,
            imdb_id=item.imdb_id,
            plex_guid=item.plex_guid,
            include_home_users=include_home_users,
            selected_users=selected_users,
        )
        if res.get("success"):
            processed += 1
            total_audio += res.get("audio_changed", 0)
            total_subs += res.get("subtitles_changed", 0)
            if item.has_vf:
                item.fr_is_default = True
            if item.forced_fr_status == "not_default":
                item.forced_fr_status = "ok"
            if item.sub_fr_status in ("not_default", "forced_not_default"):
                item.sub_fr_status = "ok" if item.sub_fr_status == "not_default" else "forced_default"
        else:
            errors.append(f"{item.title}: {res.get('error')}")

    await db.commit()
    await publish("vf_upgrade.updated", {"type": "streams_aligned_batch", "processed": processed, "item_ids": req_ids})

    return {
        "success": True,
        "processed_items": processed,
        "audio_changed": total_audio,
        "subtitles_changed": total_subs,
        "errors": errors,
    }


@router.post("/vf-upgrades/scan-all")
async def trigger_all_vf_upgrade_scans():
    if vf_upgrade_scan_state.get("status") == "running":
        raise HTTPException(409, "Un scan d'ameliorations VF est deja en cours")
    if arq_enabled():
        job_id = await enqueue_job("job_vf_upgrade_scan", True)
        return {"queued": True, "job_id": job_id, "status": "queued"}
    return await scan_vf_upgrades(force=True)


class VfUpgradeMaintenanceRequest(BaseModel):
    action: str


@router.post("/vf-upgrades/maintenance")
async def maintain_vf_upgrades(body: VfUpgradeMaintenanceRequest, db: AsyncSession = Depends(get_db_async)):
    settings = (await db.execute(select(Settings))).scalars().first()
    if body.action == "recompute":
        rows = (
            (
                await db.execute(
                    select(VfUpgradeSuggestion).filter(VfUpgradeSuggestion.status.in_(("failed", "dismissed")))
                )
            )
            .scalars()
            .all()
        )
        for row in rows:
            row.status = "pending"
            row.failed_at = None
            row.arr_message = None
            row.retry_count = 0
        await db.commit()
        await publish("vf_upgrade.updated", {"action": "recompute", "count": len(rows)}, admin_only=True)
        return {"updated": len(rows)}
    if body.action == "purge":
        retention = max(1, settings.vf_upgrade_history_retention_days if settings else 90)
        cutoff = now_utc_naive() - timedelta(days=retention)
        rows = (
            (
                await db.execute(
                    select(VfUpgradeSuggestion).filter(
                        VfUpgradeSuggestion.status.in_(("verified", "failed", "dismissed")),
                        VfUpgradeSuggestion.updated_at < cutoff,
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in rows:
            await db.delete(row)
        await db.commit()
        await publish("vf_upgrade.updated", {"action": "purge", "count": len(rows)}, admin_only=True)
        return {"deleted": len(rows)}
    raise HTTPException(400, "Action inconnue")


class VfUpgradeScanRequest(BaseModel):
    source_type: str
    source_id: int
    scope: str  # "movie" | "season" | "episode"
    season_number: int | None = None
    episode_number: int | None = None


@router.post("/vf-upgrades/scan")
async def trigger_vf_upgrade_scan(body: VfUpgradeScanRequest, db: AsyncSession = Depends(get_db_async)):
    """Recherche immédiate pour un film / une saison / un épisode précis (bouton
    "Chercher" de la fiche média) -- bypasse le cooldown et les statuts grabbed/dismissed."""
    try:
        releases = await scan_single_target(
            db, body.source_type, body.source_id, body.scope, body.season_number, body.episode_number
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {
        "found": len(releases),
        "raw_found": getattr(releases, "raw_count", len(releases)),
        "releases": releases,
    }


class VfUpgradeGrabRequest(BaseModel):
    guid: str
    indexer_id: int
    # Un clic manuel d'un moderateur peut outrepasser les rejets de profil *arr.
    # Les protections contre un doublon actif restent, elles, toujours obligatoires.
    force: bool = False


@router.post("/vf-upgrades/{suggestion_id}/grab")
async def grab_vf_upgrade(suggestion_id: int, body: VfUpgradeGrabRequest, db: AsyncSession = Depends(get_db_async)):
    """Grab d'une release choisie dans la liste proposée -- marque la suggestion
    "grabbed", jamais re-proposée ensuite (voir vf_upgrade_scanner._skip_statuses)."""
    suggestion = (
        (await db.execute(select(VfUpgradeSuggestion).filter(VfUpgradeSuggestion.id == suggestion_id)))
        .scalars()
        .first()
    )
    if not suggestion:
        raise HTTPException(404, "Suggestion introuvable")

    model = MediaRequest if suggestion.source_type == "request" else LibraryItem
    media = (await db.execute(select(model).filter(model.id == suggestion.source_id))).scalars().first()
    if not media:
        raise HTTPException(404, "Media introuvable")

    if suggestion.status in ACTIVE_UPGRADE_STATES or suggestion.status == "verified":
        raise HTTPException(409, "Cet upgrade a deja ete accepte par *arr ou est encore en cours")

    releases = json.loads(suggestion.releases_json) if suggestion.releases_json else []
    selected = next((release for release in releases if release.get("guid") == body.guid), None)
    if not selected:
        raise HTTPException(400, "Release absente de cette suggestion")
    settings = (await db.execute(select(Settings))).scalars().first()
    if (
        not body.force
        and (not settings or settings.vf_upgrade_block_arr_rejected)
        and (selected.get("rejected") or selected.get("rejections"))
    ):
        raise HTTPException(409, "Release refusee par le profil *arr: " + ", ".join(selected.get("rejections") or []))

    arr_type = "radarr" if suggestion.scope == "movie" else "sonarr"
    inst = await _resolve_arr_instance(db, media.arr_instance_id, arr_type)
    svc = radarr if arr_type == "radarr" else sonarr
    existing_queue = await svc.get_queue(inst.url, inst.api_key)
    if any(_queue_matches(item, suggestion, media.arr_id) for item in existing_queue):
        suggestion.status = "downloading"
        suggestion.queue_confirmed_at = suggestion.queue_confirmed_at or now_utc_naive()
        suggestion.arr_message = f"Un telechargement est deja actif dans {inst.name}"
        await db.commit()
        await publish(
            "vf_upgrade.updated",
            {"id": suggestion.id, "status": suggestion.status, "action": "queue_matched"},
            admin_only=True,
        )
        raise HTTPException(409, suggestion.arr_message)
    ok, msg, stale = await svc.grab_release(inst.url, inst.api_key, body.guid, body.indexer_id)
    if not ok and stale:
        # Le resultat de recherche a expire cote *arr (voir grab_release) : on
        # considere notre propre suggestion valide jusqu'au prochain cycle de scan
        # automatique, mais un grab la relance explicitement -- une seule relance
        # silencieuse suffit a repeupler le cache *arr avant de retenter le grab.
        try:
            await scan_single_target(
                db,
                suggestion.source_type,
                suggestion.source_id,
                suggestion.scope,
                suggestion.season_number,
                suggestion.episode_number,
            )
        except ValueError as e:
            logger.warning(f"vf-upgrades grab: relance de recherche impossible ({e})")
        else:
            ok, msg, stale = await svc.grab_release(inst.url, inst.api_key, body.guid, body.indexer_id)
    if not ok:
        raise HTTPException(500, msg)

    suggestion.status = "accepted"
    suggestion.grabbed_release_guid = body.guid
    suggestion.arr_message = msg or f"Release acceptee par {inst.name}"
    suggestion.accepted_at = now_utc_naive()

    queue = await svc.get_queue(inst.url, inst.api_key)
    if any(_queue_matches(item, suggestion, media.arr_id) for item in queue):
        suggestion.status = "downloading"
        suggestion.queue_confirmed_at = now_utc_naive()
        suggestion.arr_message = f"Release acceptee par {inst.name}; telechargement confirme dans la file"

    if suggestion.source_type == "request":
        req = media
        if req.status not in (RequestStatus.available,):
            await transition_request(db, req, "submitted", source=arr_type)
            settings = (await db.execute(select(Settings))).scalars().first()
            from ..services.notification_policy import dispatch_transition_notification

            await dispatch_transition_notification(settings, req, db, "submitted")

    await db.commit()
    await publish(
        "vf_upgrade.updated",
        {
            "id": suggestion.id,
            "status": suggestion.status,
            "source_type": suggestion.source_type,
            "source_id": suggestion.source_id,
            "scope": suggestion.scope,
            "action": "grab",
        },
        admin_only=True,
    )
    return {"success": True, "accepted": True, "status": suggestion.status, "message": suggestion.arr_message}


@router.post("/vf-upgrades/{suggestion_id}/dismiss")
async def dismiss_vf_upgrade(suggestion_id: int, db: AsyncSession = Depends(get_db_async)):
    """Ignore une suggestion -- ne sera plus jamais re-proposée par le scan de fond,
    seul un nouveau clic manuel sur "Chercher" peut la faire réapparaître."""
    suggestion = (
        (await db.execute(select(VfUpgradeSuggestion).filter(VfUpgradeSuggestion.id == suggestion_id)))
        .scalars()
        .first()
    )
    if not suggestion:
        raise HTTPException(404, "Suggestion introuvable")
    suggestion.status = "dismissed"
    await db.commit()
    await publish(
        "vf_upgrade.updated",
        {
            "id": suggestion.id,
            "status": "dismissed",
            "source_type": suggestion.source_type,
            "source_id": suggestion.source_id,
            "action": "dismiss",
        },
        admin_only=True,
    )
    return {"success": True}


@router.get("/vf-upgrades/scan-status")
async def vf_upgrade_scan_status():
    return vf_upgrade_scan_state


@router.get("/vf-upgrades/scan-runs")
async def vf_upgrade_scan_runs(limit: int = Query(default=20, ge=1, le=200), db: AsyncSession = Depends(get_db_async)):
    """Historique des cycles du scanner d'ameliorations VF (voir VfUpgradeScanRun) --
    complementaire de /scan-status qui ne donne que l'etat instantane du cycle en cours."""
    rows = (
        (await db.execute(select(VfUpgradeScanRun).order_by(VfUpgradeScanRun.started_at.desc()).limit(limit)))
        .scalars()
        .all()
    )
    return {
        "runs": [
            {
                "id": row.id,
                "started_at": row.started_at.isoformat() if row.started_at else None,
                "finished_at": row.finished_at.isoformat() if row.finished_at else None,
                "status": row.status,
                "trigger": row.trigger,
                "tasks_total": row.tasks_total,
                "tasks_scanned": row.tasks_scanned,
                "suggestions_found": row.suggestions_found,
                "error": row.error,
            }
            for row in rows
        ]
    }
