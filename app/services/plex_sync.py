import asyncio
import logging
import re
from datetime import timedelta
from typing import Any, Optional

from sqlalchemy import delete, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import AsyncSessionLocal
from ..models import ArrInstance, LibraryItem, MediaRequest, RequestStatus, Settings
from ..utils import now_utc, now_utc_naive
from . import plex_finder
from .arr_common import normalize_title
from .media_matching import find_library_item_by_ids as _find_library_item_by_ids
from .media_matching import link_request_to_library_item as _link_request_to_library_item
from .radarr import get_all_movies
from .sonarr import get_all_series
from .vff_scanner import _invalidate_vf_cache, _parse_vff_libraries

logger = logging.getLogger(__name__)

plex_sync_state: dict[str, Any] = {
    "status": "idle",  # "idle" | "running" | "failed"
    "started_at": None,
    "finished_at": None,
    "items_synced": 0,
    "total_items": 0,
    "error": None,
}

# plex_sync_state est partage entre le scan complet (potentiellement long) et le scan
# incremental (rapide) pour qu'ils ne tournent jamais en meme temps. Filet de securite
# contre un run reellement bloque (process tue en plein scan) qui laisserait le flag a
# "running" pour toujours et empecherait tout futur scan, complet ou incremental.
_STALE_RUN_THRESHOLD = timedelta(minutes=45)


def _reset_if_stale() -> None:
    if plex_sync_state["status"] != "running" or not plex_sync_state["started_at"]:
        return
    from datetime import datetime

    started = datetime.fromisoformat(plex_sync_state["started_at"])
    if now_utc() - started > _STALE_RUN_THRESHOLD:
        logger.warning(
            "Plex Sync : run precedent bloque depuis plus de %s min, remise a idle",
            _STALE_RUN_THRESHOLD.total_seconds() // 60,
        )
        plex_sync_state["status"] = "idle"
        plex_sync_state["error"] = "Run precedent interrompu (timeout)"


async def _find_library_item(db: AsyncSession, item: dict) -> "LibraryItem | None":
    """Cherche un LibraryItem déjà en base correspondant à un média Plex synchronisé."""
    return await _find_library_item_by_ids(
        db,
        item["plex_guid"],
        item["tmdb_id"],
        item["tvdb_id"],
        item["imdb_id"],
        item["title"],
        item["year"],
        item["media_type"],
    )


async def _integrate_plex_items(plex_items: list[dict], arr_lookup: dict) -> tuple[int, set[str]]:
    """Intègre les médias Plex en base (insert/mise à jour).

    Utilise une session async dédiée et des commits par lots de 200 éléments pour
    borner la transaction sans bloquer la boucle asyncio.
    Retourne (nombre de nouveaux éléments ajoutés, ensemble des plex_guid vus).
    """
    db: AsyncSession = AsyncSessionLocal()
    now = now_utc_naive()
    added_count = 0
    seen_guids: set[str] = set()
    try:
        for i, item in enumerate(plex_items, 1):
            lib_item = await _find_library_item(db, item)

            arr_match = None
            if item["media_type"] == "movie":
                if item["tmdb_id"] and ("movie", "tmdb", item["tmdb_id"]) in arr_lookup:
                    arr_match = arr_lookup[("movie", "tmdb", item["tmdb_id"])]
                elif item["imdb_id"] and ("movie", "imdb", item["imdb_id"]) in arr_lookup:
                    arr_match = arr_lookup[("movie", "imdb", item["imdb_id"])]
                elif item["year"] is not None:
                    arr_match = arr_lookup.get(("movie", "title", normalize_title(item["title"]), item["year"]))
            elif item["media_type"] == "show":
                if item["tvdb_id"] and ("show", "tvdb", item["tvdb_id"]) in arr_lookup:
                    arr_match = arr_lookup[("show", "tvdb", item["tvdb_id"])]
                elif item["tmdb_id"] and ("show", "tmdb", item["tmdb_id"]) in arr_lookup:
                    arr_match = arr_lookup[("show", "tmdb", item["tmdb_id"])]
                elif item["imdb_id"] and ("show", "imdb", item["imdb_id"]) in arr_lookup:
                    arr_match = arr_lookup[("show", "imdb", item["imdb_id"])]
            # media_type == "artist" (musique) : aucun equivalent Sonarr/Radarr, jamais de match.

            if item["plex_guid"]:
                seen_guids.add(item["plex_guid"])
            arr_instance_id = arr_match[0] if arr_match else None
            arr_id = arr_match[1] if arr_match else None
            arr_slug = arr_match[2] if arr_match else None
            arr_tmdb_id = arr_match[3] if arr_match else None
            arr_imdb_id = arr_match[4] if arr_match else None

            added_date = item["added_at"]
            if added_date and added_date.tzinfo:
                added_date = added_date.replace(tzinfo=None)

            if lib_item is None:
                db.add(
                    LibraryItem(
                        title=item["title"],
                        year=item["year"],
                        media_type=item["media_type"],
                        tmdb_id=arr_tmdb_id or item["tmdb_id"],
                        tvdb_id=item["tvdb_id"],
                        imdb_id=arr_imdb_id or item["imdb_id"],
                        plex_guid=item["plex_guid"],
                        poster_url=item["poster_url"],
                        art_url=item.get("art_url"),
                        genres=item.get("genres"),
                        overview=item["overview"],
                        added_at=added_date,
                        arr_instance_id=arr_instance_id,
                        arr_id=arr_id,
                        arr_slug=arr_slug,
                        has_vf=None,
                        audio_codec=item.get("audio_codec"),
                        audio_bitrate=item.get("audio_bitrate"),
                        audio_sample_rate=item.get("audio_sample_rate"),
                        audio_channels=item.get("audio_channels"),
                        duration_ms=item.get("duration_ms"),
                        created_at=now,
                        updated_at=now,
                    )
                )
                added_count += 1
            else:
                # Plex fait foi pour les metadonnees descriptives : un renommage manuel
                # dans Plex (ex: retrait d'un suffixe "(VOSTFR)" apres remplacement du
                # fichier VO par le VF) doit se refleter au sync suivant, pas rester fige
                # sur ce qui a ete capture lors de la toute premiere integration.
                if item["title"]:
                    lib_item.title = item["title"]
                if item["year"] is not None:
                    lib_item.year = item["year"]
                if item["overview"]:
                    lib_item.overview = item["overview"]
                if item.get("genres"):
                    lib_item.genres = item["genres"]
                if not lib_item.plex_guid and item["plex_guid"]:
                    lib_item.plex_guid = item["plex_guid"]
                if not lib_item.poster_url and item["poster_url"]:
                    lib_item.poster_url = item["poster_url"]
                if not lib_item.art_url and item.get("art_url"):
                    lib_item.art_url = item["art_url"]
                if not lib_item.arr_instance_id and arr_match:
                    lib_item.arr_instance_id = arr_instance_id
                    lib_item.arr_id = arr_id
                    lib_item.arr_slug = arr_slug
                # Radarr is authoritative once a unique catalogue match has been made.
                # This repairs Plex agents returning no GUIDs (local://...) as well as
                # stale/wrong external IDs without letting a fuzzy title match through.
                if item["media_type"] == "movie" and arr_match:
                    lib_item.tmdb_id = arr_tmdb_id or lib_item.tmdb_id
                    lib_item.imdb_id = arr_imdb_id or lib_item.imdb_id
                if item["media_type"] == "track" and lib_item.audio_codec is None:
                    lib_item.audio_codec = item.get("audio_codec")
                    lib_item.audio_bitrate = item.get("audio_bitrate")
                    lib_item.audio_sample_rate = item.get("audio_sample_rate")
                    lib_item.audio_channels = item.get("audio_channels")
                    lib_item.duration_ms = item.get("duration_ms")
                lib_item.updated_at = now

            plex_sync_state["items_synced"] += 1
            if i % 200 == 0:
                await db.commit()
        await db.commit()
    finally:
        await db.close()
    return added_count, seen_guids


async def _build_arr_lookup(db: AsyncSession) -> dict:
    """Table de correspondance (media_type, id_kind, id_valeur) -> (instance, arr_id, slug),
    partagee par le scan complet et le scan incremental pour rattacher un media Plex a
    son instance Sonarr/Radarr des son integration.
    """
    instances = (await db.execute(select(ArrInstance).filter(ArrInstance.enabled))).scalars().all()
    arr_lookup: dict = {}
    title_candidates: dict[tuple, list[tuple]] = {}
    for inst in instances:
        try:
            if inst.arr_type == "radarr":
                movies = await get_all_movies(inst.url, inst.api_key)
                for m in movies:
                    tmdb = str(m.get("tmdbId") or "")
                    imdb = m.get("imdbId")
                    slug = m.get("titleSlug")
                    arr_id = m.get("id")
                    value = (inst.id, arr_id, slug, tmdb or None, imdb or None)
                    if tmdb:
                        arr_lookup[("movie", "tmdb", tmdb)] = value
                    if imdb:
                        arr_lookup[("movie", "imdb", imdb)] = value
                    title_key = ("movie", "title", normalize_title(m.get("title")), m.get("year"))
                    if title_key[2] and title_key[3] is not None:
                        title_candidates.setdefault(title_key, []).append(value)
            else:  # sonarr
                series = await get_all_series(inst.url, inst.api_key)
                for s in series:
                    tvdb = str(s.get("tvdbId") or "")
                    tmdb = str(s.get("tmdbId") or "")
                    imdb = s.get("imdbId")
                    slug = s.get("titleSlug")
                    arr_id = s.get("id")
                    if tvdb:
                        arr_lookup[("show", "tvdb", tvdb)] = (inst.id, arr_id, slug, tmdb or None, imdb or None)
                    if tmdb:
                        arr_lookup[("show", "tmdb", tmdb)] = (inst.id, arr_id, slug, tmdb or None, imdb or None)
                    if imdb:
                        arr_lookup[("show", "imdb", imdb)] = (inst.id, arr_id, slug, tmdb or None, imdb or None)
        except Exception as inst_exc:
            logger.warning(f"VFF Sync : impossible de charger la bibliothèque de {inst.name} : {inst_exc}")
    # A title fallback is accepted only when title+year identifies exactly one Radarr
    # movie across every configured instance. Ambiguous remakes are deliberately skipped.
    for key, values in title_candidates.items():
        if len(values) == 1:
            arr_lookup[key] = values[0]
    return arr_lookup


async def sync_plex_media():
    """Tâche planifiée : synchronise les médias Plex configurés avec la base de données.

    Vérifie l'existence de chaque média par GUID Plex ou identifiant externe.
    Enregistre les nouveaux médias en statut disponible avec la source "plex_sync".
    """
    _reset_if_stale()
    # Consulte aussi l'etat partage : une synchronisation menee par l'autre process (cron
    # ARQ cote worker, declenchement manuel cote web) est invisible du dict local.
    from . import scan_state

    if await scan_state.is_running("sync", plex_sync_state):
        logger.info("VFF Sync : une synchronisation est déjà en cours, skip")
        return

    plex_sync_state["status"] = "running"
    plex_sync_state["started_at"] = now_utc().isoformat()
    plex_sync_state["finished_at"] = None
    plex_sync_state["items_synced"] = 0
    plex_sync_state["total_items"] = 0
    plex_sync_state["error"] = None
    # Apres le passage a "running" : la tache de diffusion s'arrete des qu'elle observe un
    # etat au repos (voir vff_progress.notify_vff_progress).
    from .vff_progress import notify_vff_progress

    notify_vff_progress()

    db: AsyncSession = AsyncSessionLocal()
    try:
        settings = (await db.execute(select(Settings))).scalars().first()
        if not settings or not settings.vff_enabled:
            plex_sync_state["status"] = "idle"
            return
        if not settings.plex_url or not settings.plex_token:
            logger.info("VFF Sync : Plex non configuré, skip")
            plex_sync_state["status"] = "idle"
            return

        libs = _parse_vff_libraries(settings)
        if not libs:
            logger.info("VFF Sync : aucune bibliothèque configurée, skip")
            plex_sync_state["status"] = "idle"
            return

        logger.info("VFF Sync : début de la synchronisation de la bibliothèque Plex")
        plex_items = await asyncio.to_thread(
            plex_finder.sync_plex_library_blocking, settings.plex_url, settings.plex_token, libs
        )

        plex_sync_state["total_items"] = len(plex_items)
        logger.info(f"VFF Sync : {len(plex_items)} média(s) récupéré(s) de Plex, intégration en base...")

        arr_lookup = await _build_arr_lookup(db)
        added_count, seen_guids = await _integrate_plex_items(plex_items, arr_lookup)

        # Supprimer les LibraryItems dont le plex_guid n'est plus dans Plex et
        # rétrograder les demandes liées (available → sent_to_arr / availability_lost).
        # Un item sans plex_guid (match titre+année uniquement) n'est jamais touché ici :
        # on ne peut pas savoir avec certitude s'il était dans la fenêtre scannée.
        if seen_guids:
            from .request_lifecycle import transition_request

            stale_items = (
                (
                    await db.execute(
                        select(LibraryItem).where(
                            LibraryItem.plex_guid.isnot(None),
                            LibraryItem.plex_guid.notin_(seen_guids),
                        )
                    )
                )
                .scalars()
                .all()
            )

            if stale_items:
                stale_ids = [item.id for item in stale_items]
                linked_reqs = (
                    (await db.execute(select(MediaRequest).filter(MediaRequest.library_item_id.in_(stale_ids))))
                    .scalars()
                    .all()
                )

                reverted = 0
                for req in linked_reqs:
                    req.library_item_id = None
                    if req.status == RequestStatus.available:
                        await transition_request(db, req, "availability_lost", source="plex_sync")
                        logger.info(
                            "VFF Sync : '%s' retiré de Plex — statut réinitialisé (availability_lost)",
                            req.title,
                        )
                        reverted += 1

                for item in stale_items:
                    await db.delete(item)

                logger.info(
                    "VFF Sync : %d LibraryItem(s) stale(s) supprimé(s), %d demande(s) réinitialisée(s)",
                    len(stale_items),
                    reverted,
                )
                await db.commit()

        if added_count > 0:
            logger.info(f"VFF Sync : {added_count} nouveau(x) média(s) Plex ajouté(s) à la bibliothèque")
            # Déclencher immédiatement une analyse VFF pour les nouveaux médias ajoutés
            from .vff_scanner import check_vf_statuses

            asyncio.create_task(check_vf_statuses())
        else:
            logger.info("VFF Sync : aucun nouveau média Plex détecté")

        plex_sync_state["status"] = "idle"
        plex_sync_state["finished_at"] = now_utc().isoformat()
    except Exception as e:
        logger.error(f"VFF Sync : erreur synchronisation : {e}")
        plex_sync_state["status"] = "failed"
        plex_sync_state["error"] = str(e)
    finally:
        await db.close()


# Marge de securite soustraite au filigrane persiste, pour couvrir le decalage entre le
# moment ou Plex indexe reellement un fichier et l'instant "addedAt" qu'il rapporte (et
# une eventuelle horloge legerement desynchronisee) -- meme principe que le
# "buffer de 10 minutes" du scan incremental de Seer/Overseerr.
_RECENT_SYNC_BUFFER = timedelta(minutes=10)
_RECENT_SYNC_DEFAULT_LOOKBACK = timedelta(minutes=15)


async def sync_plex_media_recent():
    """Scan incremental : ne recupere que les medias Plex ajoutes depuis le dernier scan.

    Complement du scan complet quotidien (sync_plex_media) : pense pour tourner toutes
    les quelques minutes (voir job_plex_sync_recent) sans jamais faire de gros appel a
    Plex, pour qu'un media confirme disponible cote Radarr/Sonarr n'attende plus jusqu'a
    24h avant d'apparaitre dans la Bibliotheque (voir LibraryItem). Partage le meme flag
    plex_sync_state que le scan complet : les deux ne tournent jamais en meme temps.
    """
    _reset_if_stale()
    from . import scan_state

    if await scan_state.is_running("sync", plex_sync_state):
        logger.info("VFF Sync (recent) : une synchronisation est déjà en cours, skip")
        return

    plex_sync_state["status"] = "running"
    plex_sync_state["started_at"] = now_utc().isoformat()
    plex_sync_state["finished_at"] = None
    plex_sync_state["items_synced"] = 0
    plex_sync_state["total_items"] = 0
    plex_sync_state["error"] = None
    # Apres le passage a "running" : la tache de diffusion s'arrete des qu'elle observe un
    # etat au repos (voir vff_progress.notify_vff_progress).
    from .vff_progress import notify_vff_progress

    notify_vff_progress()

    db: AsyncSession = AsyncSessionLocal()
    try:
        settings = (await db.execute(select(Settings))).scalars().first()
        if not settings or not settings.vff_enabled:
            plex_sync_state["status"] = "idle"
            return
        if not settings.plex_url or not settings.plex_token:
            plex_sync_state["status"] = "idle"
            return

        libs = _parse_vff_libraries(settings)
        if not libs:
            plex_sync_state["status"] = "idle"
            return

        # now_utc_naive() : coherent avec le stockage naif-UTC de la colonne et avec
        # l'hypothese deja prise ailleurs (_integrate_plex_items) que l'horloge du
        # conteneur est en UTC, addedAt de plexapi (naif, heure locale du process)
        # etant alors directement comparable sans conversion.
        run_started_at = now_utc_naive()
        since = (
            settings.plex_recent_sync_last_at - _RECENT_SYNC_BUFFER
            if settings.plex_recent_sync_last_at
            else run_started_at - _RECENT_SYNC_DEFAULT_LOOKBACK
        )

        plex_items = await asyncio.to_thread(
            plex_finder.sync_plex_library_recent_blocking, settings.plex_url, settings.plex_token, libs, since
        )
        plex_sync_state["total_items"] = len(plex_items)

        # Avance le filigrane des la recuperation Plex reussie, avant l'integration en
        # base (_integrate_plex_items ouvre sa propre session) : un souci d'integration
        # ne doit pas faire re-parcourir la meme fenetre de temps au prochain cycle.
        settings.plex_recent_sync_last_at = run_started_at
        await db.commit()

        if plex_items:
            logger.info(f"VFF Sync (recent) : {len(plex_items)} média(s) récemment ajouté(s) détecté(s)")
            arr_lookup = await _build_arr_lookup(db)
            added_count, _seen_guids = await _integrate_plex_items(plex_items, arr_lookup)
            if added_count > 0:
                from .vff_scanner import check_vf_statuses

                asyncio.create_task(check_vf_statuses())

        plex_sync_state["status"] = "idle"
        plex_sync_state["finished_at"] = now_utc().isoformat()
    except Exception as e:
        logger.error(f"VFF Sync (recent) : erreur synchronisation : {e}")
        plex_sync_state["status"] = "failed"
        plex_sync_state["error"] = str(e)
    finally:
        await db.close()
