"""Failure recovery contracts for performance protections."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.cache import Cache
from app.services import arr_catalog


@pytest.mark.asyncio
async def test_redis_initial_failure_is_retried_after_cooldown(monkeypatch):
    from redis.asyncio import Redis

    monkeypatch.setenv("REDIS_URL", "redis://unused")
    now = [100.0]
    monkeypatch.setattr("app.cache.time.monotonic", lambda: now[0])
    failed = MagicMock(ping=AsyncMock(side_effect=ConnectionError()), aclose=AsyncMock())
    healthy = MagicMock(ping=AsyncMock(), aclose=AsyncMock())
    factory = MagicMock(side_effect=[failed, healthy])
    monkeypatch.setattr(Redis, "from_url", factory)
    cache = Cache()
    assert await cache._connect() is None
    assert await cache._connect() is None
    assert factory.call_count == 1
    now[0] += 11
    assert await cache._connect() is healthy
    failed.aclose.assert_awaited_once()
    assert factory.call_args.kwargs["socket_timeout"] == 1


@pytest.mark.asyncio
async def test_arr_failure_does_not_repeat_during_cooldown(monkeypatch):
    client = MagicMock(get=AsyncMock(side_effect=ConnectionError("offline")))
    monkeypatch.setattr(arr_catalog, "ArrClient", lambda *args, **kwargs: client)
    arr_catalog._cache[("sonarr", "http://test")] = ([{"id": 1}], 0)
    assert await arr_catalog.get_catalog("sonarr", "http://test", "key") == [{"id": 1}]
    assert await arr_catalog.get_catalog("sonarr", "http://test", "key") == [{"id": 1}]
    assert client.get.await_count == 1
