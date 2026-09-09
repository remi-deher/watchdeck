import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models import LibraryAnalyticsSnapshot
from app.services.library_analytics import (
    analytics_items_payload,
    analytics_payload,
    analytics_summary_payload,
    apply_filters,
    fetch_plex_catalog,
    parse_plex_item,
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
