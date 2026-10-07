"""Prepare live artwork without delaying session collection or event delivery."""

import asyncio
import logging
import time
from urllib.parse import parse_qs, urlparse

from starlette.requests import Request

logger = logging.getLogger(__name__)
_task: asyncio.Task | None = None
_prepared: dict[tuple[str, int], float] = {}


async def prepare_playback_images() -> None:
    # Import late: the activity router also imports playback_activity.
    from ..routers.image_proxy_api import image_proxy
    from .playback_activity import live_activity_snapshot

    snapshot = await live_activity_snapshot()
    variants = {}
    for session in snapshot.get("active", [])[:12]:
        for field, widths in (("thumb_url", (162, 312, 630)), ("art_url", (1200,)), ("logo_url", (600,))):
            src = session.get(field)
            if src and src.startswith("/api/playback/thumb?"):
                for width in widths:
                    variants.setdefault((src, width), None)
    now = time.monotonic()
    for key in list(_prepared):
        if _prepared[key] < now:
            _prepared.pop(key, None)
    slots = asyncio.Semaphore(3)

    async def prepare(src, width):
        if _prepared.get((src, width), 0) > now:
            return
        query = parse_qs(urlparse(src).query)
        path = (query.get("path") or [None])[0]
        server = (query.get("server") or [None])[0]
        if not path:
            return
        try:
            async with slots, asyncio.timeout(45):
                request = Request({"type": "http", "method": "GET", "path": "/api/playback/thumb", "headers": []})
                await image_proxy(
                    request,
                    url=None,
                    plex_path=path,
                    width=width,
                    height=None,
                    quality=90,
                    image_format="webp",
                    plex_server=int(server) if server else None,
                )
            _prepared[(src, width)] = time.monotonic() + 300
        except Exception:
            # A missing poster must never affect playback collection.
            logger.debug("Préparation de visuel Plex impossible", exc_info=True)

    # Conserver l'ordre des sessions (les plus récentes d'abord) et libérer la
    # préparation après 45 s pour qu'une source lente ne retienne pas les suivantes.
    async with asyncio.timeout(45):
        await asyncio.gather(*(prepare(src, width) for src, width in variants))


def schedule_playback_images() -> None:
    global _task
    if _task is not None and not _task.done():
        return

    async def run():
        try:
            await prepare_playback_images()
        except Exception:
            logger.debug("Préparation des visuels interrompue", exc_info=True)

    _task = asyncio.create_task(run())


async def stop_playback_images() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        await asyncio.gather(_task, return_exceptions=True)
        _task = None
