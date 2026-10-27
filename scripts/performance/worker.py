"""Measure the real analytics refresh core in an isolated process, with a fixture catalogue."""

import asyncio
import json
import os
import resource
import sys
import time
from pathlib import Path
from unittest.mock import patch

from backend import RESULTS, ROOT, URL, summary


async def main(profile, arq=False):
    from sqlalchemy import select

    from app.database import AsyncSessionLocal, async_engine
    from app.models import LibraryAnalyticsSnapshot, Settings
    from app.services import library_analytics

    async with AsyncSessionLocal() as db:
        snapshot = await db.get(LibraryAnalyticsSnapshot, 1)
        catalogue = json.loads(snapshot.payload_json)["items"]
    calls = 0

    async def fetch(settings):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.1)
        return {"items": catalogue, "generated_at": "2026-10-28T12:00:00", "libraries": []}

    async def fingerprint(settings):
        return None

    lag = []
    stop = False

    async def monitor():
        while not stop:
            start = time.perf_counter()
            await asyncio.sleep(0.01)
            lag.append(max(0, (time.perf_counter() - start - 0.01) * 1000))

    task = asyncio.create_task(monitor())
    durations = []
    with (
        patch.object(library_analytics, "fetch_plex_catalog", fetch),
        patch.object(library_analytics, "_catalog_fingerprint", fingerprint),
    ):
        if arq:
            from arq.connections import RedisSettings, create_pool
            from arq.worker import Worker

            from app.jobs import job_library_analytics

            os.environ["REDIS_URL"] = "redis://127.0.0.1:6387/14"
            redis = await create_pool(RedisSettings(host="127.0.0.1", port=6387, database=14))
            await redis.flushdb()  # Dedicated disposable laboratory Redis.
            jobs = [
                await redis.enqueue_job("job_library_analytics", force=True, _queue_name="arq:lot0") for _ in range(3)
            ]
            queue_wait = []
            queued_at = time.perf_counter()

            async def on_start(ctx):
                queue_wait.append((time.perf_counter() - queued_at) * 1000)

            worker = Worker(
                [job_library_analytics],
                redis_pool=redis,
                queue_name="arq:lot0",
                burst=True,
                max_jobs=1,
                poll_delay=0.05,
                handle_signals=False,
                on_job_start=on_start,
            )
            await worker.async_run()
            results = await asyncio.gather(*(job.result(timeout=1) for job in jobs))
            assert all(r["status"] == "complete" for r in results), results
            durations = [r["duration_ms"] for r in results]
            payload = {"items": catalogue}
            await worker.close()
        else:
            for _ in range(3):
                start = time.perf_counter()
                async with AsyncSessionLocal() as db:
                    settings = (await db.execute(select(Settings))).scalars().first()
                    payload = await library_analytics.refresh_library_analytics_snapshot(settings, db)
                durations.append((time.perf_counter() - start) * 1000)
    stop = True
    await task
    result = {
        "profile": profile,
        "scope": "actual analytics refresh core, real PostgreSQL; Plex catalogue acquisition replaced by 100ms fixture; ARQ scheduler not running",
        "refresh_ms": summary(durations),
        "loop_lag_ms": summary(lag),
        "catalogue_calls": calls,
        "items": len(payload["items"]),
        "rss_peak_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
    }
    if arq:
        result["scope"] = (
            "actual ARQ queue and job_library_analytics; real PostgreSQL/Redis; Plex catalogue acquisition replaced by 100ms fixture; max_jobs=1, no cron"
        )
        result["queue_wait_ms"] = summary(queue_wait)
    (RESULTS / (f"{profile}-" + ("arq.json" if arq else "worker.json"))).write_text(json.dumps(result, indent=2) + "\n")
    await async_engine.dispose()
    print(json.dumps(result))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], "--arq" in sys.argv))
