from unittest.mock import AsyncMock, patch

import pytest

from app.models import ArrInstance, DownloadClient
from app.routers.arr_queue_api import arr_wanted_missing
from app.routers.downloads_api import download_client_queue


@pytest.mark.asyncio
async def test_wanted_missing_is_shared_and_filtered_after_cache(async_db):
    async_db.add_all([
        ArrInstance(id=1, name="Sonarr A", arr_type="sonarr", url="http://a", api_key="x", enabled=True),
        ArrInstance(id=2, name="Sonarr B", arr_type="sonarr", url="http://b", api_key="x", enabled=True),
    ])
    async_db.commit()

    async def wanted(instance):
        return [{"id": instance.id, "instance_id": instance.id, "poster_url": None}]

    with patch("app.services.arr_common.get_wanted_missing", new=AsyncMock(side_effect=wanted)) as fetch:
        first = await arr_wanted_missing("sonarr", 1, async_db)
        second = await arr_wanted_missing("sonarr", 2, async_db)

    assert [row["instance_id"] for row in first] == [1]
    assert [row["instance_id"] for row in second] == [2]
    assert fetch.await_count == 2  # deux instances, mais un seul calcul agrégé


@pytest.mark.asyncio
async def test_torrent_clients_are_not_requeried_inside_soft_ttl(async_db):
    async_db.add(DownloadClient(
        id=7, name="qBit", client_type="qbittorrent", url="http://qbit",
        username=None, password=None, enabled=True,
    ))
    async_db.commit()
    torrents = [{"hash": "abc", "name": "Film", "progress": .5, "state": "downloading"}]

    with patch("app.services.download_clients.list_client_torrents", new=AsyncMock(return_value=torrents)) as fetch:
        first = await download_client_queue(async_db)
        second = await download_client_queue(async_db)

    assert first == second
    assert first[0]["title"] == "Film"
    fetch.assert_awaited_once()
