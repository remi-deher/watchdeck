"""Lot 4: PostgreSQL compatibility, bounded pages and activity parity."""

import asyncio
import json
import random
from datetime import datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, update

from app.models import (
    ArrInstance,
    CalendarProjection,
    LibraryItem,
    MediaRequest,
    NotificationLog,
    PlaybackSession,
    PlexUser,
    RequestRequester,
    RequestStatus,
)
from app.routers import calendar_api, library_api, users_api
from app.services.activity_aggregation import aggregate
from app.services.playback_activity import _analytics
from app.services.torrent_projection import project


@pytest.mark.asyncio
async def test_requesters_follow_legacy_bulk_updates_rollbacks_and_bad_json(async_database):
    async with async_database.session_factory() as db:
        request = MediaRequest(
            plex_user_id="a",
            title="Film",
            media_type="movie",
            extra_requesters=json.dumps(
                [{"plex_user_id": "b"}, {"plex_user_id": "b"}, {"plex_user_id": "a"}, "c", {}, None]
            ),
        )
        db.add(request)
        await db.commit()

        async def ids():
            return set((await db.execute(select(RequestRequester.plex_user_id))).scalars())

        assert await ids() == {"a", "b", "c"}
        await db.execute(update(MediaRequest).where(MediaRequest.id == request.id).values(extra_requesters="[]"))
        assert await ids() == {"a"}
        await db.rollback()
        assert await ids() == {"a", "b", "c"}
        await db.execute(update(MediaRequest).values(extra_requesters="broken"))
        await db.commit()
        assert await ids() == {"a"}
        await db.execute(update(MediaRequest).values(extra_requesters='{"not":"array"}'))
        await db.commit()
        assert await ids() == {"a"}


@pytest.mark.asyncio
async def test_users_pages_keep_global_counts_and_find_unloaded_users(async_database):
    async with async_database.session_factory() as db:
        for i in range(6):
            db.add(
                PlexUser(
                    plex_user_id=f"u{i}",
                    display_name=f"Compte {i}",
                    source="api",
                    notify_admin=False,
                    notification_email="  failing@fixture.test , other@fixture.test " if i == 5 else None,
                )
            )
        db.add(MediaRequest(plex_user_id="u5", title="Film", media_type="movie", status=RequestStatus.pending_approval))
        db.add(NotificationLog(recipient="FAILING@fixture.test", event="request", success=False))
        await db.commit()
        first = await users_api.users_page(db=db, limit=2)
        assert len(first["items"]) == 2 and first["total"] == first["all_total"] == 6
        assert first["situations"] == dict(pending=1, missing_email=5, notification_error=1)
        last = await users_api.users_page(db=db, query="Compte 5", attention="notification_error", limit=2)
        assert last["total"] == 1 and last["items"][0]["plex_user_id"] == "u5"
        assert last["items"][0]["has_notification_error"]
        assert last["items"][0]["stats"]["pending_approval"] == 1
        assert last["situations"] == first["situations"]
        by_requests = await users_api.users_page(db=db, sort="requests", direction="desc", limit=1)
        assert by_requests["items"][0]["plex_user_id"] == "u5"


def test_torrent_pages_facets_filters_and_tie_breakers():
    rows = [
        dict(
            hash=str(i),
            client_id=i % 2,
            client_name="A" if i % 2 else "B",
            title="Film",
            status="uploading" if i % 3 else "downloading",
            category="Films" if i % 2 else "Séries",
            tags="tag",
            tracker="udp://fixture.test:80",
            managed_by="watchdeck",
        )
        for i in range(30)
    ]
    page = project(rows, category=["Films"], limit=3)
    assert page["total"] == 15 and page["collection_total"] == 30
    assert sum(v["count"] for v in page["facets"]["category"]) == 30
    ids = []
    for offset in range(0, 15, 3):
        ids += [r["hash"] for r in project(rows, category=["Films"], limit=3, offset=offset)["items"]]
    assert len(ids) == len(set(ids)) == 15
    filtered = project(rows, query="cat:films tag:tag", state=["!seeding"])
    assert filtered["total"] == 5
    assert project(rows, client_id=0)["collection_total"] == 15
    assert len(project(rows, client_id=0)["facets"]["client"]) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("sort", [None, "title_asc", "title_desc", "year_desc", "added_desc"])
async def test_library_cursors_match_offset_order_with_nulls_and_ties(async_database, sort):
    async with async_database.session_factory() as db:
        db.add_all(
            [
                LibraryItem(
                    title=f"Film {i % 3}",
                    media_type="movie",
                    year=None if i % 3 else 2000,
                    added_at=datetime(2026, 10, 1) if i % 2 else None,
                )
                for i in range(19)
            ]
        )
        await db.commit()
        expected = await library_api.list_library(db=db, sort=sort, limit=500)
        cursor, collected = None, []
        for _ in range(10):
            page = await library_api.list_library(db=db, sort=sort, limit=3, paged=True, cursor=cursor)
            collected.extend(page["items"])
            cursor = page["next_cursor"]
            if not cursor:
                break
        assert [r["id"] for r in collected] == [r["id"] for r in expected]
        initial = await library_api.list_library(db=db, sort=sort, limit=3, paged=True)
        with pytest.raises(HTTPException) as error:
            await library_api.list_library(
                db=db, sort=sort, limit=3, paged=True, cursor=initial["next_cursor"], query="changed"
            )
        assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_streaming_activity_matches_reference_across_dst_and_overlaps(async_database):
    rng = random.Random(414)
    cutoff = datetime(2026, 10, 24)
    async with async_database.session_factory() as db:
        for i in range(140):
            start = cutoff + timedelta(hours=rng.randint(-48, 48))
            db.add(
                PlaybackSession(
                    source_session_id=str(i),
                    source="plex",
                    user_name=rng.choice(["Été", "Bob", None]),
                    title=f"Titre {i % 7}",
                    grandparent_title="Série" if i % 2 else None,
                    rating_key=str(i % 5),
                    media_type="episode" if i % 2 else "movie",
                    started_at=start,
                    ended_at=start + timedelta(minutes=rng.randint(-1, 180)),
                    last_seen_at=start + timedelta(minutes=5),
                    watched_ms=i * 1000,
                    playback_method=rng.choice(["direct_play", "direct_stream", "transcode", None]),
                    progress_percent=rng.choice([None, 20, 90]),
                    duration_ms=100000,
                    progress_ms=i * 1000,
                    watched_status=rng.choice([None, 0, 1]),
                    group_count=rng.choice([None, 1, 2]),
                    bandwidth_kbps=rng.choice([0, 20, 100]),
                    video_codec="hevc",
                    container="mkv",
                    player_title=rng.choice([None, "TV"]),
                    product="Web",
                    media_size_bytes=i * 100,
                )
            )
        await db.commit()
        for user in (None, "Été"):
            scope = [PlaybackSession.user_name == user] if user else []
            current = (
                (
                    await db.execute(
                        select(PlaybackSession)
                        .where(PlaybackSession.started_at >= cutoff, *scope)
                        .order_by(PlaybackSession.started_at, PlaybackSession.id)
                    )
                )
                .scalars()
                .all()
            )
            previous = (
                (await db.execute(select(PlaybackSession).where(PlaybackSession.started_at < cutoff, *scope)))
                .scalars()
                .all()
            )
            expected = _analytics(current, previous)
            actual = await aggregate(db, cutoff, cutoff - timedelta(days=4), user)
            assert actual == expected


@pytest.mark.asyncio
async def test_calendar_reads_do_not_create_requests_and_worker_publishes_atomically(
    monkeypatch, committed_async_database
):
    factory = committed_async_database.session_factory
    monkeypatch.setattr(calendar_api, "AsyncSessionLocal", factory)
    remote = AsyncMock(return_value=[dict(id=1, title="Film", tmdbId=99, digitalRelease="2026-07-20T00:00:00Z")])
    monkeypatch.setattr(calendar_api.radarr, "get_calendar", remote)
    monkeypatch.setattr(calendar_api.radarr, "get_queue_movie_ids", AsyncMock(return_value=set()))
    async with factory() as db:
        db.add(ArrInstance(name="Radarr", arr_type="radarr", url="http://radarr", api_key="key", enabled=True))
        await db.commit()
        assert await calendar_api.unified_calendar(db=db, start="2026-07-01", end="2026-08-01")
        assert (await db.execute(select(func.count()).select_from(MediaRequest))).scalar_one() == 0
    await asyncio.gather(*(calendar_api.refresh_calendar_projection("2026-07-01", "2026-08-01") for _ in range(2)))
    async with factory() as db:
        assert (await db.execute(select(func.count()).select_from(MediaRequest))).scalar_one() == 1
        assert (await db.execute(select(func.count()).select_from(CalendarProjection))).scalar_one() == 1
        remote.reset_mock()
        assert await calendar_api.unified_calendar(db=db, start="2026-07-01", end="2026-08-01")
        remote.assert_not_awaited()
    remote.side_effect = RuntimeError("unavailable")
    with pytest.raises(RuntimeError):
        await calendar_api.refresh_calendar_projection("2026-07-01", "2026-08-01")
    async with factory() as db:
        assert len((await db.execute(select(CalendarProjection))).scalar_one().events) == 1


@pytest.mark.asyncio
async def test_vf_movie_scan_query_count_is_independent_of_media_count(async_database):
    from sqlalchemy import event

    from app.services.vf_upgrade_scanner import _build_movie_tasks

    async with async_database.session_factory() as db:
        db.add(
            ArrInstance(
                name="Radarr", arr_type="radarr", url="http://radarr", api_key="key", enabled=True, is_default=True
            )
        )
        db.add_all(
            [
                MediaRequest(title=str(i), plex_user_id="u", media_type="movie", arr_id=i + 1, source="rss")
                for i in range(100)
            ]
        )
        await db.commit()
        statements = []
        engine = db.sync_session.get_bind()

        def record(conn, cursor, sql, params, context, many):
            if sql.lstrip().startswith("SELECT"):
                statements.append(sql)

        event.listen(engine, "before_cursor_execute", record)
        try:
            tasks = await _build_movie_tasks(db, force=True, skip=set(), recent=set())
        finally:
            event.remove(engine, "before_cursor_execute", record)
        assert len(tasks) == 100
        assert len(statements) == 3  # Instances + requests + library; no per-media SELECT.
