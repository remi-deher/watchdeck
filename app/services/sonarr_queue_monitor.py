"""Observation durable, chaque minute, de la file Sonarr.

Cette etape ne declenche aucune notification. Elle fournit la source de verite qui
permettra ensuite de regrouper les changements VO/VF par vague d'acquisition.
"""

import json
import logging

from sqlalchemy import select

from ..database import AsyncSessionLocal
from ..models import ArrInstance, MediaRequest, SeriesAcquisitionBatch, Settings, SonarrQueueObservation
from ..utils import now_utc_naive
from . import sonarr
from .arr_queue_common import (
    FULL_PROGRESS,
    QueueClassification,
    classify_queue_record,
)
from .arr_queue_monitor import (
    classify_observation,
    fetch_queue_safely,
    load_monitor_context,
    resolve_missing_observations,
    update_observation,
)

logger = logging.getLogger(__name__)

OPEN_BATCH_STATES = ("open", "stabilizing")
ALL_SEASONS_SOURCES = {"api", "rss"}


def _expected_scope(source: str | None) -> str:
    return "all_seasons" if (source or "").strip().lower() in ALL_SEASONS_SOURCES else "monitored_seasons"


def _expected_seasons(record: dict, scope: str) -> list[int]:
    seasons = record.get("series_seasons") or []
    return sorted({
        int(season["season_number"])
        for season in seasons
        if season.get("season_number") not in (None, 0)
        and (scope == "all_seasons" or season.get("monitored") is True)
    })


async def _open_batch(db, instance: ArrInstance, req: MediaRequest | None, arr_media_id: int):
    batch = (
        await db.execute(
            select(SeriesAcquisitionBatch).filter(
                SeriesAcquisitionBatch.arr_instance_id == instance.id,
                SeriesAcquisitionBatch.arr_id == arr_media_id,
                SeriesAcquisitionBatch.status.in_(OPEN_BATCH_STATES),
            )
        )
    ).scalars().first()
    if batch:
        return batch
    batch = SeriesAcquisitionBatch(
        request_id=req.id if req else None,
        arr_instance_id=instance.id,
        arr_id=arr_media_id,
        source=req.source if req else "arr_sync",
        expected_scope=_expected_scope(req.source if req else None),
        status="open",
    )
    db.add(batch)
    await db.flush()
    return batch


async def monitor_sonarr_queue() -> dict[str, int]:
    """Controle les instances Sonarr et confirme un blocage au second passage."""
    now = now_utc_naive()
    counters = {"instances": 0, "observed": 0, "blocked": 0, "resolved": 0}
    async with AsyncSessionLocal() as db:
        instances, request_by_key = await load_monitor_context(db, "sonarr")

        for instance in instances:
            # Une panne Sonarr ne doit jamais ressembler a une file vide et resoudre
            # artificiellement tous les incidents connus.
            records = await fetch_queue_safely(instance, "Sonarr", sonarr.get_queue, logger)
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
                batch = await _open_batch(db, instance, req, arr_media_id)
                expected_seasons = _expected_seasons(record, batch.expected_scope)
                if expected_seasons:
                    batch.expected_seasons = json.dumps(expected_seasons)

                observation = (
                    await db.execute(
                        select(SonarrQueueObservation).filter(
                            SonarrQueueObservation.arr_instance_id == instance.id,
                            SonarrQueueObservation.queue_id == queue_id,
                        )
                    )
                ).scalars().first()
                if observation is None:
                    observation = SonarrQueueObservation(
                        batch_id=batch.id,
                        request_id=req.id if req else None,
                        arr_instance_id=instance.id,
                        queue_id=queue_id,
                    )
                    db.add(observation)

                state, blocked_checks = classify_observation(observation, record)
                if state in {"queued", "downloading", "importing", "awaiting_import"}:
                    batch.status = "open"
                    batch.last_sonarr_activity_at = now
                    batch.stabilization_started_at = None
                observation.batch_id = batch.id
                observation.download_id = record.get("download_id")
                observation.season_number = record.get("season_number")
                observation.episode_number = record.get("episode_number")
                observation.status_messages = json.dumps(record.get("status_messages") or [], ensure_ascii=False)
                update_observation(observation, record, req, arr_media_id, state, blocked_checks, now)
                if state == "import_blocked":
                    counters["blocked"] += 1
                counters["observed"] += 1

            counters["resolved"] += await resolve_missing_observations(
                db, SonarrQueueObservation, instance.id, seen_queue_ids, now
            )

        settings = (await db.execute(select(Settings))).scalars().first()
        from .acquisition_batches import advance_acquisition_batches

        batch_counters = await advance_acquisition_batches(db, settings, now=now)
        await db.commit()
        counters.update(batch_counters)
    return counters
