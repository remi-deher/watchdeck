"""CRUD des clients de telechargement direct (qBittorrent, Transmission, Deluge)."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db_async
from ..dependencies import require_admin
from ..models import DownloadClient
from ..services import integration_configuration as configuration
from ..services.download_clients import (
    check_client_connection,
)
from .arr_shared import invalidate_direct_downloads_cache, invalidate_download_clients_cache

router = APIRouter(prefix="/api", tags=["arr"], dependencies=[Depends(require_admin)])
logger = logging.getLogger(__name__)


class DownloadClientCreate(BaseModel):
    name: str
    client_type: str
    url: str
    username: Optional[str] = None
    password: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    is_default: Optional[bool] = False
    enabled: Optional[bool] = True


class TestDownloadClientBody(BaseModel):
    client_type: str
    url: str
    username: Optional[str] = None
    password: Optional[str] = None


@router.get("/download-clients")
async def list_download_clients(db: AsyncSession = Depends(get_db_async)):
    return (await db.execute(select(DownloadClient))).scalars().all()


@router.post("/download-clients")
async def create_download_client(data: DownloadClientCreate, db: AsyncSession = Depends(get_db_async)):
    client = await configuration.create_download_client(db, data.model_dump())
    await invalidate_download_clients_cache()
    await invalidate_direct_downloads_cache()
    return client


@router.put("/download-clients/{client_id}")
async def update_download_client(client_id: int, data: DownloadClientCreate, db: AsyncSession = Depends(get_db_async)):
    client = await configuration.update_download_client(db, client_id, data.model_dump())
    await invalidate_download_clients_cache()
    await invalidate_direct_downloads_cache()
    return client


@router.patch("/download-clients/{client_id}/toggle")
async def toggle_download_client(client_id: int, db: AsyncSession = Depends(get_db_async)):
    client = await configuration.toggle_download_client(db, client_id)
    await invalidate_download_clients_cache()
    await invalidate_direct_downloads_cache()
    return {"id": client.id, "enabled": client.enabled}


@router.delete("/download-clients/{client_id}")
async def delete_download_client(client_id: int, db: AsyncSession = Depends(get_db_async)):
    await configuration.delete_download_client(db, client_id)
    await invalidate_download_clients_cache()
    await invalidate_direct_downloads_cache()
    return {"status": "deleted"}


@router.post("/test/download-client")
async def test_download_client(body: TestDownloadClientBody):
    ok, msg = await check_client_connection(body.client_type, body.url, body.username, body.password)
    return {"success": ok, "message": msg}
