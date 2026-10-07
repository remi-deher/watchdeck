"""Loading guarantees with controlled slow upstreams, independent of PostgreSQL."""

import asyncio
import json
import time
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from PIL import Image
from starlette.requests import Request

from app.cache import cache
from app.routers import dashboard_api, image_proxy_api, metrics_api
from app.services import playback_activity, playback_preload


def payload(frame):
    return json.loads(frame.removeprefix("data: ").strip())


@pytest.fixture
def dashboard(monkeypatch):
    async def with_session(call):
        return await call(None)

    monkeypatch.setattr(dashboard_api, "_with_session", with_session)
    monkeypatch.setattr(dashboard_api.metrics_api, "next_poll_info", AsyncMock(return_value={}))


@pytest.mark.asyncio
async def test_partial_stream_reuses_prepared_sections(dashboard, monkeypatch):
    counts = AsyncMock(return_value={"total": 3})
    notifications = AsyncMock(return_value={"items": []})
    monkeypatch.setattr(dashboard_api, "_snapshot_calls", lambda: {"counts": counts, "notifications": notifications})
    await dashboard_api.prepare_dashboard()
    frames = [payload(frame) async for frame in dashboard_api._stream_sections({"counts"})]
    assert frames == [{"counts": {"total": 3}}]
    counts.assert_awaited_once()
    notifications.assert_awaited_once()


@pytest.mark.asyncio
async def test_stale_section_is_visible_before_slow_refresh(dashboard, monkeypatch):
    entered, release = asyncio.Event(), asyncio.Event()

    async def counts(_):
        entered.set()
        await release.wait()
        return {"total": 4}

    monkeypatch.setattr(dashboard_api, "_snapshot_calls", lambda: {"counts": counts})
    await cache.set_json(
        dashboard_api._SECTION_PREFIX + "counts", {"value": {"total": 3}, "cached_at": time.time() - 60}, 900
    )
    stream = dashboard_api._stream_sections({"counts"})
    assert payload(await anext(stream)) == {"counts": {"total": 3}}
    remaining = asyncio.create_task(anext(stream))
    await asyncio.wait_for(entered.wait(), 1)
    assert not remaining.done()
    release.set()
    assert payload(await remaining) == {"counts": {"total": 4}}
    await stream.aclose()


@pytest.mark.asyncio
async def test_event_refresh_does_not_return_fresh_but_obsolete_cache(dashboard, monkeypatch):
    counts = AsyncMock(return_value={"total": 4})
    monkeypatch.setattr(dashboard_api, "_snapshot_calls", lambda: {"counts": counts})
    await cache.set_json(
        dashboard_api._SECTION_PREFIX + "counts", {"value": {"total": 3}, "cached_at": time.time()}, 900
    )
    result = await dashboard_api._compute_snapshot({"counts"}, refresh=True)
    assert result["counts"] == {"total": 4}
    counts.assert_awaited_once()


@pytest.mark.asyncio
async def test_simultaneous_cold_requests_share_section_calculation(dashboard, monkeypatch):
    async def compute(_):
        await asyncio.sleep(0.01)
        return {"total": 3}

    counts = AsyncMock(side_effect=compute)
    monkeypatch.setattr(dashboard_api, "_snapshot_calls", lambda: {"counts": counts})
    results = await asyncio.gather(*(dashboard_api._compute_snapshot({"counts"}) for _ in range(5)))
    assert all(result["counts"] == {"total": 3} for result in results)
    counts.assert_awaited_once()


@pytest.mark.asyncio
async def test_section_failure_preserves_last_good_value(dashboard, monkeypatch):
    monkeypatch.setattr(
        dashboard_api, "_snapshot_calls", lambda: {"counts": AsyncMock(side_effect=RuntimeError("offline"))}
    )
    key = dashboard_api._SECTION_PREFIX + "counts"
    await cache.set_json(key, {"value": {"total": 3}, "cached_at": time.time()}, 900)
    result = await dashboard_api._compute_snapshot({"counts"}, refresh=True)
    assert result["errors"] == ["counts"]
    assert (await cache.get_json(key))["value"] == {"total": 3}


@pytest.mark.asyncio
async def test_countdown_failure_does_not_cancel_sections(dashboard, monkeypatch):
    monkeypatch.setattr(dashboard_api.metrics_api, "next_poll_info", AsyncMock(side_effect=TimeoutError()))
    monkeypatch.setattr(dashboard_api, "_snapshot_calls", lambda: {"counts": AsyncMock(return_value={"total": 3})})
    frames = [payload(frame) async for frame in dashboard_api._stream_sections()]
    assert {"errors": ["next_poll"]} in frames
    assert {"counts": {"total": 3}} in frames


@pytest.mark.asyncio
async def test_slow_countdown_does_not_delay_ready_sections(dashboard, monkeypatch):
    release = asyncio.Event()

    async def countdown():
        await release.wait()
        return {}

    monkeypatch.setattr(dashboard_api.metrics_api, "next_poll_info", countdown)
    monkeypatch.setattr(dashboard_api, "_snapshot_calls", lambda: {"counts": AsyncMock(return_value={"total": 3})})
    stream = dashboard_api._stream_sections()
    try:
        assert payload(await asyncio.wait_for(anext(stream), 1)) == {"counts": {"total": 3}}
        release.set()
        assert payload(await anext(stream)) == {"next_poll": {}}
    finally:
        await stream.aclose()


@pytest.mark.asyncio
async def test_collection_schedules_artwork_without_awaiting_it(monkeypatch):
    monkeypatch.setattr(playback_activity, "acquire_distributed_lock", AsyncMock(return_value="test"))
    monkeypatch.setattr(playback_activity, "release_distributed_lock", AsyncMock())
    monkeypatch.setattr(playback_activity, "_collect_plex_activity_unlocked", AsyncMock(return_value={"active": 1}))
    monkeypatch.setattr(playback_activity, "enrich_decisions_from_plex_logs", AsyncMock())
    schedule = MagicMock()
    monkeypatch.setattr(playback_preload, "schedule_playback_images", schedule)
    assert await playback_activity.collect_plex_activity() == {"active": 1}
    schedule.assert_called_once()


@pytest.fixture
def images(tmp_path, monkeypatch):
    monkeypatch.setattr(image_proxy_api, "_IMAGE_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(image_proxy_api, "_allowed_image_hosts", AsyncMock(return_value={"plex.local"}))
    monkeypatch.setattr(image_proxy_api, "_tls_verify", AsyncMock(return_value=True))
    image_proxy_api._missing.clear()
    image_proxy_api._image_locks.clear()
    image_proxy_api._source_locks.clear()


async def proxy(width=None):
    request = Request({"type": "http", "method": "GET", "path": "/api/image-proxy", "headers": []})
    return await image_proxy_api.image_proxy(
        request,
        url="http://plex.local/poster.png",
        plex_path=None,
        width=width,
        height=None,
        quality=90,
        image_format="webp" if width else "original",
        plex_server=None,
    )


def png():
    output = BytesIO()
    Image.new("RGB", (300, 400), "red").save(output, format="PNG")
    return output.getvalue()


@pytest.mark.asyncio
async def test_two_image_sizes_download_source_only_once(images, monkeypatch):
    async def get(*args, **kwargs):
        await asyncio.sleep(0.01)
        return httpx.Response(
            200, content=png(), headers={"content-type": "image/png"}, request=httpx.Request("GET", args[0])
        )

    client = AsyncMock()
    client.__aenter__.return_value = client
    client.get.side_effect = get
    monkeypatch.setattr(image_proxy_api.httpx, "AsyncClient", lambda **_: client)
    responses = await asyncio.gather(proxy(162), proxy(630))
    assert all(response.status_code == 200 for response in responses)
    client.get.assert_awaited_once()


@pytest.mark.asyncio
async def test_expired_image_returns_before_refresh_and_is_updated(images, monkeypatch):
    source = "http://plex.local/poster.png"
    image_proxy_api._write_image_cache(source, b"old", "image/png", time.time() - 90000)
    entered, release = asyncio.Event(), asyncio.Event()

    async def get(*args, **kwargs):
        entered.set()
        await release.wait()
        return httpx.Response(
            200, content=b"new", headers={"content-type": "image/png"}, request=httpx.Request("GET", args[0])
        )

    client = AsyncMock()
    client.__aenter__.return_value = client
    client.get.side_effect = get
    monkeypatch.setattr(image_proxy_api.httpx, "AsyncClient", lambda **_: client)
    try:
        response = await asyncio.wait_for(proxy(), 1)
        assert response.body == b"old"
        await asyncio.wait_for(entered.wait(), 1)
        again = await proxy()
        assert again.body == b"old"
        assert len(image_proxy_api._image_refresh_tasks) == 1
        tasks = list(image_proxy_api._image_refresh_tasks.values())
        release.set()
        await asyncio.gather(*tasks)
        assert (await proxy()).body == b"new"
        client.get.assert_awaited_once()
    finally:
        release.set()
        await asyncio.gather(*list(image_proxy_api._image_refresh_tasks.values()), return_exceptions=True)


@pytest.mark.asyncio
async def test_preload_prepares_exact_client_variants_and_preserves_server(monkeypatch):
    src = "/api/playback/thumb?path=%2Flibrary%2Fmetadata%2F7%2Fthumb&server=2"
    monkeypatch.setattr(
        playback_activity, "live_activity_snapshot", AsyncMock(return_value={"active": [{"thumb_url": src}]})
    )
    render = AsyncMock()
    monkeypatch.setattr(image_proxy_api, "image_proxy", render)
    playback_preload._prepared.clear()
    await playback_preload.prepare_playback_images()
    assert {call.kwargs["width"] for call in render.await_args_list} == {162, 312, 630}
    assert all(call.kwargs["plex_server"] == 2 for call in render.await_args_list)
    assert all(call.kwargs["plex_path"] == "/library/metadata/7/thumb" for call in render.await_args_list)
    await playback_preload.prepare_playback_images()
    assert render.await_count == 3


@pytest.mark.asyncio
async def test_preload_failure_is_retried_without_interrupting_collection(monkeypatch):
    monkeypatch.setattr(
        playback_activity,
        "live_activity_snapshot",
        AsyncMock(return_value={"active": [{"art_url": "/api/playback/thumb?path=%2Flibrary%2Fmetadata%2F8%2Fart"}]}),
    )
    render = AsyncMock(side_effect=RuntimeError("Plex offline"))
    monkeypatch.setattr(image_proxy_api, "image_proxy", render)
    playback_preload._prepared.clear()
    await playback_preload.prepare_playback_images()
    await playback_preload.prepare_playback_images()
    assert render.await_count == 2


@pytest.mark.asyncio
async def test_dashboard_counts_never_contact_arr(monkeypatch):
    db = AsyncMock()
    result = MagicMock()
    result.all.return_value = []
    db.execute.return_value = result
    monkeypatch.setattr(metrics_api, "_count_incomplete_show_requests", AsyncMock(return_value=0))
    shows = AsyncMock(side_effect=AssertionError("network on the display path"))
    movies = AsyncMock(side_effect=AssertionError("network on the display path"))
    monkeypatch.setattr(metrics_api, "_count_orphan_sonarr_progress", shows)
    monkeypatch.setattr(metrics_api, "_count_orphan_radarr_missing", movies)
    await cache.set_json(metrics_api._ORPHAN_SONARR_PROGRESS_CACHE_KEY, {"count": 2}, 900)
    await cache.set_json(metrics_api._ORPHAN_RADARR_MISSING_CACHE_KEY, {"count": 3}, 900)
    counts = await metrics_api.stats_counts(db, allow_remote=False)
    assert counts["sent_to_arr"] == 5
    assert counts["total"] == 5
    shows.assert_not_awaited()
    movies.assert_not_awaited()


@pytest.mark.asyncio
async def test_preparation_is_coalesced_and_stopped_cleanly(monkeypatch):
    entered = asyncio.Event()

    async def prepare():
        entered.set()
        await asyncio.Event().wait()

    work = AsyncMock(side_effect=prepare)
    monkeypatch.setattr(playback_preload, "prepare_playback_images", work)
    playback_preload.schedule_playback_images()
    await asyncio.wait_for(entered.wait(), 1)
    playback_preload.schedule_playback_images()
    work.assert_awaited_once()
    await playback_preload.stop_playback_images()
    assert playback_preload._task is None


@pytest.mark.asyncio
async def test_worker_counts_preserve_failed_source_and_refresh_healthy_source(monkeypatch):
    from app import jobs
    from app.services import arr_orphans

    session = AsyncMock()
    monkeypatch.setattr(jobs, "AsyncSessionLocal", lambda: session)
    monkeypatch.setattr(arr_orphans, "find_orphan_shows", AsyncMock(side_effect=RuntimeError("Sonarr offline")))
    monkeypatch.setattr(arr_orphans, "find_orphan_movies", AsyncMock(return_value=[{}, {}, {}]))
    dashboard_refresh = AsyncMock()
    monkeypatch.setattr(jobs, "cron_prepare_dashboard", dashboard_refresh)
    await cache.set_json(metrics_api._ORPHAN_SONARR_PROGRESS_CACHE_KEY, {"count": 2}, 900)
    await jobs.cron_prepare_dashboard_counts({})
    assert (await cache.get_json(metrics_api._ORPHAN_SONARR_PROGRESS_CACHE_KEY))["count"] == 2
    assert (await cache.get_json(metrics_api._ORPHAN_RADARR_MISSING_CACHE_KEY))["count"] == 3
    dashboard_refresh.assert_awaited_once()


@pytest.mark.parametrize("stream", [False, True])
def test_dashboard_http_routes_share_the_prepared_cache(dashboard, monkeypatch, stream):
    from fastapi.testclient import TestClient

    from app.dependencies import require_admin, require_auth
    from app.main import app

    counts = AsyncMock(return_value={"total": 3})
    monkeypatch.setattr(dashboard_api, "_snapshot_calls", lambda: {"counts": counts})
    overrides = dict(app.dependency_overrides)
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[require_auth] = lambda: None
    try:
        client = TestClient(app)
        path = "/api/dashboard/snapshot" + ("/stream" if stream else "") + "?sections=counts"
        first = client.get(path)
        second = client.get(path)
        assert first.status_code == second.status_code == 200
        counts.assert_awaited_once()
        if stream:
            assert payload(second.text) == {"counts": {"total": 3}}
            assert second.headers["x-accel-buffering"] == "no"
        else:
            assert second.json()["counts"] == {"total": 3}
        client.get(path + "&refresh=true")
        assert counts.await_count == 2
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)
