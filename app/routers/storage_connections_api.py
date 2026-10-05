"""Admin connection profiles and root bindings, separate from credentials."""

import asyncio
import json
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, text

from ..database import get_db_async
from ..dependencies import require_admin
from ..models import StorageAccess, StorageConnection, StorageTransfer, StorageTransferItem
from ..storage import connections
from ..storage.local_mounts import media_path
from ..storage.planning import absolute_path
from .storage_access_api import ConnectionBody

router = APIRouter(prefix="/api/storage", tags=["storage"], dependencies=[Depends(require_admin)])


class ProfileBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    method: Literal["ssh", "local"] = "ssh"
    connection: ConnectionBody = Field(default_factory=ConnectionBody)
    private_key: str = Field(default="", max_length=32768)
    password: str = Field(default="", max_length=1024)
    passphrase: str = Field(default="", max_length=1024)


async def get_connection(db, connection_id):
    conn = await db.get(StorageConnection, connection_id)
    if not conn:
        raise HTTPException(404, "Connexion inconnue.")
    return conn


async def assert_editable(db, accesses):
    for access in accesses:
        active = (
            await db.execute(
                select(StorageTransfer.id).where(
                    or_(
                        StorageTransfer.params["access_id"].as_integer() == access.id,
                        select(StorageTransferItem.id)
                        .where(
                            StorageTransferItem.transfer_id == StorageTransfer.id,
                            StorageTransferItem.snapshot["source_access_id"].as_integer() == access.id,
                        )
                        .exists(),
                    ),
                    StorageTransfer.status.notin_(["completed", "draft", "stopped"]),
                )
            )
        ).first()
        if active:
            raise HTTPException(409, "Connexion ou chemin utilisé par une tâche non terminée.")


@router.get("/connections")
async def list_connections(db=Depends(get_db_async)):
    return [
        connections.connection_json(c)
        for c in (await db.execute(select(StorageConnection).order_by(StorageConnection.id))).scalars()
    ]


async def save_profile(body, db, conn=None):
    await db.execute(text("SELECT pg_advisory_xact_lock(190041, 2)"))
    accesses = []
    if conn:
        accesses = (
            (await db.execute(select(StorageAccess).where(StorageAccess.connection_id == conn.id))).scalars().all()
        )
        await assert_editable(db, accesses)
    if body.method == "ssh" and (not body.connection.host.strip() or not body.connection.user.strip()):
        raise HTTPException(422, "Serveur et utilisateur requis.")
    conn = conn or StorageConnection(fingerprint="", tested=False)
    try:
        props = (
            body.connection.model_dump(exclude={"fingerprint", "browse_root"})
            if body.method == "ssh"
            else {"browse_root": "/" if body.connection.browse_root == "/" else media_path(body.connection.browse_root)}
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if conn.method != body.method or any((conn.connection or {}).get(k) != props.get(k) for k in ("host", "port")):
        conn.fingerprint = ""
    credentials = json.loads(conn.credentials or "{}")
    for key in ("private_key", "password", "passphrase"):
        if getattr(body, key):
            credentials[key] = getattr(body, key)
    conn.name, conn.method, conn.connection = body.name.strip(), body.method, props
    conn.credentials = json.dumps(credentials) if body.method == "ssh" else None
    conn.revision, conn.tested = uuid.uuid4().hex, False
    for access in accesses:
        access.name, access.method = conn.name, conn.method
        access.validation = {}
        access.revision = uuid.uuid4().hex
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return connections.connection_json(conn)


@router.post("/connections")
async def create_connection(body: ProfileBody, db=Depends(get_db_async)):
    return await save_profile(body, db)


@router.put("/connections/{connection_id}")
async def update_connection(connection_id: int, body: ProfileBody, db=Depends(get_db_async)):
    return await save_profile(body, db, await get_connection(db, connection_id))


@router.post("/connections/{connection_id}/discover")
async def discover_connection(connection_id: int, db=Depends(get_db_async)):
    conn = await get_connection(db, connection_id)
    if conn.method != "ssh":
        raise HTTPException(422, "Connexion SSH requise.")
    try:
        observed = await asyncio.to_thread(connections.probe, conn.connection["host"], conn.connection["port"])
        return dict(**observed, changed=bool(conn.fingerprint and conn.fingerprint != observed["fingerprint"]))
    except Exception as exc:
        raise HTTPException(422, "Serveur SSH inaccessible.") from exc


class TrustBody(BaseModel):
    fingerprint: str = Field(pattern=r"^SHA256:[A-Za-z0-9+/]{43}$")


@router.post("/connections/{connection_id}/trust")
async def trust_connection(connection_id: int, body: TrustBody, db=Depends(get_db_async)):
    await db.execute(text("SELECT pg_advisory_xact_lock(190041, 2)"))
    conn = await get_connection(db, connection_id)
    accesses = (await db.execute(select(StorageAccess).where(StorageAccess.connection_id == conn.id))).scalars().all()
    await assert_editable(db, accesses)
    try:
        observed = await asyncio.to_thread(connections.probe, conn.connection["host"], conn.connection["port"])
        if observed["fingerprint"] != body.fingerprint:
            raise ValueError("Identité modifiée pendant la confirmation.")
    except Exception as exc:
        raise HTTPException(422, "Identité SSH non confirmée. Relancez la détection.") from exc
    conn.fingerprint, conn.tested, conn.revision = body.fingerprint, False, uuid.uuid4().hex
    for access in accesses:
        access.validation = {}
        access.revision = uuid.uuid4().hex
    await db.commit()
    return connections.connection_json(conn)


@router.post("/connections/{connection_id}/test")
async def test_connection(connection_id: int, db=Depends(get_db_async)):
    await db.execute(text("SELECT pg_advisory_xact_lock(190041, 2)"))
    conn = await get_connection(db, connection_id)
    conn.tested = False
    try:
        await asyncio.to_thread(connections.test_connection, conn)
    except Exception as exc:
        await db.commit()
        raise HTTPException(
            422, "Connexion refusée : vérifier la confiance du serveur, l’authentification, Python 3 et rsync."
        ) from exc
    conn.tested = True
    await db.commit()
    return connections.connection_json(conn)


class BrowseBody(BaseModel):
    path: str = "/"


@router.post("/connections/{connection_id}/browse")
async def browse_connection(connection_id: int, body: BrowseBody, db=Depends(get_db_async)):
    conn = await get_connection(db, connection_id)
    if not conn.tested:
        raise HTTPException(422, "Testez la connexion avant de parcourir les dossiers.")
    try:
        if conn.method == "ssh":
            return await asyncio.to_thread(connections.browse, conn, body.path)
        from ..storage.discovery import request_engine

        return await request_engine(dict(operation="browse", path=body.path))
    except Exception as exc:
        raise HTTPException(422, "Dossier inaccessible : vérifier le chemin et les permissions.") from exc


class BindingBody(BaseModel):
    arr_instance_id: int = Field(gt=0)
    arr_root: str
    connection_id: int = 0
    path: str = ""


@router.post("/bindings")
async def save_binding(body: BindingBody, db=Depends(get_db_async)):
    await db.execute(text("SELECT pg_advisory_xact_lock(190041, 2)"))
    try:
        root = absolute_path(body.arr_root)
        path = absolute_path(body.path) if body.connection_id else ""
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    conn = await get_connection(db, body.connection_id) if body.connection_id else None
    if conn and conn.method == "local":
        try:
            path = media_path(path)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    accesses = (await db.execute(select(StorageAccess))).scalars().all()
    key = (body.arr_instance_id, root)
    old = [a for a in accesses if any((r["arr_instance_id"], r["arr_root"]) == key for r in a.roots)]
    target = next((a for a in accesses if conn and a.connection_id == conn.id), None)
    await assert_editable(db, old + ([target] if target else []))
    for access in old:
        access.roots = [r for r in access.roots if (r["arr_instance_id"], r["arr_root"]) != key]
        access.revision, access.validation = uuid.uuid4().hex, {}
    if conn:
        if not target:
            target = StorageAccess(
                name=conn.name,
                method=conn.method,
                connection_id=conn.id,
                connection={},
                credentials=None,
                roots=[],
                validation={},
            )
            db.add(target)
        target.roots = [*target.roots, dict(arr_instance_id=body.arr_instance_id, arr_root=root, path=path)]
        target.revision, target.validation = uuid.uuid4().hex, {}
    await db.commit()
    return dict(saved=True)


class RootAccessBody(BaseModel):
    connection_id: int = Field(gt=0)
    path: str


class MultipleBindingsBody(BaseModel):
    arr_instance_id: int = Field(gt=0)
    arr_root: str
    bindings: list[RootAccessBody] = Field(default_factory=list, max_length=2)


@router.post("/bindings/multiple")
async def save_multiple_bindings(body: MultipleBindingsBody, db=Depends(get_db_async)):
    await db.execute(text("SELECT pg_advisory_xact_lock(190041, 2)"))
    try:
        root = absolute_path(body.arr_root)
        entries = []
        methods = set()
        for binding in body.bindings:
            conn = await get_connection(db, binding.connection_id)
            path = absolute_path(binding.path)
            if conn.method in methods:
                raise ValueError("Un seul accès par méthode est autorisé pour cette racine.")
            if conn.method == "local":
                path = media_path(path)
            methods.add(conn.method)
            entries.append((conn, path))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    accesses = (await db.execute(select(StorageAccess))).scalars().all()
    key = (body.arr_instance_id, root)
    old = [a for a in accesses if any((r["arr_instance_id"], r["arr_root"]) == key for r in a.roots)]
    targets = [a for a in accesses if a.connection_id in {c.id for c, _ in entries}]
    await assert_editable(db, old + targets)
    for a in old:
        a.roots = [r for r in a.roots if (r["arr_instance_id"], r["arr_root"]) != key]
        a.revision, a.validation = uuid.uuid4().hex, {}
    for conn, path in entries:
        target = next((a for a in accesses if a.connection_id == conn.id), None)
        if not target:
            target = StorageAccess(
                name=conn.name,
                method=conn.method,
                connection_id=conn.id,
                connection={},
                credentials=None,
                roots=[],
                validation={},
            )
            db.add(target)
            accesses.append(target)
        target.roots = [*target.roots, dict(arr_instance_id=body.arr_instance_id, arr_root=root, path=path)]
        target.revision, target.validation = uuid.uuid4().hex, {}
    await db.commit()
    return dict(saved=True)
