"""PostgreSQL contracts for immutable analytics generations."""

import copy
import json
from datetime import datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import event, func, select

from app.models import (
    AnalyticsGeneration,
    AnalyticsItem,
    AnalyticsPlayback,
    LibraryAnalyticsSnapshot,
    PlaybackSession,
    Settings,
)
from app.services import analytics_projection as store
from app.services import library_analytics as api


def rows():
    result = []
    for i in range(24):
        result.append(
            dict(
                rating_key=str(i),
                title=["Été", "Straße", "100%_test"][i % 3] + str(i),
                parent_title="Volume " + str(i % 3),
                grandparent_title="Artiste " + str(i % 2),
                media_type="track" if i % 2 else "movie",
                library="Musique" if i % 2 else "Films",
                studio="Studio " + str(i % 2),
                video_codec="HEVC" if i % 2 else None,
                audio_codec="AAC",
                container="mkv",
                video_resolution="4k" if i % 2 else "sd",
                duration_ms=1000 + i,
                size_bytes=i * 1024**3,
                play_count=i % 3,
                watch_time_ms=i * 100,
                viewers=["Rémi", "Lisa"] if i % 3 else [],
                subtitle_count=[None, 0, 2][i % 3],
                subtitle_languages=["Français"],
                subtitle_types=["srt"],
                audio_languages=["Français"],
                audio_track_count=i % 4,
                last_viewed_at="2026-10-01T12:00:00" if i % 3 else None,
            )
        )
    return result


async def publish(db, data):
    payload = api._build_payload(copy.deepcopy(data), "2026-10-01T12:00:00", {})
    snapshot = await db.get(LibraryAnalyticsSnapshot, 1)
    if snapshot is None:
        snapshot = LibraryAnalyticsSnapshot(id=1, payload_json=json.dumps(payload))
        db.add(snapshot)
    await store.publish(db, snapshot, payload, "catalogue")
    await db.commit()
    return payload


@pytest.mark.asyncio
async def test_sql_pages_filters_summaries_and_detail_match_legacy(async_database):
    data = rows()
    async with async_database.session_factory() as db:
        await publish(db, data)
        generation = await store.header(db)
        for sort in api.ITEM_SORTS:
            for direction in ("asc", "desc"):
                expected = sorted(data, key=api.ITEM_SORTS[sort], reverse=direction == "desc")[3:10]
                actual = await api.analytics_items_payload(
                    Settings(), db, {}, sort=sort, direction=direction, offset=3, limit=7
                )
                assert actual["items"] == expected, (sort, direction)
        for filters in (
            {},
            {"search": "%"},
            {"search": "ÉTÉ"},
            {"studio": "Studio 1"},
            {"media_type": "track"},
            {"subtitle": "with"},
            {"subtitle": "without"},
            {"subtitle_type": "srt"},
            {"subtitle_language": "Français"},
            {"audio_language": "Français"},
            {"viewer": "Lisa"},
            {"watched": "no"},
            {"watched": "yes"},
            {"artist": "Artiste 1"},
            {"min_size_gb": 1.2, "max_size_gb": 11.9},
            {"video_resolution": "4k"},
            {"container": "mkv", "library": "Films", "search": "absent"},
        ):
            expected = api._build_payload(data, generation.generated_at, filters)
            actual = await api.analytics_summary_payload(Settings(), db, filters)
            assert {k: v for k, v in actual.items() if k not in ("projection_version", "refreshed_at")} == {
                k: v for k, v in expected.items() if k != "items"
            }, filters
            page = await api.analytics_items_payload(Settings(), db, filters, limit=500)
            assert page["items"] == sorted(expected["items"], key=lambda x: x["size_bytes"], reverse=True), filters
        assert await api.analytics_item(Settings(), db, "5") == data[5]
        assert await api.analytics_item(Settings(), db, "missing") is None
        for insight in ("subtitles", "unwatched"):
            page = await api.analytics_items_payload(Settings(), db, {}, limit=500, insight_kind=insight)
            assert (
                page["items"] == [r for r in data if r["subtitle_count"] == 0]
                if insight == "subtitles"
                else page["items"] == [r for r in data if not r["play_count"]]
            )
        page = await api.analytics_items_payload(
            Settings(),
            db,
            {},
            limit=500,
            insight_kind="distribution",
            insight_field="video_codec",
            insight_value="Inconnu",
        )
        assert page["items"] == [r for r in data if not r["video_codec"]]
        export = await api.analytics_payload(Settings(), db, {"viewer": "Lisa"})
        assert export["items"] == api.apply_filters(data, {"viewer": "Lisa"})


@pytest.mark.asyncio
async def test_ready_reads_never_select_or_parse_legacy_json(async_database):
    async with async_database.session_factory() as db:
        await publish(db, rows())
        snapshot = await db.get(LibraryAnalyticsSnapshot, 1)
        snapshot.payload_json = "{broken rollback fixture"
        await db.commit()
    async with async_database.session_factory() as db:
        statements = []
        connection = db.sync_session.get_bind()

        def record(conn, cursor, sql, params, context, many):
            statements.append(sql)

        event.listen(connection, "before_cursor_execute", record)
        try:
            assert (await api.analytics_items_payload(Settings(), db, {}, limit=2))["total"] == 24
            assert (await api.analytics_summary_payload(Settings(), db, {}))["summary"]["items"] == 24
            assert await api.analytics_item(Settings(), db, "0")
        finally:
            event.remove(connection, "before_cursor_execute", record)
        assert not any("payload_json" in sql for sql in statements if sql.lstrip().startswith("SELECT"))


@pytest.mark.asyncio
async def test_playback_changes_corrections_deletions_reuse_catalogue(monkeypatch, async_database):
    fetch = AsyncMock(return_value={"items": rows()[:2], "generated_at": "2026-10-01T12:00:00"})
    monkeypatch.setattr(api, "fetch_plex_catalog", fetch)
    monkeypatch.setattr(api, "_catalog_fingerprint", AsyncMock(return_value="unchanged"))
    original_aggregates = store.playback_aggregates
    aggregates = AsyncMock(wraps=original_aggregates)
    monkeypatch.setattr(store, "playback_aggregates", aggregates)
    async with async_database.session_factory() as db:
        first = await api.refresh_library_analytics_snapshot(Settings(), db)
        assert all(r["play_count"] == 0 for r in first["items"])
        session = PlaybackSession(
            source_session_id="one",
            rating_key="0",
            title="other",
            watched_ms=100,
            started_at=datetime(2026, 10, 1),
            last_seen_at=datetime(2026, 10, 1),
        )
        db.add(session)
        await db.commit()
        second = await api.refresh_library_analytics_snapshot(Settings(), db)
        assert second["items"][0]["play_count"] == 1
        assert len(aggregates.call_args.args[1]) == 1  # Only the affected medium is aggregated.
        session.watched_ms = 999
        await db.commit()  # Historical correction without touching last_seen_at.
        corrected = await api.refresh_library_analytics_snapshot(Settings(), db)
        assert corrected["items"][0]["watch_time_ms"] == 999
        await db.delete(session)
        await db.commit()
        removed = await api.refresh_library_analytics_snapshot(Settings(), db)
        assert removed["items"][0]["play_count"] == 0
        assert (await db.execute(select(func.count()).select_from(AnalyticsPlayback))).scalar_one() == 0
        assert fetch.await_count == 1
        assert (await db.execute(select(func.count()).select_from(AnalyticsGeneration))).scalar_one() == 3
        # No mutation should publish another generation.
        identifier = (await db.get(LibraryAnalyticsSnapshot, 1)).generation_id
        await api.refresh_library_analytics_snapshot(Settings(), db, include_items=False)
        assert (await db.get(LibraryAnalyticsSnapshot, 1)).generation_id == identifier


@pytest.mark.asyncio
async def test_failed_publication_keeps_previous_generation(monkeypatch, async_database):
    monkeypatch.setattr(
        api, "fetch_plex_catalog", AsyncMock(return_value={"items": rows()[:2], "generated_at": "2026-10-01T12:00:00"})
    )
    monkeypatch.setattr(api, "_catalog_fingerprint", AsyncMock(return_value=None))
    async with async_database.session_factory() as db:
        await api.refresh_library_analytics_snapshot(Settings(), db)
        identifier = (await db.get(LibraryAnalyticsSnapshot, 1)).generation_id
        original = store.publish

        async def fail(*args, **kwargs):
            await original(*args, **kwargs)
            raise RuntimeError("disk fixture")

        monkeypatch.setattr(store, "publish", fail)
        with pytest.raises(RuntimeError, match="disk fixture"):
            await api.refresh_library_analytics_snapshot(Settings(), db)
        await db.rollback()
        assert (await db.get(LibraryAnalyticsSnapshot, 1)).generation_id == identifier
        assert (await api.analytics_items_payload(Settings(), db, {}, limit=100))["total"] == 2
        assert (await db.execute(select(func.count()).select_from(AnalyticsGeneration))).scalar_one() == 1


@pytest.mark.asyncio
async def test_generation_collection_preserves_concurrent_reader(committed_async_database):
    import asyncio

    async with committed_async_database.session_factory() as writer:
        await publish(writer, rows()[:2])
        async with committed_async_database.session_factory() as reader:
            protected = await store.header(reader)
            async with asyncio.timeout(5):
                for _ in range(4):
                    await publish(writer, rows()[:2])
            page = await store.page(reader, protected, {}, offset=0, limit=2)
            assert len(page["items"]) == 2
            assert await reader.get(AnalyticsGeneration, protected.id)
        await publish(writer, rows()[:2])
        assert (await writer.execute(select(func.count()).select_from(AnalyticsGeneration))).scalar_one() == 3
