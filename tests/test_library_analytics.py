import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models import LibraryAnalyticsSnapshot
from app.services.library_analytics import (
    _build_payload,
    analytics_item,
    analytics_item_technical,
    analytics_items_payload,
    analytics_payload,
    analytics_summary_payload,
    apply_filters,
    fetch_plex_catalog,
    parse_plex_item,
    parse_plex_technical,
    refresh_library_analytics_snapshot,
)


def sample_item():
    return {
        "ratingKey": "42",
        "type": "episode",
        "title": "Le pilote",
        "grandparentTitle": "Une série",
        "studio": "Watchdeck Studio",
        "year": 2026,
        "duration": 3600000,
        "Media": [
            {
                "videoCodec": "hevc",
                "audioCodec": "eac3",
                "videoResolution": "4k",
                "Part": [
                    {
                        "size": 5 * 1024**3,
                        "container": "mkv",
                        "Stream": [
                            {"streamType": 2, "codec": "eac3", "language": "Français", "channels": 6},
                            {"streamType": 3, "language": "Français"},
                            {"streamType": 3, "language": "English"},
                        ],
                    }
                ],
            }
        ],
    }


def test_parse_plex_item_extracts_raw_technical_metadata():
    row = parse_plex_item(sample_item(), "Séries", "show")
    assert row["media_type"] == "episode"
    assert row["video_codec"] == "HEVC"
    assert row["audio_codec"] == "EAC3"
    assert row["size_bytes"] == 5 * 1024**3
    assert row["audio_track_count"] == 1
    assert row["subtitle_count"] == 2
    assert row["subtitle_languages"] == ["English", "Français"]


def test_a_catalog_entry_without_streams_has_unknown_subtitles():
    item = sample_item()
    item["Media"][0]["Part"][0].pop("Stream")
    row = parse_plex_item(item, "Séries", "show")
    assert row["subtitle_count"] is None

    # `play_count` et `viewers` sont ajoutes au rafraichissement, apres la lecture du catalogue.
    payload = _build_payload([{**row, "play_count": 0, "viewers": []}], "2026-10-01T00:00:00", {})
    subtitles = next(entry for entry in payload["insights"] if entry["kind"] == "subtitles")
    assert subtitles["value"] is None
    assert apply_filters([row], {"subtitle": "without"}) == []


def test_the_banner_of_an_episode_is_its_show_background():
    item = {**sample_item(), "art": "/library/metadata/9/art/1", "grandparentArt": "/library/metadata/3/art/2"}
    assert (
        parse_plex_item(item, "Séries", "show")["art_url"]
        == "/api/playback/thumb?path=%2Flibrary%2Fmetadata%2F3%2Fart%2F2"
    )
    # Un chemin hors de la bibliotheque Plex n'est pas servi par le proxy de vignettes.
    item = {**item, "grandparentArt": "http://ailleurs/art.jpg", "art": None}
    assert parse_plex_item(item, "Séries", "show")["art_url"] is None


def test_filters_combine_media_technical_storage_and_audience_fields():
    row = parse_plex_item(sample_item(), "Séries", "show")
    row.update(play_count=2, viewers=["Rémi"], watch_time_ms=1000)
    assert apply_filters(
        [row],
        {
            "media_type": "episode",
            "video_codec": "HEVC",
            "subtitle": "with",
            "watched": "yes",
            "min_size_gb": 4.5,
            "max_size_gb": 5.5,
        },
    ) == [row]
    assert apply_filters([row], {"subtitle": "without"}) == []
    assert apply_filters([row], {"watched": "no"}) == []


@pytest.mark.asyncio
async def test_refresh_persists_a_complete_precomputed_snapshot(monkeypatch):
    row = parse_plex_item(sample_item(), "Séries", "show")
    monkeypatch.setattr(
        "app.services.library_analytics.fetch_plex_catalog",
        AsyncMock(return_value={"items": [row], "generated_at": "2026-07-26T10:00:00", "libraries": []}),
    )
    result = SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
    db = SimpleNamespace(
        execute=AsyncMock(return_value=result),
        get=AsyncMock(return_value=None),
        add=lambda value: setattr(db, "added", value),
        commit=AsyncMock(),
    )

    payload = await refresh_library_analytics_snapshot(SimpleNamespace(), db)

    assert payload["summary"]["items"] == 1
    assert isinstance(db.added, LibraryAnalyticsSnapshot)
    assert json.loads(db.added.payload_json)["insights"] == payload["insights"]
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_normal_request_serves_database_snapshot_without_recalculation(monkeypatch):
    row = parse_plex_item(sample_item(), "Séries", "show")
    row.update(play_count=0, viewers=[], watch_time_ms=0)
    stored = {
        "generated_at": "2026-07-26T10:00:00",
        "summary": {"items": 1},
        "insights": [],
        "distributions": {},
        "largest": [],
        "options": {},
        "items": [row],
    }
    snapshot = LibraryAnalyticsSnapshot(payload_json=json.dumps(stored))
    db = SimpleNamespace(get=AsyncMock(return_value=snapshot))
    fetch = AsyncMock(side_effect=AssertionError("Plex ne doit pas être interrogé"))
    monkeypatch.setattr("app.services.library_analytics.fetch_plex_catalog", fetch)

    payload = await analytics_payload(SimpleNamespace(), db, {}, refresh=False)

    assert payload == stored
    fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_summary_and_items_do_not_return_the_whole_snapshot():
    rows = []
    for index in range(3):
        row = parse_plex_item(sample_item(), "Séries", "show")
        row.update(title=f"Episode {index}", size_bytes=(index + 1) * 100, play_count=0, viewers=[], watch_time_ms=0)
        rows.append(row)
    stored = {
        "generated_at": "2026-07-26T10:00:00",
        "summary": {"items": 3},
        "insights": [],
        "distributions": {},
        "largest": [],
        "options": {},
        "items": rows,
    }
    db = SimpleNamespace(get=AsyncMock(return_value=LibraryAnalyticsSnapshot(payload_json=json.dumps(stored))))

    summary = await analytics_summary_payload(SimpleNamespace(), db, {}, refresh=False)
    page = await analytics_items_payload(SimpleNamespace(), db, {}, offset=0, limit=2)

    assert "items" not in summary
    assert page["total"] == 3
    assert page["has_more"] is True
    assert [row["title"] for row in page["items"]] == ["Episode 2", "Episode 1"]


@pytest.mark.asyncio
async def test_analytics_item_finds_one_media_by_its_plex_key():
    rows = []
    for index in range(2):
        row = parse_plex_item(sample_item(), "Films", "movie")
        row.update(title=f"Film {index}", rating_key=f"k{index}")
        rows.append(row)
    db = SimpleNamespace(get=AsyncMock(return_value=LibraryAnalyticsSnapshot(payload_json=json.dumps({"items": rows}))))

    assert (await analytics_item(SimpleNamespace(), db, "k1"))["title"] == "Film 1"
    assert await analytics_item(SimpleNamespace(), db, "absent") is None


@pytest.mark.asyncio
async def test_analytics_item_rebuilds_a_missing_or_unreadable_snapshot(monkeypatch):
    rebuilt = {"items": [{"rating_key": "k1", "title": "Reconstruit"}]}
    refresh = AsyncMock(return_value=rebuilt)
    monkeypatch.setattr("app.services.library_analytics.refresh_library_analytics_snapshot", refresh)

    missing = SimpleNamespace(get=AsyncMock(return_value=None))
    assert (await analytics_item(SimpleNamespace(), missing, "k1"))["title"] == "Reconstruit"

    unreadable = SimpleNamespace(get=AsyncMock(return_value=LibraryAnalyticsSnapshot(payload_json="{pas du json")))
    assert (await analytics_item(SimpleNamespace(), unreadable, "k1"))["title"] == "Reconstruit"
    assert refresh.await_count == 2


def test_analytics_item_endpoint_returns_the_media_or_404(monkeypatch):
    from fastapi.testclient import TestClient

    from app.database import get_db_async
    from app.dependencies import get_settings_or_404, require_admin
    from app.main import app

    async def fake_item(settings, db, rating_key):
        return {"rating_key": rating_key, "title": "Dune"} if rating_key == "k1" else None

    monkeypatch.setattr("app.routers.library_analytics_api.analytics_item", fake_item)
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_settings_or_404] = lambda: SimpleNamespace()
    app.dependency_overrides[get_db_async] = lambda: None
    try:
        client = TestClient(app, raise_server_exceptions=False)
        assert client.get("/api/library-analytics/items/k1").json()["title"] == "Dune"
        assert client.get("/api/library-analytics/items/absent").status_code == 404
    finally:
        for dependency in (require_admin, get_settings_or_404, get_db_async):
            app.dependency_overrides.pop(dependency, None)


@pytest.mark.asyncio
async def test_items_sort_on_quality_audio_and_subtitles():
    def row(title, resolution, codec, audio, tracks, subtitles):
        item = parse_plex_item(sample_item(), "Films", "movie")
        item.update(
            title=title,
            video_resolution=resolution,
            video_codec=codec,
            audio_codec=audio,
            audio_track_count=tracks,
            subtitle_count=subtitles,
        )
        return item

    rows = [
        row("SD", "sd", "h264", "ac3", 1, 3),
        row("UHD", "4k", "hevc", "truehd", 2, 0),
        row("HD", "1080", "h264", "eac3", 1, 1),
    ]
    db = SimpleNamespace(get=AsyncMock(return_value=LibraryAnalyticsSnapshot(payload_json=json.dumps({"items": rows}))))

    async def titles(sort, direction):
        page = await analytics_items_payload(SimpleNamespace(), db, {}, sort=sort, direction=direction)
        return [item["title"] for item in page["items"]]

    assert await titles("video", "desc") == ["UHD", "HD", "SD"]
    assert await titles("video", "asc") == ["SD", "HD", "UHD"]
    assert await titles("audio", "asc") == ["SD", "HD", "UHD"]
    assert await titles("subtitles", "desc") == ["SD", "HD", "UHD"]


@pytest.mark.asyncio
async def test_subtitles_insight_lists_only_media_known_without_subtitles():
    """Un média sans flux analysés (sous-titres inconnus) ne compte pas comme « sans sous-titres »."""

    def row(title, subtitles):
        item = parse_plex_item(sample_item(), "Films", "movie")
        item.update(title=title, subtitle_count=subtitles)
        return item

    rows = [row("Sans", 0), row("Avec", 2), row("Inconnu", None)]
    db = SimpleNamespace(get=AsyncMock(return_value=LibraryAnalyticsSnapshot(payload_json=json.dumps({"items": rows}))))

    page = await analytics_items_payload(SimpleNamespace(), db, {}, insight_kind="subtitles")

    assert [item["title"] for item in page["items"]] == ["Sans"]


def test_an_episode_inherits_the_studio_of_its_show():
    """Plex n'expose le studio que sur la série ; l'épisode n'en porte aucun.

    La bibliothèque de séries était interrogée en `type=4`, donc épisode par épisode :
    aucun ne portait de studio et l'inventaire les rangeait tous sous « Inconnu » —
    96 % du catalogue en production, alors que la donnée existait un niveau au-dessus.
    """
    episode = sample_item()
    episode.pop("studio")
    episode["grandparentRatingKey"] = "7"

    orphelin = parse_plex_item(dict(episode), "Séries", "show")
    herite = parse_plex_item(dict(episode), "Séries", "show", {"7": "Watchdeck Studio"})

    assert orphelin["studio"] == "Inconnu"
    assert herite["studio"] == "Watchdeck Studio"


def test_the_item_keeps_its_own_studio_when_it_has_one():
    """Un film porte son studio : la table des séries ne doit pas l'écraser."""
    film = sample_item()
    film["grandparentRatingKey"] = "7"

    row = parse_plex_item(film, "Films", "movie", {"7": "Studio de la série"})

    assert row["studio"] == "Watchdeck Studio"


@pytest.mark.asyncio
async def test_the_catalog_reads_the_shows_to_learn_their_studios(monkeypatch):
    """Une bibliothèque de séries demande aussi les séries, pas seulement les épisodes.

    C'est là que vivait le défaut : l'inventaire n'interrogeait Plex qu'en `type=4` et
    n'avait donc jamais l'occasion de voir un studio.
    """
    calls: list[dict] = []

    def _payload(url: str, params: dict) -> dict:
        if url.endswith("/library/sections"):
            return {"MediaContainer": {"Directory": [{"key": "3", "title": "Séries", "type": "show"}]}}
        if params.get("type") == 2:
            return {"MediaContainer": {"Metadata": [{"ratingKey": "7", "studio": "Watchdeck Studio"}]}}
        episode = sample_item()
        episode.pop("studio")
        episode["grandparentRatingKey"] = "7"
        return {"MediaContainer": {"Metadata": [episode]}}

    class _Response:
        def __init__(self, data):
            self._data = data

        def raise_for_status(self):
            return None

        def json(self):
            return self._data

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, headers=None, params=None):
            calls.append({"url": url, "params": params or {}})
            return _Response(_payload(url, params or {}))

    monkeypatch.setattr("app.services.library_analytics.httpx.AsyncClient", lambda **kwargs: _Client())
    settings = SimpleNamespace(plex_url="http://plex:32400", plex_token="jeton", plex_verify_ssl=False)

    catalog = await fetch_plex_catalog(settings)

    assert [call["params"].get("type") for call in calls if "sections/3/all" in call["url"]] == [2, 4]
    assert [row["studio"] for row in catalog["items"]] == ["Watchdeck Studio"]


def _session(**overrides):
    """Une lecture minimale, telle que la corrélation la lit."""
    base = {
        "id": 7,
        "player_title": "Salon",
        "product": "Plex for Apple TV",
        "platform": "tvOS",
        "rating_key": None,
        "title": None,
        "grandparent_title": None,
        "user_name": "Lisa",
        "watched_ms": 60_000,
        "progress_ms": 0,
        "started_at": datetime(2026, 5, 1, 20, 0),
        "last_seen_at": datetime(2026, 5, 1, 21, 0),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


async def _rows_with_history(monkeypatch, rows, sessions):
    monkeypatch.setattr(
        "app.services.library_analytics.fetch_plex_catalog",
        AsyncMock(return_value={"items": rows, "generated_at": "2026-07-26T10:00:00", "libraries": []}),
    )
    result = SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: sessions))
    db = SimpleNamespace(
        execute=AsyncMock(return_value=result),
        get=AsyncMock(return_value=None),
        add=lambda value: None,
        commit=AsyncMock(),
    )
    return await refresh_library_analytics_snapshot(SimpleNamespace(), db)


@pytest.mark.asyncio
async def test_an_episode_only_counts_its_own_plays(monkeypatch):
    """Le repli par titre passait par `grandparent_title`.

    Un épisode héritait donc de *toutes* les lectures de sa série : chaque épisode
    affichait l'audience de la saison entière, et la fiche annonçait des spectateurs qui
    n'avaient jamais ouvert celui-là.
    """
    pilote = parse_plex_item({**sample_item(), "ratingKey": "1", "title": "Le pilote"}, "Séries", "show")
    final = parse_plex_item({**sample_item(), "ratingKey": "2", "title": "Le final"}, "Séries", "show")
    sessions = [
        _session(title="Le pilote", grandparent_title="Une série", user_name="Lisa"),
        _session(title="Le pilote", grandparent_title="Une série", user_name="Rémi"),
    ]

    payload = await _rows_with_history(monkeypatch, [pilote, final], sessions)
    rows = {row["title"]: row for row in payload["items"]}

    assert rows["Le pilote"]["play_count"] == 2
    assert rows["Le final"]["play_count"] == 0
    assert rows["Le final"]["viewers"] == []


@pytest.mark.asyncio
async def test_each_item_carries_its_viewing_dates(monkeypatch):
    """La fiche disait combien de fois un média avait été vu, jamais quand."""
    film = parse_plex_item({**sample_item(), "type": "movie", "title": "Chihiro"}, "Films", "movie")
    sessions = [
        _session(title="Chihiro", user_name="Lisa", started_at=datetime(2026, 5, 1, 20, 0)),
        _session(title="Chihiro", user_name="Rémi", started_at=datetime(2026, 6, 2, 21, 0)),
    ]

    payload = await _rows_with_history(monkeypatch, [film], sessions)
    row = payload["items"][0]

    # Les plus récentes d'abord : c'est ce que la fiche montre en premier.
    assert [view["user"] for view in row["views"]] == ["Rémi", "Lisa"]
    # Chaque visionnage mene a la fiche de sa session.
    assert all(view["session_id"] == 7 for view in row["views"])
    assert row["views"][0]["player"] == "Salon" and row["views"][0]["platform"] == "tvOS"
    assert row["last_viewed_at"] == "2026-06-02T21:00:00"


def test_the_distributions_that_are_clickable_are_also_filterable():
    """Chaque camembert filtre la page entière : le serveur doit savoir s'y restreindre.

    La résolution et l'artiste n'étaient pas des filtres serveur ; cliquer leur part
    n'aurait donc rien filtré, alors que les cinq autres répartitions le faisaient.
    """
    piste = parse_plex_item({**sample_item(), "type": "track", "grandparentTitle": "Daft Punk"}, "Musique", "artist")
    episode = parse_plex_item(sample_item(), "Séries", "show")

    assert apply_filters([piste, episode], {"artist": "Daft Punk"}) == [piste]
    assert apply_filters([piste, episode], {"artist": "Personne"}) == []
    # `video_resolution` vaut « 4k » sur l'échantillon (voir `sample_item`).
    assert apply_filters([episode], {"video_resolution": "4k"}) == [episode]
    assert apply_filters([episode], {"video_resolution": "1080"}) == []


def test_the_inventory_can_be_filtered_by_viewer():
    row = parse_plex_item(sample_item(), "Séries", "show")
    row.update(play_count=2, viewers=["Lisa", "Rémi"], watch_time_ms=0)

    assert apply_filters([row], {"viewer": "Lisa"}) == [row]
    assert apply_filters([row], {"viewer": "Inconnu"}) == []


def test_each_row_carries_a_portrait_poster_through_the_proxy():
    """Un episode prend l'affiche de sa saison : sa propre vignette est une capture 16/9."""
    episode = parse_plex_item(
        {**sample_item(), "thumb": "/library/metadata/42/thumb/1", "parentThumb": "/library/metadata/40/thumb/2"},
        "Séries",
        "show",
    )
    film = parse_plex_item(
        {**sample_item(), "type": "movie", "thumb": "/library/metadata/42/thumb/1"}, "Films", "movie"
    )
    sans = parse_plex_item({**sample_item(), "type": "movie"}, "Films", "movie")

    assert episode["thumb_url"] == "/api/playback/thumb?path=%2Flibrary%2Fmetadata%2F40%2Fthumb%2F2"
    assert film["thumb_url"].startswith("/api/playback/thumb?path=%2Flibrary%2Fmetadata%2F42%2Fthumb%2F1")
    assert sans["thumb_url"] is None


def technical_metadata():
    return {
        "type": "movie",
        "guid": "plex://movie/abc",
        "thumb": "/library/metadata/42/thumb/1",
        "art": "/library/metadata/42/art/1",
        "Media": [
            {
                "bitrate": 50120,
                "videoResolution": "4k",
                "aspectRatio": "2.39",
                "optimizedForStreaming": 0,
                "Part": [
                    {
                        "file": "/media/Films 4K/Dune (2024)/Dune.2160p.mkv",
                        "size": 62_400_000_000,
                        "container": "mkv",
                        "duration": 9_960_000,
                        "Stream": [
                            {
                                "streamType": 1,
                                "codec": "hevc",
                                "profile": "main 10",
                                "width": 3840,
                                "height": 1606,
                                "frameRate": 23.976,
                                "bitDepth": 10,
                                "colorTrc": "smpte2084",
                                "chromaSubsampling": "4:2:0",
                                "bitrate": 45000,
                            },
                            {
                                "streamType": 2,
                                "codec": "eac3",
                                "language": "Français",
                                "channels": 6,
                                "audioChannelLayout": "5.1(side)",
                                "bitrate": 640,
                                "default": True,
                            },
                            {
                                "streamType": 2,
                                "codec": "truehd",
                                "language": "English",
                                "channels": 8,
                                "title": "Atmos",
                            },
                            {
                                "streamType": 3,
                                "codec": "srt",
                                "language": "Français",
                                "forced": "1",
                                "key": "/library/streams/9",
                            },
                            {"streamType": 3, "codec": "pgs", "language": "English", "hearingImpaired": True},
                        ],
                    }
                ],
            }
        ],
    }


def test_the_technical_sheet_details_the_file_and_every_track():
    sheet = parse_plex_technical(technical_metadata())

    assert sheet["file"]["path"] == "/media/Films 4K/Dune (2024)/Dune.2160p.mkv"
    assert sheet["file"]["bitrate_kbps"] == 50120
    assert sheet["video"]["dynamic_range"] == "HDR10"
    assert (sheet["video"]["width"], sheet["video"]["height"], sheet["video"]["bit_depth"]) == (3840, 1606, 10)
    assert [track["language"] for track in sheet["audio"]] == ["Français", "English"]
    assert sheet["audio"][0]["default"] is True and sheet["audio"][1]["title"] == "Atmos"
    assert sheet["subtitles"][0] == {
        "language": "Français",
        "codec": "srt",
        "title": None,
        "forced": True,
        "hearing_impaired": False,
        "external": True,
        "default": False,
    }
    assert sheet["subtitles"][1]["hearing_impaired"] is True


def test_dolby_vision_wins_over_the_transfer_function():
    metadata = technical_metadata()
    video = metadata["Media"][0]["Part"][0]["Stream"][0]
    video.update({"DOVIPresent": True, "DOVIProfile": 8})
    assert parse_plex_technical(metadata)["video"]["dynamic_range"] == "Dolby Vision 8"


@pytest.mark.asyncio
async def test_the_technical_sheet_links_the_library_media(monkeypatch):
    metadata_holder = technical_metadata()

    class _Response:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"MediaContainer": {"Metadata": [metadata_holder]}}

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, url, headers=None):
            assert url == "http://plex:32400/library/metadata/42"
            return _Response()

    monkeypatch.setattr("app.services.library_analytics.httpx.AsyncClient", lambda **kwargs: _Client())
    settings = SimpleNamespace(plex_url="http://plex:32400", plex_token="jeton", plex_verify_ssl=False)
    db = SimpleNamespace(
        execute=AsyncMock(
            return_value=SimpleNamespace(first=lambda: (12, "https://image.tmdb.org/t/p/original/dune.jpg"))
        )
    )

    sheet = await analytics_item_technical(settings, db, "42")

    assert sheet["library_item_id"] == 12
    assert sheet["poster_url"] == "/api/playback/thumb?path=%2Flibrary%2Fmetadata%2F42%2Fthumb%2F1"
    assert sheet["art_url"] == "/api/playback/thumb?path=%2Flibrary%2Fmetadata%2F42%2Fart%2F1"
    assert sheet["file"]["container"] == "mkv"

    # Sans fond Plex, le bandeau reprend celui de la bibliotheque.
    del metadata_holder["art"]
    sheet = await analytics_item_technical(settings, db, "42")
    assert sheet["art_url"].startswith("/api/image-proxy?url=https%3A%2F%2Fimage.tmdb.org")


def test_the_technical_endpoint_separates_an_unknown_file_from_an_unreachable_plex(monkeypatch):
    import httpx
    from fastapi.testclient import TestClient

    from app.database import get_db_async
    from app.dependencies import get_settings_or_404, require_admin
    from app.main import app

    async def fake_technical(settings, db, rating_key):
        if rating_key == "panne":
            raise httpx.ConnectError("Plex injoignable")
        return {"file": {"container": "mkv"}} if rating_key == "k1" else None

    monkeypatch.setattr("app.routers.library_analytics_api.analytics_item_technical", fake_technical)
    app.dependency_overrides[require_admin] = lambda: None
    app.dependency_overrides[get_settings_or_404] = lambda: SimpleNamespace()
    app.dependency_overrides[get_db_async] = lambda: None
    try:
        client = TestClient(app, raise_server_exceptions=False)
        assert client.get("/api/library-analytics/items/k1/technical").json()["file"]["container"] == "mkv"
        assert client.get("/api/library-analytics/items/absent/technical").status_code == 404
        assert client.get("/api/library-analytics/items/panne/technical").status_code == 502
    finally:
        for dependency in (require_admin, get_settings_or_404, get_db_async):
            app.dependency_overrides.pop(dependency, None)
