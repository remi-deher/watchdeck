"""Storage paths and durable transfer state. No credentials in job snapshots."""

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, BigInteger, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from ..crypto import EncryptedText
from ..utils import now_utc_naive
from .base import Base


class StorageLocation(Base):
    __tablename__ = "storage_locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    mount_path: Mapped[str]
    mappings: Mapped[list] = mapped_column(JSON, default=list)
    reserve_bytes: Mapped[int] = mapped_column(BigInteger, default=100_000_000_000)
    enabled: Mapped[bool] = mapped_column(default=True)
    total_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    free_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    checked_at: Mapped[Optional[datetime]]
    health: Mapped[str] = mapped_column(default="not_checked")


class StorageTransfer(Base):
    __tablename__ = "storage_transfers"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("storage_locations.id"))
    destination_id: Mapped[int] = mapped_column(ForeignKey("storage_locations.id"))
    status: Mapped[str] = mapped_column(default="queued", index=True)
    desired_state: Mapped[str] = mapped_column(default="run")
    auto_resume: Mapped[bool] = mapped_column(default=True)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=now_utc_naive)
    updated_at: Mapped[datetime] = mapped_column(default=now_utc_naive)
    worker_seen_at: Mapped[Optional[datetime]]
    error: Mapped[Optional[str]]


class StorageTransferItem(Base):
    __tablename__ = "storage_transfer_items"
    __table_args__ = (Index("ix_storage_transfer_item_arr", "arr_instance_id", "arr_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    transfer_id: Mapped[int] = mapped_column(ForeignKey("storage_transfers.id", ondelete="CASCADE"), index=True)
    arr_instance_id: Mapped[int] = mapped_column(ForeignKey("arr_instances.id"))
    arr_id: Mapped[int]
    title: Mapped[str]
    media_type: Mapped[str]
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(default="pending")
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    proofs: Mapped[dict] = mapped_column(JSON, default=dict)
    progress: Mapped[dict] = mapped_column(JSON, default=dict)
    reason: Mapped[Optional[str]]
    created_at: Mapped[datetime] = mapped_column(default=now_utc_naive)
    updated_at: Mapped[datetime] = mapped_column(default=now_utc_naive)


class StorageAccess(Base):
    """One execution endpoint, credentials encrypted and excluded from snapshots."""

    __tablename__ = "storage_accesses"
    id: Mapped[int] = mapped_column(primary_key=True)
    connection_id: Mapped[Optional[int]] = mapped_column(ForeignKey("storage_connections.id"))
    method: Mapped[str]
    name: Mapped[str]
    revision: Mapped[str]
    connection: Mapped[dict] = mapped_column(JSON, default=dict)
    credentials: Mapped[Optional[str]] = mapped_column(EncryptedText())
    roots: Mapped[list] = mapped_column(JSON, default=list)
    validation: Mapped[dict] = mapped_column(JSON, default=dict)


class StorageConnection(Base):
    __tablename__ = "storage_connections"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    method: Mapped[str]
    revision: Mapped[str]
    connection: Mapped[dict] = mapped_column(JSON, default=dict)
    credentials: Mapped[Optional[str]] = mapped_column(EncryptedText())
    fingerprint: Mapped[str] = mapped_column(default="")
    tested: Mapped[bool] = mapped_column(default=False)


class StorageProtectedTitle(Base):
    __tablename__ = "storage_protected_titles"
    __table_args__ = (Index("ix_storage_protected_arr", "arr_instance_id", "arr_id", unique=True),)
    id: Mapped[int] = mapped_column(primary_key=True)
    arr_instance_id: Mapped[int] = mapped_column(ForeignKey("arr_instances.id", ondelete="CASCADE"))
    arr_id: Mapped[int]
    title: Mapped[str]
