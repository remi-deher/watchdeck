"""Short HTTP requests around planning and targeted checks; no transfer is launched."""

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
ACTIVE_TTL = 45
HEARTBEAT_INTERVAL = 10
PREFIX = "storage:preview:"
ACTIVE = PREFIX + "active:"
logger = logging.getLogger(__name__)


async def start(body):
    client = redis_client()
    key = uuid.uuid4().hex
    try:
        # A short lease makes a calculation left behind by a container restart
        # become visibly failed quickly instead of disabling the UI for 10 min.
        await client.set(ACTIVE + key, "1", ex=ACTIVE_TTL)
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
    from .preview_progress import reset_reporter, set_reporter

    async def keep_alive():
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            await client.set(ACTIVE + key, "1", ex=ACTIVE_TTL)

    async def update_progress(phase):
        await client.set(PREFIX + key, json.dumps(dict(status="running", progress=phase)), ex=TTL)

    reporter_token = set_reporter(update_progress)
    heartbeat = asyncio.create_task(keep_alive())
    try:
        await update_progress("Démarrage du calcul…")
        async with asyncio.timeout(TIMEOUT), AsyncSessionLocal() as db:
            if body.task_id:
                from ..routers.storage_api import draft_task

                await draft_task(db, body.task_id)
            result = await service.preview(db, body)
            # Persist only configuration proofs and capacities; no transfer is launched.
            await db.commit()
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
        heartbeat.cancel()
        try:
            await heartbeat
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.debug("Preview heartbeat stopped for %s", key, exc_info=True)
        reset_reporter(reporter_token)
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
