"""Régressions de pagination pour l'historique des téléchargements."""

from datetime import datetime, timedelta

import pytest

from app.models import DownloadHistory
from app.routers.downloads_api import downloads_history
from app.utils import now_utc_naive


@pytest.mark.asyncio
async def test_download_history_honors_limit_and_offset(async_db):
    now = now_utc_naive()
    for index in range(5):
        async_db.add(
            DownloadHistory(
                title=f"Média {index}",
                year=2026,
                media_type="movie",
                source="plex",
                instance_name=None,
                completed_at=now - timedelta(minutes=index),
            )
        )
    async_db.commit()

    first_page = await downloads_history(limit=2, offset=0, source="plex", db=async_db)
    second_page = await downloads_history(limit=2, offset=2, source="plex", db=async_db)

    assert [row["title"] for row in first_page["items"]] == ["Média 0", "Média 1"]
    assert [row["title"] for row in second_page["items"]] == ["Média 2", "Média 3"]
    assert {row["id"] for row in first_page["items"]}.isdisjoint(row["id"] for row in second_page["items"])


@pytest.mark.asyncio
async def test_arr_history_is_read_from_database_without_live_instance(async_db):
    async_db.add(DownloadHistory(
        title="Film archivé", year=2026, media_type="movie", source="radarr",
        instance_name="Radarr", arr_instance_id=2, arr_history_id=91,
        processing_mode="automatic", completed_at=datetime.now(),
    ))
    async_db.commit()

    response = await downloads_history(limit=100, offset=0, source="radarr", instance_id=2, db=async_db)

    assert [row["title"] for row in response["items"]] == ["Film archivé"]
    assert response["items"][0]["processing_mode"] == "automatic"
