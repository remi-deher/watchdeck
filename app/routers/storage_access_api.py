"""Admin configuration for rsync execution methods. Credentials never returned."""

import json
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select

from ..database import get_db_async
from ..dependencies import require_admin
from ..models import StorageAccess, StorageTransfer, StorageTransferItem
from ..storage.access import access_json, validate_access
from ..storage.local_mounts import media_path
from ..storage.planning import absolute_path

router = APIRouter(prefix="/api/storage/accesses", tags=["storage"], dependencies=[Depends(require_admin)])


class AccessRoot(BaseModel):
    arr_instance_id: int = Field(gt=0)
    arr_root: str
    path: str


class ConnectionBody(BaseModel):
    host: str = Field(default="", max_length=255)
    port: int = Field(default=22, ge=1, le=65535)
    user: str = Field(default="", max_length=100)
    fingerprint: str = Field(default="", max_length=100)
    auth: Literal["key", "password"] = "key"
    auth_fallback: bool = False
    browse_root: str = Field(default="/storage", max_length=4096)


class AccessBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    method: Literal["ssh", "local"]
    connection: ConnectionBody = Field(default_factory=ConnectionBody)
    private_key: str = Field(default="", max_length=32768)
    password: str = Field(default="", max_length=1024)
    passphrase: str = Field(default="", max_length=1024)
    roots: list[AccessRoot] = Field(min_length=1, max_length=100)


@router.get("")
async def list_accesses(db=Depends(get_db_async)):
    return [access_json(a) for a in (await db.execute(select(StorageAccess).order_by(StorageAccess.id))).scalars()]


async def save_access(body, db, access=None):
    if access:
        active = (
            await db.execute(
                select(StorageTransfer.id).where(
                    or_(
                        StorageTransfer.params["access_id"].as_integer() == access.id,
                        select(StorageTransferItem.id)
                        .where(
                            StorageTransferItem.transfer_id == StorageTransfer.id,
                            StorageTransferItem.claimed.is_(True),
                            StorageTransferItem.snapshot["source_access_id"].as_integer() == access.id,
                        )
                        .exists(),
                    ),
                    StorageTransfer.status.notin_(["completed", "draft", "cancelled"]),
                )
            )
        ).first()
        if active:
            raise HTTPException(409, "Accès utilisé par une tâche non terminée.")
    seen = set()
    for root in body.roots:
        try:
            root.arr_root = absolute_path(root.arr_root)
            root.path = absolute_path(root.path)
            if body.method == "local":
                root.path = media_path(root.path)
            key = (root.arr_instance_id, root.arr_root)
            if key in seen:
                raise ValueError("Racine déclarée plusieurs fois.")
            seen.add(key)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    if body.method == "ssh" and (
        not body.connection.host or not body.connection.user or not body.connection.fingerprint.startswith("SHA256:")
    ):
        raise HTTPException(422, "Hôte, utilisateur et empreinte SHA256 du serveur requis.")
    access = access or StorageAccess()
    credentials = json.loads(access.credentials or "{}")
    for key in ("private_key", "password", "passphrase"):
        value = getattr(body, key)
        if value:
            credentials[key] = value
    access.name, access.method = body.name.strip(), body.method
    access.connection = body.connection.model_dump() if body.method == "ssh" else {}
    access.credentials = json.dumps(credentials) if body.method == "ssh" else None
    access.roots = [root.model_dump() for root in body.roots]
    access.revision = uuid.uuid4().hex
    access.validation = {}
    db.add(access)
    await db.commit()
    await db.refresh(access)
    return access_json(access)


@router.post("")
async def create_access(body: AccessBody, db=Depends(get_db_async)):
    return await save_access(body, db)


@router.put("/{access_id}")
async def update_access(access_id: int, body: AccessBody, db=Depends(get_db_async)):
    access = await db.get(StorageAccess, access_id)
    if not access:
        raise HTTPException(404, "Accès inconnu.")
    return await save_access(body, db, access)


@router.post("/{access_id}/validate")
async def test_access(access_id: int, db=Depends(get_db_async)):
    access = await db.get(StorageAccess, access_id)
    if not access:
        raise HTTPException(404, "Accès inconnu.")
    access.validation = {}
    try:
        result = await validate_access(db, access)
        await db.commit()
        return result
    except Exception as exc:
        await db.commit()
        raise HTTPException(
            422,
            "Validation impossible : vérifiez SSH, rsync, les chemins, leurs permissions et l’association Arr/Plex.",
        ) from exc
