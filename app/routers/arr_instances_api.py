"""CRUD des instances Sonarr/Radarr/Prowlarr/Bazarr/FileFlows et lecture de leur configuration (profils de qualite, dossiers racine, tags)."""

import asyncio
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db_async
from ..dependencies import require_admin
from ..models import ArrInstance, DownloadClient, PlexServer
from ..services import bazarr, fileflows, prowlarr, radarr, sonarr
from ..services import integration_configuration as configuration
from .arr_shared import (
    _arr_call,
    _arr_folders,
    invalidate_arr_queue_cache,
    invalidate_arr_wanted_cache,
)

router = APIRouter(prefix="/api", tags=["arr"], dependencies=[Depends(require_admin)])
logger = logging.getLogger(__name__)


class ArrInstanceCreate(BaseModel):
    name: str
    arr_type: str
    url: str
    # Vide à la modification : la clé en base est gardée (l'interface ne la relit plus).
    api_key: Optional[str] = None
    quality_profile_id: Optional[int] = None
    root_folder: Optional[str] = None
    minimum_availability: Optional[str] = "released"
    enabled: Optional[bool] = True
    is_default: Optional[bool] = False
    indexer_ids: Optional[str] = None
    # Serveur Plex vers lequel cette instance importe ; vide = serveur principal.
    plex_server_id: Optional[int] = None


class TestArrInstanceBody(BaseModel):
    url: str
    api_key: Optional[str] = None
    arr_type: str
    # Instance déjà enregistrée : sans clé saisie, on teste avec celle en base.
    id: Optional[int] = None


def public_instance(inst: ArrInstance) -> dict[str, Any]:
    """Une instance telle que l'interface la voit : jamais sa clé API, seulement s'il en a une.

    La liste renvoyait l'objet entier, clé déchiffrée comprise : elle partait dans le
    navigateur à chaque ouverture des réglages, des téléchargements ou de la recherche.
    """
    return {
        "id": inst.id,
        "name": inst.name,
        "arr_type": inst.arr_type,
        "url": inst.url,
        "has_api_key": bool(inst.api_key),
        "quality_profile_id": inst.quality_profile_id,
        "root_folder": inst.root_folder,
        "minimum_availability": inst.minimum_availability,
        "enabled": inst.enabled,
        "is_default": inst.is_default,
        "indexer_ids": inst.indexer_ids,
        "plex_server_id": inst.plex_server_id,
    }


# FileFlows n'a pas d'authentification par defaut : sa cle est facultative.
KEYLESS_TYPES = {"fileflows"}


@router.get("/arr-instances")
async def list_arr_instances(db: AsyncSession = Depends(get_db_async)):
    return [public_instance(inst) for inst in (await db.execute(select(ArrInstance))).scalars().all()]


@router.get("/arr/capabilities")
async def arr_capabilities(db: AsyncSession = Depends(get_db_async)):
    all_instances = (await db.execute(select(ArrInstance))).scalars().all()
    enabled_instances = [i for i in all_instances if i.enabled]
    configured_types = {i.arr_type for i in all_instances}
    enabled_types = {i.arr_type for i in enabled_instances}
    has_enabled_clients = (
        await db.execute(select(DownloadClient).filter(DownloadClient.enabled))
    ).scalars().first() is not None
    has_clients = (await db.execute(select(DownloadClient))).scalars().first() is not None
    return {
        "has_sonarr": "sonarr" in enabled_types,
        "has_radarr": "radarr" in enabled_types,
        "has_prowlarr": "prowlarr" in enabled_types,
        "has_bazarr": "bazarr" in enabled_types,
        "has_fileflows": "fileflows" in enabled_types,
        "sonarr_configured": "sonarr" in configured_types,
        "radarr_configured": "radarr" in configured_types,
        "prowlarr_configured": "prowlarr" in configured_types,
        "sonarr_disabled": "sonarr" in configured_types and "sonarr" not in enabled_types,
        "radarr_disabled": "radarr" in configured_types and "radarr" not in enabled_types,
        "prowlarr_disabled": "prowlarr" in configured_types and "prowlarr" not in enabled_types,
        "has_arr_downloads": bool({"sonarr", "radarr"} & enabled_types),
        "arr_downloads_disabled": bool({"sonarr", "radarr"} & configured_types)
        and not bool({"sonarr", "radarr"} & enabled_types),
        "has_download_clients": has_enabled_clients,
        "download_clients_configured": has_clients,
        "download_clients_disabled": has_clients and not has_enabled_clients,
    }


async def _instance_values(db: AsyncSession, data: ArrInstanceCreate) -> dict:
    """Valeurs a enregistrer ; le serveur principal se note NULL, comme ailleurs."""
    values = data.model_dump()
    if not values.get("api_key"):
        values.pop("api_key", None)
    if values.get("plex_server_id") is not None:
        server = (
            (await db.execute(select(PlexServer).filter(PlexServer.id == values["plex_server_id"]))).scalars().first()
        )
        if server is None:
            raise HTTPException(422, "Serveur Plex introuvable")
        if server.is_primary:
            values["plex_server_id"] = None
    return values


@router.post("/arr-instances")
async def create_arr_instance(data: ArrInstanceCreate, db: AsyncSession = Depends(get_db_async)):
    if not data.api_key and data.arr_type not in KEYLESS_TYPES:
        raise HTTPException(422, "Clé API requise")
    values = await _instance_values(db, data)
    values.setdefault("api_key", "")
    inst = await configuration.create_arr_instance(db, values)
    if inst.arr_type in {"sonarr", "radarr"}:
        await invalidate_arr_queue_cache()
        await invalidate_arr_wanted_cache(inst.arr_type)
    if inst.enabled and inst.arr_type in {"sonarr", "radarr"}:
        from ..services.arr_history import sync_instance_after_event

        asyncio.create_task(sync_instance_after_event(inst.id, inst.arr_type, delay=0))
    return public_instance(inst)


@router.put("/arr-instances/{instance_id}")
async def update_arr_instance(instance_id: int, data: ArrInstanceCreate, db: AsyncSession = Depends(get_db_async)):
    inst, affected_types = await configuration.update_arr_instance(db, instance_id, await _instance_values(db, data))
    if affected_types:
        await invalidate_arr_queue_cache()
        for arr_type in affected_types:
            await invalidate_arr_wanted_cache(arr_type)
    if inst.enabled and inst.arr_type in {"sonarr", "radarr"}:
        from ..services.arr_history import sync_instance_after_event

        asyncio.create_task(sync_instance_after_event(inst.id, inst.arr_type, delay=0))
    return public_instance(inst)


@router.delete("/arr-instances/{instance_id}")
async def delete_arr_instance(instance_id: int, db: AsyncSession = Depends(get_db_async)):
    arr_type = await configuration.delete_arr_instance(db, instance_id)
    if arr_type in {"sonarr", "radarr"}:
        await invalidate_arr_queue_cache()
        await invalidate_arr_wanted_cache(arr_type)
    return {"status": "deleted"}


@router.patch("/arr-instances/{instance_id}/toggle")
async def toggle_arr_instance(instance_id: int, db: AsyncSession = Depends(get_db_async)):
    inst = await configuration.toggle_arr_instance(db, instance_id)
    if inst.arr_type in {"sonarr", "radarr"}:
        await invalidate_arr_queue_cache()
        await invalidate_arr_wanted_cache(inst.arr_type)
    if inst.enabled and inst.arr_type in {"sonarr", "radarr"}:
        from ..services.arr_history import sync_instance_after_event

        asyncio.create_task(sync_instance_after_event(inst.id, inst.arr_type, delay=0))
    return {"id": inst.id, "enabled": inst.enabled}


@router.patch("/arr-instances/by-type/{arr_type}/toggle")
async def toggle_arr_instances_by_type(arr_type: str, db: AsyncSession = Depends(get_db_async)):
    """Active/désactive en un clic toutes les instances d'un type (carte de la vue Connexions)."""
    instances, new_state = await configuration.toggle_arr_instances_by_type(db, arr_type)
    if arr_type in {"sonarr", "radarr"}:
        await invalidate_arr_queue_cache()
        await invalidate_arr_wanted_cache(arr_type)
    if new_state:
        from ..services.arr_history import sync_instance_after_event

        for inst in instances:
            if inst.arr_type in {"sonarr", "radarr"}:
                asyncio.create_task(sync_instance_after_event(inst.id, inst.arr_type, delay=0))
    return {"arr_type": arr_type, "enabled": new_state, "count": len(instances)}


@router.post("/test/arr-instance")
async def test_arr_instance(body: TestArrInstanceBody, db: AsyncSession = Depends(get_db_async)):
    if not body.api_key and body.id is not None:
        stored = await db.get(ArrInstance, body.id)
        body.api_key = stored.api_key if stored else None
    if body.arr_type == "fileflows":
        ok, msg = await fileflows.check_connection(body.url, body.api_key)
        return {"success": ok, "message": msg}
    if not body.api_key:
        return {"success": False, "message": "Clé API manquante"}
    if body.arr_type == "prowlarr":
        ok = await prowlarr.check_connection(body.url, body.api_key)
        return {"success": ok, "message": "Prowlarr connecté" if ok else "Erreur de connexion Prowlarr"}
    elif body.arr_type == "sonarr":
        ok, msg = await sonarr.check_connection(body.url, body.api_key)
        return {"success": ok, "message": msg}
    elif body.arr_type == "radarr":
        ok, msg = await radarr.check_connection(body.url, body.api_key)
        return {"success": ok, "message": msg}
    elif body.arr_type == "bazarr":
        ok, msg = await bazarr.check_connection(body.url, body.api_key)
        return {"success": ok, "message": msg}
    return {"success": False, "message": f"Type d'instance inconnu : {body.arr_type}"}


@router.get("/sonarr/profiles")
async def sonarr_profiles(
    instance_id: Optional[int] = None,
    url: Optional[str] = None,
    api_key: Optional[str] = None,
    db: AsyncSession = Depends(get_db_async),
):
    return await _arr_call(url, api_key, instance_id, "sonarr", db, sonarr.get_quality_profiles)


@router.get("/sonarr/folders")
async def sonarr_folders(
    instance_id: Optional[int] = None,
    url: Optional[str] = None,
    api_key: Optional[str] = None,
    db: AsyncSession = Depends(get_db_async),
):
    return await _arr_folders(url, api_key, instance_id, "sonarr", db, sonarr.get_root_folders)


@router.get("/radarr/profiles")
async def radarr_profiles(
    instance_id: Optional[int] = None,
    url: Optional[str] = None,
    api_key: Optional[str] = None,
    db: AsyncSession = Depends(get_db_async),
):
    return await _arr_call(url, api_key, instance_id, "radarr", db, radarr.get_quality_profiles)


@router.get("/radarr/folders")
async def radarr_folders(
    instance_id: Optional[int] = None,
    url: Optional[str] = None,
    api_key: Optional[str] = None,
    db: AsyncSession = Depends(get_db_async),
):
    return await _arr_folders(url, api_key, instance_id, "radarr", db, radarr.get_root_folders)


@router.get("/sonarr/tags")
async def sonarr_tags(
    instance_id: Optional[int] = None,
    url: Optional[str] = None,
    api_key: Optional[str] = None,
    db: AsyncSession = Depends(get_db_async),
):
    return await _arr_call(url, api_key, instance_id, "sonarr", db, sonarr.get_tags)


@router.get("/radarr/tags")
async def radarr_tags(
    instance_id: Optional[int] = None,
    url: Optional[str] = None,
    api_key: Optional[str] = None,
    db: AsyncSession = Depends(get_db_async),
):
    return await _arr_call(url, api_key, instance_id, "radarr", db, radarr.get_tags)
