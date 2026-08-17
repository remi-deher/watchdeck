from unittest.mock import AsyncMock, MagicMock

import pytest

from app.errors import ResourceNotFoundError
from app.models import ArrInstance, DownloadClient
from app.services import integration_configuration as configuration


@pytest.mark.asyncio
async def test_arr_configuration_owns_create_update_and_delete_transactions(async_db):
    first = await configuration.create_arr_instance(
        async_db,
        {"name": "Sonarr", "arr_type": "sonarr", "url": "http://one", "api_key": "key", "is_default": True},
    )
    second = await configuration.create_arr_instance(
        async_db,
        {"name": "Sonarr 4K", "arr_type": "sonarr", "url": "http://two", "api_key": "key", "is_default": True},
    )
    async_db.sync_session.expire_all()
    assert async_db.query(ArrInstance).filter(ArrInstance.id == first.id).one().is_default is False
    assert second.is_default is True

    updated, affected = await configuration.update_arr_instance(
        async_db,
        second.id,
        {"name": "Radarr", "arr_type": "radarr", "url": "http://two", "api_key": "key", "is_default": True},
    )
    assert updated.arr_type == "radarr"
    assert affected == {"sonarr", "radarr"}

    assert await configuration.delete_arr_instance(async_db, updated.id) == "radarr"
    assert async_db.query(ArrInstance).filter(ArrInstance.id == updated.id).first() is None


@pytest.mark.asyncio
async def test_download_client_configuration_keeps_a_single_default(async_db):
    first = await configuration.create_download_client(
        async_db,
        {"name": "qBit", "client_type": "qbittorrent", "url": "http://one", "is_default": True},
    )
    second = await configuration.create_download_client(
        async_db,
        {"name": "Transmission", "client_type": "transmission", "url": "http://two", "is_default": True},
    )
    async_db.sync_session.expire_all()
    assert async_db.query(DownloadClient).filter(DownloadClient.id == first.id).one().is_default is False
    assert second.is_default is True

    toggled = await configuration.toggle_download_client(async_db, second.id)
    assert toggled.enabled is False


@pytest.mark.asyncio
async def test_configuration_rolls_back_failed_commits():
    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock(side_effect=RuntimeError("database unavailable"))
    db.rollback = AsyncMock()
    db.refresh = AsyncMock()

    with pytest.raises(RuntimeError, match="database unavailable"):
        await configuration.create_download_client(
            db,
            {"name": "qBit", "client_type": "qbittorrent", "url": "http://one"},
        )

    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_missing_configuration_resource_stays_a_domain_error(async_db):
    with pytest.raises(ResourceNotFoundError, match="Client introuvable"):
        await configuration.delete_download_client(async_db, 999)
