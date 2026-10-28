"""Cold and warm activity costs, measured separately with the same HTTP harness."""

import asyncio
import json
import sys
import time

import httpx
from backend import RESULTS, summary


async def main(label):
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8765", timeout=120) as client:
        (
            await client.post("/api/auth/login", json=dict(username="benchmark", password="benchmark-local-only"))
        ).raise_for_status()
        result = dict(
            scope="50000 media, 200000 plays, 501 users; new server process and empty daily aggregates; 20 calls per route",
            results={},
        )
        for name, path in dict(
            search="/api/library?query=0042&limit=200",
            deep="/api/library?sort=title_asc&offset=49900&limit=100",
            users="/api/users",
            activity="/api/playback/statistics?days=3650",
        ).items():
            await client.get("/__benchmark/stats?reset=true")
            times = []
            for _ in range(20):
                start = time.perf_counter()
                response = await client.get(path)
                response.raise_for_status()
                times.append((time.perf_counter() - start) * 1000)
            metrics = (await client.get("/__benchmark/stats")).json()
            result["results"][name] = dict(
                first_ms=round(times[0], 3),
                warm_ms=summary(times[1:]),
                decoded_bytes=len(response.content),
                sql_ms=summary([r["sql_ms"] for r in metrics["requests"]]),
                loop_lag_ms=summary(metrics["lag_ms"]),
                rss_peak_kib=metrics["rss_peak_kib"],
                rss_current_kib=metrics["rss_current_kib"],
            )
    (RESULTS / (label + "-activity-http.json")).write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
