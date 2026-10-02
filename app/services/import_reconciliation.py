"""Rapprochement automatique d'un téléchargement que *arr n'a pas su importer seul.

Quand Sonarr ou Radarr termine un téléchargement sans réussir à le rattacher à son média
— épisode pas encore présent dans ses métadonnées, nom de release exotique —, l'élément
reste en file avec l'état « import bloqué » et attend une intervention : ouvrir la file,
choisir le fichier, confirmer.

Ce module fait ce geste à la place de l'administrateur, mais **seulement quand le choix
ne se discute pas** : un seul fichier candidat, et une cible unique. Dès qu'il y a
plusieurs fichiers ou plusieurs épisodes possibles, on préfère laisser la main plutôt que
d'attacher le mauvais fichier au mauvais média — une erreur silencieuse qu'il faudrait
ensuite retrouver.
"""

import logging
from typing import Any

from ..models import MediaRequest, Settings
from . import radarr, sonarr

logger = logging.getLogger(__name__)


#: Etats *arr ou le telechargement est fini et c'est l'import qui coince. Ce sont les
#: seuls ou un rapprochement a un sens.
IMPORT_STUCK_STATES = {"importpending", "importblocked", "importfailed"}

#: Le client de telechargement considere le fichier comme livre.
FINISHED_DOWNLOAD_STATUSES = {"completed", "complete"}


def blocked_on_import(record: dict) -> tuple[bool, str]:
    """Vrai seulement si *arr **et** le client de telechargement sont d'accord : le
    fichier est livre, et c'est l'import qui bloque.

    La classification generale marque « blocage possible » des qu'un element termine
    porte un diagnostic, quel qu'il soit. C'est suffisant pour alerter un humain, pas
    pour agir : un torrent sans source, une release refusee comme non-amelioration ou
    une erreur de disque y entrent aussi, et tenter un import n'y changerait rien --
    au mieux inutile, au pire un mauvais fichier attache au mauvais media.

    Le message de *arr fait foi : c'est lui qui dit si le probleme est a l'import.
    """
    tracked_state = str(record.get("tracked_state") or "").strip().lower()
    if tracked_state not in IMPORT_STUCK_STATES:
        return False, f"*arr n'attend pas d'import (etat « {tracked_state or 'inconnu'} »)"

    status = str(record.get("status") or "").strip().lower()
    size = float(record.get("size") or 0)
    sizeleft = float(record.get("sizeleft") or 0)
    progress = float(record.get("progress") or 0)
    delivered = status in FINISHED_DOWNLOAD_STATUSES or (size > 0 and sizeleft <= 0) or progress >= 100
    if not delivered:
        return False, f"le telechargement n'est pas termine (statut « {status or 'inconnu'} »)"
    return True, ""


def is_enabled(settings: Settings | None, request: MediaRequest | None) -> bool:
    """Le média décide, sinon le réglage global.

    `None` sur le média n'est pas « désactivé » mais « pas de choix » : c'est ce qui
    permet de forcer un média en manuel sans toucher au reste, et réciproquement.
    """
    if request is not None and request.auto_import_reconciliation is not None:
        return bool(request.auto_import_reconciliation)
    return bool(settings and settings.auto_import_reconciliation)


def pick_unambiguous_candidate(candidates: list[dict]) -> dict | None:
    """Le seul fichier importable, ou rien.

    Les fichiers déjà rejetés par *arr (`rejections`) ne comptent pas : les retenir
    reviendrait à forcer un import que *arr a explicitement refusé.
    """
    usable = [entry for entry in candidates if entry.get("path") and not entry.get("rejections")]
    return usable[0] if len(usable) == 1 else None


def pick_unambiguous_episode(candidate: dict, episodes: list[dict]) -> int | None:
    """Identifiant de l'épisode visé, quand un seul correspond au fichier.

    Sonarr propose parfois lui-même les épisodes reconnus dans le fichier ; sinon on
    retombe sur la saison et le numéro devinés du nom de la release.
    """
    proposed = candidate.get("episodes") or []
    if len(proposed) == 1 and proposed[0].get("id"):
        return proposed[0]["id"]

    season = candidate.get("suggested_season")
    number = candidate.get("suggested_episode")
    if season is None or number is None:
        return None
    matches = [
        episode
        for episode in episodes
        if episode.get("seasonNumber") == season and episode.get("episodeNumber") == number
    ]
    return matches[0].get("id") if len(matches) == 1 else None


async def reconcile_movie(instance: Any, observation: Any) -> tuple[bool, str]:
    """Tente l'import automatique d'un film bloqué."""
    if not observation.download_id or not observation.arr_media_id:
        return False, "Téléchargement sans identifiant exploitable"
    candidates = await radarr.get_manual_import_candidates(instance.url, instance.api_key, observation.download_id)
    candidate = pick_unambiguous_candidate(candidates)
    if not candidate:
        return False, f"{len(candidates)} fichier(s) candidat(s) : choix laissé à l'administrateur"
    return await radarr.manual_import_movie(
        instance.url,
        instance.api_key,
        path=candidate["path"],
        folder_name=candidate.get("folderName"),
        movie_id=observation.arr_media_id,
        download_id=observation.download_id,
        quality=candidate.get("quality"),
        languages=candidate.get("languages"),
        release_group=candidate.get("releaseGroup"),
        indexer_flags=candidate.get("indexerFlags"),
    )


async def reconcile_episode(instance: Any, observation: Any) -> tuple[bool, str]:
    """Tente l'import automatique d'un épisode bloqué."""
    if not observation.download_id or not observation.arr_media_id:
        return False, "Téléchargement sans identifiant exploitable"
    candidates = await sonarr.get_manual_import_candidates(instance.url, instance.api_key, observation.download_id)
    candidate = pick_unambiguous_candidate(candidates)
    if not candidate:
        return False, f"{len(candidates)} fichier(s) candidat(s) : choix laissé à l'administrateur"

    episodes = await sonarr.get_episodes(instance.url, instance.api_key, observation.arr_media_id)
    episode_id = pick_unambiguous_episode(candidate, episodes)
    if not episode_id:
        return False, "Épisode cible ambigu : choix laissé à l'administrateur"

    return await sonarr.manual_import_episode(
        instance.url,
        instance.api_key,
        path=candidate["path"],
        folder_name=candidate.get("folderName"),
        series_id=observation.arr_media_id,
        episode_id=episode_id,
        download_id=observation.download_id,
        quality=candidate.get("quality"),
        languages=candidate.get("languages"),
        release_group=candidate.get("releaseGroup"),
        indexer_flags=candidate.get("indexerFlags"),
    )


async def try_reconcile(
    *,
    product: str,
    instance: Any,
    observation: Any,
    record: dict,
    request: MediaRequest | None,
    settings: Settings | None,
) -> bool:
    """Rapproche l'import si le réglage l'autorise et que le choix est évident.

    Renvoie `True` seulement si l'import a été lancé — l'appelant laisse alors *arr
    finir le travail, et l'observation se résoudra d'elle-même au prochain passage.
    """
    if not is_enabled(settings, request):
        return False
    blocked, why = blocked_on_import(record)
    if not blocked:
        logger.info("Rapprochement automatique ecarte pour '%s' : %s", observation.title, why)
        return False
    try:
        if product == "radarr":
            ok, message = await reconcile_movie(instance, observation)
        else:
            ok, message = await reconcile_episode(instance, observation)
    except Exception as exc:
        # Un rapprochement raté ne doit jamais interrompre la surveillance de la file :
        # l'élément reste bloqué, exactement comme avant, et l'alerte part.
        logger.warning("Rapprochement automatique impossible pour '%s' : %s", observation.title, exc)
        return False

    if ok:
        logger.info("Import rapproché automatiquement pour '%s' (%s)", observation.title, product)
    else:
        logger.info("Rapprochement automatique écarté pour '%s' : %s", observation.title, message)
    return ok
