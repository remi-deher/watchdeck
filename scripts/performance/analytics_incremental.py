"""Measure unchanged and corrected-history refreshes in the disposable lab DB."""

import asyncio
import json
import resource
import time
from unittest.mock import patch

from backend import RESULTS
from sqlalchemy import select

from app.database import AsyncSessionLocal, async_engine
from app.models import LibraryAnalyticsSnapshot, PlaybackSession, Settings
from app.services import library_analytics as api


async def main():
    async with AsyncSessionLocal() as db:
        catalogue = json.loads((await db.get(LibraryAnalyticsSnapshot, 1)).payload_json)["items"]
    calls = 0

    async def fetch(settings):
        nonlocal calls
        calls += 1
        return dict(items=catalogue, generated_at="2026-10-28T12:00:00")

    async def fingerprint(settings):
        return "lab-stable"

    result = dict(
        scope="real PostgreSQL, 50000 media/200000 plays; stable fixture catalogue; historical correction without last_seen_at change"
    )
    with patch.object(api, "fetch_plex_catalog", fetch), patch.object(api, "_catalog_fingerprint", fingerprint):
        for phase in ("initial_stable_catalogue", "unchanged", "historical_correction", "unchanged_after"):
            async with AsyncSessionLocal() as db:
                if phase == "historical_correction":
                    session = (
                        await db.execute(select(PlaybackSession).order_by(PlaybackSession.id).limit(1))
                    ).scalar_one()
                    session.watched_ms = (session.watched_ms or 0) + 1
                    await db.commit()
                settings = (await db.execute(select(Settings))).scalars().first()
                start = time.perf_counter()
                await api.refresh_library_analytics_snapshot(settings, db, include_items=False)
                result[phase + "_ms"] = round((time.perf_counter() - start) * 1000, 3)
    result.update(catalogue_calls=calls, rss_peak_kib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    (RESULTS / "analytics-incremental.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
    await async_engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
