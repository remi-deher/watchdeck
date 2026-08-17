import asyncio
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import sqlalchemy
from sqlalchemy import or_, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import AsyncSessionLocal
from ..models import (
    ArrInstance,
    EpisodeMetadata,
    LibraryItem,
    MediaRequest,
    PlexUser,
    RequestStatus,
    Settings,
    VfEpisodeStatus,
)
from ..utils import now_utc, now_utc_naive
from . import arr_catalog, audio_analyzer, plex_finder, radarr, sonarr
from .media_matching import link_request_to_library_item as _link_request_to_library_item
from .notification_orchestrator import (
    _notify,
    _queue_milestone,
    _queue_show_milestones,
    _resolve_movie_notify_language,
    _resolve_series_notify_language,
)
from .radarr import search_movie
from .sonarr import get_episodes, get_season_aired_episode_counts, lookup_series, search_series

logger = logging.getLogger(__name__)


def _compute_subtitle_status(
    media_type: str,
    tracks: list[dict],
    subtitles: list[dict],
    episode_metadata: dict | None = None,
) -> tuple[str | None, str | None]:
    """Calcule sub_fr_status et forced_fr_status pour un LibraryItem.

    Pour les films : tracks/subtitles viennent directement du résultat du scan.
    Pour les séries : on agrège depuis episode_metadata (dict sn -> {en -> {tracks, subtitles}}).

    sub_fr_status    : "absent" | "no_track" | "forced_not_default" | "not_default" | "forced_default" | "ok" | None
    forced_fr_status : "not_default" | "ok" | None
    """

    def _episode_flags(ep_tracks, ep_subs):
        is_fr = any(t.get("is_fr") for t in ep_tracks)
        fr_subs = [s for s in ep_subs if s.get("is_fr")]
        full_fr = [s for s in fr_subs if not s.get("is_forced")]
        forced_fr = [s for s in fr_subs if s.get("is_forced")]
        return is_fr, full_fr, forced_fr, fr_subs

    # Priorité décroissante : absent > no_track > forced_not_default > not_default > forced_default > ok
    _SUB_PRIORITY = {
        "absent": 5,
        "no_track": 4,
        "forced_not_default": 3,
        "not_default": 2,
        "forced_default": 1,
        "ok": 0,
    }

    def _aggregate(episodes_iter):
        sub_fr = None
        forced_fr = None
        for ep_tracks, ep_subs in episodes_iter:
            if not ep_tracks and not ep_subs:
                continue
            is_fr, full_fr, forced_fr_subs, fr_subs = _episode_flags(ep_tracks, ep_subs)
            if not is_fr:
                if not ep_subs:
                    # Aucune piste de sous-titre : possiblement brûlés dans le flux vidéo
                    candidate = "no_track"
                elif not fr_subs:
                    # Des pistes existent mais aucune en français
                    candidate = "absent"
                elif full_fr:
                    # Pistes complètes françaises présentes
                    if any(s.get("is_default") for s in full_fr):
                        candidate = "ok"
                    else:
                        candidate = "not_default"
                else:
                    # Uniquement des pistes françaises marquées 'forcées' (ex: rip VO avec flag forcé)
                    if any(s.get("is_default") for s in forced_fr_subs):
                        candidate = "forced_default"
                    else:
                        candidate = "forced_not_default"

                if sub_fr is None or _SUB_PRIORITY[candidate] > _SUB_PRIORITY.get(sub_fr, -1):
                    sub_fr = candidate

            if is_fr and forced_fr_subs:
                if not any(s.get("is_default") for s in forced_fr_subs):
                    forced_fr = "not_default"
                elif forced_fr is None:
                    forced_fr = "ok"
        return sub_fr, forced_fr

    if media_type == "movie":
        sub_fr, forced_fr = _aggregate([(tracks, subtitles)])
    else:
        if not episode_metadata:
            return None, None
        episodes = [
            (ep.get("tracks") or [], ep.get("subtitles") or [])
            for sn_eps in episode_metadata.values()
            for ep in sn_eps.values()
        ]
        sub_fr, forced_fr = _aggregate(episodes)

    return sub_fr, forced_fr


vff_scan_state: dict[str, Any] = {
    "status": "idle",  # "idle" | "running" | "failed"
    "started_at": None,
    "finished_at": None,
    "items_scanned": 0,
    "total_items": 0,
    "error": None,
}

episode_scan_state: dict[str, Any] = {
    "status": "idle",  # "idle" | "running" | "failed"
    "started_at": None,
    "finished_at": None,
    "items_scanned": 0,
    "total_items": 0,
    "error": None,
}


def _parse_vff_libraries(settings: Settings) -> list[dict]:
    """Parse la config JSON des bibliothèques VFF. Retourne [] si absente/invalide.

    Format : [{"name": "Films", "kind": "movie"}, {"name": "Musique", "kind": "music"}]
    kind ∈ {"movie", "series", "music"} — "music" identifie une bibliothèque Plex de
    type artiste : elle est synchronisée dans la bibliothèque comme les autres, mais
    n'est jamais scannée pour la VF (aucune notion de piste doublée pour de la musique),
    voir l'exclusion dans `_scan_vf_blocking`.
    """
    raw = getattr(settings, "vff_libraries", None)
    if not raw:
        return []
    try:
        libs = json.loads(raw)
    except Exception:
        logger.warning("vff_libraries : JSON invalide, ignoré")
        return []
    out = []
    for entry in libs if isinstance(libs, list) else []:
        name = (entry.get("name") or "").strip()
        kind = (entry.get("kind") or "").strip().lower()
        if name and kind in ("movie", "series", "music"):
            out.append({"name": name, "kind": kind})
    return out


async def _load_known_vf_episodes(
    db: AsyncSession, source_type: str, source_ids: list[int]
) -> dict[int, dict[int, set[int]]]:
    """Charge le cache des épisodes déjà confirmés VF pour une liste de médias.

    Retourne {source_id: {season_number: {episode_number, ...}}}. Ne contient que les
    épisodes has_vf=True : un épisode confirmé VF ne redevient jamais VO, donc ce cache
    permet d'éviter tout appel Plex superflu pour les épisodes déjà connus.
    """
    if not source_ids:
        return {}
    rows = (
        (
            await db.execute(
                select(VfEpisodeStatus).filter(
                    VfEpisodeStatus.source_type == source_type,
                    VfEpisodeStatus.source_id.in_(source_ids),
                    VfEpisodeStatus.has_vf.is_(True),
                    VfEpisodeStatus.fr_is_default.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    out: dict[int, dict[int, set[int]]] = {}
    for r in rows:
        out.setdefault(r.source_id, {}).setdefault(r.season_number, set()).add(r.episode_number)
    return out


async def _load_episode_status_map(
    db: AsyncSession, source_type: str, source_ids: list[int]
) -> dict[int, dict[int, dict[int, bool]]]:
    if not source_ids:
        return {}
    rows = (
        (
            await db.execute(
                select(VfEpisodeStatus).filter(
                    VfEpisodeStatus.source_type == source_type, VfEpisodeStatus.source_id.in_(source_ids)
                )
            )
        )
        .scalars()
        .all()
    )
    out: dict[int, dict[int, dict[int, bool]]] = {}
    for row in rows:
        out.setdefault(row.source_id, {}).setdefault(row.season_number, {})[row.episode_number] = bool(row.has_vf)
    return out


async def _persist_episode_status(
    db: AsyncSession,
    source_type: str,
    source_id: int,
    episode_status: dict[int, dict[int, bool]],
    now: datetime,
    french_default: dict[int, dict[int, bool]] | None = None,
    known_episode_status: dict[int, dict[int, bool]] | None = None,
) -> None:
    """Upsert le statut VF par épisode dans le cache (`vf_episode_status`).

    `known_episode_status` : {season_number: {episode_number: is_known_episode}}, voir
    `audio_analyzer.show_has_full_french_audio` — épisode reconnu par Sonarr/TheTVDB ou
    non (défaut True si absent, aucun lien Sonarr connu).
    """
    if not episode_status:
        return
    existing = {
        (r.season_number, r.episode_number): r
        for r in (
            await db.execute(
                select(VfEpisodeStatus).filter(
                    VfEpisodeStatus.source_type == source_type, VfEpisodeStatus.source_id == source_id
                )
            )
        )
        .scalars()
        .all()
    }
    for sn, eps in episode_status.items():
        for en, has_vf in eps.items():
            fr_is_default = (french_default or {}).get(sn, {}).get(en)
            is_known_episode = (known_episode_status or {}).get(sn, {}).get(en, True)
            row = existing.get((sn, en))
            if row:
                if row.has_vf != has_vf:
                    row.has_vf = has_vf
                if fr_is_default is not None and row.fr_is_default != fr_is_default:
                    row.fr_is_default = fr_is_default
                if row.is_known_episode != is_known_episode:
                    row.is_known_episode = is_known_episode
                row.checked_at = now
            else:
                db.add(
                    VfEpisodeStatus(
                        source_type=source_type,
                        source_id=source_id,
                        season_number=sn,
                        episode_number=en,
                        has_vf=has_vf,
                        fr_is_default=fr_is_default,
                        is_known_episode=is_known_episode,
                        checked_at=now,
                    )
                )


async def _persist_episode_metadata(
    db: AsyncSession,
    source_type: str,
    source_id: int,
    episode_metadata: dict[int, dict[int, dict]] | None,
    now: datetime,
) -> None:
    """Upsert titre/résumé/miniature Plex par épisode (`episode_metadata`) -- sous-produit
    du scan VF (voir plex_finder.scan_media_vf), alimente l'onglet Saisons & épisodes sans
    appel Plex dédié à l'ouverture de la fiche (voir routers/vff_api.py
    _season_episodes_payload). N'écrase jamais un titre/résumé/miniature déjà connu par
    une valeur vide (le scan ne recharge que les épisodes pas encore confirmés VF, voir
    `known_vf` dans `show_has_full_french_audio` -- ce n'est donc pas une régression de
    disponibilité, juste une passe qui n'a rien de nouveau à offrir sur cet épisode)."""
    if not episode_metadata:
        return
    existing = {
        (r.season_number, r.episode_number): r
        for r in (
            await db.execute(
                select(EpisodeMetadata).filter(
                    EpisodeMetadata.source_type == source_type, EpisodeMetadata.source_id == source_id
                )
            )
        )
        .scalars()
        .all()
    }
    for sn, eps in episode_metadata.items():
        for en, meta in eps.items():
            tracks_json = json.dumps(meta["tracks"]) if meta.get("tracks") else None
            subtitles_json = json.dumps(meta["subtitles"]) if meta.get("subtitles") else None
            row = existing.get((sn, en))
            if row:
                if meta.get("title"):
                    row.title = meta["title"]
                if meta.get("overview"):
                    row.overview = meta["overview"]
                if meta.get("still_url"):
                    row.still_url = meta["still_url"]
                if meta.get("air_date"):
                    row.air_date = meta["air_date"]
                if tracks_json:
                    row.audio_tracks = tracks_json
                if subtitles_json:
                    row.subtitles = subtitles_json
                row.updated_at = now
            else:
                db.add(
                    EpisodeMetadata(
                        source_type=source_type,
                        source_id=source_id,
                        season_number=sn,
                        episode_number=en,
                        title=meta.get("title"),
                        overview=meta.get("overview") or None,
                        still_url=meta.get("still_url"),
                        air_date=meta.get("air_date"),
                        audio_tracks=tracks_json,
                        subtitles=subtitles_json,
                        updated_at=now,
                    )
                )


async def _invalidate_vf_cache(
    db: AsyncSession,
    source_type: Optional[str] = None,
    source_id: Optional[int] = None,
    season_number: Optional[int] = None,
    episode_number: Optional[int] = None,
) -> int:
    """Invalide (supprime) des entrées du cache VF par épisode pour forcer un re-scan Plex.

    Le cache par épisode suppose qu'un épisode confirmé VF le reste (ce qui est vrai en
    fonctionnement normal), mais un faux positif de détection ou un remplacement de
    fichier côté Plex peut rendre une entrée obsolète. Ce helper permet de la purger à
    la granularité voulue, avec une portée croissante selon les paramètres fournis :
    - aucun paramètre                        : tout le cache (force globale)
    - source_type + source_id                : une série/un film entier (force série)
    - + season_number                        : une seule saison (force saison)
    - + season_number + episode_number       : un seul épisode (force épisode)

    Ne fait pas de commit : à la charge de l'appelant.
    Retourne le nombre de lignes supprimées.
    """
    conditions = []
    if source_type is not None:
        conditions.append(VfEpisodeStatus.source_type == source_type)
    if source_id is not None:
        conditions.append(VfEpisodeStatus.source_id == source_id)
    if season_number is not None:
        conditions.append(VfEpisodeStatus.season_number == season_number)
    if episode_number is not None:
        conditions.append(VfEpisodeStatus.episode_number == episode_number)
    result = await db.execute(sqlalchemy.delete(VfEpisodeStatus).filter(*conditions))
    return int(result.rowcount or 0)


def _scan_vf_blocking(
    plex_url: str,
    plex_token: str,
    candidates: list[dict],
    libs: list[dict],
    known_vf_by_id: Optional[dict[int, dict[int, set[int]]]] = None,
    state: dict[str, Any] | None = None,
    known_episodes_by_id: Optional[dict[int, dict[int, set[int]]]] = None,
) -> list[dict]:
    """Analyse (bloquante, plexapi) la présence de VF pour chaque candidat.

    `state` : dict de progression à incrémenter (`items_scanned`) — `vff_scan_state` par
    défaut si non fourni, pour ne pas casser un appelant qui ne suit pas sa propre
    progression séparément.

    Exécutée dans un thread via asyncio.to_thread pour ne pas bloquer la boucle async.
    `known_vf_by_id` (séries) : cache par candidat, voir `_load_known_vf_episodes` —
    les épisodes déjà confirmés VF ne sont pas re-interrogés dans Plex.
    `known_episodes_by_id` (séries) : {season_number: {episode_number}} connus de Sonarr
    par candidat, voir `_sonarr_episode_numbers_for` — exclut du calcul d'agrégation
    (has_vf/vf_granularity série) un épisode que Plex indexe mais que Sonarr ne reconnaît
    pas comme réel (toujours scanné, juste pas compté).
    Retourne une liste de dicts : {"id", "found", "has_vf", "category", "episode_status"?}.
    """
    known_vf_by_id = known_vf_by_id or {}
    known_episodes_by_id = known_episodes_by_id or {}
    state = state if state is not None else vff_scan_state
    try:
        plex = plex_finder.connect(plex_url, plex_token)
    except Exception as exc:
        logger.warning(f"VFF : connexion Plex impossible : {exc}")
        return []

    movie_libs = [lib["name"] for lib in libs if lib["kind"] == "movie"]
    show_libs = [(lib["name"], lib["kind"]) for lib in libs if lib["kind"] == "series"]

    results: list[dict] = []
    for c in candidates:
        try:
            res = plex_finder.scan_media_vf(
                plex,
                c["media_type"],
                movie_libs,
                show_libs,
                c["title"],
                c["year"],
                c["tmdb_id"],
                c["tvdb_id"],
                c["imdb_id"],
                plex_guid=c.get("plex_guid"),
                known_vf=known_vf_by_id.get(c["id"]),
                known_episodes=known_episodes_by_id.get(c["id"]),
            )
            results.append({"id": c["id"], **res})
        except Exception as exc:
            logger.warning(f"VFF : erreur analyse '{c.get('title')}' : {exc}")
            results.append({"id": c["id"], "found": False})
        finally:
            state["items_scanned"] += 1
    return results


async def _resolve_vf_arr_instance(db: AsyncSession, req: MediaRequest, arr_type: str) -> ArrInstance | None:
    """Résout l'instance Sonarr/Radarr à utiliser pour l'auto-search VFF d'une demande."""
    if req.arr_instance_id:
        inst = (
            (
                await db.execute(
                    select(ArrInstance).filter(
                        ArrInstance.id == req.arr_instance_id, ArrInstance.arr_type == arr_type, ArrInstance.enabled
                    )
                )
            )
            .scalars()
            .first()
        )
        if inst:
            return inst
    return (
        (
            await db.execute(
                select(ArrInstance).filter(
                    ArrInstance.arr_type == arr_type, ArrInstance.enabled, ArrInstance.is_default
                )
            )
        )
        .scalars()
        .first()
    )


async def _prefetch_season_aired_counts(db: AsyncSession, requests: list[MediaRequest]) -> dict[int, dict[int, int]]:
    """Précharge, pour chaque série Sonarr, le nombre d'épisodes déjà diffusés par saison.

    Référence utilisée par `_series_language_milestones` pour ne pas confondre "tous les
    épisodes déjà repérés dans Plex correspondent" avec "la saison est réellement complète"
    (voir docstring de `sonarr.get_season_aired_episode_counts`). Best-effort : une série
    dont Sonarr est injoignable ou introuvable retombe sur l'ancien comportement (pas de
    référence disponible).
    """
    shows = []
    seen_ids: set[int] = set()
    instances: dict[int, ArrInstance] = {}
    for req in requests:
        if req.media_type != "show" or req.id in seen_ids:
            continue
        inst = await _resolve_vf_arr_instance(db, req, "sonarr")
        if not inst:
            continue
        seen_ids.add(req.id)
        instances[req.id] = inst
        shows.append(req)
    if not shows:
        return {}

    # Comme `_known_episodes_for_show_rows` : catalogue Sonarr mutualisé (au lieu d'un
    # retéléchargement complet par série) et appels menés en parallèle. Les accès DB sont
    # déjà faits ci-dessus, la partie parallélisée ne touche plus la session.
    series_cache: dict[int, list[dict]] = {}
    for inst in {id(i): i for i in instances.values()}.values():
        await _series_list_cache_get(series_cache, inst)
    semaphore = asyncio.Semaphore(8)

    async def _fetch(req: MediaRequest):
        inst = instances[req.id]
        async with semaphore:
            try:
                # Une demande Seer porte l'ID interne Seer dans arr_id, pas l'ID Sonarr : il
                # faut le resoudre via tvdb_id (meme logique que
                # episode_availability._fetch_show_episodes), sans quoi cette serie etait
                # silencieusement ignoree ici -- son "expected" restait None et
                # _series_milestones annoncait alors "saison complete" des que les episodes
                # deja telecharges avaient tous leur VF, meme diffusion en cours.
                series_id = await _resolve_sonarr_series_id(
                    inst,
                    req.arr_id,
                    req.tvdb_id,
                    req.source == "seer",
                    await _series_list_cache_get(series_cache, inst),
                )
                if not series_id:
                    return req.id, None
                return req.id, await get_season_aired_episode_counts(inst.url, inst.api_key, series_id)
            except Exception as e:
                logger.warning(f"VFF : compteurs saison Sonarr indisponibles pour '{req.title}': {e}")
                return req.id, None

    results = await asyncio.gather(*(_fetch(req) for req in shows))
    return {req_id: counts for req_id, counts in results if counts is not None}


async def _series_list_cache_get(cache: dict[int, list[dict]] | None, inst: ArrInstance) -> list[dict] | None:
    """Catalogue Sonarr complet de `inst`, téléchargé au plus une fois par scan.

    `cache` est un dict {arr_instance_id: series_list} propre à une passe de scan ; passer
    None désactive la mutualisation (scan ponctuel sur un seul média, où un catalogue
    complet coûterait plus cher que le lookup qu'il économise).
    """
    if cache is None:
        return None
    key = inst.id or 0
    if key not in cache:
        # Le cache local garantit un unique téléchargement pour toute la passe, même si
        # elle dure plus longtemps que le TTL d'`arr_catalog` (un scan complet dépasse
        # les cinq minutes) ; `arr_catalog` le partage en plus avec le reste de l'appli.
        cache[key] = await arr_catalog.get_catalog("sonarr", inst.url, inst.api_key) or []
    return cache[key] or None


async def _resolve_sonarr_series_id(
    inst: ArrInstance,
    arr_id: int | None,
    tvdb_id: str | None,
    is_seer: bool,
    series_list: list[dict] | None = None,
) -> int | None:
    """Résout l'ID série Sonarr d'un objet (MediaRequest ou LibraryItem) à partir de ses
    identifiants — une demande Seer porte l'ID interne Seer dans arr_id, pas l'ID Sonarr,
    d'où le passage par tvdb_id (même logique que `_prefetch_season_aired_counts`).

    `series_list` : catalogue Sonarr déjà en main (voir `_series_list_cache_get`) — sans
    lui, `lookup_series` retélécharge tout le catalogue à chaque résolution par tvdb_id.
    """
    series_id = arr_id if not is_seer else None
    if tvdb_id:
        data = await lookup_series(inst.url, inst.api_key, tvdb_id=tvdb_id, series_list=series_list)
        series_id = data.get("id") if data else series_id
    if not series_id and arr_id:
        data = await lookup_series(inst.url, inst.api_key, arr_id=arr_id, series_list=series_list)
        series_id = data.get("id") if data else None
    return series_id


async def _resolve_sonarr_instance_for(db: AsyncSession, obj) -> ArrInstance | None:
    """Instance Sonarr à utiliser pour `obj` (MediaRequest ou LibraryItem) — requête DB
    seule, séparée de la résolution HTTP (`_episode_numbers_via_instance`) pour permettre
    de précharger ces instances séquentiellement puis de paralléliser les appels Sonarr
    sans partager la même AsyncSession entre coroutines concurrentes (non thread-safe)."""
    arr_instance_id = getattr(obj, "arr_instance_id", None)
    inst = None
    if arr_instance_id:
        inst = (
            (
                await db.execute(
                    select(ArrInstance).filter(
                        ArrInstance.id == arr_instance_id, ArrInstance.arr_type == "sonarr", ArrInstance.enabled
                    )
                )
            )
            .scalars()
            .first()
        )
    if not inst:
        inst = (
            (
                await db.execute(
                    select(ArrInstance).filter(
                        ArrInstance.arr_type == "sonarr", ArrInstance.enabled, ArrInstance.is_default
                    )
                )
            )
            .scalars()
            .first()
        )
    return inst


async def _episode_numbers_via_instance(
    inst: ArrInstance, obj, series_list: list[dict] | None = None
) -> dict[int, set[int]] | None:
    """Liste des épisodes connus de Sonarr (donc TheTVDB) pour une série, par saison —
    partie HTTP pure (aucun accès DB), voir `_resolve_sonarr_instance_for`."""
    try:
        is_seer = getattr(obj, "source", None) == "seer"
        series_id = await _resolve_sonarr_series_id(
            inst, getattr(obj, "arr_id", None), getattr(obj, "tvdb_id", None), is_seer, series_list
        )
        if not series_id:
            return None
        episodes = await get_episodes(inst.url, inst.api_key, series_id)
    except Exception as e:
        logger.warning(f"VFF : liste épisodes Sonarr indisponible pour '{getattr(obj, 'title', '?')}': {e}")
        return None
    out: dict[int, set[int]] = {}
    for ep in episodes:
        season = ep.get("seasonNumber")
        number = ep.get("episodeNumber")
        if not season or number is None:
            continue
        out.setdefault(season, set()).add(number)
    return out


async def _sonarr_episode_numbers_for(db: AsyncSession, obj) -> dict[int, set[int]] | None:
    """Liste des épisodes connus de Sonarr pour un seul objet (MediaRequest ou
    LibraryItem) — combine résolution d'instance (DB) et appel HTTP. Utilisé par les
    scans ponctuels (un seul média) ; le scan en masse utilise
    `_known_episodes_for_show_rows`, qui parallélise les appels HTTP sur plusieurs séries.
    """
    inst = await _resolve_sonarr_instance_for(db, obj)
    if not inst:
        return None
    return await _episode_numbers_via_instance(inst, obj)


async def _trigger_vf_search(db: AsyncSession, settings: Settings, req: MediaRequest) -> None:
    """Relance une recherche Sonarr/Radarr pour un média détecté en VO seule (auto-search VFF).

    Ignoré si arr_id absent ou si la demande provient de Seer (arr_id = ID Seer, pas Sonarr/Radarr).
    """
    if not req.arr_id or req.source == "seer":
        return
    arr_type = "radarr" if req.media_type == "movie" else "sonarr"
    inst = await _resolve_vf_arr_instance(db, req, arr_type)
    if not inst:
        return
    try:
        if arr_type == "radarr":
            ok = await search_movie(inst.url, inst.api_key, req.arr_id)
        else:
            ok = await search_series(inst.url, inst.api_key, req.arr_id)
        if ok:
            logger.info(f"VFF auto-search lancé pour '{req.title}' ({arr_type})")
    except Exception as e:
        logger.warning(f"VFF auto-search échec pour '{req.title}': {e}")


_last_section_refresh: dict[str, datetime] = {}
_SECTION_REFRESH_COOLDOWN = timedelta(seconds=45)

_plex_connector_cache: dict[str, tuple[bool, datetime]] = {}
_PLEX_CONNECTOR_CACHE_TTL = timedelta(minutes=10)


async def has_native_plex_connector(arr_type: str, arr_url: str, arr_api_key: str, cache_key: str) -> bool:
    """Indique si Sonarr/Radarr a déjà un connecteur natif "Plex Media Server" actif.

    Si oui, l'*arr notifie déjà Plex directement (scan ciblé sur le dossier importé) à
    chaque import — notre propre refresh de section deviendrait redondant. Résultat mis
    en cache (`_PLEX_CONNECTOR_CACHE_TTL`) pour ne pas interroger Sonarr/Radarr à chaque
    webhook reçu. En cas d'erreur réseau, on suppose prudemment "non" (mieux vaut un
    refresh en trop qu'un défaut de refresh).
    """
    cached = _plex_connector_cache.get(cache_key)
    now = now_utc()
    if cached and now - cached[1] < _PLEX_CONNECTOR_CACHE_TTL:
        return cached[0]

    client = sonarr if arr_type == "sonarr" else radarr
    try:
        notifications = await client.get_notifications(arr_url, arr_api_key)
        found = client.find_plex_notification(notifications) is not None
    except Exception as e:
        logger.warning(f"Vérification du connecteur Plex natif échouée pour {arr_type}: {e}")
        found = False
    _plex_connector_cache[cache_key] = (found, now)
    return found


async def trigger_plex_library_refresh(
    settings: Settings,
    media_type: str,
    *,
    arr_type: str | None = None,
    arr_url: str | None = None,
    arr_api_key: str | None = None,
    cache_key: str | None = None,
) -> None:
    """Déclenche un scan Plex immédiat de la bibliothèque concernée par un import *arr.

    Appelé depuis le webhook Sonarr/Radarr (Download/Import), au lieu d'attendre le
    calendrier de scan de Plex — réduit la latence avant que `has_vf` soit détectable par
    le scan eager (`scan_and_notify_availability`) ou le scan léger. Anti-rebond : ignore
    les sections déjà rafraîchies récemment (import groupé, ex. pack de saison qui
    déclenche plusieurs webhooks Download en quelques secondes).

    Si `arr_type`/`arr_url`/`arr_api_key`/`cache_key` sont fournis, court-circuite d'abord
    si Sonarr/Radarr a déjà un connecteur natif "Plex Media Server" actif — cet *arr
    notifie alors déjà Plex directement, plus précisément (scan ciblé) que notre refresh
    de section complète.
    """
    if arr_type and arr_url and arr_api_key and cache_key:
        arr_label = arr_type.capitalize()
        if await has_native_plex_connector(arr_type, arr_url, arr_api_key, cache_key):
            logger.info(f"Plex : refresh actif ignoré, {arr_label} gère déjà nativement le scan Plex")
            return
        logger.info(f"Plex : refresh actif, {arr_label} ne gère pas le scan Plex")

    if not settings.vff_enabled or not settings.plex_url or not settings.plex_token:
        return
    libs = _parse_vff_libraries(settings)
    kinds = ("movie",) if media_type == "movie" else ("series",)
    names = [lib["name"] for lib in libs if lib["kind"] in kinds]
    if not names:
        return

    now = now_utc()
    epoch = datetime.min.replace(tzinfo=timezone.utc)
    due = [n for n in names if now - _last_section_refresh.get(n, epoch) > _SECTION_REFRESH_COOLDOWN]
    if not due:
        return
    for n in due:
        _last_section_refresh[n] = now

    try:
        await asyncio.to_thread(plex_finder.refresh_sections_blocking, settings.plex_url, settings.plex_token, due)
        logger.info(f"Plex : scan déclenché pour {due}")
    except Exception as e:
        logger.warning(f"Déclenchement du scan Plex échoué : {e}")


async def _queue_availability_progress(
    settings: Settings,
    req: MediaRequest,
    db: AsyncSession,
    *,
    language: str,
    episode_status: dict | None = None,
    has_vf_full: bool = False,
    season_aired_counts: dict[int, int] | None = None,
    is_upgrade: bool | None = None,
) -> int:
    """Point d'entrée unique pour les notifications de progression VO/VF (films et
    séries) — remplace l'ancien `_queue_language_progress_notifications`. Respecte le
    mode "classic" (movie_notify_language/series_notify_language désactivé) et le suivi
    "sans langue" des séries (délégué à `check_episode_tracking`, jamais les deux à la
    fois pour éviter un double suivi du même évènement).

    `is_upgrade` : laissé à None pour l'inférence par défaut (langue "vf" = amélioration).
    À forcer à False pour un premier scan qui tombe directement sur du VF (pas de
    période VO connue avant) — ce n'est pas une vraie transition VO→VF."""
    user_obj = (await db.execute(select(PlexUser).filter(PlexUser.plex_user_id == req.plex_user_id))).scalars().first()
    if req.media_type != "show":
        if not _resolve_movie_notify_language(settings, user_obj):
            if not req.available_mail_sent:
                await _notify("available", settings, req, db)
            return 0
        return int(await _queue_milestone(settings, req, db, scope="movie", language=language, is_upgrade=is_upgrade))

    if not _resolve_series_notify_language(settings, user_obj):
        return 0
    return await _queue_show_milestones(
        settings,
        req,
        db,
        language=language,
        episode_status=episode_status,
        has_vf_full=has_vf_full,
        season_aired_counts=season_aired_counts,
        is_upgrade=is_upgrade,
    )


async def _apply_vf_result(
    req: MediaRequest,
    has_vf: bool,
    category: str | None,
    db: AsyncSession,
    settings: Settings,
    now: datetime,
    season_aired_counts: dict[int, int] | None = None,
    episode_status: dict | None = None,
    granularity: str | None = None,
    fr_is_default: bool | None = None,
    known_episode_status: dict | None = None,
) -> tuple[bool, int, int]:
    """Applique une transition VO/VF à une demande (notifications incluses).

    Extrait du scan périodique (`check_vf_statuses`) pour être réutilisable par le scan
    immédiat déclenché à la disponibilité (`scan_and_notify_availability`).

    `granularity` : si déjà connue (ex: propagée depuis un LibraryItem lié), on
    l'utilise directement — sinon elle est calculée depuis `episode_status`.
    `fr_is_default` : True/False si connu (VF présente et sa priorité), None si aucune
    VF détectée — voir plex_finder.scan_media_vf.
    Retourne (trigger_search, vf_delta, vo_delta) — `trigger_search` indique si une
    recherche VFF auto (Sonarr/Radarr) doit être déclenchée par l'appelant (await
    nécessaire, donc hors de cette fonction synchrone) ; `vf_delta`/`vo_delta` sont le
    nombre de notifications effectivement mises en file (pour les compteurs du scan par
    lot — toujours 0 pour un scan immédiat à un seul média).
    """
    was_tracking = req.has_vf is False  # déjà identifié VO au passage précédent
    req.vf_category = category or req.vf_category
    req.vf_checked_at = now
    req.fr_is_default = fr_is_default
    trigger_search = False
    vf_delta = 0
    vo_delta = 0

    if has_vf:
        req.has_vf = True
        req.vf_granularity = "full"
        # `vf_available_at` doit être posé ici même en "première analyse" (pas
        # seulement lors d'une transition) : sinon une demande dont le tout premier
        # scan VF tombe directement sur du VF (aucune période VO détectée avant, ex.
        # fichier arrivé longtemps après la confirmation "disponible" générique côté
        # *arr) garde `vf_available_at` à NULL indéfiniment.
        req.vf_available_at = req.vf_available_at or now
        await db.commit()
        if was_tracking:
            logger.info(f"VFF : '{req.title}' est désormais disponible en VF")
        # Toujours passer par le système de jalons (respecte les réglages VF/VO de
        # l'utilisateur et n'est jamais bloqué par `available_mail_sent`), plutôt que
        # le _notify("available", ...) générique utilisé ici auparavant en "première
        # analyse" — celui-ci restait silencieusement bloqué dès que le mail
        # générique était déjà parti (ex: confirmation *arr) avant que le tout
        # premier scan VF n'ait eu l'occasion de tourner, ce qui pouvait survenir
        # bien après (le fichier met parfois des semaines à apparaître dans Plex).
        vf_delta = await _queue_availability_progress(
            settings,
            req,
            db,
            language="vf",
            episode_status=episode_status,
            has_vf_full=True,
            season_aired_counts=season_aired_counts,
            is_upgrade=was_tracking,
        )
    else:
        # VO uniquement
        req.has_vf = False
        req.vf_granularity = (
            granularity
            if granularity is not None
            else audio_analyzer.compute_vf_granularity(episode_status, known_episode_status)
        )
        if not was_tracking:
            if not req.available_mail_sent:
                # Première détection VO : la notification « VO » tient lieu
                # d'annonce de disponibilité. On marque available_mail_sent
                # pour éviter tout doublon « available » ultérieur.
                req.available_mail_sent = True
                await db.commit()
                vo_delta = await _queue_availability_progress(
                    settings,
                    req,
                    db,
                    language="vo",
                    episode_status=episode_status,
                    has_vf_full=False,
                    season_aired_counts=season_aired_counts,
                )
                logger.info(f"VFF : '{req.title}' disponible en VO uniquement — suivi VF activé")
            else:
                # Dispo déjà notifiée (fallback scan-lag) → suivi silencieux
                await db.commit()
            trigger_search = bool(settings.vff_auto_search)
        else:
            await db.commit()
            if req.media_type != "movie":
                vf_delta = await _queue_availability_progress(
                    settings,
                    req,
                    db,
                    language="vf",
                    episode_status=episode_status,
                    has_vf_full=False,
                    season_aired_counts=season_aired_counts,
                )
    return trigger_search, vf_delta, vo_delta


async def scan_and_notify_availability(req: MediaRequest, settings: Settings, db: AsyncSession) -> bool:
    """Scanne Plex immédiatement pour CE seul média avant d'envoyer le mail de disponibilité.

    Appelé au moment précis où une demande devient disponible (webhook temps réel ou poll
    *arr), pour proposer directement le bon mail (VF / VO / jalon série) plutôt que le
    mail générique "Disponible sur Plex" — sans attendre le prochain scan VFF planifié.

    Retourne True si le scan a tranché (mail déjà géré ci-dessous) — l'appelant ne doit
    alors plus rien envoyer lui-même. Retourne False si le scan n'a pas pu conclure (VFF
    désactivé, mode "classic" de l'utilisateur, Plex non configuré, ou média pas encore
    indexé dans Plex) — l'appelant garde son comportement actuel (mail générique, ou
    attente du prochain scan planifié qui rattrapera le cas via son propre filet de
    sécurité).
    """
    if not settings.vff_enabled or not settings.plex_url or not settings.plex_token:
        return False

    user_obj = (await db.execute(select(PlexUser).filter(PlexUser.plex_user_id == req.plex_user_id))).scalars().first()
    series_no_language = False
    if req.media_type == "movie":
        if not _resolve_movie_notify_language(settings, user_obj):
            return False
    else:
        series_no_language = not _resolve_series_notify_language(settings, user_obj)

    libs = _parse_vff_libraries(settings)
    if not libs:
        return False

    candidate = {
        "id": req.id,
        "title": req.title,
        "year": req.year,
        "media_type": req.media_type,
        "tmdb_id": req.tmdb_id,
        "tvdb_id": req.tvdb_id,
        "imdb_id": req.imdb_id,
        "plex_guid": req.plex_guid,
    }
    known_vf = await _load_known_vf_episodes(db, "request", [req.id]) if req.media_type == "show" else {}
    known_episodes = await _sonarr_episode_numbers_for(db, req) if req.media_type == "show" else None
    try:
        results = await asyncio.to_thread(
            _scan_vf_blocking,
            settings.plex_url,
            settings.plex_token,
            [candidate],
            libs,
            known_vf,
            None,
            {req.id: known_episodes} if known_episodes is not None else None,
        )
    except Exception as e:
        logger.warning(f"Scan eager VFF échec pour '{req.title}': {e}")
        return False

    res: dict[str, Any] = results[0] if results else {"found": False}
    if not res.get("found"):
        # Pas encore indexé côté Plex (course avec le scan Sonarr/Radarr → Plex) : on ne
        # force rien, le prochain scan planifié (et son filet de sécurité) prendra le relais.
        return False

    now = now_utc_naive()
    episode_status: dict[int, dict[int, bool]] | None = res.get("episode_status")
    if episode_status:
        await _persist_episode_status(
            db, "request", req.id, episode_status, now, res.get("french_default"), res.get("known_episode_status")
        )
        await _persist_episode_metadata(db, "request", req.id, res.get("episode_metadata"), now)
        await db.commit()

    season_aired_counts = None
    if req.media_type == "show":
        counts = await _prefetch_season_aired_counts(db, [req])
        season_aired_counts = counts.get(req.id)

    if req.media_type == "show" and series_no_language:
        await _queue_show_milestones(
            settings, req, db, language=None, episode_status=episode_status, season_aired_counts=season_aired_counts
        )
        return True

    trigger_search, _, _ = await _apply_vf_result(
        req,
        res["has_vf"],
        res.get("category"),
        db,
        settings,
        now,
        season_aired_counts=season_aired_counts,
        episode_status=episode_status,
        fr_is_default=res.get("fr_is_default"),
        known_episode_status=res.get("known_episode_status"),
    )
    if trigger_search:
        await _trigger_vf_search(db, settings, req)
    return True


vff_light_scan_state: dict[str, Any] = {
    "status": "idle",  # "idle" | "running" | "failed"
    "started_at": None,
    "finished_at": None,
    "items_scanned": 0,
    "total_items": 0,
    "error": None,
}


def _start_scan_state(state: dict[str, Any]) -> None:
    state.update(
        {
            "status": "running",
            "started_at": now_utc().isoformat(),
            "finished_at": None,
            "items_scanned": 0,
            "total_items": 0,
            "error": None,
        }
    )
    # Apres le passage a "running" : la tache de diffusion s'arrete des qu'elle observe un
    # etat au repos (voir vff_progress.notify_vff_progress).
    from .vff_progress import notify_vff_progress

    notify_vff_progress()


def _vf_candidate_filters(only_unseen: bool, force: bool):
    """Filtres SQL identiques pour demandes et éléments Plex.

    En scan complet (not only_unseen), on inclut également les films VF (has_vf=True,
    media_type='movie') dont forced_fr_status est NULL : les sous-titres des films ne
    sont pas stockés en DB, un re-scan Plex one-time est nécessaire pour les remplir.
    Les séries VF sont traitées séparément par _backfill_show_forced_fr_status (DB-only).
    """
    if force:
        return true(), true()
    request_filter = (
        MediaRequest.has_vf.is_(None)
        if only_unseen
        else (MediaRequest.has_vf.is_(None)) | (MediaRequest.has_vf.is_(False))
    )
    if only_unseen:
        library_filter = LibraryItem.has_vf.is_(None)
    else:
        library_filter = (
            (LibraryItem.has_vf.is_(None))
            | (LibraryItem.has_vf.is_(False))
            | (
                LibraryItem.has_vf.is_(True)
                & (LibraryItem.media_type == "movie")
                & LibraryItem.forced_fr_status.is_(None)
            )
        )
    return request_filter, library_filter


async def _backfill_show_forced_fr_status(db: AsyncSession) -> int:
    """Calcule forced_fr_status pour les séries VF (has_vf=True) depuis les EpisodeMetadata
    déjà stockées en DB, sans appel Plex.

    Retourne le nombre d'items mis à jour.
    """
    shows = (
        (
            await db.execute(
                select(LibraryItem).filter(
                    LibraryItem.has_vf.is_(True),
                    LibraryItem.media_type == "show",
                    LibraryItem.forced_fr_status.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )

    if not shows:
        return 0

    show_ids = [s.id for s in shows]
    meta_rows = (
        (
            await db.execute(
                select(EpisodeMetadata).filter(
                    EpisodeMetadata.source_type == "library_item",
                    EpisodeMetadata.source_id.in_(show_ids),
                )
            )
        )
        .scalars()
        .all()
    )

    meta_by_show: dict[int, dict] = {}
    for row in meta_rows:
        tracks = json.loads(row.audio_tracks) if row.audio_tracks else []
        subs = json.loads(row.subtitles) if row.subtitles else []
        meta_by_show.setdefault(row.source_id, {}).setdefault(row.season_number, {})[row.episode_number] = {
            "tracks": tracks,
            "subtitles": subs,
        }

    updated = 0
    for show in shows:
        ep_meta = meta_by_show.get(show.id)
        if not ep_meta:
            continue
        sub_fr, forced_fr = _compute_subtitle_status("show", [], [], ep_meta)
        changed = False
        if forced_fr is not None and show.forced_fr_status != forced_fr:
            show.forced_fr_status = forced_fr
            changed = True
        if sub_fr is not None and show.sub_fr_status != sub_fr:
            show.sub_fr_status = sub_fr
            changed = True
        if changed:
            updated += 1

    if updated:
        await db.commit()
    return updated


def _vf_candidate_payload(row) -> dict[str, Any]:
    return {
        "id": row.id,
        "title": row.title,
        "year": row.year,
        "media_type": row.media_type,
        "tmdb_id": row.tmdb_id,
        "tvdb_id": row.tvdb_id,
        "imdb_id": row.imdb_id,
        "plex_guid": row.plex_guid,
    }


async def _known_episodes_for_show_rows(db: AsyncSession, rows: list) -> dict[int, dict[int, set[int]]]:
    """Précharge {id: {season_number: {episode_number connu de Sonarr}}} pour un lot de
    séries (MediaRequest ou LibraryItem) — voir `_sonarr_episode_numbers_for`. Une série
    sans lien Sonarr résoluble est simplement absente du résultat (rien à exclure).

    Requêtes Sonarr menées en parallèle (concurrence limitée) : un scan complet peut
    porter sur plusieurs centaines de séries, et un `await` séquentiel (2 appels HTTP par
    série) faisait dépasser l'heure pour un simple rescan forcé de bibliothèque.
    """
    show_rows = [row for row in rows if row.media_type == "show"]
    if not show_rows:
        return {}
    # Résolution des instances Sonarr séquentielle (accès DB, non parallélisable sur une
    # même AsyncSession) ; seuls les appels HTTP Sonarr (lents, ~1-2 requêtes/série) sont
    # ensuite parallélisés, sans plus toucher la session.
    instances_by_row_id: dict[int, ArrInstance] = {}
    for row in show_rows:
        inst = await _resolve_sonarr_instance_for(db, row)
        if inst:
            instances_by_row_id[row.id] = inst
    if not instances_by_row_id:
        return {}
    # Catalogue Sonarr téléchargé une seule fois par instance, puis réutilisé pour toutes
    # les résolutions tvdb_id -> series_id : c'était le coût dominant du scan complet
    # (un catalogue de plusieurs Mo retéléchargé par série).
    series_cache: dict[int, list[dict]] = {}
    for inst in {id(i): i for i in instances_by_row_id.values()}.values():
        await _series_list_cache_get(series_cache, inst)
    semaphore = asyncio.Semaphore(8)

    async def _fetch(row):
        inst = instances_by_row_id[row.id]
        async with semaphore:
            return row.id, await _episode_numbers_via_instance(
                inst, row, await _series_list_cache_get(series_cache, inst)
            )

    rows_with_instance = [row for row in show_rows if row.id in instances_by_row_id]
    results = await asyncio.gather(*(_fetch(row) for row in rows_with_instance))
    return {row_id: known for row_id, known in results if known is not None}


async def _scan_candidate_group(
    db: AsyncSession,
    settings: Settings,
    source_type: str,
    candidates: list[dict[str, Any]],
    libs: list[dict[str, Any]],
    state: dict[str, Any],
    now,
    known_episodes_by_id: dict[int, dict[int, set[int]]] | None = None,
) -> dict[int, dict[str, Any]]:
    """Scan Plex bloquant + persistance du détail épisode pour un groupe homogène."""
    if not candidates:
        return {}
    known = await _load_known_vf_episodes(db, source_type, [candidate["id"] for candidate in candidates])
    results = await asyncio.to_thread(
        _scan_vf_blocking,
        settings.plex_url,
        settings.plex_token,
        candidates,
        libs,
        known,
        state,
        known_episodes_by_id,
    )
    for result in results:
        episode_status = result.get("episode_status")
        if episode_status:
            await _persist_episode_status(
                db,
                source_type,
                result["id"],
                episode_status,
                now,
                result.get("french_default"),
                result.get("known_episode_status"),
            )
            await _persist_episode_metadata(db, source_type, result["id"], result.get("episode_metadata"), now)
    if any(result.get("episode_status") for result in results):
        await db.commit()
    return {result["id"]: result for result in results}


async def _run_vf_scan(
    only_unseen: bool,
    state: dict[str, Any],
    label: str,
    force: bool = False,
    section: str | None = None,
) -> None:
    """Cœur du job VFF : détecte la présence de VF sur les médias disponibles et notifie.

    - Première analyse d'un média (has_vf IS NULL) :
        · VF présente  → has_vf=True (pas de notification, l'« available » a suffi)
        · VO seulement → has_vf=False + notification « disponible en VO » + suivi actif
    - Ré-analyse des médias suivis (has_vf=False), seulement si `only_unseen=False` :
        · VF désormais présente → has_vf=True + notification « VF disponible »

    `only_unseen=True` restreint aux médias jamais analysés (`has_vf IS NULL`) : sous-
    ensemble généralement petit, utilisé par le scan léger et fréquent
    (`check_new_vf_availability`) pour combler le trou laissé par un scan eager raté sans
    attendre le scan complet (`check_vf_statuses`, tous les médias en attente de VF, sur
    un intervalle plus long).

    `force=True` : re-scanne aussi les médias déjà marqués `has_vf=True` (normalement
    exclus, voir `req_has_vf_filter`/`lib_has_vf_filter` ci-dessous) — utilisé quand le
    cache par épisode est suspecté obsolète (faux positif, remplacement de fichier côté
    Plex). L'appelant est responsable d'avoir déjà vidé le cache par épisode
    (`_invalidate_vf_cache`) avant d'appeler cette fonction.

    La détection Plex (plexapi) est bloquante : elle est déportée dans un thread.

    `section` : nom de la section d'état partagé (voir services/scan_state.py) quand ce
    scan est visible depuis les autres process. Sans lui, la garde « déjà en cours »
    ci-dessous ne voit que ce process — et le cron ARQ du worker doublonnait avec un
    déclenchement manuel venu du conteneur web.
    """
    if section is not None:
        from . import scan_state

        already_running = await scan_state.is_running(section, state)
    else:
        already_running = state["status"] == "running"
    if already_running:
        logger.info(f"VFF ({label}) : un scan est déjà en cours, skip")
        return

    _start_scan_state(state)

    db: AsyncSession = AsyncSessionLocal()
    try:
        settings = (await db.execute(select(Settings))).scalars().first()
        if not settings or not settings.vff_enabled:
            state["status"] = "idle"
            return
        if not settings.plex_url or not settings.plex_token:
            logger.info(f"VFF ({label}) : Plex non configuré, skip")
            state["status"] = "idle"
            return

        libs = _parse_vff_libraries(settings)
        if not libs:
            logger.info(f"VFF ({label}) : aucune bibliothèque configurée, skip")
            state["status"] = "idle"
            return

        # --- Réconciliation : demandes jamais passées "available" mais déjà présentes
        # dans Plex. Sonarr/Radarr peut ne jamais détecter le fichier (import manuel,
        # retard d'indexation, média ajouté directement dans Plex sans passer par *arr...),
        # laissant la demande bloquée en pending/sent_to_arr indéfiniment alors que la
        # bibliothèque Plex prouve déjà sa présence réelle. La présence dans LibraryItem
        # devient donc un déclencheur de disponibilité à part entière, indépendant de ce
        # que rapporte *arr.
        pending_q = (
            (
                await db.execute(
                    select(MediaRequest).filter(
                        MediaRequest.status.notin_([RequestStatus.available, RequestStatus.failed]),
                        MediaRequest.library_item_id.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        promoted = 0
        now_reconcile = now_utc_naive()
        for req in pending_q:
            li = await _link_request_to_library_item(db, req)
            if not li:
                continue
            from .request_lifecycle import transition_request

            await transition_request(db, req, "available", source="plex_vff", available_at=now_reconcile)
            promoted += 1
            logger.info(f"VFF : '{req.title}' détecté disponible via la bibliothèque Plex (arr en retard/inconnu)")
            # Pas de notification "available" ici : cette fonction ne tourne que si VFF est
            # actif (garde en tête de fonction), donc has_vf est encore None juste après la
            # promotion -> la demande retombe naturellement dans candidates_q ci-dessous et
            # reçoit "available" (VF présente) ou "vo_only" (VO) selon le résultat du scan,
            # sans jamais doubler la notification.
        if promoted:
            await db.commit()
            logger.info(f"VFF ({label}) : {promoted} demande(s) promue(s) 'disponible' via la bibliothèque Plex")

        req_has_vf_filter, lib_has_vf_filter = _vf_candidate_filters(only_unseen, force)
        candidates_q = (
            (
                await db.execute(
                    select(MediaRequest).filter(
                        MediaRequest.status == RequestStatus.available,
                        # Une demande sans library_item_id reste candidate au rattachement meme si
                        # son has_vf est deja connu (VF confirmee) : sans ce filtre supplementaire,
                        # une demande dont le lien a echoue/n'a jamais eu lieu (ex: titre localise
                        # different entre *arr et Plex) ne repasse plus jamais dans cette boucle une
                        # fois has_vf resolu -- son nom de demandeur reste alors introuvable sur la
                        # fiche Bibliotheque (jointure via library_item_id), a jamais.
                        req_has_vf_filter | MediaRequest.library_item_id.is_(None),
                        MediaRequest.vf_tracking_disabled.is_(False),
                    )
                )
            )
            .scalars()
            .all()
        )
        # La musique (artist/album/track) n'a pas de notion de piste VF/VO doublee : le
        # scan est ecarte ici, pas seulement documente en aval (voir scan_media_vf), sinon
        # chaque item musique (has_vf reste None indefiniment, jamais resolu) est reinjecte
        # comme candidat a chaque cycle, pour une recherche Plex qui echoue systematiquement
        # (scan_media_vf ne cherche que dans les bibliotheques films/series).
        lib_q = (
            (
                await db.execute(
                    select(LibraryItem).filter(
                        lib_has_vf_filter,
                        LibraryItem.media_type.notin_(("artist", "album", "track")),
                    )
                )
            )
            .scalars()
            .all()
        )
        if not candidates_q and not lib_q:
            state["status"] = "idle"
            state["finished_at"] = now_utc().isoformat()
            return

        # Rapprochement demande <-> LibraryItem : une fois liée, une demande n'est plus
        # scannée indépendamment dans Plex — son has_vf est propagé depuis le LibraryItem
        # (source de vérité unique), pour éviter deux scans divergents du même média
        # (ex: Bibliothèque affiche VF alors que Demandes affiche encore VO en attente).
        linked_pairs: list[tuple[MediaRequest, LibraryItem]] = []
        unlinked_candidates_q: list[MediaRequest] = []
        for req in candidates_q:
            li = await _link_request_to_library_item(db, req)
            if li:
                linked_pairs.append((req, li))
            else:
                unlinked_candidates_q.append(req)
        if linked_pairs:
            await db.commit()  # persiste les nouveaux library_item_id

        candidates = [_vf_candidate_payload(r) for r in unlinked_candidates_q]
        lib_candidates = [_vf_candidate_payload(r) for r in lib_q]
        state["total_items"] = len(candidates) + len(lib_candidates)
        logger.info(
            f"VFF ({label}) : analyse de {len(candidates)} demande(s) non liée(s) + {len(lib_candidates)} média(s) "
            f"de bibliothèque ({len(linked_pairs)} demande(s) liée(s), pas de re-scan)"
        )

        now = now_utc_naive()

        known_episodes_by_req_id = await _known_episodes_for_show_rows(db, unlinked_candidates_q)
        results_by_id = await _scan_candidate_group(
            db, settings, "request", candidates, libs, state, now, known_episodes_by_req_id
        )

        season_counts_by_req_id = await _prefetch_season_aired_counts(
            db, unlinked_candidates_q + [req for req, _ in linked_pairs]
        )

        newly_vo = 0
        newly_vf = 0
        newly_fallback = 0

        for req in unlinked_candidates_q:
            res = results_by_id.get(req.id)

            if not res or not res.get("found"):
                # Média disponible mais pas (encore) indexé dans Plex.
                # Filet de sécurité : si l'« available » a été différé (VFF actif) et
                # jamais envoyé, notifier la disponibilité générique maintenant pour
                # ne pas laisser l'utilisateur sans information. has_vf reste None :
                # un passage ultérieur détectera la VF/VO (suivi silencieux, pas de doublon).
                if req.has_vf is None and not req.available_mail_sent:
                    await _notify("available", settings, req, db)
                    newly_fallback += 1
                continue

            trigger_search, vf_delta, vo_delta = await _apply_vf_result(
                req,
                res["has_vf"],
                res.get("category"),
                db,
                settings,
                now,
                season_aired_counts=season_counts_by_req_id.get(req.id),
                episode_status=res.get("episode_status"),
                fr_is_default=res.get("fr_is_default"),
                known_episode_status=res.get("known_episode_status"),
            )
            newly_vf += vf_delta
            newly_vo += vo_delta
            if trigger_search:
                await _trigger_vf_search(db, settings, req)

        # --- Médias de bibliothèque : état VF pour affichage (pas de notification) ---
        lib_updated = 0
        if lib_candidates:
            known_episodes_by_lib_id = await _known_episodes_for_show_rows(db, lib_q)
            lib_by_id = await _scan_candidate_group(
                db, settings, "library_item", lib_candidates, libs, state, now, known_episodes_by_lib_id
            )
            for li in lib_q:
                res = lib_by_id.get(li.id)
                if not res or not res.get("found"):
                    continue
                prev = li.has_vf
                plex_finder.apply_plex_metadata(li, res)
                li.vf_category = res.get("category") or li.vf_category
                li.vf_checked_at = now
                li.has_vf = bool(res["has_vf"])
                li.fr_is_default = res.get("fr_is_default")
                li.vf_granularity = (
                    "full"
                    if li.has_vf
                    else audio_analyzer.compute_vf_granularity(
                        res.get("episode_status"), res.get("known_episode_status")
                    )
                )
                li.sub_fr_status, li.forced_fr_status = _compute_subtitle_status(
                    li.media_type,
                    res.get("tracks") or [],
                    res.get("subtitles") or [],
                    res.get("episode_metadata"),
                )
                if li.has_vf and prev is False:
                    li.vf_available_at = now
                lib_updated += 1
                episode_status = res.get("episode_status")
                if episode_status:
                    await _persist_episode_status(
                        db,
                        "library_item",
                        li.id,
                        episode_status,
                        now,
                        res.get("french_default"),
                        res.get("known_episode_status"),
                    )
                    await _persist_episode_metadata(db, "library_item", li.id, res.get("episode_metadata"), now)
            await db.commit()

        # --- Demandes liées à un LibraryItem : propager son has_vf, pas de re-scan Plex ---
        linked_updated = 0
        linked_episode_status = await _load_episode_status_map(
            db, "library_item", list({li.id for _, li in linked_pairs})
        )
        for req, li in linked_pairs:
            if li.has_vf is None:
                continue  # LibraryItem pas encore résolu ; réessaiera au prochain cycle
            trigger_search, vf_delta, vo_delta = await _apply_vf_result(
                req,
                li.has_vf,
                li.vf_category,
                db,
                settings,
                now,
                season_aired_counts=season_counts_by_req_id.get(req.id),
                episode_status=linked_episode_status.get(li.id),
                granularity=li.vf_granularity,
                fr_is_default=li.fr_is_default,
            )
            newly_vf += vf_delta
            newly_vo += vo_delta
            if trigger_search:
                await _trigger_vf_search(db, settings, req)
            linked_updated += 1

        # Backfill forced_fr_status pour les séries VF depuis les EpisodeMetadata en DB
        # (pas de Plex nécessaire, les sous-titres de chaque épisode sont déjà stockés).
        shows_backfilled = await _backfill_show_forced_fr_status(db)

        logger.info(
            f"VFF ({label}) : analyse terminée ({newly_vo} nouveau(x) VO, {newly_vf} VF détectée(s), "
            f"{newly_fallback} dispo notifiée(s) en filet, {lib_updated} média(s) de bibliothèque mis à jour, "
            f"{linked_updated} demande(s) liée(s) synchronisée(s), "
            f"{shows_backfilled} série(s) VF backfillée(s) pour forced_fr_status)"
        )
        state["status"] = "idle"
        state["finished_at"] = now_utc().isoformat()
    except Exception as e:
        logger.error(f"Erreur _run_vf_scan ({label}) : {e}")
        state["status"] = "failed"
        state["error"] = str(e)
    finally:
        await db.close()


async def check_vf_statuses(force: bool = False) -> None:
    """Scan complet : tous les médias en attente de VF (`has_vf IS NULL` ou `False`),
    sur l'intervalle long (`vff_recheck_interval_minutes`). `force=True` (scan manuel
    "Forcer l'analyse complète") re-scanne aussi les médias déjà marqués VF."""
    await _run_vf_scan(only_unseen=False, state=vff_scan_state, label="complet", force=force, section="scan")


async def check_new_vf_availability() -> None:
    """Scan léger : uniquement les médias jamais analysés (`has_vf IS NULL`), sur un
    intervalle court (1 min) — comble le trou laissé par un scan eager raté
    (`scan_and_notify_availability`) sans attendre le prochain scan complet."""
    await _run_vf_scan(only_unseen=True, state=vff_light_scan_state, label="léger")


async def check_episode_tracking():
    """Job de suivi épisode/saison "sans langue" (voir `_resolve_series_notify_language`).

    Contrairement à `check_vf_statuses`, ne dépend pas de `settings.vff_enabled` : seules
    les demandes dont `series_notify_language` résolu (global ou par utilisateur) vaut
    False sont scannées. Réutilise le même scanner Plex (`_scan_vf_blocking`) — la présence
    d'un épisode dans `episode_status` (retourné par le scan, indépendamment de sa valeur
    has_vf) suffit à prouver sa présence dans la bibliothèque Plex, langue non prise en
    compte ici. Les jalons sont dédupliqués via `NotificationMilestone` (direction="simple"),
    donc rescanner une série déjà notifiée est sans effet (pas de doublon).
    """
    if episode_scan_state["status"] == "running":
        logger.info("Suivi épisode : un scan est déjà en cours, skip")
        return

    episode_scan_state["status"] = "running"
    episode_scan_state["started_at"] = now_utc().isoformat()
    episode_scan_state["finished_at"] = None
    episode_scan_state["items_scanned"] = 0
    episode_scan_state["total_items"] = 0
    episode_scan_state["error"] = None

    db: AsyncSession = AsyncSessionLocal()
    try:
        settings = (await db.execute(select(Settings))).scalars().first()
        if not settings or not settings.plex_url or not settings.plex_token:
            episode_scan_state["status"] = "idle"
            return

        libs = _parse_vff_libraries(settings)
        if not libs:
            episode_scan_state["status"] = "idle"
            return

        global_no_language = not _resolve_series_notify_language(settings, None)
        candidates_q = (
            (
                await db.execute(
                    select(MediaRequest).filter(
                        MediaRequest.status == RequestStatus.available, MediaRequest.media_type == "show"
                    )
                )
            )
            .scalars()
            .all()
        )
        users_by_id = {u.plex_user_id: u for u in (await db.execute(select(PlexUser))).scalars().all()}

        def _wants_no_language(req: MediaRequest) -> bool:
            user_obj = users_by_id.get(req.plex_user_id)
            if user_obj and user_obj.series_notify_language is not None:
                return not user_obj.series_notify_language
            return global_no_language

        candidates_q = [r for r in candidates_q if _wants_no_language(r)]
        if not candidates_q:
            episode_scan_state["status"] = "idle"
            episode_scan_state["finished_at"] = now_utc().isoformat()
            return

        def _to_candidate(r):
            return {
                "id": r.id,
                "title": r.title,
                "year": r.year,
                "media_type": r.media_type,
                "tmdb_id": r.tmdb_id,
                "tvdb_id": r.tvdb_id,
                "imdb_id": r.imdb_id,
                "plex_guid": r.plex_guid,
            }

        candidates = [_to_candidate(r) for r in candidates_q]
        episode_scan_state["total_items"] = len(candidates)
        logger.info(f"Suivi épisode : analyse de {len(candidates)} série(s) en mode simple")

        now = now_utc_naive()
        results = await asyncio.to_thread(
            _scan_vf_blocking, settings.plex_url, settings.plex_token, candidates, libs, None, episode_scan_state
        )
        results_by_id = {r["id"]: r for r in results}
        season_counts_by_req_id = await _prefetch_season_aired_counts(db, candidates_q)

        notified = 0
        for req in candidates_q:
            res = results_by_id.get(req.id)
            if not res or not res.get("found"):
                continue
            episode_status = res.get("episode_status")
            if episode_status:
                await _persist_episode_status(db, "request", req.id, episode_status, now, res.get("french_default"))
                await _persist_episode_metadata(db, "request", req.id, res.get("episode_metadata"), now)
                await db.commit()
            notified += await _queue_show_milestones(
                settings,
                req,
                db,
                language=None,
                episode_status=episode_status,
                season_aired_counts=season_counts_by_req_id.get(req.id),
            )

        logger.info(f"Suivi épisode : analyse terminée ({notified} notification(s) déclenchée(s))")
        episode_scan_state["status"] = "idle"
        episode_scan_state["finished_at"] = now_utc().isoformat()
    except Exception as e:
        logger.error(f"Erreur check_episode_tracking : {e}")
        episode_scan_state["status"] = "failed"
        episode_scan_state["error"] = str(e)
    finally:
        await db.close()


def trigger_vff_scan_background(force: bool = False):
    if vff_scan_state["status"] == "running":
        return
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(check_vf_statuses(force=force))
    except RuntimeError:
        pass
