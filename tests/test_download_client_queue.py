"""Projection de la file des clients torrent."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.models import DownloadClient
from app.routers import downloads_api


@pytest.mark.asyncio
async def test_queue_exposes_downloaded_and_uploaded_amounts(async_db):
    async_db.add(DownloadClient(name="Truenas", client_type="qbittorrent", url="http://qb", enabled=True))
    await async_db.commit()
    client = (await async_db.execute(select(DownloadClient))).scalars().first()
    downloads_api._torrent_client_cache.pop(client.id, None)
    torrent = {
        "hash": "ABC",
        "name": "Film",
        "state": "uploading",
        "progress": 1,
        "size": 4096,
        "ratio": 0.5,
        "downloaded": 4096,
        "uploaded": 2048,
    }

    with patch("app.services.download_clients.list_client_torrents", new=AsyncMock(return_value=[torrent])):
        rows = await downloads_api._compute_download_client_queue(async_db)

    assert rows[0]["hash"] == "abc"
    assert rows[0]["downloaded"] == 4096
    assert rows[0]["uploaded"] == 2048
    assert rows[0]["ratio"] == 0.5
