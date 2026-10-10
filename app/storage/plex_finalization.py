"""Durable Plex finalization queue, separate from copying and owned by one worker."""

import asyncio
import logging
import threading
import time
from pathlib import PurePosixPath

import httpx
from sqlalchemy import select, text

from ..database import AsyncSessionLocal, async_engine
from ..models import ArrInstance, StorageTransfer, StorageTransferItem
from ..services.plex_servers import connection_for
from ..utils import now_utc_naive
from .integrite import Interrompu
from .locks import item_paths, mutation_lock

log = logging.getLogger(__name__)
CHECK_INTERVAL = 30
SCAN_INTERVAL = 300
FINALIZATION_STATES = ("plex_pending", "cleaning")


def transfer_status(items):
    states = {item.status for item in items}
    if states <= {"completed"}:
        return "completed"
    if states <= {"completed", *FINALIZATION_STATES}:
        return "finalizing"
    return "blocked"


def scan_key(item):
    snap = item.snapshot
    return (snap.get("plex_machine") or item.arr_instance_id, snap["plex_section_id"], snap["destination_plex"])


async def request_scan(db, item, scans, now):
    from .worker import plex_get, update_item

    key = scan_key(item)
    if now - scans.get(key, 0) < SCAN_INTERVAL:
        return
    # Commit intent first: a restart cannot repeatedly flood Plex with this scan.
    scans[key] = now
    await update_item(db, item, item.status, item.reason, progress={"plex_scan_requested_at": now})
    instance = await db.get(ArrInstance, item.arr_instance_id)
    if not instance or not instance.enabled:
        raise ValueError("Instance Arr indisponible pour la finalisation Plex.")
    conn = await connection_for(db, instance.plex_server_id)
    if not conn:
        raise ValueError("Connexion Plex indisponible.")
    await plex_get(
        conn,
        f"/library/sections/{item.snapshot['plex_section_id']}/refresh",
        {"path": item.snapshot["destination_plex"]},
    )


async def settle_job(db, job_id):
    # Fresh locked state prevents a concurrent pause/cancel or copy completion being overwritten.
    job = (
        await db.execute(
            select(StorageTransfer)
            .where(StorageTransfer.id == job_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not job or job.desired_state != "run" or job.status not in ("finalizing", "blocked"):
        return
    items = (
        (
            await db.execute(
                select(StorageTransferItem)
                .where(StorageTransferItem.transfer_id == job_id)
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    job.status = transfer_status(items)
    job.updated_at = now_utc_naive()
    await db.commit()


async def finalize_item(item_id, scans, lease, shutdown):
    from .worker import process_item, update_item

    stop = threading.Event()
    lost = threading.Event()

    async def monitor(job_id):
        while not stop.is_set():
            try:
                await lease.execute(text("SELECT 1"))
                async with AsyncSessionLocal() as control:
                    job = await control.get(StorageTransfer, job_id)
                    if shutdown.is_set() or not job or job.desired_state != "run":
                        stop.set()
            except Exception:
                lost.set()
                stop.set()
            await asyncio.sleep(1)

    async with AsyncSessionLocal() as db:
        item = await db.get(StorageTransferItem, item_id)
        if not item or item.status not in FINALIZATION_STATES:
            return
        job = await db.get(StorageTransfer, item.transfer_id)
        if (
            not job
            or job.desired_state != "run"
            or job.status not in ("running", "queued", "blocked", "finalizing")
            or shutdown.is_set()
        ):
            return
        now = time.time()
        if now - (item.progress or {}).get("plex_checked_at", 0) < CHECK_INTERVAL:
            return
        await update_item(
            db,
            item,
            item.status,
            item.reason,
            progress={"plex_checked_at": now, "plex_checks": (item.progress or {}).get("plex_checks", 0) + 1},
        )
        watch = asyncio.create_task(monitor(job.id))
        try:
            await request_scan(db, item, scans, now)
            if stop.is_set() or shutdown.is_set():
                raise Interrompu()
            # Un dossier occupe sera repris au prochain passage, sans attendre la copie.
            async with mutation_lock(item_paths(item), wait=False) as acquired:
                if not acquired:
                    return
                if stop.is_set() or shutdown.is_set():
                    raise Interrompu()
                await process_item(db, job, item, stop, finalize_only=True)
        except Interrompu:
            pass
        except (httpx.HTTPError, TimeoutError):
            log.exception("Plex temporairement indisponible pour le titre %s", item.id)
            await update_item(
                db, item, "plex_pending", "Finalisation Plex à réessayer automatiquement ; original conservé."
            )
        except Exception:
            log.exception("Finalisation refusée pour le titre %s", item.id)
            await update_item(
                db,
                item,
                "blocked",
                "Finalisation refusée : vérifier les accès, les chemins et les fiches Plex ; original conservé.",
            )
        finally:
            stop.set()
            watch.cancel()
            await asyncio.gather(watch, return_exceptions=True)
        if lost.is_set():
            raise RuntimeError("Verrou de finalisation perdu : nettoyage arrêté.")
        await settle_job(db, job.id)


async def run_finalizer(shutdown):
    async with async_engine.connect() as lease:
        # Reserved namespace: 1 is the transfer engine, 3 is Plex finalization.
        # Storage API requests must never use this session-level worker lease.
        if not (await lease.execute(text("SELECT pg_try_advisory_lock(190041, 3)"))).scalar():
            raise RuntimeError("Un moteur de finalisation Plex est déjà actif.")
        await lease.commit()
        while not shutdown.is_set():
            async with AsyncSessionLocal() as db:
                pending = (
                    (
                        await db.execute(
                            select(StorageTransferItem)
                            .join(StorageTransfer, StorageTransfer.id == StorageTransferItem.transfer_id)
                            .where(
                                StorageTransferItem.status.in_(FINALIZATION_STATES),
                                StorageTransfer.desired_state == "run",
                                StorageTransfer.status.in_(["running", "queued", "blocked", "finalizing"]),
                            )
                            .order_by(StorageTransferItem.updated_at, StorageTransferItem.id)
                        )
                    )
                    .scalars()
                    .all()
                )
                scans = {}
                for item in pending:
                    key = scan_key(item)
                    scans[key] = max(scans.get(key, 0), (item.progress or {}).get("plex_scan_requested_at", 0))
                ids = [
                    item.id
                    for item in pending
                    if time.time() - (item.progress or {}).get("plex_checked_at", 0) >= CHECK_INTERVAL
                ][:10]
            for item_id in ids:
                if shutdown.is_set():
                    break
                await finalize_item(item_id, scans, lease, shutdown)
            if not shutdown.is_set():
                await refresh_sources()
            await asyncio.sleep(3)


async def refresh_sources():
    """Group source scans after proven cleanup; persist retries without rescanning on every file."""
    from .worker import plex_get, update_item

    now = time.time()
    async with AsyncSessionLocal() as db:
        pending = (
            (
                await db.execute(
                    select(StorageTransferItem)
                    .join(StorageTransfer, StorageTransfer.id == StorageTransferItem.transfer_id)
                    .where(
                        StorageTransferItem.status == "completed",
                        StorageTransferItem.progress["plex_source_refresh_pending"].as_boolean().is_(True),
                        StorageTransfer.desired_state == "run",
                        StorageTransfer.status.in_(["running", "finalizing", "completed", "blocked"]),
                    )
                    .order_by(StorageTransferItem.id)
                    .limit(100)
                )
            )
            .scalars()
            .all()
        )
        recent = (
            (
                await db.execute(
                    select(StorageTransferItem).where(
                        StorageTransferItem.progress["plex_source_scan_requested_at"].as_float() > now - SCAN_INTERVAL
                    )
                )
            )
            .scalars()
            .all()
        )

        def key(item):
            snap = item.snapshot
            return (
                snap.get("plex_machine") or item.arr_instance_id,
                snap["plex_section_id"],
                str(PurePosixPath(snap["source_plex"]).parent),
            )

        requested = {key(item) for item in recent}
        groups = {}
        for item in pending:
            groups.setdefault(key(item), []).append(item)
        for target, items in groups.items():
            if target in requested:
                continue
            item = items[0]
            instance = await db.get(ArrInstance, item.arr_instance_id)
            if not instance or not instance.enabled:
                continue
            conn = await connection_for(db, instance.plex_server_id)
            if not conn:
                continue
            try:
                for item in items:
                    await update_item(db, item, "completed", progress={"plex_source_scan_requested_at": now})
                await plex_get(conn, f"/library/sections/{target[1]}/refresh", {"path": target[2]})
                for item in items:
                    await update_item(
                        db,
                        item,
                        "completed",
                        progress={"plex_source_refresh_pending": False, "plex_source_scan_requested_at": now},
                    )
            except Exception:
                # Cleanup is already proven; a scan failure must not undo completion.
                log.exception("Rafraîchissement source Plex reporté pour le titre %s", item.id)
