"""Short HTTP requests around long, read-only planning; no transfer is launched."""

import asyncio
import json
import logging
import uuid

from fastapi.encoders import jsonable_encoder
from ..database import AsyncSessionLocal
from . import service
from .discovery import redis_client

_tasks: set[asyncio.Task[None]] = set()
TTL = 900
TIMEOUT = 600
PREFIX = "storage:preview:"
ACTIVE = PREFIX + "active:"
logger = logging.getLogger(__name__)


async def start(body):
    client = redis_client()
    key = uuid.uuid4().hex
    try:
        await client.set(ACTIVE + key, "1", ex=TIMEOUT + 30)
        try:
            await client.set(PREFIX + key, json.dumps(dict(status="running")), ex=TTL)
        except BaseException:
            await client.delete(ACTIVE + key)
            raise
        task = asyncio.create_task(calculate(key, body.model_copy(deep=True)))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
        return dict(id=key, status="running")
    finally:
        await client.aclose()


async def calculate(key, body):
    client = redis_client()
    try:
        async with asyncio.timeout(TIMEOUT), AsyncSessionLocal() as db:
            if body.task_id:
                from ..routers.storage_api import draft_task

                await draft_task(db, body.task_id)
            result = await service.preview(db, body)
            # An overview must not persist changed paths or validation proofs.
            await db.rollback()
        result = dict(status="completed", result=jsonable_encoder(result))
    except ValueError as exc:
        result = dict(status="failed", error=str(exc))
    except (TimeoutError, asyncio.CancelledError):
        result = dict(
            status="failed", error="Calcul de l’aperçu interrompu ou trop long. Réessayez avec moins de racines."
        )
    except Exception:
        logger.exception("Storage preview calculation failed")
        result = dict(
            status="failed", error="Impossible de calculer l’aperçu. Vérifiez les services Arr, Plex et les accès."
        )
    try:
        await client.set(PREFIX + key, json.dumps(result), ex=TTL)
    finally:
        try:
            await client.delete(ACTIVE + key)
        finally:
            await client.aclose()


async def status(key):
    client = redis_client()
    try:
        value = await client.get(PREFIX + key)
        if not value:
            raise ValueError("Cet aperçu a expiré. Relancez son calcul.")
        result = json.loads(value)
        if result["status"] == "running" and not await client.exists(ACTIVE + key):
            return dict(status="failed", error="Le service a redémarré ou le calcul a expiré. Relancez l’aperçu.")
        return result
    finally:
        await client.aclose()
