"""Compare seek/offset and paged/legacy account contracts in the isolated lab."""

import asyncio
import json
import time

import httpx
from backend import RESULTS, summary


async def main():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8765", timeout=120) as client:
        (
            await client.post("/api/auth/login", json=dict(username="benchmark", password="benchmark-local-only"))
        ).raise_for_status()
        first = await client.get("/api/library?paged=true&sort=title_asc&offset=49800&limit=100")
        first.raise_for_status()
        initial = first.json()
        assert len(initial["items"]) == 100 and initial["next_cursor"]
        import urllib.parse

        paths = dict(
            offset="/api/library?sort=title_asc&offset=49900&limit=100",
            seek="/api/library?paged=true&sort=title_asc&limit=100&cursor="
            + urllib.parse.quote(initial["next_cursor"]),
            users_legacy="/api/users",
            users_page="/api/users/page?limit=100",
        )
        results, identities = {}, {}
        for name, path in paths.items():
            await client.get("/__benchmark/stats?reset=true")
            timings, sizes = [], []
            for _ in range(20):
                start = time.perf_counter()
                response = await client.get(path)
                response.raise_for_status()
                timings.append((time.perf_counter() - start) * 1000)
                sizes.append(len(response.content))
                payload = response.json()
                items = payload if isinstance(payload, list) else payload["items"]
                identities[name] = [r["id"] for r in items]
            metrics = (await client.get("/__benchmark/stats")).json()
            results[name] = dict(
                http_ms=summary(timings),
                decoded_bytes=max(sizes),
                sql_ms=summary([r["sql_ms"] for r in metrics["requests"]]),
                sql_count=summary([r["sql_count"] for r in metrics["requests"]]),
                loop_lag_ms=summary(metrics["lag_ms"]),
            )
        assert identities["offset"] == identities["seek"]
        assert len(set(identities["seek"])) == 100
        assert len(identities["users_legacy"]) == 501 and len(identities["users_page"]) == 100
    result = dict(scope="same live laboratory, 50000 library items / 501 users; 20 requests per route", results=results)
    (RESULTS / "collections-http.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    asyncio.run(main())
