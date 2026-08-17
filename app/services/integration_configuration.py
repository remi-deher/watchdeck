"""Cas d'usage transactionnels pour la configuration des intégrations."""

from collections.abc import Mapping
from typing import Any, NoReturn

import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..errors import ResourceNotFoundError
from ..models import ArrInstance, DownloadClient


async def _rollback_and_raise(db: AsyncSession) -> NoReturn:
    await db.rollback()
    raise


async def create_arr_instance(db: AsyncSession, values: Mapping[str, Any]) -> ArrInstance:
    try:
        if values.get("is_default"):
            await _clear_arr_default(db, str(values["arr_type"]))
        instance = ArrInstance(**dict(values))
        db.add(instance)
        await db.commit()
        await db.refresh(instance)
        return instance
    except Exception:
        await _rollback_and_raise(db)


async def update_arr_instance(
    db: AsyncSession, instance_id: int, values: Mapping[str, Any]
) -> tuple[ArrInstance, set[str]]:
    try:
        instance = await _arr_instance(db, instance_id)
        previous_type = instance.arr_type
        if values.get("is_default"):
            await _clear_arr_default(db, str(values["arr_type"]), exclude_id=instance_id)
        for key, value in values.items():
            setattr(instance, key, value)
        await db.commit()
        await db.refresh(instance)
        return instance, {previous_type, instance.arr_type} & {"sonarr", "radarr"}
    except Exception:
        await _rollback_and_raise(db)


async def delete_arr_instance(db: AsyncSession, instance_id: int) -> str:
    try:
        instance = await _arr_instance(db, instance_id)
        arr_type = instance.arr_type
        await db.delete(instance)
        await db.commit()
        return arr_type
    except Exception:
        await _rollback_and_raise(db)


async def toggle_arr_instance(db: AsyncSession, instance_id: int) -> ArrInstance:
    try:
        instance = await _arr_instance(db, instance_id)
        instance.enabled = not instance.enabled
        await db.commit()
        await db.refresh(instance)
        return instance
    except Exception:
        await _rollback_and_raise(db)


async def toggle_arr_instances_by_type(db: AsyncSession, arr_type: str) -> tuple[list[ArrInstance], bool]:
    try:
        instances = (await db.execute(select(ArrInstance).filter(ArrInstance.arr_type == arr_type))).scalars().all()
        if not instances:
            raise ResourceNotFoundError(f"Aucune instance {arr_type} configurée")
        enabled = not any(instance.enabled for instance in instances)
        for instance in instances:
            instance.enabled = enabled
        await db.commit()
        return list(instances), enabled
    except Exception:
        await _rollback_and_raise(db)


async def create_download_client(db: AsyncSession, values: Mapping[str, Any]) -> DownloadClient:
    try:
        if values.get("is_default"):
            await db.execute(sqlalchemy.update(DownloadClient).values(is_default=False))
        client = DownloadClient(**dict(values))
        db.add(client)
        await db.commit()
        await db.refresh(client)
        return client
    except Exception:
        await _rollback_and_raise(db)


async def update_download_client(db: AsyncSession, client_id: int, values: Mapping[str, Any]) -> DownloadClient:
    try:
        client = await _download_client(db, client_id)
        if values.get("is_default"):
            await db.execute(
                sqlalchemy.update(DownloadClient).where(DownloadClient.id != client_id).values(is_default=False)
            )
        for key, value in values.items():
            setattr(client, key, value)
        await db.commit()
        await db.refresh(client)
        return client
    except Exception:
        await _rollback_and_raise(db)


async def toggle_download_client(db: AsyncSession, client_id: int) -> DownloadClient:
    try:
        client = await _download_client(db, client_id)
        client.enabled = not client.enabled
        await db.commit()
        await db.refresh(client)
        return client
    except Exception:
        await _rollback_and_raise(db)


async def delete_download_client(db: AsyncSession, client_id: int) -> None:
    try:
        client = await _download_client(db, client_id)
        await db.delete(client)
        await db.commit()
    except Exception:
        await _rollback_and_raise(db)


async def _arr_instance(db: AsyncSession, instance_id: int) -> ArrInstance:
    instance = (await db.execute(select(ArrInstance).filter(ArrInstance.id == instance_id))).scalars().first()
    if not instance:
        raise ResourceNotFoundError("Instance introuvable")
    return instance


async def _download_client(db: AsyncSession, client_id: int) -> DownloadClient:
    client = (await db.execute(select(DownloadClient).filter(DownloadClient.id == client_id))).scalars().first()
    if not client:
        raise ResourceNotFoundError("Client introuvable")
    return client


async def _clear_arr_default(db: AsyncSession, arr_type: str, exclude_id: int | None = None) -> None:
    query = sqlalchemy.update(ArrInstance).where(ArrInstance.arr_type == arr_type)
    if exclude_id is not None:
        query = query.where(ArrInstance.id != exclude_id)
    await db.execute(query.values(is_default=False))
