from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models import ArrInstance, DownloadHistory
from app.services.arr_history import normalize_arr_import, sync_instance_history


def instance(arr_type="radarr"):
    return SimpleNamespace(id=2, name=arr_type.title(), arr_type=arr_type)


def test_automatic_radarr_import_keeps_instance_and_movie():
    item = normalize_arr_import(
        {
            "id": 91,
            "eventType": "downloadFolderImported",
            "date": "2026-08-10T10:00:00Z",
            "downloadId": "ABC123",
            "movie": {"title": "Le Film", "year": 2026},
        },
        instance(),
        "radarr",
    )

    assert item["title"] == "Le Film"
    assert item["instance_id"] == 2
    assert item["processing_mode"] == "automatic"


def test_manual_sonarr_import_has_explicit_badge_mode():
    item = normalize_arr_import(
        {
            "id": 92,
            "eventType": "downloadFolderImported",
            "date": "2026-08-10T10:00:00Z",
            "series": {"title": "La Série", "year": 2025},
            "episode": {"seasonNumber": 2, "episodeNumber": 4, "title": "Retour"},
        },
        instance("sonarr"),
        "sonarr",
    )

    assert item["title"] == "La Série · S02E04 · Retour"
    assert item["processing_mode"] == "manual"


def test_non_import_history_event_is_ignored():
    assert normalize_arr_import({"id": 93, "eventType": "grabbed"}, instance(), "radarr") is None


@pytest.mark.asyncio
async def test_instance_history_import_is_idempotent(async_db, monkeypatch):
    arr = ArrInstance(id=2, name="Radarr", arr_type="radarr", url="http://radarr", api_key="key", enabled=True)
    async_db.add(arr)
    async_db.commit()
    item = {
        "arr_history_id": 91,
        "title": "Le Film",
        "year": 2026,
        "media_type": "movie",
        "completed_at": "2026-08-10T10:00:00Z",
        "processing_mode": "manual",
        "poster_url": "https://images.example/film.jpg",
    }
    fetch = AsyncMock(return_value=[item])
    monkeypatch.setattr("app.services.arr_history.fetch_all_instance_history", fetch)

    first = await sync_instance_history(async_db, arr)
    second = await sync_instance_history(async_db, arr)

    assert first == {"instance_id": 2, "found": 1, "imported": 1, "updated": 0, "existing": 0}
    assert second == {"instance_id": 2, "found": 1, "imported": 0, "updated": 0, "existing": 1}
    rows = async_db.query(DownloadHistory).all()
    assert len(rows) == 1
    assert rows[0].processing_mode == "manual"
    assert rows[0].poster_url == "https://images.example/film.jpg"


@pytest.mark.asyncio
async def test_instance_history_sync_backfills_missing_poster(async_db, monkeypatch):
    arr = ArrInstance(id=2, name="Radarr", arr_type="radarr", url="http://radarr", api_key="key", enabled=True)
    async_db.add(arr)
    async_db.commit()
    base = {
        "arr_history_id": 91,
        "title": "Le Film",
        "year": 2026,
        "media_type": "movie",
        "completed_at": "2026-08-10T10:00:00Z",
        "processing_mode": "manual",
    }
    fetch = AsyncMock(
        side_effect=[
            [base],
            [{**base, "poster_url": "https://images.example/film.jpg"}],
        ]
    )
    monkeypatch.setattr("app.services.arr_history.fetch_all_instance_history", fetch)

    await sync_instance_history(async_db, arr)
    second = await sync_instance_history(async_db, arr)

    row = async_db.query(DownloadHistory).one()
    assert second["updated"] == 1
    assert row.poster_url == "https://images.example/film.jpg"
