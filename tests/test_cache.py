"""Tests pour app/cache.py, en particulier Cache.get_or_refresh (stale-while-revalidate)."""

import asyncio

import pytest

from app.cache import Cache


@pytest.mark.asyncio
async def test_get_or_refresh_computes_synchronously_on_cold_cache():
    cache = Cache()
    calls = []

    async def compute():
        calls.append(1)
        return {"n": len(calls)}

    result = await cache.get_or_refresh("k", soft_ttl_seconds=60, hard_ttl_seconds=600, compute_sync=compute)
    assert result == {"n": 1}
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_get_or_refresh_serves_cached_value_within_soft_ttl_without_recomputing():
    cache = Cache()
    calls = []

    async def compute():
        calls.append(1)
        return {"n": len(calls)}

    first = await cache.get_or_refresh("k", soft_ttl_seconds=60, hard_ttl_seconds=600, compute_sync=compute)
    second = await cache.get_or_refresh("k", soft_ttl_seconds=60, hard_ttl_seconds=600, compute_sync=compute)
    assert first == second == {"n": 1}
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_get_or_refresh_serves_stale_value_immediately_and_refreshes_in_background():
    """Passe soft_ttl : la valeur perimee doit etre renvoyee IMMEDIATEMENT (jamais
    d'attente sur le recalcul), pendant qu'un rafraichissement tourne en tache de
    fond et alimente le PROCHAIN appel."""
    cache = Cache()
    calls = []

    async def compute():
        calls.append(1)
        return {"n": len(calls)}

    first = await cache.get_or_refresh("k", soft_ttl_seconds=0, hard_ttl_seconds=600, compute_sync=compute)
    assert first == {"n": 1}

    # soft_ttl_seconds=0 : la valeur est deja "perimee" des le prochain appel.
    second = await cache.get_or_refresh("k", soft_ttl_seconds=0, hard_ttl_seconds=600, compute_sync=compute)
    assert second == {"n": 1}  # valeur perimee servie sans attendre le recalcul

    # Laisse la tache de fond se terminer, puis verifie qu'elle a bien recalcule.
    await asyncio.sleep(0.05)
    assert len(calls) == 2
    third = await cache.get_or_refresh("k", soft_ttl_seconds=60, hard_ttl_seconds=600, compute_sync=compute)
    assert third == {"n": 2}


@pytest.mark.asyncio
async def test_get_or_refresh_uses_compute_background_for_stale_refresh():
    """compute_background (pas compute_sync) doit etre utilise pour le
    rafraichissement en arriere-plan -- important car compute_sync peut fermer sur
    des ressources liees a la requete d'origine (ex: session DB) qui ne sont plus
    valides une fois la reponse HTTP repartie."""
    cache = Cache()
    sync_calls, background_calls = [], []

    async def compute_sync():
        sync_calls.append(1)
        return {"source": "sync"}

    async def compute_background():
        background_calls.append(1)
        return {"source": "background"}

    await cache.get_or_refresh("k", 0, 600, compute_sync=compute_sync, compute_background=compute_background)
    await cache.get_or_refresh("k", 0, 600, compute_sync=compute_sync, compute_background=compute_background)
    await asyncio.sleep(0.05)

    assert len(sync_calls) == 1
    assert len(background_calls) == 1


@pytest.mark.asyncio
async def test_get_or_refresh_does_not_duplicate_concurrent_background_refreshes():
    """Deux appels concurrents sur une valeur perimee ne doivent lancer qu'UN SEUL
    rafraichissement en arriere-plan, pas un par appel."""
    cache = Cache()
    calls = []

    async def compute():
        calls.append(1)
        await asyncio.sleep(0.02)
        return {"n": len(calls)}

    await cache.get_or_refresh("k", 0, 600, compute_sync=compute)
    await asyncio.gather(
        cache.get_or_refresh("k", 0, 600, compute_sync=compute),
        cache.get_or_refresh("k", 0, 600, compute_sync=compute),
    )
    await asyncio.sleep(0.05)
    assert len(calls) == 2  # 1 premier calcul synchrone + 1 seul rafraichissement de fond


@pytest.mark.asyncio
async def test_redis_miss_does_not_resurrect_process_local_value(monkeypatch):
    """Une suppression Redis faite par le worker doit invalider la copie de l'API."""
    cache = Cache()
    cache._memory["k"] = ('{"cached_at": 1, "value": {"stale": true}}', float("inf"))

    class Redis:
        async def get(self, _key):
            return None

    async def redis_client():
        return Redis()

    monkeypatch.setattr(cache, "_client", redis_client)
    assert await cache.get_json("k") is None


@pytest.mark.asyncio
async def test_cold_requests_share_computation():
    cache = Cache()
    started = asyncio.Event()
    release = asyncio.Event()
    calls = 0

    async def compute():
        nonlocal calls
        calls += 1
        started.set()
        await release.wait()
        return {"n": calls}

    tasks = [asyncio.create_task(cache.get_or_refresh("cold", 60, 600, compute)) for _ in range(20)]
    await started.wait()
    release.set()
    assert await asyncio.gather(*tasks) == [{"n": 1}] * 20
    assert calls == 1


@pytest.mark.asyncio
async def test_failed_cold_compute_releases_lock():
    cache = Cache()

    async def failure():
        raise ValueError("upstream")

    with pytest.raises(ValueError):
        await cache.get_or_refresh("cold", 60, 600, failure)

    async def success():
        return {"ok": True}

    assert await cache.get_or_refresh("cold", 60, 600, success) == {"ok": True}


@pytest.mark.asyncio
async def test_memory_has_entry_and_byte_budgets():
    cache = Cache()
    cache._max_entries = 2
    cache._max_bytes = 100
    for i in range(10):
        await cache.set_json(str(i), {"value": "x" * 20}, 600)
    assert len(cache._memory) <= 2
    assert sum(len(raw.encode()) for raw, _ in cache._memory.values()) <= 100
    await cache.set_json("oversized", {"value": "x" * 200}, 600)
    assert "oversized" not in cache._memory
    for i in range(10):
        await cache.set_json("expired" + str(i), {}, -1)
    assert not any(k.startswith("expired") for k in cache._memory)


@pytest.mark.asyncio
async def test_two_caches_coordinate_with_shared_redis_lock(monkeypatch):
    shared = {}
    mutex = asyncio.Lock()

    class Lease:
        async def acquire(self):
            await mutex.acquire()
            return True

        async def release(self):
            mutex.release()

    class Redis:
        def lock(self, *args, **kwargs):
            return Lease()

        async def get(self, key):
            return shared.get(key)

        async def set(self, key, value, **kwargs):
            shared[key] = value

    redis = Redis()

    async def client():
        return redis

    first, second = Cache(), Cache()
    monkeypatch.setattr(first, "_client", client)
    monkeypatch.setattr(second, "_client", client)
    calls = 0

    async def compute():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0)
        return {"ok": True}

    assert (
        await asyncio.gather(*(c.get_or_refresh("shared", 60, 600, compute) for c in (first, second)))
        == [{"ok": True}] * 2
    )
    assert calls == 1
    assert not mutex.locked()


@pytest.mark.asyncio
async def test_cancelled_cold_request_releases_lock():
    cache = Cache()
    started = asyncio.Event()

    async def blocked():
        started.set()
        await asyncio.Event().wait()

    task = asyncio.create_task(cache.get_or_refresh("cancel", 60, 600, blocked))
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    async def success():
        return {"ok": True}

    assert await cache.get_or_refresh("cancel", 60, 600, success) == {"ok": True}
