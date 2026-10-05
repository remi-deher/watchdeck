"""Cancel after the copy has stopped; remove only recorded partial files."""

import asyncio
from pathlib import PurePosixPath

from sqlalchemy import select, text

from ..models import ArrInstance, StorageTransferItem
from ..utils import now_utc_naive
from . import integrite
from .access import filesystem_for
from .service import arr_request


async def cancel_transfer(db, job, lease):
    from .peer_fs import PeerFilesystem
    from .worker import local_media, update_item

    items = (
        (await db.execute(select(StorageTransferItem).where(StorageTransferItem.transfer_id == job.id))).scalars().all()
    )
    try:
        for item in items:
            await lease.execute(text("SELECT 1"))
            if item.status in ("completed", "cancelled"):
                continue
            snap = dict(item.snapshot)
            if job.params.get("transfer_mode") == "arr":
                if snap.get("arr_submission_intent") and not snap.get("arr_command_id"):
                    raise ValueError("Commande Arr non identifiée : vérifiez son résultat avant d’annuler.")
                if snap.get("arr_command_id"):
                    instance = await db.get(ArrInstance, item.arr_instance_id)
                    state = await arr_request(instance, "GET", f"command/{snap['arr_command_id']}")
                    if state["status"] not in ("completed", "failed", "aborted", "cancelled"):
                        job.error = "La commande Arr déjà lancée doit se terminer avant la clôture de l’annulation."
                        await db.commit()
                        return False
            elif snap.get("files"):
                fs = (
                    await filesystem_for(db, job, snap)
                    if job.params.get("transfer_mode") in ("rsync_ssh", "rsync_local")
                    else None
                )
                folder = str(PurePosixPath(snap["destination_mount"]) / snap["relative"])
                dst = (
                    fs.path(folder, "destination")
                    if isinstance(fs, PeerFilesystem)
                    else fs.path(folder)
                    if fs
                    else local_media(snap["destination_mount"], snap["relative"])
                )
                recorded = snap.get("temporary_files", [])
                # Legacy tasks recorded the active filename before starting rsync.
                if not recorded and item.progress.get("file") in snap["files"]:
                    recorded = [item.progress["file"]]
                for name in recorded:
                    await lease.execute(text("SELECT 1"))
                    relative = PurePosixPath(name)
                    if name not in snap["files"] or relative.is_absolute() or ".." in relative.parts:
                        raise ValueError("Liste des fichiers temporaires invalide.")
                    partial = dst / (name + ".partiel")
                    if not await asyncio.to_thread(partial.exists):
                        continue
                    signature = await asyncio.to_thread(fs.signature if fs else integrite.signature, partial)
                    if fs:
                        endpoint = partial.fs
                        await asyncio.to_thread(
                            endpoint.call, "discard_partial", path=str(partial), signature=signature
                        )
                    else:
                        await asyncio.to_thread(integrite.discard_partial, str(partial), signature)
                # Published copies and both Plex library roots are deliberately retained.
            await update_item(db, item, "cancelled", "Tâche annulée. Copies complètes et chemins Plex conservés.")
        job.status = "cancelled"
        job.error = None
    except Exception as exc:
        job.status = "cancel_blocked"
        job.error = str(exc)
    job.updated_at = now_utc_naive()
    await db.commit()
    return True
