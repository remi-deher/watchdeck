"""Local, synthetic cache baseline. No database or external service is contacted."""

import argparse
import asyncio
import importlib.util
import json
import platform
import statistics
import time
import tracemalloc
from pathlib import Path


async def measure(source):
    spec = importlib.util.spec_from_file_location("measured_cache", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    cache = module.Cache()

    async def offline():
        return None

    cache._client = offline
    calls = 0

    async def compute():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.02)
        return {"items": list(range(100))}

    async def request():
        start = time.perf_counter()
        await cache.get_or_refresh("baseline", 60, 600, compute)
        return (time.perf_counter() - start) * 1000

    tracemalloc.start()
    cold = await asyncio.gather(*(request() for _ in range(20)))
    cold_calls = calls
    warm = [await request() for _ in range(100)]
    for i in range(3000):
        await cache.set_json(f"expired:{i}", {"payload": "x" * 512}, -1)
    retained = len(cache._memory)
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    def summary(values):
        ordered = sorted(values)
        return {
            "p50_ms": round(statistics.median(values), 3),
            "p95_ms": round(ordered[int((len(ordered) - 1) * 0.95)], 3),
        }

    return {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "scope": "synthetic, memory cache only, no DB/Redis/browser",
        "concurrent_requests": 20,
        "cold_compute_calls": cold_calls,
        "cold": summary(cold),
        "warm": summary(warm),
        "entries_after_3000_expired_writes": retained,
        "traced_current_bytes": current,
        "traced_peak_bytes": peak,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1] / "app/cache.py")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(asyncio.run(measure(args.source)), indent=2) + "\n")
