"""Independent observations: never ownership or permission to move media."""

from datetime import datetime

from sqlalchemy import JSON, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class StorageInventory(Base):
    __tablename__ = "storage_inventory"
    __table_args__ = (
        UniqueConstraint("source", "endpoint_id", "entity_id", name="uq_storage_inventory_entity"),
        Index("ix_storage_inventory_identity", "source", "endpoint_id", "provider_id"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str]
    endpoint_id: Mapped[int]
    entity_id: Mapped[str]
    endpoint_revision: Mapped[str]
    media_type: Mapped[str]
    provider_id: Mapped[str | None]
    present: Mapped[bool] = mapped_column(default=True)
    observed_at: Mapped[datetime]
    data: Mapped[dict] = mapped_column(JSON)


class StorageInventoryScope(Base):
    __tablename__ = "storage_inventory_scopes"
    __table_args__ = (UniqueConstraint("source", "endpoint_id", name="uq_storage_inventory_scope"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str]
    endpoint_id: Mapped[int]
    endpoint_revision: Mapped[str]
    observed_at: Mapped[datetime]
