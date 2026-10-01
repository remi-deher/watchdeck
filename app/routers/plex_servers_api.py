"""CRUD des serveurs Plex suivis.

Le serveur principal se configure toujours dans Réglages > Connexions > Plex (URL,
jeton, bibliothèques VF) : ici on ne peut que le renommer. Les serveurs
supplémentaires portent leur propre URL, jeton et bibliothèques, et alimentent
l'inventaire de la Bibliothèque (voir services/plex_sync.py).
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db_async
from ..dependencies import require_admin
from ..models import LibraryItemLocation, PlexServer, Settings
from ..services import plex_servers
from ..services.plex_api import check_connection, fetch_identity

router = APIRouter(prefix="/api", tags=["plex"], dependencies=[Depends(require_admin)])

_MASK = "••••••••"


class PlexServerBody(BaseModel):
    name: str
    url: Optional[str] = None
    token: Optional[str] = None
    libraries: Optional[str] = None
    enabled: Optional[bool] = True


class PlexServerTestBody(BaseModel):
    id: Optional[int] = None
    url: Optional[str] = None
    token: Optional[str] = None


def _clean_libraries(raw: Optional[str]) -> Optional[str]:
    """Normalise le JSON des bibliothèques ; vide = mêmes noms que le serveur principal."""
    if raw is None or not raw.strip():
        return None
    try:
        json.loads(raw)
    except ValueError as exc:
        raise HTTPException(422, "Bibliothèques : JSON invalide") from exc
    libs = plex_servers.parse_libraries(raw)
    return json.dumps(libs, ensure_ascii=False) if libs else None


def _serialize(server: PlexServer, settings: Optional[Settings], locations: int) -> dict:
    url = (settings.plex_url if settings else None) if server.is_primary else server.url
    token = (settings.plex_token if settings else None) if server.is_primary else server.token
    return {
        "id": server.id,
        "name": server.name,
        "is_primary": server.is_primary,
        "url": url,
        "token": _MASK if token else "",
        "token_configured": bool(token),
        "libraries": server.libraries or "",
        "machine_identifier": server.machine_identifier,
        "enabled": server.enabled,
        "location_count": locations,
    }


async def _location_counts(db: AsyncSession) -> dict[int, int]:
    rows = (
        await db.execute(
            select(LibraryItemLocation.server_id, func.count(LibraryItemLocation.id)).group_by(
                LibraryItemLocation.server_id
            )
        )
    ).all()
    return {server_id: count for server_id, count in rows}


async def _get_server(db: AsyncSession, server_id: int) -> PlexServer:
    server = (await db.execute(select(PlexServer).filter(PlexServer.id == server_id))).scalars().first()
    if server is None:
        raise HTTPException(404, "Serveur Plex introuvable")
    return server


@router.get("/plex-servers")
async def list_plex_servers(db: AsyncSession = Depends(get_db_async)):
    servers = await plex_servers.list_servers(db)
    await db.commit()
    settings = (await db.execute(select(Settings))).scalars().first()
    counts = await _location_counts(db)
    return [_serialize(s, settings, counts.get(s.id, 0)) for s in servers]


@router.get("/plex-servers/{server_id}")
async def get_plex_server(server_id: int, db: AsyncSession = Depends(get_db_async)):
    server = await _get_server(db, server_id)
    settings = (await db.execute(select(Settings))).scalars().first()
    counts = await _location_counts(db)
    return _serialize(server, settings, counts.get(server.id, 0))


@router.post("/plex-servers")
async def create_plex_server(body: PlexServerBody, db: AsyncSession = Depends(get_db_async)):
    name = body.name.strip()
    url = (body.url or "").strip().rstrip("/")
    token = (body.token or "").strip()
    if not name or not url or not token or token == _MASK:
        raise HTTPException(422, "Nom, URL et jeton sont requis")
    await plex_servers.ensure_primary_server(db)
    server = PlexServer(
        name=name,
        is_primary=False,
        url=url,
        token=token,
        libraries=_clean_libraries(body.libraries),
        enabled=body.enabled if body.enabled is not None else True,
        machine_identifier=await fetch_identity(url, token),
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return _serialize(server, None, 0)


@router.put("/plex-servers/{server_id}")
async def update_plex_server(server_id: int, body: PlexServerBody, db: AsyncSession = Depends(get_db_async)):
    server = await _get_server(db, server_id)
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Le nom est requis")
    server.name = name
    if not server.is_primary:
        url = (body.url or "").strip().rstrip("/")
        if not url:
            raise HTTPException(422, "L'URL est requise")
        token = (body.token or "").strip()
        connection_changed = url != server.url or (token and token != _MASK)
        server.url = url
        if token and token != _MASK:
            server.token = token
        server.libraries = _clean_libraries(body.libraries)
        if body.enabled is not None:
            server.enabled = body.enabled
        if connection_changed or not server.machine_identifier:
            server.machine_identifier = (
                await fetch_identity(server.url, server.token or "") or server.machine_identifier
            )
    await db.commit()
    settings = (await db.execute(select(Settings))).scalars().first()
    counts = await _location_counts(db)
    return _serialize(server, settings, counts.get(server.id, 0))


@router.patch("/plex-servers/{server_id}/toggle")
async def toggle_plex_server(server_id: int, db: AsyncSession = Depends(get_db_async)):
    server = await _get_server(db, server_id)
    if server.is_primary:
        raise HTTPException(400, "Le serveur principal se configure dans la carte Plex")
    server.enabled = not server.enabled
    await db.commit()
    return {"id": server.id, "enabled": server.enabled}


@router.delete("/plex-servers/{server_id}")
async def delete_plex_server(server_id: int, db: AsyncSession = Depends(get_db_async)):
    server = await _get_server(db, server_id)
    if server.is_primary:
        raise HTTPException(400, "Le serveur principal ne peut pas être supprimé")
    await db.delete(server)
    await db.commit()
    return {"status": "deleted"}


@router.post("/test/plex-server")
async def test_plex_server(body: PlexServerTestBody, db: AsyncSession = Depends(get_db_async)):
    """Teste une connexion : celle saisie dans le formulaire, sinon celle enregistrée."""
    url = (body.url or "").strip()
    token = (body.token or "").strip()
    if body.id is not None and (not url or not token or token == _MASK):
        server = await _get_server(db, body.id)
        if server.is_primary:
            settings = (await db.execute(select(Settings))).scalars().first()
            url = url or (settings.plex_url if settings else "") or ""
            stored = settings.plex_token if settings else ""
        else:
            url = url or server.url or ""
            stored = server.token
        if not token or token == _MASK:
            token = stored or ""
    if token == _MASK:
        token = ""
    ok, msg = await check_connection(url, token)
    return {"success": ok, "message": msg}
