"""Prechargement des images d'un media (app/services/image_warmup.py) et ses actions de maintenance."""

import os
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import unquote_plus

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import LibraryItem, MediaRequest
from app.routers import image_proxy_api
from app.routers.maintenance import (
    MaintenanceRun,
    _run_clear_image_cache,
    _run_warm_images,
    _runs,
)
from app.services import image_warmup
from app.services.image_warmup import (
    POSTER_VARIANTS,
    WarmTarget,
    clear_image_cache,
    load_warm_targets,
    register_listeners,
    schedule_media_warmup,
    stop_image_warmup,
    warm_media_images,
    warm_targets,
)
from app.services.media_annotate import annotate_rail_items
from app.utils import RAIL_PROXY_WIDTHS, wrap_rail_poster


class _NoDb:
    """Session factice : le detail TMDB est simule, la base n'est jamais interrogee."""

    async def __aenter__(self):
        return None

    async def __aexit__(self, *exc):
        return False


def _target(**overrides):
    base = {
        "kind": "library",
        "id": 7,
        "title": "Dune",
        "media_type": "movie",
        "tmdb_id": "438631",
        "poster_url": "https://image.tmdb.org/t/p/w342/poster.jpg",
    }
    return WarmTarget(**{**base, **overrides})


@pytest.fixture()
def proxy(monkeypatch):
    """Remplace le proxy et TMDB : seul compte ce que le prechargement leur demande."""
    stored = AsyncMock()
    fetch = AsyncMock()
    monkeypatch.setattr(image_proxy_api, "_proxy_stored_poster", stored)
    monkeypatch.setattr(image_proxy_api, "image_proxy", fetch)
    monkeypatch.setattr(image_warmup, "AsyncSessionLocal", lambda: _NoDb())
    detail = AsyncMock(return_value={"backdrop_url": "https://image.tmdb.org/t/p/w1280/bd.jpg"})
    monkeypatch.setattr("app.services.tmdb.detail", detail)
    return stored, fetch, detail


def test_cover_url_points_at_the_card_variant_or_nothing():
    assert _target().cover_url == "/api/image-proxy/library/7?width=500&quality=82&format=webp"
    assert _target(kind="request", id=3).cover_url == "/api/image-proxy/request/3?width=500&quality=82&format=webp"
    assert _target(poster_url=None).cover_url is None


@pytest.mark.asyncio
async def test_every_poster_variant_and_the_original_backdrop_are_requested(proxy):
    stored, fetch, detail = proxy

    warmed = await warm_media_images(_target(), None)

    assert warmed == len(POSTER_VARIANTS) + 1
    asked = [(call.args[3], call.args[5]) for call in stored.await_args_list]
    assert asked == list(POSTER_VARIANTS)
    detail.assert_awaited_once()
    backdrop = fetch.await_args.kwargs
    # Le fond est demande depuis l'original TMDB, a la definition que reclame la banniere.
    assert backdrop["url"] == "https://image.tmdb.org/t/p/original/bd.jpg"
    assert (backdrop["width"], backdrop["quality"], backdrop["image_format"]) == (1920, 90, "webp")


@pytest.mark.asyncio
async def test_cast_portraits_are_requested_at_the_widths_the_sheet_uses(proxy):
    _, fetch, detail = proxy
    detail.return_value = {
        "backdrop_url": None,
        "cast": [
            {"profile_url": "https://image.tmdb.org/t/p/w185/face.jpg"},
            {"profile_url": None},
        ],
    }

    warmed = await warm_media_images(_target(poster_url=None), None)

    asked = [(call.kwargs["url"], call.kwargs["width"], call.kwargs["quality"]) for call in fetch.await_args_list]
    # Depuis le barreau h632, aux deux largeurs du srcset, sans rien pour l'acteur sans portrait.
    assert asked == [
        ("https://image.tmdb.org/t/p/h632/face.jpg", 185, 92),
        ("https://image.tmdb.org/t/p/h632/face.jpg", 370, 92),
    ]
    assert warmed == 2


@pytest.mark.asyncio
async def test_rail_posters_are_requested_once_each_at_every_srcset_width(proxy):
    _, fetch, detail = proxy
    detail.return_value = {
        "recommendations": [{"poster_url": "https://image.tmdb.org/t/p/w342/a.jpg"}],
        "similar": [
            {"poster_url": "https://image.tmdb.org/t/p/w342/a.jpg"},  # deja vue dans les recommandations
            {"poster_url": None},
            {"poster_url": "/api/image-proxy/library/3?width=500"},  # media de la bibliotheque : deja chaud
        ],
        "saga": {"items": [{"poster_url": "https://image.tmdb.org/t/p/w342/b.jpg"}]},
    }

    warmed = await warm_media_images(_target(poster_url=None), None)

    asked = sorted((call.kwargs["url"], call.kwargs["width"]) for call in fetch.await_args_list)
    expected = sorted(
        (f"https://image.tmdb.org/t/p/w500/{name}.jpg", width) for name in ("a", "b") for width in RAIL_PROXY_WIDTHS
    )
    assert asked == expected
    assert all(call.kwargs["quality"] == 92 for call in fetch.await_args_list)
    assert warmed == len(expected)


def test_a_tmdb_rail_poster_goes_through_the_proxy_from_the_w500_source():
    wrapped = wrap_rail_poster("https://image.tmdb.org/t/p/w342/a.jpg")

    assert wrapped.startswith("/api/image-proxy?url=")
    assert unquote_plus(wrapped.split("url=")[1].split("&")[0]) == "https://image.tmdb.org/t/p/w500/a.jpg"


@pytest.mark.parametrize(
    "url",
    [None, "", "/api/image-proxy/library/3?width=500", "https://artworks.thetvdb.com/banners/x.jpg"],
)
def test_other_posters_are_left_untouched(url):
    assert wrap_rail_poster(url) == url


@pytest.mark.asyncio
async def test_annotated_rail_items_get_their_posters_proxied(monkeypatch):
    items = [{"tmdb_id": 1, "poster_url": "https://image.tmdb.org/t/p/w342/a.jpg"}, {"tmdb_id": 2, "poster_url": None}]
    monkeypatch.setattr(
        "app.services.media_annotate.annotate_media_items", AsyncMock(side_effect=lambda db, rows: rows)
    )

    result = await annotate_rail_items(None, items)

    assert result[0]["poster_url"].startswith("/api/image-proxy?url=")
    assert result[1]["poster_url"] is None


@pytest.mark.asyncio
async def test_a_failing_portrait_does_not_stop_the_others(proxy):
    _, fetch, detail = proxy
    detail.return_value = {
        "cast": [
            {"profile_url": "https://image.tmdb.org/t/p/w185/a.jpg"},
            {"profile_url": "https://image.tmdb.org/t/p/w185/b.jpg"},
        ]
    }
    fetch.side_effect = [RuntimeError("introuvable"), None, None]

    warmed = await warm_media_images(_target(poster_url=None), None)

    # A echoue des sa premiere largeur ; B charge ses deux largeurs.
    assert warmed == 2


@pytest.mark.asyncio
async def test_a_missing_poster_stops_its_remaining_variants_but_not_the_backdrop(proxy):
    stored, fetch, _ = proxy
    stored.side_effect = RuntimeError("source injoignable")

    warmed = await warm_media_images(_target(), None)

    assert stored.await_count == 1
    assert warmed == 1
    fetch.assert_awaited_once()


@pytest.mark.asyncio
async def test_a_failing_backdrop_never_raises(proxy):
    _, fetch, detail = proxy
    detail.side_effect = RuntimeError("TMDB indisponible")

    assert await warm_media_images(_target(), None) == len(POSTER_VARIANTS)
    fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_music_and_unknown_tmdb_ids_get_a_poster_only(proxy):
    _, fetch, detail = proxy

    await warm_media_images(_target(media_type="album"), None)
    await warm_media_images(_target(tmdb_id=None), None)

    detail.assert_not_awaited()
    fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_progress_reports_each_finished_media(monkeypatch):
    targets = [_target(id=1, title="A"), _target(id=2, title="B"), _target(id=3, title="C")]
    monkeypatch.setattr(image_warmup, "_load_settings", AsyncMock(return_value=None))
    monkeypatch.setattr(image_warmup, "warm_media_images", AsyncMock(side_effect=[5, 0, 5]))
    seen = []

    stats = await warm_targets(targets, lambda done, total, target: seen.append((done, total)), concurrency=1)

    assert stats == {"total": 3, "warmed": 2, "empty": 1}
    assert seen == [(1, 3), (2, 3), (3, 3)]


def test_clearing_the_cache_removes_every_file_and_forgets_missing_images(tmp_path, monkeypatch):
    (tmp_path / "a.bin").write_bytes(b"x" * 10)
    (tmp_path / "a.meta").write_bytes(b"y" * 5)
    monkeypatch.setattr(image_proxy_api, "_IMAGE_CACHE_DIR", str(tmp_path))
    image_proxy_api._missing["https://example.test/x.jpg"] = 1e12

    assert clear_image_cache() == {"files": 2, "bytes": 15}
    assert os.listdir(tmp_path) == []
    assert image_proxy_api._missing == {}


def test_clearing_a_cache_that_does_not_exist_is_a_noop(tmp_path, monkeypatch):
    monkeypatch.setattr(image_proxy_api, "_IMAGE_CACHE_DIR", str(tmp_path / "absent"))
    assert clear_image_cache() == {"files": 0, "bytes": 0}


@pytest.mark.asyncio
async def test_targets_cover_the_library_then_requests_not_yet_in_it(async_db):
    movie = LibraryItem(title="Dune", media_type="movie", tmdb_id="1", poster_url="https://x/p.jpg")
    track = LibraryItem(title="Une piste", media_type="track")
    async_db.add_all([movie, track])
    async_db.commit()
    async_db.add_all(
        [
            MediaRequest(plex_user_id="a", title="Deja en bibliotheque", media_type="movie", library_item_id=movie.id),
            MediaRequest(plex_user_id="a", title="Pas encore la", media_type="show", tmdb_id="2"),
        ]
    )
    async_db.commit()

    targets = await load_warm_targets(async_db)

    assert [(t.kind, t.title) for t in targets] == [("library", "Dune"), ("request", "Pas encore la")]


@pytest.mark.asyncio
async def test_scheduling_deduplicates_and_stopping_empties_the_queue():
    schedule_media_warmup("library", 1)
    schedule_media_warmup("library", 1)
    schedule_media_warmup("request", 1)
    assert set(image_warmup._pending) == {("library", 1), ("request", 1)}

    await stop_image_warmup()
    assert image_warmup._pending == {}


def test_scheduling_without_an_event_loop_does_nothing():
    schedule_media_warmup("library", 5)
    assert image_warmup._pending == {}


@pytest.mark.asyncio
async def test_a_new_media_or_a_new_poster_is_queued_but_not_a_track(async_db):
    register_listeners()
    register_listeners()  # idempotent : un seul ecouteur par evenement

    item = LibraryItem(title="Dune", media_type="movie")
    track = LibraryItem(title="Une piste", media_type="track")
    async_db.add_all([item, track])
    async_db.commit()
    assert set(image_warmup._pending) == {("library", item.id)}

    image_warmup._pending.clear()
    item.title = "Dune 2"
    async_db.commit()
    assert image_warmup._pending == {}  # un autre champ ne declenche rien

    item.poster_url = "https://x/new.jpg"
    async_db.commit()
    assert set(image_warmup._pending) == {("library", item.id)}


# --- Actions de maintenance -----------------------------------------------------------


@pytest.mark.asyncio
async def test_warm_images_run_exposes_the_media_being_processed(monkeypatch):
    targets = [_target(id=1, title="A"), _target(id=2, title="B")]
    monkeypatch.setattr("app.database.AsyncSessionLocal", lambda: _NoDb())
    monkeypatch.setattr(image_warmup, "load_warm_targets", AsyncMock(return_value=targets))

    async def fake_warm(items, on_progress):
        for index, item in enumerate(items, start=1):
            on_progress(index, len(items), item)
        return {"total": 2, "warmed": 2, "empty": 0}

    monkeypatch.setattr(image_warmup, "warm_targets", fake_warm)
    run = MaintenanceRun(action="warm-images")

    await _run_warm_images(run)

    assert run.current == {
        "title": "B",
        "media_type": "movie",
        "cover_url": "/api/image-proxy/library/2?width=500&quality=82&format=webp",
        "done": 2,
        "total": 2,
    }
    # La barre ne depasse pas 99 : c'est la fin du run qui la ferme.
    assert run.progress == 99.0
    assert any("2 média(s) préchargé(s)" in line for line in run.logs)


@pytest.mark.asyncio
async def test_warm_images_run_with_nothing_to_do_warns(monkeypatch):
    monkeypatch.setattr("app.database.AsyncSessionLocal", lambda: _NoDb())
    monkeypatch.setattr(image_warmup, "load_warm_targets", AsyncMock(return_value=[]))
    run = MaintenanceRun(action="warm-images")

    await _run_warm_images(run)

    assert run.logs == ["[WARN] Aucun média à précharger."]


@pytest.mark.asyncio
async def test_warm_images_run_reports_a_failure_in_its_logs(monkeypatch):
    monkeypatch.setattr("app.database.AsyncSessionLocal", lambda: _NoDb())
    monkeypatch.setattr(image_warmup, "load_warm_targets", AsyncMock(side_effect=RuntimeError("base injoignable")))
    run = MaintenanceRun(action="warm-images")

    with pytest.raises(RuntimeError):
        await _run_warm_images(run)

    assert run.logs == ["[ERR] base injoignable"]


@pytest.mark.asyncio
async def test_clear_cache_run_reports_what_it_freed(monkeypatch):
    monkeypatch.setattr(image_warmup, "clear_image_cache", MagicMock(return_value={"files": 4, "bytes": 2_097_152}))
    run = MaintenanceRun(action="clear-image-cache")

    await _run_clear_image_cache(run)

    assert run.logs == ["[OK] 4 fichier(s) supprimé(s), 2.0 Mo libérés."]


@pytest.mark.asyncio
async def test_clear_cache_run_reports_a_failure_in_its_logs(monkeypatch):
    monkeypatch.setattr(image_warmup, "clear_image_cache", MagicMock(side_effect=OSError("disque en lecture seule")))
    run = MaintenanceRun(action="clear-image-cache")

    with pytest.raises(OSError):
        await _run_clear_image_cache(run)

    assert run.logs == ["[ERR] disque en lecture seule"]


@pytest.fixture()
def client(async_db):
    app.dependency_overrides[require_auth] = lambda: None
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_db_async] = lambda: async_db
    yield TestClient(app, raise_server_exceptions=True)
    for dependency in (require_auth, require_admin, get_db_async):
        app.dependency_overrides.pop(dependency, None)


def test_both_actions_are_listed_and_clearing_asks_for_confirmation(client):
    actions = client.get("/api/maintenance/actions").json()

    assert actions["warm-images"]["label"] == "Précharger les images"
    assert "confirm" not in actions["warm-images"]
    assert actions["clear-image-cache"]["confirm"]


def test_a_run_exposes_its_current_media(client):
    run = MaintenanceRun(action="warm-images", current={"title": "Dune", "done": 1, "total": 9})
    _runs["warm-run"] = run
    try:
        body = client.get("/api/maintenance/run/warm-run").json()
    finally:
        _runs.pop("warm-run", None)

    assert body["current"] == {"title": "Dune", "done": 1, "total": 9}
