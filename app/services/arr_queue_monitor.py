"""Mécanique commune aux observateurs de files Sonarr et Radarr."""

from collections.abc import Awaitable, Callable
from datetime import datetime
from logging import Logger
from typing import Any

from sqlalchemy import select

from ..models import ArrInstance, MediaRequest
from .arr_queue_common import BLOCKED_CONFIRMATION_CHECKS, classify_queue_record


async def load_monitor_context(db, arr_type: str) -> tuple[list[ArrInstance], dict[tuple[int, int], MediaRequest]]:
    instances = (
        (await db.execute(select(ArrInstance).filter(ArrInstance.enabled, ArrInstance.arr_type == arr_type)))
        .scalars()
        .all()
    )
    requests = (
        (
            await db.execute(
                select(MediaRequest).filter(MediaRequest.arr_instance_id.isnot(None), MediaRequest.arr_id.isnot(None))
            )
        )
        .scalars()
        .all()
    )
    return list(instances), {(request.arr_instance_id, request.arr_id): request for request in requests}


async def fetch_queue_safely(
    instance: ArrInstance,
    product: str,
    get_queue: Callable[..., Awaitable[list[dict]]],
    logger: Logger,
) -> list[dict] | None:
    """Une panne externe n'est jamais interprétée comme une file devenue vide."""
    try:
        return await get_queue(instance.url, instance.api_key, raise_on_error=True)
    except Exception as exc:
        logger.warning("Surveillance queue %s '%s' ignoree: %s", product, instance.name, exc)
        return None


def classify_observation(observation: Any, record: dict) -> tuple[str, int]:
    classification = classify_queue_record(record)
    blocked_checks = (observation.consecutive_blocked_checks or 0) + 1 if classification.blocked_candidate else 0
    state = (
        "import_blocked"
        if classification.blocked_candidate and blocked_checks >= BLOCKED_CONFIRMATION_CHECKS
        else classification.state
    )
    return state, blocked_checks


def update_observation(
    observation: Any,
    record: dict,
    request: MediaRequest | None,
    arr_media_id: int,
    state: str,
    blocked_checks: int,
    now: datetime,
) -> None:
    observation.request_id = request.id if request else None
    observation.arr_media_id = arr_media_id
    observation.title = record.get("title")
    observation.state = state
    observation.progress = float(record.get("progress") or 0)
    observation.tracked_state = record.get("tracked_state")
    observation.tracked_status = record.get("tracked_status")
    observation.error_message = record.get("error")
    observation.consecutive_blocked_checks = blocked_checks
    observation.last_seen_at = now
    observation.resolved_at = None
    observation.blocked_at = observation.blocked_at or now if state == "import_blocked" else None


async def resolve_missing_observations(
    db,
    observation_model,
    instance_id: int,
    seen_queue_ids: set[int],
    now: datetime,
) -> int:
    unresolved = (
        (
            await db.execute(
                select(observation_model).filter(
                    observation_model.arr_instance_id == instance_id,
                    observation_model.resolved_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    resolved = 0
    for observation in unresolved:
        if observation.queue_id in seen_queue_ids:
            continue
        observation.state = "resolved"
        observation.resolved_at = now
        observation.consecutive_blocked_checks = 0
        resolved += 1
    return resolved
