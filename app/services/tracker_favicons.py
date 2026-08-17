"""Persistent and Redis-backed favicon cache for torrent trackers."""

import asyncio
import base64
import ipaddress
import socket
from datetime import timedelta
from io import BytesIO
from urllib.parse import urlparse

import httpx
from PIL import Image, UnidentifiedImageError
from sqlalchemy.future import select

from ..cache import cache
from ..models import TrackerFavicon
from ..utils import now_utc_naive

_MAX_BYTES = 256 * 1024
_SUCCESS_TTL = timedelta(days=30)
_FAILURE_TTL = timedelta(hours=24)
_locks: dict[str, asyncio.Lock] = {}


def tracker_host(value: str) -> str | None:
    raw = (value or "").split(",", 1)[0].strip()
    if not raw:
        return None
    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    return parsed.hostname.lower().rstrip(".") if parsed.hostname else None


async def _public_host(host: str) -> bool:
    try:
        rows = await asyncio.to_thread(socket.getaddrinfo, host, 443, type=socket.SOCK_STREAM)
    except OSError:
        return False
    addresses = {row[4][0] for row in rows}
    if not addresses:
        return False
    for value in addresses:
        address = ipaddress.ip_address(value)
        if not address.is_global:
            return False
    return True


def _safe_png(content: bytes) -> bytes | None:
    if not content or len(content) > _MAX_BYTES:
        return None
    try:
        with Image.open(BytesIO(content)) as image:
            image.load()
            image.thumbnail((32, 32), Image.Resampling.LANCZOS)
            if image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGBA")
            output = BytesIO()
            image.save(output, format="PNG", optimize=True)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError):
        return None


async def _download(host: str) -> tuple[bytes | None, str | None]:
    if not await _public_host(host):
        return None, None
    async with httpx.AsyncClient(follow_redirects=False, headers={"User-Agent": "Watchdeck favicon cache/1.0"}) as client:
        for scheme in ("https", "http"):
            url = f"{scheme}://{host}/favicon.ico"
            try:
                async with client.stream("GET", url, timeout=6) as response:
                    if response.status_code != 200:
                        continue
                    content = bytearray()
                    async for chunk in response.aiter_bytes():
                        content.extend(chunk)
                        if len(content) > _MAX_BYTES:
                            break
                png = _safe_png(bytes(content))
                if png:
                    return png, url
            except (httpx.HTTPError, ValueError):
                continue
    return None, None


async def get_tracker_favicon(db, tracker: str) -> tuple[bytes, str] | None:
    host = tracker_host(tracker)
    if not host:
        return None
    cache_key = f"watchdeck:tracker-favicon:{host}"
    cached = await cache.get_json(cache_key)
    if cached:
        if cached.get("status") != "ok":
            return None
        return base64.b64decode(cached["content"]), "image/png"

    lock = _locks.setdefault(host, asyncio.Lock())
    async with lock:
        cached = await cache.get_json(cache_key)
        if cached:
            return (base64.b64decode(cached["content"]), "image/png") if cached.get("status") == "ok" else None
        now = now_utc_naive()
        row = (await db.execute(select(TrackerFavicon).filter(TrackerFavicon.host == host))).scalars().first()
        if row and row.expires_at > now:
            payload = {"status": row.status}
            if row.content:
                payload["content"] = base64.b64encode(row.content).decode("ascii")
            await cache.set_json(cache_key, payload, ttl_seconds=86400)
            return (row.content, row.content_type or "image/png") if row.status == "ok" and row.content else None

        content, source_url = await _download(host)
        expires_at = now + (_SUCCESS_TTL if content else _FAILURE_TTL)
        if not row:
            row = TrackerFavicon(host=host, expires_at=expires_at)
            db.add(row)
        row.source_url = source_url
        row.content = content
        row.content_type = "image/png" if content else None
        row.status = "ok" if content else "missing"
        row.fetched_at = now
        row.expires_at = expires_at
        await db.commit()
        payload = {"status": row.status}
        if content:
            payload["content"] = base64.b64encode(content).decode("ascii")
        await cache.set_json(cache_key, payload, ttl_seconds=86400)
        return (content, "image/png") if content else None
