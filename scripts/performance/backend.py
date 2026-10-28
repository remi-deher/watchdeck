"""Isolated lot-0 lab. Never point this harness at an application database."""

import argparse
import asyncio
import contextvars
import json
import os
import platform
import resource
import statistics
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
URL = "postgresql+asyncpg://watchdeck:watchdeck-test@127.0.0.1:5433/watchdeck_perf_lot0"
os.environ["DATABASE_URL"] = URL
os.environ.pop("REDIS_URL", None)
RESULTS = Path(os.environ.get("WATCHDECK_PERF_RESULTS", ROOT / "docs/performance-results/lot0"))
RESULTS.mkdir(parents=True, exist_ok=True)


def summary(values):
    values = sorted(values)
    return (
        {
            "n": len(values),
            "p50": round(statistics.median(values), 3),
            "p95": round(values[max(0, __import__("math").ceil(len(values) * 0.95) - 1)], 3),
            "max": round(max(values), 3),
        }
        if values
        else {}
    )


async def seed(profile):
    from sqlalchemy import insert, text

    from app.database import AsyncSessionLocal, async_engine
    from app.models import (
        Base,
        LibraryAnalyticsSnapshot,
        LibraryItem,
        MediaRequest,
        PlaybackSession,
        PlexUser,
        Settings,
    )
    from app.services.auth import hash_password
    from app.services.library_analytics import _build_payload, parse_plex_item

    n, history = {"small": (1000, 1000), "large": (50000, 10000), "history": (50000, 200000)}[profile]
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    now = datetime(2026, 10, 1, 12)
    user_count = 10 if profile == "small" else 500
    rows = []
    for i in range(n):
        row = parse_plex_item(
            {
                "ratingKey": str(i + 1),
                "type": "movie",
                "title": f"Film laboratoire {i:06}",
                "year": 2000 + i % 26,
                "duration": 5400000,
                "Media": [
                    {
                        "videoCodec": "h264",
                        "audioCodec": "aac",
                        "videoResolution": "1080",
                        "Part": [{"size": 1000000000 + i, "container": "mkv", "Stream": []}],
                    }
                ],
            },
            "Films",
            "movie",
        )
        row.update(play_count=i % 5, viewers=["benchmark"], watch_time_ms=i % 5 * 5400000)
        rows.append(row)
    payload = _build_payload(rows, now.isoformat(), {})
    async with AsyncSessionLocal() as db:
        db.add(Settings(id=1, auth_username="benchmark", auth_password_hash=hash_password("benchmark-local-only")))
        db.add(PlexUser(plex_user_id="benchmark", role="admin", enabled=True, can_login=True))
        db.add_all(
            [PlexUser(plex_user_id=f"lab-user-{i}", display_name=f"Compte laboratoire {i}") for i in range(user_count)]
        )
        db.add(LibraryAnalyticsSnapshot(id=1, payload_json=json.dumps(payload), source_fingerprint="lab"))
        for start in range(0, n, 1000):
            await db.execute(
                insert(LibraryItem),
                [
                    dict(
                        title=f"Film laboratoire {i:06}",
                        media_type="movie",
                        tmdb_id=str(i + 1),
                        added_at=now - timedelta(minutes=i),
                        year=2000 + i % 26,
                        overview="Description de laboratoire " * 12,
                        has_vf=True,
                    )
                    for i in range(start, min(n, start + 1000))
                ],
            )
        for start in range(0, n // 5, 1000):
            await db.execute(
                insert(MediaRequest),
                [
                    dict(
                        plex_user_id=f"lab-user-{i % user_count}",
                        title=f"Film laboratoire {i:06}",
                        media_type="movie",
                        tmdb_id=str(i + 1),
                        status="available",
                        requested_at=now - timedelta(minutes=i),
                        extra_requesters="[]",
                    )
                    for i in range(start, min(n // 5, start + 1000))
                ],
            )
        for start in range(0, history, 2000):
            await db.execute(
                insert(PlaybackSession),
                [
                    dict(
                        source_session_id=f"lab-{i}",
                        title=f"Film laboratoire {i % n:06}",
                        rating_key=str(i % n + 1),
                        user_name=f"lab-user-{i % user_count}",
                        started_at=now - timedelta(minutes=i),
                        last_seen_at=now - timedelta(minutes=i),
                        ended_at=now - timedelta(minutes=i),
                        watched_ms=3600000,
                    )
                    for i in range(start, min(history, start + 2000))
                ],
            )
        await db.commit()
    async with async_engine.connect() as conn:
        await conn.execute(text("ANALYZE"))
        actual = {}
        for table, expected in [
            ("library_items", n),
            ("media_requests", n // 5),
            ("playback_sessions", history),
            ("plex_users", user_count + 1),
        ]:
            actual[table] = (await conn.execute(text("SELECT count(*) FROM " + table))).scalar()
            assert actual[table] == expected, (table, actual[table], expected)
        plans = {}
        for name, sql in {
            "search": "SELECT * FROM library_items WHERE title ILIKE '%0042%' ORDER BY added_at DESC, title, id LIMIT 200",
            "first_page": "SELECT * FROM library_items ORDER BY added_at DESC, title, id LIMIT 200",
            "deep_page": f"SELECT * FROM library_items ORDER BY added_at DESC, title, id OFFSET {max(0, n - 200)} LIMIT 200",
            "history_recent": "SELECT * FROM playback_sessions WHERE ended_at IS NOT NULL ORDER BY started_at DESC, id DESC LIMIT 100",
        }.items():
            plans[name] = (await conn.execute(text("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql))).scalar()
    data = {
        "profile": profile,
        "library_items": n,
        "requests": n // 5,
        "playback_sessions": history,
        "fixture_reference_utc": now.isoformat(),
        "users": user_count + 1,
        "snapshot_bytes": len(json.dumps(payload).encode()),
        "verified_counts": actual,
        "plans": plans,
    }
    (RESULTS / f"{profile}-dataset.json").write_text(json.dumps(data, indent=2) + "\n")
    await async_engine.dispose()
    print(json.dumps({k: v for k, v in data.items() if k != "plans"}))


def server():
    import uvicorn
    from sqlalchemy import event

    from app.database import async_engine
    from app.main import app

    current = contextvars.ContextVar("perf_request", default=None)
    stats = {"requests": [], "lag_ms": [], "pool_checkout_peak": 0, "pool_probe_ms": []}

    @event.listens_for(async_engine.sync_engine, "before_cursor_execute")
    def before(conn, cursor, statement, parameters, context, many):
        context._perf_start = time.perf_counter()

    @event.listens_for(async_engine.sync_engine, "after_cursor_execute")
    def after(conn, cursor, statement, parameters, context, many):
        sample = current.get()
        if sample is not None:
            sample["sql_count"] += 1
            sample["sql_ms"] += (time.perf_counter() - context._perf_start) * 1000

    async def monitor():
        while True:
            start = time.perf_counter()
            await asyncio.sleep(0.01)
            stats["lag_ms"].append(max(0, (time.perf_counter() - start - 0.01) * 1000))
            stats["pool_checkout_peak"] = max(stats["pool_checkout_peak"], async_engine.pool.checkedout())
            start = time.perf_counter()
            async with async_engine.connect():
                stats["pool_probe_ms"].append((time.perf_counter() - start) * 1000)
            await asyncio.sleep(0.04)

    @app.middleware("http")
    async def instrumentation(request, call_next):
        if request.url.path.startswith("/__benchmark"):
            return await call_next(request)
        if not hasattr(app.state, "perf_monitor"):
            app.state.perf_monitor = asyncio.create_task(monitor())
        sample = {"path": request.url.path, "sql_count": 0, "sql_ms": 0}
        token = current.set(sample)
        start = time.perf_counter()
        try:
            response = await call_next(request)
            sample["status"] = response.status_code
            return response
        finally:
            sample["headers_ms"] = (time.perf_counter() - start) * 1000
            stats["requests"].append(sample)
            current.reset(token)

    @app.get("/__benchmark/stats")
    async def metrics(reset: bool = False):
        result = {
            **stats,
            "rss_peak_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "rss_current_kib": int(Path("/proc/self/statm").read_text().split()[1])
            * os.sysconf("SC_PAGE_SIZE")
            // 1024,
        }
        if reset:
            stats.update(requests=[], lag_ms=[], pool_checkout_peak=0, pool_probe_ms=[])
        return result

    app.router.routes.insert(0, app.router.routes.pop())
    uvicorn.run(app, host="127.0.0.1", port=8765, lifespan="off", access_log=False, log_level="warning")


async def http(profile):
    import httpx

    async with httpx.AsyncClient(base_url="http://127.0.0.1:8765", timeout=120) as client:
        login = await client.post("/api/auth/login", json={"username": "benchmark", "password": "benchmark-local-only"})
        login.raise_for_status()
        output = {
            "profile": profile,
            "python": platform.python_version(),
            "platform": platform.platform(),
            "concurrency": 8,
            "results": {},
        }
        paths = {
            "library": "/api/library?limit=200",
            "search": "/api/library?query=0042&limit=200",
            "deep": "/api/library?limit=200&offset=" + ("800" if profile == "small" else "49800"),
            "analytics": "/api/library-analytics/items?limit=100&sort=title",
            "summary": "/api/library-analytics",
            "users": "/api/users",
            "playback": "/api/playback/history?days=3650&limit=100",
            "playback_stats": "/api/playback/statistics?days=3650",
        }
        for name, path in paths.items():
            await client.get("/__benchmark/stats?reset=true")
            values = []
            sizes = []
            for _ in range(20):
                start = time.perf_counter()
                response = await client.get(path)
                response.raise_for_status()
                values.append((time.perf_counter() - start) * 1000)
                sizes.append(len(response.content))
            metrics = (await client.get("/__benchmark/stats")).json()
            output["results"][name] = {
                "http_ms": summary(values),
                "first_ms": round(values[0], 3),
                "warm_http_ms": summary(values[1:]),
                "decoded_bytes": max(sizes),
                "sql_count": summary([r["sql_count"] for r in metrics["requests"]]),
                "sql_ms": summary([r["sql_ms"] for r in metrics["requests"]]),
                "loop_lag_ms": summary(metrics["lag_ms"]),
                "pool_probe_ms": summary(metrics["pool_probe_ms"]),
                "pool_checkout_peak": metrics["pool_checkout_peak"],
                "rss_current_kib": metrics["rss_current_kib"],
            }
        await client.get("/__benchmark/stats?reset=true")

        async def request(i):
            start = time.perf_counter()
            response = await client.get(list(paths.values())[i % len(paths)])
            response.raise_for_status()
            return (time.perf_counter() - start) * 1000

        mixed = []
        for _ in range(5):
            mixed.extend(await asyncio.gather(*(request(i) for i in range(8))))
        output["mixed_http_ms"] = summary(mixed)
        metrics = (await client.get("/__benchmark/stats")).json()
        output["mixed"] = {k: v for k, v in metrics.items() if k not in ("requests", "lag_ms", "pool_probe_ms")}
        output["mixed"]["loop_lag_ms"] = summary(metrics["lag_ms"])
        output["mixed"]["pool_probe_ms"] = summary(metrics["pool_probe_ms"])
        await client.get("/__benchmark/stats?reset=true")

        async def login_again():
            start = time.perf_counter()
            response = await client.post(
                "/api/auth/login", json={"username": "benchmark", "password": "benchmark-local-only"}
            )
            response.raise_for_status()
            return (time.perf_counter() - start) * 1000

        logins = [asyncio.create_task(login_again()) for _ in range(4)]
        await asyncio.sleep(0.05)
        probe = []
        for _ in range(10):
            start = time.perf_counter()
            response = await client.get("/api/library?limit=1")
            response.raise_for_status()
            probe.append((time.perf_counter() - start) * 1000)
        output["auth_load"] = {
            "login_ms": summary(await asyncio.gather(*logins)),
            "independent_route_ms": summary(probe),
        }
        metrics = (await client.get("/__benchmark/stats")).json()
        output["auth_load"]["loop_lag_ms"] = summary(metrics["lag_ms"])
        (RESULTS / f"{profile}-http.json").write_text(json.dumps(output, indent=2) + "\n")
        print(json.dumps(output))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["seed", "server", "http"])
    parser.add_argument("--profile", choices=["small", "large", "history"], default="small")
    args = parser.parse_args()
    if args.mode == "server":
        server()
    else:
        asyncio.run(seed(args.profile) if args.mode == "seed" else http(args.profile))
