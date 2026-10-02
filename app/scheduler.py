"""
Point d'entrée historique des tâches périodiques.

La planification est assurée par le worker ARQ (`app/jobs.py`). Les implémentations
réelles vivent dans app/services/ ; ce module ne fait que réexporter les fonctions et
états globaux encore importés par les routeurs et les tests.
"""

import logging

import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from .models import ArrInstance, Settings

# --- Imports des services pour réexportation (compatibilité ascendante) ---
from .notification_queue import enqueue as enqueue_notification
from .services.download_clients import delete_torrent, get_torrent_status
from .services.episode_availability import check_episode_availability, episode_availability_state
from .services.media_matching import (
    link_request_to_library_item as _link_request_to_library_item,
)
from .services.notification_orchestrator import (
    _add_co_requester,
    _get_recipients,
    _handle_show_progress_notification,
    _notify,
    _purge_notification_logs,
    _queue_milestone,
    _send_digest,
)
from .services.plex_sync import (
    plex_sync_state,
    sync_plex_media,
)
from .services.radarr import get_all_movies, is_movie_available
from .services.radarr_queue_monitor import monitor_radarr_queue
from .services.seer import (
    _resolve_tmdb_id as _seer_resolve_tmdb_id,
)
from .services.seer import (
    get_user_requests as seer_get_user_requests,
)
from .services.seer import (
    get_users as seer_get_users,
)
from .services.seer import (
    is_request_available as seer_available,
)
from .services.seer_sync import (
    _seer_full_sync,
    sync_seer_requests,
    sync_seer_users,
)
from .services.sonarr import get_all_series, get_series_episode_stats, is_series_available
from .services.sonarr_queue_monitor import monitor_sonarr_queue
from .services.vff_scanner import (
    _invalidate_vf_cache,
    _load_known_vf_episodes,
    _parse_vff_libraries,
    _persist_episode_metadata,
    _persist_episode_status,
    _scan_vf_blocking,
    _sonarr_episode_numbers_for,
    _trigger_vf_search,
    check_episode_tracking,
    check_new_vf_availability,
    check_vf_statuses,
    episode_scan_state,
    trigger_vff_scan_background,
    vff_scan_state,
)
from .services.watchlist_poller import (
    _clean_title,
    _find_global_request,
    _submit_to_arr,
    add_torrent_to_client,
    fetch_watchlist,
    poll_watchlists,
    sync_users_from_feed,
)

logger = logging.getLogger(__name__)

# --- Wrappers de déclenchement des jobs planifiés ---


async def check_arr_statuses(**kwargs):
    """Job planifié : vérification de la disponibilité des médias dans Sonarr/Radarr."""
    from .services.arr_tracker import check_arr_statuses as _check

    await _check(**kwargs)


async def check_torrent_statuses():
    """Job planifié : suivi des téléchargements torrents actifs."""
    from .services.arr_tracker import check_torrent_statuses as _check

    await _check()


async def _check_and_seed_instances_from_settings(db: AsyncSession, settings: Settings):
    """Fallback / compatibilité pour les tests unitaires et les premières exécutions."""
    count = (await db.execute(select(sqlalchemy.func.count(ArrInstance.id)))).scalar()
    if count == 0 and settings:
        if settings.sonarr_url and settings.sonarr_api_key:
            db.add(
                ArrInstance(
                    name="Sonarr Default",
                    arr_type="sonarr",
                    url=settings.sonarr_url,
                    api_key=settings.sonarr_api_key,
                    quality_profile_id=settings.sonarr_quality_profile_id,
                    root_folder=settings.sonarr_root_folder,
                    enabled=settings.sonarr_enabled if settings.sonarr_enabled is not None else True,
                    is_default=True,
                )
            )
        if settings.radarr_url and settings.radarr_api_key:
            db.add(
                ArrInstance(
                    name="Radarr Default",
                    arr_type="radarr",
                    url=settings.radarr_url,
                    api_key=settings.radarr_api_key,
                    quality_profile_id=settings.radarr_quality_profile_id,
                    root_folder=settings.radarr_root_folder,
                    enabled=settings.radarr_enabled if settings.radarr_enabled is not None else True,
                    is_default=True,
                    minimum_availability=settings.radarr_minimum_availability or "released",
                )
            )
        await db.commit()
