"""Recherche interactive de releases via Sonarr/Radarr, avec mise en avant des versions francaises."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..cache import cache
from ..database import AsyncSessionLocal, get_db_async
from ..dependencies import require_admin
from ..models import LibraryItem, MediaRequest, RequestStatus, Settings, VfUpgradeSuggestion
from ..realtime import publish
from ..services import radarr, sonarr
from ..services.release_matching import release_is_french as _release_is_french
from ..services.release_matching import release_matches_target as _release_matches_target
from ..services.request_lifecycle import transition_request
from ..utils import now_utc_naive
from .arr_shared import _resolve_arr_instance

router = APIRouter(prefix="/api", tags=["arr"], dependencies=[Depends(require_admin)])
logger = logging.getLogger(__name__)

_RELEASES_SOFT_TTL = 20

_RELEASES_HARD_TTL = 120


async def _resolve_release_target(
    db: AsyncSession,
    media_type: str,
    arr_id: int | None,
    instance_id: int | None,
    request_id: int | None,
    source_type: str | None = None,
    source_id: int | None = None,
) -> tuple[int, int | None]:
    """Resolve the real Sonarr/Radarr id used by an interactive search.

    ``MediaRequest.arr_id`` stores the Seer request id for Seer-originated rows.  It
    must therefore never be sent to Sonarr/Radarr.  Resolve those rows through their
    stable external ids instead, while preserving the legacy explicit ``arr_id`` API.
    """
    if source_id is not None:
        model = MediaRequest if source_type == "request" else LibraryItem if source_type == "library_item" else None
        if model is None:
            raise HTTPException(400, "source_type invalide")
        media = await db.get(model, source_id)
        if not media:
            raise HTTPException(404, "Média introuvable")
        expected_type = "movie" if media_type == "movie" else "show"
        if media.media_type != expected_type:
            raise HTTPException(400, "Type de média incohérent")
        arr_type = "radarr" if media_type == "movie" else "sonarr"
        inst = await _resolve_arr_instance(db, media.arr_instance_id or instance_id, arr_type)
        if media.arr_id and not (source_type == "request" and getattr(media, "source", None) == "seer"):
            return int(media.arr_id), inst.id
        if source_type == "request" and getattr(media, "source", None) == "seer":
            if media_type == "movie":
                remote = await radarr.lookup_movie(inst.url, inst.api_key, tmdb_id=media.tmdb_id, imdb_id=media.imdb_id)
            else:
                remote = await sonarr.lookup_series(
                    inst.url, inst.api_key, tvdb_id=media.tvdb_id, tmdb_id=media.tmdb_id, imdb_id=media.imdb_id
                )
            if remote and remote.get("id"):
                return int(remote["id"]), inst.id
        raise HTTPException(404, f"Média non lié à {arr_type.capitalize()}")

    if request_id is None:
        if arr_id is None:
            raise HTTPException(400, "arr_id ou request_id requis")
        return arr_id, instance_id

    req = await db.get(MediaRequest, request_id)
    if not req:
        raise HTTPException(404, "Demande introuvable")
    if req.media_type != media_type:
        raise HTTPException(400, "Type de média incohérent avec la demande")

    arr_type = "radarr" if media_type == "movie" else "sonarr"
    resolved_instance_id = req.arr_instance_id or instance_id
    inst = await _resolve_arr_instance(db, resolved_instance_id, arr_type)
    if req.source != "seer" and req.arr_id:
        return req.arr_id, inst.id

    if media_type == "movie":
        item = await radarr.lookup_movie(inst.url, inst.api_key, tmdb_id=req.tmdb_id, imdb_id=req.imdb_id)
    else:
        item = await sonarr.lookup_series(
            inst.url,
            inst.api_key,
            tvdb_id=req.tvdb_id,
            tmdb_id=req.tmdb_id,
            imdb_id=req.imdb_id,
        )
    if not item or not item.get("id"):
        raise HTTPException(404, f"Média introuvable dans {arr_type.capitalize()}")
    return int(item["id"]), inst.id


async def _compute_releases(
    db: AsyncSession,
    media_type: str,
    arr_id: int,
    instance_id: Optional[int],
    episode_id: Optional[int],
    season_number: Optional[int],
    episode_number: Optional[int],
    prefer_french: bool = True,
) -> list[dict]:
    arr_type = "radarr" if media_type == "movie" else "sonarr"
    inst = await _resolve_arr_instance(db, instance_id, arr_type)
    if media_type == "movie":
        releases = await radarr.get_releases(inst.url, inst.api_key, arr_id)
    else:
        if episode_id is None and season_number is not None and episode_number is not None:
            episodes = await sonarr.get_episodes(inst.url, inst.api_key, arr_id)
            episode_id = next(
                (
                    ep.get("id")
                    for ep in episodes
                    if ep.get("seasonNumber") == season_number and ep.get("episodeNumber") == episode_number
                ),
                None,
            )
            if episode_id is None:
                raise HTTPException(404, "Épisode introuvable dans Sonarr")
        releases = await sonarr.get_releases(
            inst.url,
            inst.api_key,
            series_id=arr_id,
            episode_id=episode_id,
            season_number=season_number,
        )

    scope = (
        "movie"
        if media_type == "movie"
        else ("episode" if episode_number is not None else ("season" if season_number is not None else "show"))
    )
    for rel in releases:
        rel["is_french"] = _release_is_french(rel)
        rel["arr_instance_id"] = inst.id
        matches, reason = _release_matches_target(rel.get("title") or "", scope, season_number, episode_number)
        rel["is_target_match"] = matches
        if not matches and reason:
            rel["rejected"] = True
            rejections = list(rel.get("rejections") or [])
            if reason not in rejections:
                rejections.append(reason)
            rel["rejections"] = rejections
    if prefer_french:
        releases.sort(
            key=lambda r: (
                r.get("is_target_match", True),
                r["is_french"],
                r.get("custom_format_score", 0),
                r.get("seeders", 0),
            ),
            reverse=True,
        )
    return releases


class ArrGrabRequest(BaseModel):
    media_type: str  # "movie" | "show"
    guid: str
    indexer_id: int
    instance_id: Optional[int] = None
    request_id: Optional[int] = None
    source_type: Optional[str] = None
    source_id: Optional[int] = None
    scope: Optional[str] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None


@router.get("/arr/releases")
async def arr_interactive_releases(
    media_type: str,
    arr_id: Optional[int] = None,
    instance_id: Optional[int] = None,
    episode_id: Optional[int] = None,
    season_number: Optional[int] = None,
    episode_number: Optional[int] = None,
    request_id: Optional[int] = None,
    source_type: Optional[str] = None,
    source_id: Optional[int] = None,
    prefer_french: bool = True,
    db: AsyncSession = Depends(get_db_async),
):
    """Recherche interactive Sonarr/Radarr : releases déjà scorées (qualité + custom
    format + langue) avec marquage VF.

    Mis en cache tres court (stale-while-revalidate, voir cache.py) : evite de
    re-taper l'indexeur a chaque clic/rechargement rapproche sur la meme recherche,
    sans jamais retarder un premier lancement (recalcul synchrone si rien en cache).
    """
    arr_id, instance_id = await _resolve_release_target(
        db, media_type, arr_id, instance_id, request_id, source_type, source_id
    )
    args = (media_type, arr_id, instance_id, episode_id, season_number, episode_number, prefer_french)
    key = f"watchdeck:releases:{media_type}:{arr_id}:{instance_id}:{episode_id}:{season_number}:{episode_number}:{prefer_french}"

    async def _background():
        async with AsyncSessionLocal() as fresh_db:
            return await _compute_releases(fresh_db, *args)

    return await cache.get_or_refresh(
        key,
        _RELEASES_SOFT_TTL,
        _RELEASES_HARD_TTL,
        compute_sync=lambda: _compute_releases(db, *args),
        compute_background=_background,
    )


@router.get("/arr/root-folder")
async def arr_root_folder(
    media_type: str,
    arr_id: Optional[int] = None,
    instance_id: Optional[int] = None,
    request_id: Optional[int] = None,
    source_type: Optional[str] = None,
    source_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db_async),
):
    """Dossier racine reel du media cote Sonarr/Radarr (info seule, pas de selecteur).

    Affiche sur la recherche de release pour verifier ou le fichier va atterrir --
    endpoint dedie plutot que d'alourdir /arr/releases (deja mis en cache et
    consomme telle quelle comme liste par plusieurs vues).
    """
    resolved_arr_id, resolved_instance_id = await _resolve_release_target(
        db, media_type, arr_id, instance_id, request_id, source_type, source_id
    )
    arr_type = "radarr" if media_type == "movie" else "sonarr"
    inst = await _resolve_arr_instance(db, resolved_instance_id, arr_type)
    media = (
        await radarr.get_movie_by_id(inst.url, inst.api_key, resolved_arr_id)
        if media_type == "movie"
        else await sonarr.get_series_by_id(inst.url, inst.api_key, resolved_arr_id)
    )
    return {"root_folder_path": (media or {}).get("rootFolderPath")}


@router.post("/arr/grab")
async def arr_grab_release(body: ArrGrabRequest, db: AsyncSession = Depends(get_db_async)):
    """Grab d'une release via Sonarr/Radarr."""
    arr_type = "radarr" if body.media_type == "movie" else "sonarr"
    inst = await _resolve_arr_instance(db, body.instance_id, arr_type)
    svc = radarr if body.media_type == "movie" else sonarr
    # Contrairement a /vf-upgrades/{id}/grab, cet endpoint ne recoit pas l'id *arr du
    # media (ArrGrabRequest n'a que guid/indexer_id) : pas moyen de relancer la
    # recherche pour repeupler le cache *arr en cas de guid expire (stale=True), donc
    # pas de retry ici -- seul le message d'erreur reste ameliore par grab_release.
    ok, msg, _stale = await svc.grab_release(inst.url, inst.api_key, body.guid, body.indexer_id)
    if not ok:
        raise HTTPException(500, msg)
    from .arr_shared import invalidate_arr_wanted_cache

    await invalidate_arr_wanted_cache(arr_type)

    # Synchronisation immédiate avec les suggestions VF associées
    src_type = body.source_type or ("request" if body.request_id else None)
    src_id = body.source_id or body.request_id
    if src_type and src_id:
        stmt = select(VfUpgradeSuggestion).filter(
            VfUpgradeSuggestion.source_type == src_type,
            VfUpgradeSuggestion.source_id == src_id,
        )
        if body.scope:
            stmt = stmt.filter(VfUpgradeSuggestion.scope == body.scope)
        if body.season_number is not None:
            stmt = stmt.filter(VfUpgradeSuggestion.season_number == body.season_number)
        if body.episode_number is not None:
            stmt = stmt.filter(VfUpgradeSuggestion.episode_number == body.episode_number)

        suggestions = (await db.execute(stmt)).scalars().all()
        for sug in suggestions:
            if sug.status not in ("verified",):
                sug.status = "accepted"
                sug.grabbed_release_guid = body.guid
                sug.arr_message = msg or f"Release acceptée par {inst.name}"
                sug.accepted_at = now_utc_naive()
                await publish(
                    "vf_upgrade.updated",
                    {
                        "id": sug.id,
                        "status": sug.status,
                        "source_type": sug.source_type,
                        "source_id": sug.source_id,
                        "scope": sug.scope,
                        "action": "grab",
                    },
                    admin_only=True,
                )

    if body.request_id:
        req = (await db.execute(select(MediaRequest).filter(MediaRequest.id == body.request_id))).scalars().first()
        if req and req.status not in (RequestStatus.available,):
            await transition_request(db, req, "submitted", source=arr_type)
            await db.commit()
            from ..services.notification_policy import dispatch_transition_notification

            settings = (await db.execute(select(Settings))).scalars().first()
            await dispatch_transition_notification(settings, req, db, "submitted")
        else:
            await db.commit()
    else:
        await db.commit()
    return {"success": True, "message": msg}
