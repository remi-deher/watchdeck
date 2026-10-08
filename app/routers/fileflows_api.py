"""Supervision de FileFlows : état, fichiers, journaux, relance, pause, lien avec les médias.

Réservé aux administrateurs : relancer un fichier ou mettre FileFlows en pause agit sur
le serveur de traitement. L'état est gardé quelques secondes en cache : l'accueil, la
page Encodage et plusieurs onglets ouverts ne multiplient pas les appels à FileFlows,
dont l'interface ralentit déjà sous la charge.
"""

import asyncio
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..cache import cache
from ..database import get_db_async
from ..dependencies import require_admin
from ..models import ArrInstance, LibraryItem
from ..realtime import publish
from ..services import fileflows

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fileflows", tags=["fileflows"], dependencies=[Depends(require_admin)])

STATUS_CACHE_KEY = "watchdeck:fileflows:status:{instance_id}"
STATUS_CACHE_TTL = 8
RECENT_LIMIT = 5


class ReprocessBody(BaseModel):
    uids: list[str] = Field(min_length=1, max_length=fileflows.MAX_REPROCESS)


class PauseBody(BaseModel):
    # 0 = reprendre.
    minutes: int = Field(ge=0, le=fileflows.PAUSE_MAX_MINUTES)


async def _instance(db: AsyncSession) -> ArrInstance:
    inst = await fileflows.get_instance(db)
    if inst is None:
        raise HTTPException(404, "FileFlows n'est pas configuré (Administration → Connexions → Médias)")
    return inst


async def _guard(call):
    """Erreurs FileFlows -> 502 lisible ; erreurs de saisie -> 422."""
    try:
        return await call
    except fileflows.FileFlowsError as exc:
        raise HTTPException(502, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


async def _invalidate(inst: ArrInstance) -> None:
    try:
        await cache.delete(STATUS_CACHE_KEY.format(instance_id=inst.id))
    except Exception:  # noqa: BLE001 -- le cache expire de lui-même en quelques secondes
        logger.debug("Cache FileFlows non vidé", exc_info=True)


def _with_media(rows: list[dict[str, Any]], index: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**row, "media": fileflows.match_media(index, row["name"])} for row in rows]


@router.get("/status")
async def fileflows_status(refresh: bool = False, db: AsyncSession = Depends(get_db_async)):
    """État global, plus les derniers échecs et traitements : de quoi remplir l'accueil."""
    inst = await fileflows.get_instance(db)
    if inst is None:
        return {"configured": False}
    key = STATUS_CACHE_KEY.format(instance_id=inst.id)
    if not refresh:
        cached = await cache.get_json(key)
        if cached:
            return cached
    base = {"configured": True, "instance": {"id": inst.id, "name": inst.name, "url": inst.url}}
    try:
        state, failed, processed = await asyncio.gather(
            fileflows.dashboard(inst.url, inst.api_key),
            fileflows.list_files(inst.url, inst.api_key, fileflows.STATUS_FAILED),
            fileflows.list_files(inst.url, inst.api_key, fileflows.STATUS_PROCESSED),
        )
    except fileflows.FileFlowsError as exc:
        return {**base, "connected": False, "error": str(exc)}
    index = await fileflows.folder_index(db)
    payload = {
        **base,
        "connected": True,
        **state,
        "runners": [{**r, "media": fileflows.match_media(index, r["name"])} for r in state["runners"]],
        "recent_failed": _with_media(failed[:RECENT_LIMIT], index),
        "recent_processed": _with_media(processed[:RECENT_LIMIT], index),
    }
    try:
        await cache.set_json(key, payload, ttl_seconds=STATUS_CACHE_TTL)
    except Exception:  # noqa: BLE001
        logger.debug("Cache FileFlows indisponible", exc_info=True)
    return payload


@router.get("/files")
async def fileflows_files(
    status: int = fileflows.STATUS_QUEUED,
    page: int = Query(0, ge=0, le=10_000),
    search: str = Query("", max_length=300),
    db: AsyncSession = Depends(get_db_async),
):
    if status not in fileflows.LISTABLE_STATUSES:
        raise HTTPException(422, "Statut inconnu")
    inst = await _instance(db)
    rows, state = await asyncio.gather(
        _guard(fileflows.list_files(inst.url, inst.api_key, status, page=page, search=search)),
        _guard(fileflows.dashboard(inst.url, inst.api_key)),
    )
    index = await fileflows.folder_index(db)
    return {"files": _with_media(rows, index), "page": page, "has_more": len(rows) >= state["page_size"]}


@router.get("/files/{uid}/log")
async def fileflows_file_log(uid: str, db: AsyncSession = Depends(get_db_async)):
    inst = await _instance(db)
    return {"text": await _guard(fileflows.file_log(inst.url, inst.api_key, uid))}


@router.post("/reprocess")
async def fileflows_reprocess(body: ReprocessBody, db: AsyncSession = Depends(get_db_async)):
    inst = await _instance(db)
    result = await _guard(fileflows.reprocess(inst.url, inst.api_key, body.uids))
    await _invalidate(inst)
    await publish("fileflows.updated", {"queued": result["queued"]}, admin_only=True)
    return result


@router.post("/pause")
async def fileflows_pause(body: PauseBody, db: AsyncSession = Depends(get_db_async)):
    inst = await _instance(db)
    await _guard(fileflows.set_paused(inst.url, inst.api_key, body.minutes))
    await _invalidate(inst)
    await publish("fileflows.updated", {"paused": body.minutes > 0}, admin_only=True)
    return {"paused": body.minutes > 0}


async def _media_files(db: AsyncSession, item_id: int) -> tuple[ArrInstance, Optional[str], list[dict[str, Any]]]:
    item = await db.get(LibraryItem, item_id)
    if item is None:
        raise HTTPException(404, "Média introuvable")
    inst = await _instance(db)
    folder = await fileflows.media_folder(db, item)
    if not folder:
        return inst, None, []
    files = await _guard(fileflows.files_for_item(inst.url, inst.api_key, folder))
    return inst, folder, files


@router.get("/media/{item_id}")
async def fileflows_media(item_id: int, db: AsyncSession = Depends(get_db_async)):
    """Traitements FileFlows des fichiers d'un média de la bibliothèque."""
    if await fileflows.get_instance(db) is None:
        return {"configured": False, "files": []}
    _, folder, files = await _media_files(db, item_id)
    return {"configured": True, "folder": folder, "files": files}


@router.post("/media/{item_id}/reprocess")
async def fileflows_media_reprocess(
    item_id: int, body: Optional[ReprocessBody] = None, db: AsyncSession = Depends(get_db_async)
):
    """Relance les fichiers du média : ceux choisis, sinon tous ceux que FileFlows connaît."""
    inst, _, files = await _media_files(db, item_id)
    known = {row["uid"] for row in files}
    uids = [uid for uid in body.uids if uid in known] if body else list(known)
    if not uids:
        raise HTTPException(404, "FileFlows ne connaît aucun fichier de ce média")
    result = await _guard(fileflows.reprocess(inst.url, inst.api_key, uids[: fileflows.MAX_REPROCESS]))
    await _invalidate(inst)
    await publish("fileflows.updated", {"queued": result["queued"], "media_ids": [item_id]}, admin_only=True)
    return result
