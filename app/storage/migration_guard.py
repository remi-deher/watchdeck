"""A brief, live migration is not a disappearance. Stale/blocked jobs never mask loss."""

from datetime import timedelta

from sqlalchemy import and_, exists, select

from ..models import LibraryItem, StorageTransfer, StorageTransferItem
from ..utils import now_utc_naive


def active_migration_for(library_item):
    return exists(
        select(StorageTransferItem.id)
        .join(StorageTransfer, StorageTransfer.id == StorageTransferItem.transfer_id)
        .where(
            StorageTransferItem.arr_instance_id == library_item.arr_instance_id,
            StorageTransferItem.arr_id == library_item.arr_id,
            StorageTransferItem.status.in_(
                ["prepared", "copying", "verifying", "switching", "plex_pending", "cleaning"]
            ),
            StorageTransfer.status == "running",
            StorageTransfer.worker_seen_at >= now_utc_naive() - timedelta(seconds=90),
        )
    )


async def guarded_library_ids(db, ids):
    if not ids:
        return set()
    return set(
        (
            await db.execute(select(LibraryItem.id).where(LibraryItem.id.in_(ids), active_migration_for(LibraryItem)))
        ).scalars()
    )
