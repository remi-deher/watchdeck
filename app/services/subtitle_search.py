"""Recherche de sous-titres français pour les medias en VO, a la maniere de Bazarr.

Deux moyens, au choix ou en complement :
- **Plex** (integre, sans compte supplementaire) : Plex sait chercher et telecharger des
  sous-titres a la demande (https://support.plex.tv/articles/subtitle-search/). Watchdeck
  le lui demande pour chaque film ou episode sans piste audio ni sous-titre francais.
- **Bazarr** (instance de type `bazarr` dans Connexions) : on lui demande de chercher les
  sous-titres manquants du film ou de la serie, selon ses propres fournisseurs et profils.

Le choix se fait par `Settings.subtitle_search_provider` : `auto` passe par Bazarr quand il
est configure et connait le media (identifiant Radarr/Sonarr), sinon par Plex.

Un passage automatique (tache planifiee `subtitle-search`) reprend, par lots, les medias
dont `sub_fr_status` vaut `absent` ou `no_track`, en espacant les nouvelles tentatives
d'un meme media (`RETRY_AFTER`). L'etat `sub_fr_status` lui-meme n'est jamais ecrit ici :
le prochain scan VF le recalcule a partir des pistes reelles.
"""

import asyncio
import logging
from datetime import timedelta
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import AsyncSessionLocal
from ..models import ArrInstance, LibraryItem, Settings
from ..utils import now_utc_naive
from . import bazarr

logger = logging.getLogger(__name__)

MISSING_STATUSES = ("absent", "no_track")
PROVIDERS = ("auto", "plex", "bazarr")
RETRY_AFTER = timedelta(days=7)
# Plafond d'episodes traites par serie et par passage : chaque recherche Plex interroge
# un fournisseur externe, une serie de 300 episodes ne doit pas monopoliser un lot.
MAX_EPISODES_PER_SHOW = 40


def _wants_subtitle(video) -> bool:
    """Ni piste audio francaise, ni sous-titre francais complet (un force ne suffit pas)."""
    from .audio_analyzer import get_audio_info

    has_fr, _tracks, subtitles = get_audio_info(video)
    if has_fr:
        return False
    return not any(sub.get("is_fr") and not sub.get("is_forced") for sub in subtitles)


def _download_best(video, language: str) -> str:
    """Cherche via Plex et telecharge le meilleur resultat ; renvoie l'issue."""
    try:
        # forced=3 : sous-titres complets uniquement ; hearingImpaired=0 : SDH evites
        # quand une version classique existe.
        results = video.searchSubtitles(language=language, hearingImpaired=0, forced=3)
    except Exception as exc:
        logger.warning("Recherche de sous-titres Plex en echec pour %r: %s", getattr(video, "title", "?"), exc)
        return "error"
    if not results:
        return "not_found"
    try:
        video.downloadSubtitles(results[0])
    except Exception as exc:
        logger.warning("Telechargement de sous-titres Plex en echec pour %r: %s", getattr(video, "title", "?"), exc)
        return "error"
    return "downloaded"


def search_plex_subtitles_blocking(
    plex_url: str,
    plex_token: str,
    library_names: list[str],
    *,
    title: str,
    year: Optional[int] = None,
    media_type: str = "movie",
    tmdb_id: Optional[str] = None,
    tvdb_id: Optional[str] = None,
    imdb_id: Optional[str] = None,
    plex_guid: Optional[str] = None,
    language: str = "fr",
    max_episodes: int = MAX_EPISODES_PER_SHOW,
) -> dict[str, Any]:
    """Demande a Plex des sous-titres pour le film, ou les episodes d'une serie, qui en manquent."""
    from .audio_analyzer import _reload, bulk_reload_episodes
    from .plex_finder import connect, find_item_in_libraries

    try:
        plex = connect(plex_url, plex_token)
    except Exception as exc:
        return {"success": False, "error": f"Connexion Plex impossible : {exc}"}
    item = find_item_in_libraries(plex, library_names, title, year, tmdb_id, tvdb_id, imdb_id, plex_guid)
    if item is None:
        return {"success": False, "error": f"Média '{title}' introuvable dans Plex"}

    if media_type == "show" or getattr(item, "type", "") == "show":
        try:
            stubs = item.episodes()
        except Exception as exc:
            return {"success": False, "error": f"Episodes illisibles : {exc}"}
        reloaded = bulk_reload_episodes(stubs)
        videos = []
        for stub in stubs:
            episode = reloaded.get(getattr(stub, "ratingKey", None))
            if episode is None:
                _reload(stub, "episode")
                episode = stub
            videos.append(episode)
    else:
        _reload(item, "film")
        videos = [item]

    targets = [video for video in videos if _wants_subtitle(video)]
    counts = {"downloaded": 0, "not_found": 0, "error": 0}
    for video in targets[:max_episodes]:
        counts[_download_best(video, language)] += 1
    return {
        "success": True,
        "provider": "plex",
        "targets": len(targets),
        "searched": min(len(targets), max_episodes),
        **counts,
    }


async def bazarr_instance(db: AsyncSession) -> Optional[ArrInstance]:
    return (
        (
            await db.execute(
                select(ArrInstance)
                .filter(ArrInstance.arr_type == "bazarr", ArrInstance.enabled)
                .order_by(ArrInstance.is_default.desc(), ArrInstance.id.asc())
            )
        )
        .scalars()
        .first()
    )


async def _bazarr_arr_id(db: AsyncSession, item: LibraryItem) -> Optional[int]:
    """Identifiant Radarr/Sonarr du media, s'il vient bien d'une instance du bon type."""
    if not item.arr_id or not item.arr_instance_id:
        return None
    instance = await db.get(ArrInstance, item.arr_instance_id)
    expected = "radarr" if item.media_type == "movie" else "sonarr"
    if instance is None or instance.arr_type != expected:
        return None
    return int(item.arr_id)


def _summary(result: dict) -> str:
    if not result.get("success"):
        return result.get("error") or "Recherche impossible"
    if result.get("provider") == "bazarr":
        return result.get("message") or "Recherche lancée dans Bazarr"
    if not result.get("targets"):
        return "Rien à chercher : une piste ou un sous-titre français est déjà présent."
    found = result.get("downloaded", 0)
    if found:
        return f"{found} sous-titre(s) demandé(s) à Plex ; ils apparaîtront après son analyse."
    if result.get("error"):
        return "Plex n'a pas pu chercher de sous-titres (voir les journaux)."
    return "Aucun sous-titre français trouvé par Plex pour l'instant."


def _outcome(result: dict) -> str:
    if not result.get("success"):
        return "error"
    if result.get("provider") == "bazarr" or result.get("downloaded"):
        return "requested"
    if not result.get("targets"):
        return "nothing_to_do"
    return "error" if result.get("error") and not result.get("not_found") else "not_found"


async def search_for_item(
    db: AsyncSession,
    item: LibraryItem,
    settings: Optional[Settings] = None,
    provider: Optional[str] = None,
) -> dict[str, Any]:
    """Cherche des sous-titres francais pour un media de la bibliotheque et note la tentative."""
    from . import plex_servers

    if settings is None:
        settings = (await db.execute(select(Settings))).scalars().first()
    provider = provider or getattr(settings, "subtitle_search_provider", None) or "auto"
    if provider not in PROVIDERS:
        provider = "auto"

    result: dict[str, Any] | None = None
    if provider in ("auto", "bazarr"):
        instance = await bazarr_instance(db)
        arr_id = await _bazarr_arr_id(db, item) if instance else None
        if instance and arr_id:
            ok, message = await bazarr.search_missing(instance.url, instance.api_key, item.media_type, arr_id)
            result = {"success": ok, "provider": "bazarr", "message": message, "error": None if ok else message}
        elif provider == "bazarr":
            reason = (
                "Aucune instance Bazarr active."
                if not instance
                else "Ce média n'est pas rattaché à Radarr/Sonarr : Bazarr ne peut pas le retrouver."
            )
            result = {"success": False, "provider": "bazarr", "error": reason}
        elif instance and not arr_id:
            # Bazarr ne connait que les medias de Radarr/Sonarr : Plex prend le relais.
            logger.info("Sous-titres : %r hors Radarr/Sonarr, recherche via Plex", item.title)

    if result is None:
        conn = await plex_servers.connection_for_item(db, item.id, settings)
        if conn is None:
            result = {"success": False, "provider": "plex", "error": "Plex non configuré"}
        else:
            result = await asyncio.to_thread(
                search_plex_subtitles_blocking,
                conn.url,
                conn.token,
                [lib["name"] if isinstance(lib, dict) else str(lib) for lib in conn.libraries],
                title=item.title,
                year=item.year,
                media_type=item.media_type,
                tmdb_id=item.tmdb_id,
                tvdb_id=item.tvdb_id,
                imdb_id=item.imdb_id,
                plex_guid=item.plex_guid,
            )

    item.subtitle_searched_at = now_utc_naive()
    item.subtitle_search_result = _outcome(result)
    await db.commit()
    return {**result, "item_id": item.id, "outcome": item.subtitle_search_result, "message": _summary(result)}


def _missing_filter(now):
    return (
        LibraryItem.media_type.in_(("movie", "show")),
        LibraryItem.sub_fr_status.in_(MISSING_STATUSES),
        or_(LibraryItem.has_vf.is_(None), LibraryItem.has_vf.is_(False)),
        or_(LibraryItem.subtitle_searched_at.is_(None), LibraryItem.subtitle_searched_at < now - RETRY_AFTER),
    )


async def count_missing(db: AsyncSession) -> dict[str, int]:
    from sqlalchemy import func

    now = now_utc_naive()
    total = (
        await db.execute(
            select(func.count())
            .select_from(LibraryItem)
            .filter(
                LibraryItem.media_type.in_(("movie", "show")),
                LibraryItem.sub_fr_status.in_(MISSING_STATUSES),
                or_(LibraryItem.has_vf.is_(None), LibraryItem.has_vf.is_(False)),
            )
        )
    ).scalar() or 0
    due = (await db.execute(select(func.count()).select_from(LibraryItem).filter(*_missing_filter(now)))).scalar() or 0
    return {"missing": int(total), "due": int(due)}


async def search_missing_batch(limit: Optional[int] = None) -> dict[str, Any]:
    """Un lot de la tache planifiee : les medias sans sous-titres FR, jamais cherches d'abord."""
    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        size = limit or getattr(settings, "subtitle_search_batch_size", None) or 20
        now = now_utc_naive()
        items = (
            (
                await db.execute(
                    select(LibraryItem)
                    .filter(*_missing_filter(now))
                    .order_by(LibraryItem.subtitle_searched_at.asc().nulls_first(), LibraryItem.id.asc())
                    .limit(size)
                )
            )
            .scalars()
            .all()
        )
        outcomes: dict[str, int] = {}
        for item in items:
            try:
                result = await search_for_item(db, item, settings)
                outcome = result["outcome"]
            except Exception as exc:
                logger.warning("Recherche de sous-titres en echec pour %r: %s", item.title, exc)
                await db.rollback()
                outcome = "error"
            outcomes[outcome] = outcomes.get(outcome, 0) + 1
        return {"processed": len(items), "outcomes": outcomes}
