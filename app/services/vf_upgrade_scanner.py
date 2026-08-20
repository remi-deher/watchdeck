"""Recherche de releases VF (MULTI/VFF/TRUEFRENCH...) pour upgrader un média encore VO
ou partiellement VF, via la recherche interactive Sonarr/Radarr.

Distinct du scan VF (`vff_scanner.py`, qui lit ce que Plex a déjà) : ce module interroge
les indexeurs pour proposer un candidat d'UPGRADE, jamais grabbé automatiquement --
l'utilisateur valide manuellement depuis la fiche média (voir routers/vf_upgrades_api.py).

Granularité adaptative, pour rester dans le même ordre de grandeur de coût que le scan VF
(voir les correctifs de performance de la même session) :
- saison entièrement VO -> une seule recherche de season pack ;
- saison mixte (déjà partiellement VF) -> recherche uniquement les épisodes encore VO de
  CETTE saison, jamais toute la saison ;
- film -> une recherche.

La recherche interactive Sonarr/Radarr interroge les indexeurs en direct (plusieurs
secondes par appel, contrairement aux lectures de catalogue) : contrairement au scan VF,
elle n'est PAS parallélisable à haute concurrence sans risquer de saturer les indexeurs.
Concurrence modeste (voir `_SEARCH_CONCURRENCY`) et plafond par passage
(`_MAX_SEARCHES_PER_RUN`) pour qu'un cycle reste borné en durée -- le reste attend le
prochain cycle (cooldown, voir `_COOLDOWN`).
"""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import timedelta
from itertools import zip_longest
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..cache import cache
from ..database import AsyncSessionLocal
from ..models import ArrInstance, LibraryItem, MediaRequest, Settings, VfEpisodeStatus, VfUpgradeSuggestion
from ..utils import now_utc, now_utc_naive
from . import radarr, sonarr
from .release_matching import french_release_evidence, release_is_french, release_matches_target

logger = logging.getLogger(__name__)

vf_upgrade_scan_state: dict[str, Any] = {
    "status": "idle",
    "started_at": None,
    "finished_at": None,
    "items_scanned": 0,
    "total_items": 0,
    "suggestions_found": 0,
    "error": None,
}
_CURRENT_FILES_CACHE_TTL = 60
_current_files_cache: dict[tuple, tuple[float, list[dict]]] = {}
_current_files_inflight: dict[tuple, asyncio.Task] = {}


def _setting(settings: Settings | None, name: str, default):
    value = getattr(settings, name, None) if settings is not None else None
    return default if value is None else value


def _order_tasks(tasks: list["_SearchTask"], settings: Settings | None) -> list["_SearchTask"]:
    """Applique la priorite configuree sans modifier l'ordre relatif d'une categorie."""
    priority = [
        value.strip().lower()
        for value in _setting(settings, "vf_upgrade_priority", "mixed,vo,vf").split(",")
        if value.strip().lower() in {"mixed", "vo", "vf"}
    ]
    priority.extend(value for value in ("mixed", "vo", "vf") if value not in priority)
    priority_rank = {value: index for index, value in enumerate(priority)}
    return sorted(tasks, key=lambda task: priority_rank.get(task.target_kind, len(priority_rank)))


@dataclass
class _SearchTask:
    source_type: str
    source_id: int
    scope: str  # "movie" | "season" | "episode"
    arr_type: str
    inst: ArrInstance
    arr_id: Optional[int] = None  # movie_id, series_id
    episode_id: Optional[int] = None  # Sonarr episode id (numeric), scope "episode"
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    title: str = ""
    target_kind: str = "vo"  # "mixed" | "vo" | "vf"
    current_release_titles: list[str] = field(default_factory=list)


class ReleaseResults(list):
    """Liste compatible avec les appelants existants, enrichie du volume indexeur brut."""

    def __init__(self, values=(), *, raw_count: int = 0):
        super().__init__(values)
        self.raw_count = raw_count


def _file_release_title(item: dict) -> str | None:
    title = (item.get("sceneName") or item.get("releaseTitle") or "").strip()
    if title:
        return title
    path = (item.get("relativePath") or item.get("path") or "").strip()
    if not path:
        return None
    filename = re.split(r"[/\\]", path)[-1]
    return re.sub(r"\.[a-z0-9]{2,5}$", "", filename, flags=re.IGNORECASE)


async def _current_release_titles(task: _SearchTask) -> list[str]:
    """Noms des fichiers en place dans la portee, recuperes depuis *arr."""
    try:
        cache_key = (task.arr_type, task.inst.id, task.arr_id)
        cached = _current_files_cache.get(cache_key)
        if cached and time.monotonic() - cached[0] < _CURRENT_FILES_CACHE_TTL:
            files = cached[1]
        else:
            query = _current_files_inflight.get(cache_key)
            if query is None:
                call = (
                    radarr.get_movie_files(task.inst.url, task.inst.api_key, task.arr_id)
                    if task.arr_type == "radarr"
                    else sonarr.get_episode_files(task.inst.url, task.inst.api_key, task.arr_id)
                )
                query = asyncio.create_task(call)
                _current_files_inflight[cache_key] = query
            try:
                files = await query
                _current_files_cache[cache_key] = (time.monotonic(), files)
            finally:
                if _current_files_inflight.get(cache_key) is query:
                    _current_files_inflight.pop(cache_key, None)
        if task.arr_type == "sonarr":
            if task.scope == "episode":
                files = [item for item in files if task.episode_id in (item.get("episodeIds") or [])]
            elif task.scope == "season":
                files = [item for item in files if item.get("seasonNumber") == task.season_number]
        return list(dict.fromkeys(title for item in files if (title := _file_release_title(item))))
    except Exception as exc:
        logger.warning("VF upgrade : titre de la release actuelle indisponible pour '%s': %s", task.title, exc)
        return []


async def _resolve_instance_for(db: AsyncSession, obj, arr_type: str) -> Optional[ArrInstance]:
    """Instance *arr pour `obj` (MediaRequest ou LibraryItem) -- requête DB seule, aucun
    appel réseau (même séparation que `vff_scanner._resolve_sonarr_instance_for`, pour
    pouvoir résoudre toutes les instances séquentiellement puis paralléliser les
    recherches elles-mêmes sans partager l'AsyncSession entre coroutines)."""
    arr_instance_id = getattr(obj, "arr_instance_id", None)
    inst = None
    if arr_instance_id:
        inst = (
            (
                await db.execute(
                    select(ArrInstance).filter(
                        ArrInstance.id == arr_instance_id, ArrInstance.arr_type == arr_type, ArrInstance.enabled
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
                        ArrInstance.arr_type == arr_type, ArrInstance.enabled, ArrInstance.is_default
                    )
                )
            )
            .scalars()
            .first()
        )
    return inst


async def _recent_scan_keys(db: AsyncSession, settings: Settings | None = None) -> set[tuple]:
    """{(source_type, source_id, scope, season_number, episode_number)} déjà scannés dans
    la fenêtre de cooldown -- une seule requête plutôt qu'une par candidat."""
    now = now_utc_naive()
    regular_cutoff = now - timedelta(hours=max(1, _setting(settings, "vf_upgrade_cooldown_hours", 24)))
    retry_cutoff = now - timedelta(hours=max(1, _setting(settings, "vf_upgrade_retry_hours", 6)))
    rows = (
        await db.execute(
            select(
                VfUpgradeSuggestion.source_type,
                VfUpgradeSuggestion.source_id,
                VfUpgradeSuggestion.scope,
                VfUpgradeSuggestion.season_number,
                VfUpgradeSuggestion.episode_number,
                VfUpgradeSuggestion.status,
                VfUpgradeSuggestion.scanned_at,
            ).filter(VfUpgradeSuggestion.scanned_at.isnot(None))
        )
    ).all()
    return {
        tuple(row[:5]) for row in rows if row.scanned_at > (retry_cutoff if row.status == "failed" else regular_cutoff)
    }


async def _skip_statuses(db: AsyncSession, settings: Settings | None = None) -> set[tuple]:
    """{(source_type, source_id, scope, season_number, episode_number)} à ne jamais
    re-scanner en tâche de fond : déjà grabbée, ou explicitement ignorée par
    l'utilisateur -- seul le bouton "Chercher" (force=True) passe outre."""
    rows = (
        await db.execute(
            select(
                VfUpgradeSuggestion.source_type,
                VfUpgradeSuggestion.source_id,
                VfUpgradeSuggestion.scope,
                VfUpgradeSuggestion.season_number,
                VfUpgradeSuggestion.episode_number,
            ).filter(
                VfUpgradeSuggestion.status.in_(
                    (
                        "grabbed",
                        "accepted",
                        "downloading",
                        "importing",
                        "awaiting_verification",
                        "verified",
                        "dismissed",
                    )
                )
            )
        )
    ).all()
    skipped = {tuple(r) for r in rows}
    max_retries = max(0, _setting(settings, "vf_upgrade_max_retries", 3))
    exhausted = (
        await db.execute(
            select(
                VfUpgradeSuggestion.source_type,
                VfUpgradeSuggestion.source_id,
                VfUpgradeSuggestion.scope,
                VfUpgradeSuggestion.season_number,
                VfUpgradeSuggestion.episode_number,
            ).filter(
                VfUpgradeSuggestion.status == "failed",
                VfUpgradeSuggestion.retry_count >= max_retries,
            )
        )
    ).all()
    return skipped | {tuple(r) for r in exhausted}


async def _build_movie_tasks(
    db: AsyncSession, force: bool, skip: set, recent: set, settings: Settings | None = None
) -> list[_SearchTask]:
    tasks: list[_SearchTask] = []
    for model in (MediaRequest, LibraryItem):
        rows = (
            (await db.execute(select(model).filter(model.media_type == "movie", model.arr_id.isnot(None))))
            .scalars()
            .all()
        )
        source_type = "request" if model is MediaRequest else "library_item"
        for row in rows:
            # Une demande deja liee a un LibraryItem (voir _link_request_to_library_item,
            # vff_scanner.py) fait doublon avec lui : meme film, meme arr_id, mais un titre
            # fige au moment de la demande (jamais resynchronise si l'utilisateur renomme le
            # fichier dans Plex ensuite) et un has_vf qui peut diverger. Sans ce filtre, les
            # deux lignes produisent chacune leur propre suggestion pour le meme film.
            if model is MediaRequest and getattr(row, "library_item_id", None) is not None:
                continue
            if row.has_vf is True and not _setting(settings, "vf_upgrade_include_vf", False):
                continue
            if row.has_vf is True and _setting(settings, "vf_upgrade_protect_existing_vf", True):
                continue
            if row.has_vf is not True and not _setting(settings, "vf_upgrade_include_vo", True):
                continue
            # arr_id d'une demande Seer est l'ID interne Seer, pas celui de Radarr --
            # meme choix que _trigger_vf_search (vff_scanner.py), qui exclut ces demandes
            # plutot que de risquer une recherche sur le mauvais film.
            if getattr(row, "source", None) == "seer":
                continue
            key = (source_type, row.id, "movie", None, None)
            if not force and (key in skip or key in recent):
                continue
            inst = await _resolve_instance_for(db, row, "radarr")
            if not inst:
                continue
            tasks.append(
                _SearchTask(
                    source_type=source_type,
                    source_id=row.id,
                    scope="movie",
                    arr_type="radarr",
                    inst=inst,
                    arr_id=row.arr_id,
                    title=row.title,
                    target_kind="vf" if row.has_vf is True else "vo",
                )
            )
    return tasks


async def _season_vf_status(db: AsyncSession, source_type: str, source_id: int) -> dict[int, dict[int, bool]]:
    """{season_number: {episode_number: has_vf}} d'une série, épisodes connus de
    Sonarr/TheTVDB uniquement (voir VfEpisodeStatus.is_known_episode -- un épisode
    fantôme Plex n'a pas de release Sonarr à chercher)."""
    rows = (
        (
            await db.execute(
                select(VfEpisodeStatus).filter(
                    VfEpisodeStatus.source_type == source_type,
                    VfEpisodeStatus.source_id == source_id,
                    VfEpisodeStatus.is_known_episode.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    out: dict[int, dict[int, bool]] = {}
    for r in rows:
        out.setdefault(r.season_number, {})[r.episode_number] = bool(r.has_vf)
    return out


def classify_vf_target(
    media,
    scope: str,
    season_number: int | None = None,
    episode_number: int | None = None,
    seasons: dict[int, dict[int, bool]] | None = None,
) -> str:
    """Classe une cible avec les donnees du dernier scan audio Plex.

    Une recherche manuelle reste toujours autorisee. Cette classification determine
    seulement si son resultat represente une vraie amelioration VF a conserver dans le
    dashboard.
    """
    if scope == "movie":
        return "vf" if media.has_vf is True else "vo"
    episodes = (seasons or {}).get(season_number or -1, {})
    if scope == "episode":
        if episode_number not in episodes:
            return "unknown"
        return "vf" if episodes[episode_number] else "vo"
    if not episodes:
        return "unknown"
    values = list(episodes.values())
    if all(values):
        return "vf"
    if any(values):
        return "mixed"
    return "vo"


async def _sonarr_season_tasks(
    row,
    inst: ArrInstance,
    source_type: str,
    force: bool,
    skip: set,
    recent: set,
    settings: Settings | None = None,
) -> list[_SearchTask]:
    """Crée des tâches de recherche à partir de la structure Sonarr quand aucun statut Plex
    n'est disponible (série jamais scannée). Une tâche season-pack par saison avec fichiers ;
    si `vf_upgrade_episodic_fallback` est activé, ajoute aussi des tâches par épisode pour
    couvrir les releases MULTI épisodiques sans season pack indexé."""
    tasks: list[_SearchTask] = []
    try:
        series_data = await sonarr.lookup_series(inst.url, inst.api_key, arr_id=row.arr_id)
        if not series_data:
            return tasks
        stats = sonarr.aggregate_monitored_episode_stats(series_data)
        seasons_with_files = [s for s in stats.get("seasons", []) if s.get("season_number") and s.get("episode_file_count", 0) > 0]
    except Exception as exc:
        logger.debug("VF upgrade : impossible de lire les saisons Sonarr pour '%s' : %s", row.title, exc)
        return tasks

    episodic_fallback = _setting(settings, "vf_upgrade_episodic_fallback", True)

    # Un seul appel Sonarr pour tous les épisodes de la série (peu importe le nombre de saisons).
    all_episodes: list[dict] = []
    if episodic_fallback and seasons_with_files:
        try:
            all_episodes = await sonarr.get_episodes(inst.url, inst.api_key, row.arr_id)
        except Exception as exc:
            logger.debug("VF upgrade : épisodes Sonarr indisponibles pour '%s' : %s", row.title, exc)

    for season_info in seasons_with_files:
        sn = season_info["season_number"]
        key_pack = (source_type, row.id, "season", sn, None)
        if force or (key_pack not in skip and key_pack not in recent):
            tasks.append(
                _SearchTask(
                    source_type=source_type,
                    source_id=row.id,
                    scope="season",
                    arr_type="sonarr",
                    inst=inst,
                    arr_id=row.arr_id,
                    season_number=sn,
                    title=f"{row.title} - Saison {sn}",
                    target_kind="vo",
                )
            )

        if not episodic_fallback:
            continue
        # Épisodes individuels en fallback pour capturer les MULTI sans season pack
        for ep in all_episodes:
            if ep.get("seasonNumber") != sn:
                continue
            ep_num = ep.get("episodeNumber")
            ep_id = ep.get("id")
            if not ep_num or not ep_id or not ep.get("hasFile"):
                continue
            key_ep = (source_type, row.id, "episode", sn, ep_num)
            if force or (key_ep not in skip and key_ep not in recent):
                tasks.append(
                    _SearchTask(
                        source_type=source_type,
                        source_id=row.id,
                        scope="episode",
                        arr_type="sonarr",
                        inst=inst,
                        arr_id=row.arr_id,
                        episode_id=ep_id,
                        season_number=sn,
                        episode_number=ep_num,
                        title=f"{row.title} - S{sn:02d}E{ep_num:02d}",
                        target_kind="vo",
                    )
                )
    return tasks


async def _build_show_tasks(
    db: AsyncSession, force: bool, skip: set, recent: set, settings: Settings | None = None
) -> list[_SearchTask]:
    tasks: list[_SearchTask] = []
    for model in (MediaRequest, LibraryItem):
        rows = (
            (await db.execute(select(model).filter(model.media_type == "show", model.arr_id.isnot(None))))
            .scalars()
            .all()
        )
        source_type = "request" if model is MediaRequest else "library_item"
        for row in rows:
            # Voir le meme garde-fou dans _build_movie_tasks : une demande deja liee a un
            # LibraryItem fait doublon avec lui.
            if model is MediaRequest and getattr(row, "library_item_id", None) is not None:
                continue
            if getattr(row, "source", None) == "seer":
                continue
            # Instance resolue en premier : necessaire aussi pour le fallback Sonarr (#Fix1).
            inst = await _resolve_instance_for(db, row, "sonarr")
            if not inst:
                continue
            seasons = await _season_vf_status(db, source_type, row.id)
            if not seasons:
                # Fix #1 : aucun statut Plex (serie jamais scannee ou fichiers recemment
                # importes). On interroge directement Sonarr pour decouvrir les saisons
                # disponibles et creer des taches season-pack + episode fallback.
                tasks.extend(await _sonarr_season_tasks(row, inst, source_type, force, skip, recent, settings))
                continue
            episode_ids_needed: dict[int, list[int]] = {}
            for sn, eps in seasons.items():
                if not eps:
                    continue
                if all(eps.values()):
                    if not _setting(settings, "vf_upgrade_include_vf", False):
                        continue
                    if _setting(settings, "vf_upgrade_protect_existing_vf", True):
                        continue
                    key = (source_type, row.id, "season", sn, None)
                    if force or (key not in skip and key not in recent):
                        tasks.append(
                            _SearchTask(
                                source_type=source_type,
                                source_id=row.id,
                                scope="season",
                                arr_type="sonarr",
                                inst=inst,
                                arr_id=row.arr_id,
                                season_number=sn,
                                title=f"{row.title} - Saison {sn}",
                                target_kind="vf",
                            )
                        )
                    continue
                if not any(eps.values()):
                    if not _setting(settings, "vf_upgrade_include_vo", True):
                        continue
                    # Saison entierement VO : season pack en priorite.
                    key = (source_type, row.id, "season", sn, None)
                    if force or (key not in skip and key not in recent):
                        tasks.append(
                            _SearchTask(
                                source_type=source_type,
                                source_id=row.id,
                                scope="season",
                                arr_type="sonarr",
                                inst=inst,
                                arr_id=row.arr_id,
                                season_number=sn,
                                title=f"{row.title} - Saison {sn}",
                            )
                        )
                    # Fix #4 : fallback episodique pour capturer les MULTI sans season pack.
                    # Les taches episode s'ajoutent avec une priorite inferieure (en fin de
                    # liste avant tri) et ne sont generees que si le setting le permet.
                    if _setting(settings, "vf_upgrade_episodic_fallback", True):
                        for en, _has_vf in eps.items():
                            key_ep = (source_type, row.id, "episode", sn, en)
                            if not force and (key_ep in skip or key_ep in recent):
                                continue
                            episode_ids_needed.setdefault(sn, []).append(en)
                    continue
                if not _setting(settings, "vf_upgrade_include_mixed", True):
                    continue
                if _setting(settings, "vf_upgrade_mixed_mode", "episodes") == "season" and not _setting(
                    settings, "vf_upgrade_protect_existing_vf", True
                ):
                    key = (source_type, row.id, "season", sn, None)
                    if force or (key not in skip and key not in recent):
                        tasks.append(
                            _SearchTask(
                                source_type=source_type,
                                source_id=row.id,
                                scope="season",
                                arr_type="sonarr",
                                inst=inst,
                                arr_id=row.arr_id,
                                season_number=sn,
                                title=f"{row.title} - Saison {sn}",
                                target_kind="mixed",
                            )
                        )
                    continue
                # Saison mixte : seulement les episodes encore VO de CETTE saison.
                missing = [en for en, has_vf in eps.items() if not has_vf]
                pending_keys = [
                    en
                    for en in missing
                    if force
                    or (
                        (source_type, row.id, "episode", sn, en) not in skip
                        and (source_type, row.id, "episode", sn, en) not in recent
                    )
                ]
                if pending_keys:
                    episode_ids_needed.setdefault(sn, []).extend(pending_keys)

            if episode_ids_needed:
                try:
                    episodes = await sonarr.get_episodes(inst.url, inst.api_key, row.arr_id)
                except Exception as e:
                    logger.warning(f"VF upgrade : episodes Sonarr indisponibles pour '{row.title}': {e}")
                    episodes = []
                by_season_ep = {
                    (ep.get("seasonNumber"), ep.get("episodeNumber")): ep.get("id")
                    for ep in episodes
                    if ep.get("id") is not None
                }
                for sn, ens in episode_ids_needed.items():
                    for en in ens:
                        episode_id = by_season_ep.get((sn, en))
                        if not episode_id:
                            continue
                        tasks.append(
                            _SearchTask(
                                source_type=source_type,
                                source_id=row.id,
                                scope="episode",
                                arr_type="sonarr",
                                inst=inst,
                                episode_id=episode_id,
                                season_number=sn,
                                episode_number=en,
                                title=f"{row.title} - S{sn:02d}E{en:02d}",
                                target_kind="mixed",
                            )
                        )
    return tasks


async def _search_task(task: _SearchTask, settings: Settings | None = None) -> list[dict]:
    if task.arr_type == "radarr":
        release_call = radarr.get_releases(task.inst.url, task.inst.api_key, task.arr_id)
    elif task.scope == "episode":
        release_call = sonarr.get_releases(task.inst.url, task.inst.api_key, episode_id=task.episode_id)
    else:
        release_call = sonarr.get_releases(
            task.inst.url, task.inst.api_key, series_id=task.arr_id, season_number=task.season_number
        )
    releases, current_titles = await asyncio.gather(release_call, _current_release_titles(task))
    task.current_release_titles = current_titles
    matched = []
    markers = [
        value.strip().lower()
        for value in _setting(settings, "vf_upgrade_markers", "truefrench,vff,multi,vfi,vfq").split(",")
        if value.strip()
    ]
    preferences = [
        value.strip().lower()
        for value in _setting(settings, "vf_upgrade_preference", "truefrench,vff,multi,vfi,vfq").split(",")
        if value.strip()
    ]
    # Fix #2 : word-boundary pour éviter les faux positifs ("multimedia", "multiple", etc.)
    _marker_re = (
        re.compile(r"\b(?:" + "|".join(re.escape(m) for m in markers) + r")\b", re.IGNORECASE)
        if markers
        else None
    )

    # Fix #3 : compteurs de rejet pour le logging debug
    _rej: dict[str, int] = {"target": 0, "not_fr": 0, "marker": 0, "confidence": 0, "seed": 0, "size": 0}

    for release in releases:
        rel_title = release.get("title") or ""
        matches_target, _mismatch_reason = release_matches_target(
            rel_title, task.scope, task.season_number, task.episode_number
        )
        if not matches_target:
            _rej["target"] += 1
            continue
        if not release_is_french(release):
            _rej["not_fr"] += 1
            continue
        enriched = {**release, **french_release_evidence(release)}
        title = rel_title.lower()
        # Fix #2 : correspondance exacte de mot (pas de sous-chaîne)
        if _marker_re and not _marker_re.search(title) and not release.get("languages"):
            _rej["marker"] += 1
            continue
        if enriched["vf_confidence"] < _setting(settings, "vf_upgrade_min_confidence", 0):
            _rej["confidence"] += 1
            continue
        # Un torrent a 0 seed n'a personne pour l'uploader : *arr le grabberait quand
        # meme (il n'a pas cette notion) mais le telechargement resterait bloque a 0%
        # indefiniment. Ne s'applique pas au usenet, qui n'a pas ce concept.
        if release.get("protocol") == "torrent" and not release.get("seeders"):
            _rej["seed"] += 1
            continue
        size_gb = (release.get("size") or 0) / (1024**3)
        min_size = _setting(settings, "vf_upgrade_min_size_gb", None)
        max_size = _setting(settings, "vf_upgrade_max_size_gb", None)
        if min_size is not None and size_gb < min_size:
            _rej["size"] += 1
            continue
        if max_size is not None and size_gb > max_size:
            _rej["size"] += 1
            continue
        enriched["vf_preference_rank"] = next(
            (index for index, marker in enumerate(preferences) if marker in title), len(preferences)
        )
        matched.append(enriched)

    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(
            "VF search '%s' : %d/%d retenus — rejets: cible=%d non_fr=%d marker=%d conf=%d seed=%d taille=%d",
            task.title, len(matched), len(releases), _rej["target"], _rej["not_fr"],
            _rej["marker"], _rej["confidence"], _rej["seed"], _rej["size"],
        )
    elif not matched and releases:
        logger.info(
            "VF search '%s' : 0/%d retenus (non_fr=%d, marker=%d, cible=%d, seed=%d, taille=%d)",
            task.title, len(releases), _rej["not_fr"], _rej["marker"],
            _rej["target"], _rej["seed"], _rej["size"],
        )

    matched.sort(
        key=lambda release: (
            release.get("vf_preference_rank", 99),
            -release.get("vf_confidence", 0),
            -release.get("custom_format_score", 0),
        )
    )
    return ReleaseResults(matched, raw_count=len(releases))


async def _persist_result(
    db: AsyncSession,
    task: _SearchTask,
    releases: list[dict],
    now,
    settings: Settings | None = None,
    *,
    origin: str = "auto",
) -> bool:
    """Upsert (ou supprime si plus rien trouvé) la suggestion pour `task`. Retourne True
    si une suggestion avec des releases existe après l'opération."""
    existing = (
        (
            await db.execute(
                select(VfUpgradeSuggestion).filter(
                    VfUpgradeSuggestion.source_type == task.source_type,
                    VfUpgradeSuggestion.source_id == task.source_id,
                    VfUpgradeSuggestion.scope == task.scope,
                    VfUpgradeSuggestion.season_number == task.season_number,
                    VfUpgradeSuggestion.episode_number == task.episode_number,
                )
            )
        )
        .scalars()
        .first()
    )

    if (
        existing
        and existing.status == "failed"
        and existing.grabbed_release_guid
        and _setting(settings, "vf_upgrade_blacklist_failed", True)
    ):
        releases = [release for release in releases if release.get("guid") != existing.grabbed_release_guid]

    if not releases:
        # Plus rien de VF disponible chez l'indexeur (delisting, etc) : on ne garde pas
        # une suggestion "pending" perimee. Une suggestion deja grabbee/ignoree n'est
        # jamais atteinte ici (filtree en amont par _skip_statuses).
        if existing and existing.status == "pending" and (origin == "auto" or existing.origin != "auto"):
            await db.delete(existing)
        return False

    if existing:
        existing.releases_json = json.dumps(releases)
        existing.current_release_titles_json = json.dumps(task.current_release_titles)
        existing.target_kind = task.target_kind
        # Un scan automatique est la provenance la plus forte. Une recherche manuelle
        # ne doit pas transformer en resultat manuel une suggestion deja automatique.
        if origin == "auto" or existing.origin in (None, "legacy"):
            existing.origin = origin
        existing.scanned_at = now
        existing.updated_at = now
        # Une recherche manuelle explicite rouvre uniquement un ancien resultat
        # ignore/echec; un telechargement actif ou valide reste protege du doublon.
        if existing.status in ("dismissed", "failed"):
            existing.status = "pending"
            existing.failed_at = None
    else:
        db.add(
            VfUpgradeSuggestion(
                source_type=task.source_type,
                source_id=task.source_id,
                scope=task.scope,
                season_number=task.season_number,
                episode_number=task.episode_number,
                releases_json=json.dumps(releases),
                current_release_titles_json=json.dumps(task.current_release_titles),
                origin=origin,
                target_kind=task.target_kind,
                status="pending",
                scanned_at=now,
                updated_at=now,
            )
        )
    return True


async def scan_vf_upgrades(force: bool = False) -> dict[str, Any]:
    """Scan complet (films + séries) : construit les tâches de recherche adaptatives,
    les exécute avec une concurrence bornée, et persiste les suggestions VF trouvées.

    `force` : ignore le cooldown 24h ET les statuts grabbed/dismissed -- utilisé par le
    bouton "Chercher" d'une fiche média précise (voir routers/vf_upgrades_api.py), jamais
    par le cycle de fond.
    """
    vf_upgrade_scan_state.update(
        status="running",
        started_at=now_utc().isoformat(),
        finished_at=None,
        items_scanned=0,
        total_items=0,
        suggestions_found=0,
        error=None,
    )
    db: AsyncSession = AsyncSessionLocal()
    try:
        settings = (await db.execute(select(Settings))).scalars().first()
        if not settings or not settings.vff_enabled or not _setting(settings, "vf_upgrade_enabled", True):
            vf_upgrade_scan_state["status"] = "idle"
            return {"status": "idle", "reason": "vff_disabled"}

        retention_cutoff = now_utc_naive() - timedelta(
            days=max(1, _setting(settings, "vf_upgrade_history_retention_days", 90))
        )
        expired = (
            (
                await db.execute(
                    select(VfUpgradeSuggestion).filter(
                        VfUpgradeSuggestion.status.in_(("verified", "failed", "dismissed")),
                        VfUpgradeSuggestion.updated_at < retention_cutoff,
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in expired:
            await db.delete(row)

        skip = set() if force else await _skip_statuses(db, settings)
        recent = set() if force else await _recent_scan_keys(db, settings)

        movie_tasks = await _build_movie_tasks(db, force, skip, recent, settings)
        show_tasks = await _build_show_tasks(db, force, skip, recent, settings)
        # Intercalage plutot que concatenation : sans lui, une bibliotheque avec plus de
        # films VO que de series VO monopolise le plafond par passage indefiniment (le
        # cooldown fait juste tourner le MEME sous-ensemble de films en boucle), les
        # series n'etant jamais scannees. Chaque categorie avance a son rythme.
        tasks: list[_SearchTask] = []
        for pair in zip_longest(movie_tasks, show_tasks):
            tasks.extend(t for t in pair if t is not None)

        tasks = _order_tasks(tasks, settings)

        if not force:
            tasks = tasks[: max(1, settings.vf_upgrade_max_searches_per_run or 40)]
        vf_upgrade_scan_state["total_items"] = len(tasks)
        if not tasks:
            vf_upgrade_scan_state["status"] = "idle"
            vf_upgrade_scan_state["finished_at"] = now_utc().isoformat()
            return {"status": "idle", "scanned": 0}

        semaphore = asyncio.Semaphore(max(1, min(10, settings.vf_upgrade_search_concurrency or 3)))

        async def _run_task(task: _SearchTask) -> tuple[_SearchTask, list[dict]]:
            async with semaphore:
                try:
                    return task, await _search_task(task, settings)
                except Exception as e:
                    logger.warning(f"VF upgrade : recherche echouee pour '{task.title}': {e}")
                    return task, []

        results = await asyncio.gather(*(_run_task(t) for t in tasks))

        now = now_utc_naive()
        found = 0
        for task, releases in results:
            if await _persist_result(db, task, releases, now, settings, origin="auto"):
                found += 1
            vf_upgrade_scan_state["items_scanned"] += 1
        await db.commit()

        vf_upgrade_scan_state["status"] = "idle"
        vf_upgrade_scan_state["finished_at"] = now_utc().isoformat()
        vf_upgrade_scan_state["suggestions_found"] = found
        logger.info(f"VF upgrade : {len(tasks)} recherche(s), {found} suggestion(s) VF trouvee(s)")
        from ..realtime import publish

        await publish(
            "vf_upgrade.updated", {"action": "scan_completed", "scanned": len(tasks), "found": found}, admin_only=True
        )
        return {"status": "idle", "scanned": len(tasks), "found": found}
    except Exception as e:
        vf_upgrade_scan_state["status"] = "failed"
        vf_upgrade_scan_state["error"] = str(e)
        logger.exception("VF upgrade scan : echec")
        raise
    finally:
        await db.close()


async def scan_single_target(
    db: AsyncSession,
    source_type: str,
    source_id: int,
    scope: str,
    season_number: Optional[int] = None,
    episode_number: Optional[int] = None,
) -> list[dict]:
    """Recherche immediate pour UNE cible precise (bouton "Chercher" d'une fiche media) --
    toujours force=True implicite (bypass cooldown/statut), pas de plafond de volume
    puisque c'est une action explicite sur un seul scope."""
    model = MediaRequest if source_type == "request" else LibraryItem
    row = (await db.execute(select(model).filter(model.id == source_id))).scalars().first()
    if not row or not row.arr_id:
        raise ValueError("Media non lie a Sonarr/Radarr")

    if scope == "movie":
        inst = await _resolve_instance_for(db, row, "radarr")
        if not inst:
            raise ValueError("Instance Radarr introuvable")
        task = _SearchTask(
            source_type=source_type,
            source_id=source_id,
            scope="movie",
            arr_type="radarr",
            inst=inst,
            arr_id=row.arr_id,
            title=row.title,
            target_kind=classify_vf_target(row, "movie"),
        )
    else:
        inst = await _resolve_instance_for(db, row, "sonarr")
        if not inst:
            raise ValueError("Instance Sonarr introuvable")
        episode_id = None
        if scope == "episode":
            episodes = await sonarr.get_episodes(inst.url, inst.api_key, row.arr_id)
            episode_id = next(
                (
                    ep.get("id")
                    for ep in episodes
                    if ep.get("seasonNumber") == season_number and ep.get("episodeNumber") == episode_number
                ),
                None,
            )
            if not episode_id:
                raise ValueError("Episode introuvable cote Sonarr")
        seasons = await _season_vf_status(db, source_type, source_id)
        task = _SearchTask(
            source_type=source_type,
            source_id=source_id,
            scope=scope,
            arr_type="sonarr",
            inst=inst,
            arr_id=row.arr_id,
            episode_id=episode_id,
            season_number=season_number,
            episode_number=episode_number,
            title=row.title,
            target_kind=classify_vf_target(row, scope, season_number, episode_number, seasons),
        )

    settings = (await db.execute(select(Settings))).scalars().first()
    if settings and not _setting(settings, "vf_upgrade_enabled", True):
        raise ValueError("Ameliorations VF desactivees")
    releases = await _search_task(task, settings)

    # Invalidation du cache des releases interactives pour garantir la synchronisation
    await cache.delete_prefix("watchdeck:releases:")

    # La modale reçoit toujours les releases. Seules les recherches qui corrigent une
    # cible VO ou mixte alimentent le tableau global des améliorations.
    if task.target_kind in {"vo", "mixed"}:
        await _persist_result(db, task, releases, now_utc_naive(), settings, origin="manual")
        await db.commit()

    from ..realtime import publish

    await publish(
        "vf_upgrade.updated",
        {
            "action": "single_scan_completed",
            "source_type": source_type,
            "source_id": source_id,
            "scope": scope,
        },
        admin_only=True,
    )
    return releases
