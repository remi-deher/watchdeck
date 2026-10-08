"""Suivi périodique de FileFlows : alerte sur les échecs, réanalyse VF après traitement.

La tâche planifiée `fileflows-monitor` lit la première page des fichiers traités et en
échec (FileFlows les sert du plus récent au plus ancien) et la compare au passage
précédent, gardé en cache :

* un fichier **nouvellement en échec** part dans une alerte à l'administrateur (email,
  et Discord s'il est actif) ; plusieurs échecs d'un même passage font une seule alerte ;
* un fichier **nouvellement traité** fait réanalyser le média correspondant (pistes
  audio et sous-titres) : le flow vient de les modifier, l'état VF affiché serait périmé.

Le premier passage ne fait que mémoriser l'état : brancher FileFlows n'envoie pas d'alerte
pour tout son historique.

Si l'option est activée, la même tâche alterne aussi la file par disque
(voir services/fileflows_queue.py).
"""

import logging
from typing import Any

from sqlalchemy.future import select

from ..cache import cache
from ..database import AsyncSessionLocal
from ..models import Settings
from ..realtime import publish
from . import fileflows, fileflows_queue

logger = logging.getLogger(__name__)

STATE_KEY = "watchdeck:fileflows-monitor:{instance_id}"
STATE_TTL = 30 * 24 * 3600
# Au-delà, une alerte devient illisible : le reste se consulte dans Watchdeck.
ALERT_LIST_LIMIT = 10
# Un réencodage en masse peut terminer beaucoup de fichiers entre deux passages ; chaque
# réanalyse interroge Plex, on en borne le nombre par passage.
RESCAN_LIMIT = 20


def changes(previous: dict[str, str], current: dict[str, str]) -> list[str]:
    """Fichiers apparus depuis le dernier passage, ou dont la date a changé (relancés)."""
    return [uid for uid, date in current.items() if previous.get(uid) != date]


def alert_text(instance_name: str, failed: list[dict[str, Any]]) -> str:
    lines = [f"Traitements en échec dans {instance_name} :"]
    for row in failed[:ALERT_LIST_LIMIT]:
        reason = f" — {row['failure_reason']}" if row.get("failure_reason") else ""
        lines.append(f"• {row['name']}{reason}")
    if len(failed) > ALERT_LIST_LIMIT:
        lines.append(f"… et {len(failed) - ALERT_LIST_LIMIT} autre(s), à voir dans Watchdeck (Encodage).")
    return "\n".join(lines)


async def _rescan(media_ids: list[int]) -> int:
    """Réanalyse VF immédiate des médias, comme le bouton de la fiche média."""
    from ..routers.vff_api import library_vff_scan

    done = 0
    for media_id in media_ids:
        async with AsyncSessionLocal() as db:
            try:
                await library_vff_scan(media_id, force=True, season=None, episode=None, db=db)
                done += 1
            except Exception as exc:  # noqa: BLE001 -- un média absent de Plex n'arrête pas les autres
                logger.info("FileFlows : réanalyse VF du média %s impossible (%s)", media_id, exc)
    return done


async def check_fileflows() -> dict[str, Any]:
    from .indexer_health import _notify

    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        inst = await fileflows.get_instance(db)
        if inst is None:
            return {"status": "not_configured"}
        url, api_key, name = inst.url, inst.api_key, inst.name
        # Alternance de la file par disque, si l'option est activee (desactivee par defaut).
        reorder = await fileflows_queue.reorder_if_enabled(db, url, api_key)
        processed = await fileflows.list_files(url, api_key, fileflows.STATUS_PROCESSED)
        failed = await fileflows.list_files(url, api_key, fileflows.STATUS_FAILED)
        index = await fileflows.folder_index(db) if processed else {}

    current = {
        "processed": {row["uid"]: row.get("date") or "" for row in processed if row.get("uid")},
        "failed": {row["uid"]: row.get("date") or "" for row in failed if row.get("uid")},
    }
    key = STATE_KEY.format(instance_id=inst.id)
    previous = await cache.get_json(key)
    await cache.set_json(key, current, ttl_seconds=STATE_TTL)
    if previous is None:
        return {"status": "initialized", "processed": len(processed), "failed": len(failed), "reorder": reorder}

    new_failed_ids = set(changes(previous.get("failed") or {}, current["failed"]))
    new_failed = [row for row in failed if row["uid"] in new_failed_ids]
    new_processed_ids = set(changes(previous.get("processed") or {}, current["processed"]))
    media_ids: list[int] = []
    for row in processed:
        if row["uid"] not in new_processed_ids:
            continue
        media = fileflows.match_media(index, row["name"])
        if media and media["id"] not in media_ids and media["media_type"] in ("movie", "show"):
            media_ids.append(media["id"])

    alerts = 0
    if new_failed and settings is not None:
        subject = f"FileFlows : {len(new_failed)} traitement(s) en échec"
        alerts = await _notify(settings, subject, alert_text(name, new_failed))
    rescanned = await _rescan(media_ids[:RESCAN_LIMIT]) if media_ids else 0
    if new_failed or new_processed_ids:
        await publish(
            "fileflows.updated",
            {"failed": len(new_failed), "processed": len(new_processed_ids), "media_ids": media_ids},
            admin_only=True,
        )
    return {
        "status": "ok",
        "new_failed": len(new_failed),
        "new_processed": len(new_processed_ids),
        "rescanned": rescanned,
        "alerts": alerts,
        "reorder": reorder,
    }
