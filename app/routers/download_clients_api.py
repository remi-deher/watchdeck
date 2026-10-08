"""CRUD des clients de telechargement direct (qBittorrent, Transmission, Deluge)."""

import logging
from typing import Any, Optional

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
    # Client déjà enregistré : sans mot de passe saisi, on teste avec celui en base.
    id: Optional[int] = None


def public_client(client: DownloadClient) -> dict[str, Any]:
    """Un client tel que l'interface le voit : jamais son mot de passe, seulement s'il en a un.

    La liste renvoyait l'objet entier, mot de passe déchiffré compris : il partait dans le
    navigateur à chaque ouverture des réglages et de la file de téléchargements.
    """
    return {
        "id": client.id,
        "name": client.name,
        "client_type": client.client_type,
        "url": client.url,
        "username": client.username,
        "has_password": bool(client.password),
        "category": client.category,
        "tags": client.tags,
        "is_default": client.is_default,
        "enabled": client.enabled,
    }


def _without_empty_password(data: DownloadClientCreate) -> dict[str, Any]:
    """Un mot de passe vide à l'enregistrement garde celui en base (le formulaire ne le relit plus)."""
    values = data.model_dump()
    if not values.get("password"):
        values.pop("password", None)
    return values


@router.get("/download-clients")
async def list_download_clients(db: AsyncSession = Depends(get_db_async)):
    return [public_client(client) for client in (await db.execute(select(DownloadClient))).scalars().all()]


@router.post("/download-clients")
async def create_download_client(data: DownloadClientCreate, db: AsyncSession = Depends(get_db_async)):
    client = await configuration.create_download_client(db, data.model_dump())
    await invalidate_download_clients_cache()
    await invalidate_direct_downloads_cache()
    return public_client(client)


@router.put("/download-clients/{client_id}")
async def update_download_client(client_id: int, data: DownloadClientCreate, db: AsyncSession = Depends(get_db_async)):
    client = await configuration.update_download_client(db, client_id, _without_empty_password(data))
    await invalidate_download_clients_cache()
    await invalidate_direct_downloads_cache()
    return public_client(client)


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
async def test_download_client(body: TestDownloadClientBody, db: AsyncSession = Depends(get_db_async)):
    password = body.password
    if not password and body.id is not None:
        stored = await db.get(DownloadClient, body.id)
        password = stored.password if stored else None
    ok, msg = await check_client_connection(body.client_type, body.url, body.username, password)
    return {"success": ok, "message": msg}
