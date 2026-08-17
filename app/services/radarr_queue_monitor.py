"""Observation durable, chaque minute, de la file Radarr -- detecte les imports bloques.

Contrairement a Sonarr (regroupe par vague d'episodes via SeriesAcquisitionBatch/
sonarr_queue_monitor.py), un film Radarr est un item unique : pas de notion de vague
ni de stabilisation. L'alerte admin "import bloque" part directement d'ici des qu'un
item est confirme bloque deux verifications de suite -- meme evenement de notification
que cote Sonarr (voir notification_catalog.EVENTS["import_blocked"]), meme bascule
d'activation (Settings.notify_import_blocked).
"""

import logging

from sqlalchemy import select

from ..database import AsyncSessionLocal
from ..models import ArrInstance, MediaRequest, RadarrQueueObservation, Settings
from ..notification_queue import enqueue
from ..utils import now_utc_naive, parse_email_list
from . import radarr
from .arr_queue_monitor import (
    classify_observation,
    fetch_queue_safely,
    load_monitor_context,
    resolve_missing_observations,
    update_observation,
)

logger = logging.getLogger(__name__)


async def monitor_radarr_queue() -> dict[str, int]:
    """Controle les instances Radarr et alerte l'admin sur un blocage confirme."""
    now = now_utc_naive()
    counters = {"instances": 0, "observed": 0, "blocked": 0, "resolved": 0, "admin_alerts": 0}
    async with AsyncSessionLocal() as db:
        instances, request_by_key = await load_monitor_context(db, "radarr")
        settings = (await db.execute(select(Settings))).scalars().first()
        alerts_enabled = bool(settings and settings.admin_notification_email and settings.notify_import_blocked)
        admin_recipients = parse_email_list(settings.admin_notification_email) if settings else []

        for instance in instances:
            # Une panne Radarr ne doit jamais ressembler a une file vide et resoudre
            # artificiellement tous les incidents connus.
            records = await fetch_queue_safely(instance, "Radarr", radarr.get_queue, logger)
            if records is None:
                continue
            counters["instances"] += 1
            seen_queue_ids: set[int] = set()

            for record in records:
                queue_id = record.get("queue_id")
                arr_media_id = record.get("arr_media_id")
                if queue_id is None or arr_media_id is None:
                    continue
                queue_id = int(queue_id)
                arr_media_id = int(arr_media_id)
                seen_queue_ids.add(queue_id)
                req = request_by_key.get((instance.id, arr_media_id))

                observation = (
                    (
                        await db.execute(
                            select(RadarrQueueObservation).filter(
                                RadarrQueueObservation.arr_instance_id == instance.id,
                                RadarrQueueObservation.queue_id == queue_id,
                            )
                        )
                    )
                    .scalars()
                    .first()
                )
                if observation is None:
                    observation = RadarrQueueObservation(arr_instance_id=instance.id, queue_id=queue_id)
                    db.add(observation)

                state, blocked_checks = classify_observation(observation, record)
                update_observation(observation, record, req, arr_media_id, state, blocked_checks, now)

                if state == "import_blocked":
                    counters["blocked"] += 1
                    if alerts_enabled and not observation.admin_alert_queued_at and req:
                        reason = observation.error_message or "Import Radarr bloque : verification manuelle requise."
                        await enqueue(
                            "import_blocked",
                            req.id,
                            admin_recipients,
                            {
                                "reason": f"{reason} ({observation.title or 'element Radarr'})",
                                "admin_only": True,
                            },
                            db=db,
                        )
                        observation.admin_alert_queued_at = now
                        counters["admin_alerts"] += 1
                counters["observed"] += 1

            counters["resolved"] += await resolve_missing_observations(
                db, RadarrQueueObservation, instance.id, seen_queue_ids, now
            )

        await db.commit()
    return counters
