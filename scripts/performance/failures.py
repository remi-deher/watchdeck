"""Fault scenarios against a dedicated Redis on port 6387 and a local HTTP fixture."""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


async def main():
    from redis.asyncio import Redis

    from app.cache import Cache

    result = {}
    os.environ["REDIS_URL"] = "redis://127.0.0.1:6387/15"
    redis = Redis.from_url(os.environ["REDIS_URL"])
    await redis.flushdb()  # Dedicated disposable lab container only.
    first, second = Cache(), Cache()
    calls = 0

    async def compute():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.25)
        return {"value": calls}

    start = time.perf_counter()
    values = await asyncio.gather(*(c.get_or_refresh("lab:shared", 60, 600, compute) for c in [first, second] * 10))
    result["redis_shared_cold"] = {
        "requests": len(values),
        "computations": calls,
        "total_ms": (time.perf_counter() - start) * 1000,
    }
    # A separate Python interpreter proves that the coordination crosses process boundaries.
    await redis.delete("lab:process")
    start = time.perf_counter()
    processes = [await asyncio.create_subprocess_exec(sys.executable, __file__, "--child", cwd=ROOT) for _ in range(4)]
    statuses = await asyncio.gather(*(p.wait() for p in processes))
    assert statuses == [0] * 4, statuses
    result["redis_multiprocess"] = {
        "processes": 4,
        "computations": int(await redis.get("lab:process:computes")),
        "total_ms": (time.perf_counter() - start) * 1000,
    }
    await first.set_json("lab:hard", {"value": {"old": True}, "cached_at": time.time()}, 1)
    await asyncio.sleep(1.1)
    before = calls
    start = time.perf_counter()
    values = await asyncio.gather(*(c.get_or_refresh("lab:hard", 60, 600, compute) for c in (first, second)))
    result["hard_expired"] = {
        "computations": calls - before,
        "total_ms": (time.perf_counter() - start) * 1000,
        "recomputed": all(v != {"old": True} for v in values),
    }
    await first.set_json("lab:stale", {"value": {"old": True}, "cached_at": time.time() - 60}, 600)
    start = time.perf_counter()
    value = await first.get_or_refresh("lab:stale", 1, 600, compute)
    result["stale"] = {"response_ms": (time.perf_counter() - start) * 1000, "served_old": value == {"old": True}}
    await asyncio.sleep(0.35)
    result["stale"]["refreshed"] = (await first.get_json("lab:stale"))["value"] != {"old": True}
    await first.close()
    await second.close()
    # Real socket that accepts but never responds, to measure the configured timeout.
    sockets = []

    async def silent(reader, writer):
        sockets.append(writer)
        await reader.read()

    server = await asyncio.start_server(silent, "127.0.0.1", 6388)
    os.environ["REDIS_URL"] = "redis://127.0.0.1:6388/15"
    failed = Cache()
    start = time.perf_counter()
    await failed.set_json("fallback", {"ok": True}, 60)
    result["silent_redis"] = {"first_fallback_ms": (time.perf_counter() - start) * 1000}
    start = time.perf_counter()
    value = await failed.get_json("fallback")
    result["silent_redis"].update(repeated_ms=(time.perf_counter() - start) * 1000, fallback_ok=value == {"ok": True})
    os.environ["REDIS_URL"] = "redis://127.0.0.1:6387/15"
    await asyncio.sleep(10.1)
    start = time.perf_counter()
    await failed.set_json("recovered", {"ok": True}, 60)
    result["recovery"] = {
        "connection_ms": (time.perf_counter() - start) * 1000,
        "redis_value": await redis.get("recovered") == b'{"ok": true}',
    }
    await failed.close()
    server.close()
    for writer in sockets:
        writer.close()
    await server.wait_closed()
    # Actual Arr HTTP client, locally simulated 250 ms dependency and HTTP 503.
    os.environ["DATABASE_URL"] = "postgresql://watchdeck:watchdeck-test@127.0.0.1:5433/watchdeck_perf_lot0"
    from app.services import arr_catalog
    from app.services.arr_http_client import close_arr_clients

    requests = 0
    status = 200

    async def upstream(reader, writer):
        nonlocal requests
        await reader.readuntil(b"\r\n\r\n")
        requests += 1
        await asyncio.sleep(0.25)
        body = b'[{"id":1}]'
        writer.write(
            f"HTTP/1.1 {status} Fixture\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode() + body
        )
        await writer.drain()
        writer.close()

    http = await asyncio.start_server(upstream, "127.0.0.1", 6389)
    arr_catalog.invalidate()
    start = time.perf_counter()
    await asyncio.gather(*(arr_catalog.get_catalog("sonarr", "http://127.0.0.1:6389", "lab") for _ in range(20)))
    result["slow_arr"] = {"requests": 20, "upstream_calls": requests, "total_ms": (time.perf_counter() - start) * 1000}
    status = 503
    arr_catalog._cache[("sonarr", "http://127.0.0.1:6389")] = ([{"id": 1}], 0)
    before = requests
    start = time.perf_counter()
    values = await asyncio.gather(
        *(arr_catalog.get_catalog("sonarr", "http://127.0.0.1:6389", "lab") for _ in range(20))
    )
    result["failed_arr"] = {
        "upstream_calls": requests - before,
        "total_ms": (time.perf_counter() - start) * 1000,
        "stale_preserved": all(v == [{"id": 1}] for v in values),
    }
    await close_arr_clients()
    http.close()
    await http.wait_closed()
    await redis.aclose()
    path = ROOT / "docs/performance-results/lot0/failures.json"
    path.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


async def child():
    from redis.asyncio import Redis

    from app.cache import Cache

    redis = Redis.from_url(os.environ["REDIS_URL"])

    async def compute():
        await redis.incr("lab:process:computes")
        await asyncio.sleep(0.25)
        return {"ok": True}

    await Cache().get_or_refresh("lab:process", 60, 600, compute)
    await redis.aclose()


if __name__ == "__main__":
    asyncio.run(child() if "--child" in sys.argv else main())
