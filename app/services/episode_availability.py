"""Synchronisation en arrière-plan de la disponibilité Sonarr par épisode.

Alimente `EpisodeAvailability` (fichier présent + date de diffusion) pour que la
fiche détail lise cet état en base au lieu d'appeler Sonarr en direct à chaque
affichage (voir `vff_scanner.py`/`VfEpisodeStatus` pour le même principe côté VF).
Seerr ne fait jamais d'appel *arr live dans le chemin de la requête -- sa
disponibilité vient toujours d'une lecture DB locale, tenue à jour par ses propres
jobs de fond ("Sonarr Scan", "Media Availability Sync").
"""

import asyncio
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import AsyncSessionLocal
from ..models import ArrInstance, EpisodeAvailability, LibraryItem, MediaRequest, Settings
from ..utils import now_utc, now_utc_naive
from .sonarr import get_episodes, lookup_series

logger = logging.getLogger(__name__)

# Appels Sonarr simultanes, et taille des lots traites avant ecriture en base.
_SYNC_CONCURRENCY = 8
_SYNC_BATCH = 50

episode_availability_state: dict = {
    "status": "idle",
    "started_at": None,
    "finished_at": None,
    "items_scanned": 0,
    "total_items": 0,
    "error": None,
}


async def _resolve_sonarr_instance(db: AsyncSession, instance_id: int | None) -> ArrInstance | None:
    """Version tolérante de `arr_shared._resolve_arr_instance` (renvoie None plutôt que de
    lever une HTTPException) : ce module tourne en tâche de fond, une instance
    introuvable pour une série ne doit jamais faire échouer tout le cycle."""
    if instance_id is not None:
        return (await db.execute(
            select(ArrInstance).filter(ArrInstance.id == instance_id, ArrInstance.arr_type == "sonarr")
        )).scalars().first()
    inst = (await db.execute(
        select(ArrInstance).filter(ArrInstance.is_default, ArrInstance.arr_type == "sonarr")
    )).scalars().first()
    if inst:
        return inst
    settings = (await db.execute(select(Settings))).scalars().first()
    if settings and settings.sonarr_url:
        return ArrInstance(url=settings.sonarr_url, api_key=settings.sonarr_api_key, root_folder=settings.sonarr_root_folder)
    return None


async def _fetch_show_episodes(inst: ArrInstance, req) -> list[dict] | None:
    series_id = req.arr_id if getattr(req, "source", None) != "seer" else None
    data = None
    if req.tvdb_id:
        # `arr_id` est transmis en plus du tvdb_id : quand il est connu, `lookup_series`
        # interroge directement /series/{id} et n'a plus besoin du catalogue complet
        # (cette fonction est appelée pour CHAQUE série du cycle, voir sync_all).
        data = await lookup_series(inst.url, inst.api_key, arr_id=series_id, tvdb_id=req.tvdb_id)
        series_id = data.get("id") if data else series_id
    if not series_id:
        data = await lookup_series(inst.url, inst.api_key, arr_id=req.arr_id)
        series_id = data.get("id") if data else None
    if not series_id:
        return None
    return await get_episodes(inst.url, inst.api_key, series_id)


def _episodes_to_seasons(episodes: list[dict]) -> dict[int, dict[int, dict]]:
    """Réduit une liste d'épisodes Sonarr à {saison: {épisode: {has_file, air_date_utc}}}.

    Purement calculatoire (ni réseau ni base) : c'est ce qui permet à `sync_all` de mener
    les appels Sonarr en parallèle puis d'écrire en base séquentiellement.
    """
    seasons: dict[int, dict[int, dict]] = {}
    for ep in episodes:
        if not ep.get("monitored", True):
            continue
        sn, en = ep.get("seasonNumber"), ep.get("episodeNumber")
        if sn is None or en is None or sn == 0:
            continue
        seasons.setdefault(sn, {})[en] = {
            "has_file": bool(ep.get("hasFile")),
            "air_date_utc": ep.get("airDateUtc") or ep.get("airDate"),
        }
    return seasons


async def sync_episode_availability_for_show(db: AsyncSession, inst: ArrInstance, req) -> dict[int, dict[int, dict]]:
    """Récupère les épisodes Sonarr d'une série et upsert `EpisodeAvailability`.

    Réutilisé à la fois par le job planifié (toutes les séries) et par le paramètre
    `force=true` de `GET .../episodes-availability` (resynchronisation immédiate d'une
    seule série, pour le bouton "Actualiser").
    """
    episodes = await _fetch_show_episodes(inst, req)
    if episodes is None:
        return {}
    seasons = _episodes_to_seasons(episodes)
    await _upsert_availability(db, req, seasons)
    return seasons


async def _upsert_availability(db: AsyncSession, req, seasons: dict[int, dict[int, dict]]) -> None:
    """Écrit en base la disponibilité par épisode d'une série (partie SQL pure)."""
    source_type = "request" if isinstance(req, MediaRequest) else "library_item"
    now = now_utc_naive()
    existing = {
        (r.season_number, r.episode_number): r
        for r in (await db.execute(select(EpisodeAvailability).filter(
            EpisodeAvailability.source_type == source_type, EpisodeAvailability.source_id == req.id
        ))).scalars().all()
    }
    for sn, eps in seasons.items():
        for en, info in eps.items():
            row = existing.get((sn, en))
            if row:
                if row.has_file != info["has_file"] or row.air_date_utc != info["air_date_utc"]:
                    row.has_file = info["has_file"]
                    row.air_date_utc = info["air_date_utc"]
                row.checked_at = now
            else:
                db.add(EpisodeAvailability(
                    source_type=source_type, source_id=req.id, season_number=sn, episode_number=en,
                    has_file=info["has_file"], air_date_utc=info["air_date_utc"], checked_at=now,
                ))


async def check_episode_availability() -> None:
    """Tâche planifiée : resynchronise la disponibilité Sonarr de toutes les séries
    suivies (MediaRequest + LibraryItem), pour que l'affichage normal de la fiche
    détail n'ait plus jamais à interroger Sonarr en direct."""
    if episode_availability_state["status"] == "running":
        logger.info("Disponibilité épisodes : un scan est déjà en cours, skip")
        return

    episode_availability_state.update(
        status="running", started_at=now_utc().isoformat(), finished_at=None,
        items_scanned=0, total_items=0, error=None,
    )

    db: AsyncSession = AsyncSessionLocal()
    try:
        requests_q = (await db.execute(
            select(MediaRequest).filter(MediaRequest.media_type == "show")
        )).scalars().all()
        library_q = (await db.execute(
            select(LibraryItem).filter(LibraryItem.media_type == "show")
        )).scalars().all()
        candidates = [r for r in requests_q if r.arr_id or r.tvdb_id] + [r for r in library_q if r.arr_id or r.tvdb_id]
        episode_availability_state["total_items"] = len(candidates)
        if not candidates:
            episode_availability_state["status"] = "idle"
            episode_availability_state["finished_at"] = now_utc().isoformat()
            return

        # Résolution des instances d'abord (accès base, séquentiel), puis traitement par
        # lots : les appels Sonarr d'un lot partent en parallèle, et seules les écritures
        # en base restent séquentielles — l'AsyncSession n'est jamais partagée entre
        # coroutines. Auparavant chaque série attendait la précédente, soit ~770 allers-
        # retours strictement en file sur une bibliothèque de cette taille.
        instances: dict[int | None, ArrInstance | None] = {}
        pairs: list[tuple[Any, ArrInstance]] = []
        for req in candidates:
            if req.arr_instance_id not in instances:
                instances[req.arr_instance_id] = await _resolve_sonarr_instance(db, req.arr_instance_id)
            inst = instances[req.arr_instance_id]
            if inst is None:
                episode_availability_state["items_scanned"] += 1
                continue
            pairs.append((req, inst))

        semaphore = asyncio.Semaphore(_SYNC_CONCURRENCY)

        async def _fetch(req, inst):
            async with semaphore:
                try:
                    return req, await _fetch_show_episodes(inst, req)
                except Exception as e:
                    logger.warning(f"Disponibilité épisodes : échec pour '{req.title}': {e}")
                    return req, None

        # Lots bornés plutôt qu'un unique gather sur toute la bibliothèque : la mémoire
        # occupée par les listes d'épisodes reste plafonnée et la progression avance
        # régulièrement au lieu de sauter à la fin.
        for start in range(0, len(pairs), _SYNC_BATCH):
            batch = pairs[start : start + _SYNC_BATCH]
            for req, episodes in await asyncio.gather(*(_fetch(r, i) for r, i in batch)):
                try:
                    if episodes is not None:
                        await _upsert_availability(db, req, _episodes_to_seasons(episodes))
                except Exception as e:
                    logger.warning(f"Disponibilité épisodes : écriture échouée pour '{req.title}': {e}")
                finally:
                    episode_availability_state["items_scanned"] += 1
        await db.commit()
        episode_availability_state["status"] = "idle"
        episode_availability_state["finished_at"] = now_utc().isoformat()
    except Exception as e:
        episode_availability_state["status"] = "failed"
        episode_availability_state["error"] = str(e)
        logger.error(f"Disponibilité épisodes : échec global: {e}")
    finally:
        await db.close()
