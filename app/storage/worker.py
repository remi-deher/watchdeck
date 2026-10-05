"""One dedicated process. PostgreSQL owns commands/checkpoints; rsync runs in a thread.

Run with ``python -m app.storage.worker``. Never start it inside the API worker.
"""

import asyncio
import json
import logging
import os
import shutil
import signal
import threading
import time
from pathlib import Path, PurePosixPath

import httpx
from sqlalchemy import select, text

from ..database import AsyncSessionLocal, async_engine
from ..models import ArrInstance, StorageLocation, StorageTransfer, StorageTransferItem
from ..services.plex_servers import connection_for
from ..utils import now_utc_naive
from . import integrite, ssh_hash
from .integrite import Interrompu, copier_fichier, verifier_dossier
from .service import arr_request, discover_instance_roots

log = logging.getLogger(__name__)
VIDEO = (".mkv", ".mp4", ".avi", ".m4v", ".mov", ".ts", ".m2ts", ".wmv")
SHUTDOWN = threading.Event()
HEARTBEAT = Path("/tmp/watchdeck-transfers-heartbeat")


def mounted_root(root: str) -> Path:
    path = Path(root)
    if not root.startswith("/storage/") or path.is_symlink() or path.resolve() != path or not path.is_dir():
        raise ValueError("Montage absent, lien symbolique ou chemin hors /storage.")
    mounts = Path("/proc/self/mountinfo").read_text().splitlines()
    valid = any(
        (m := line.split()[4].replace("\\040", " ")).startswith("/storage/") and (root == m or root.startswith(m + "/"))
        for line in mounts
    )
    if not valid:
        raise ValueError("Stockage non monté : refus de travailler sur un dossier local de remplacement.")
    return path


def local_media(root: str, relative: str) -> Path:
    base = mounted_root(root)
    if "/" in relative or relative in ("", ".", ".."):
        raise ValueError("Dossier média invalide.")
    path = base / relative
    if path.is_symlink() or path.resolve().parent != base:
        raise ValueError("Chemin média hors du stockage ou lien symbolique.")
    return path


def inventory(source: Path, require_video=True) -> list[str]:
    out: list[str] = []
    for parent, dirs, files in os.walk(source, followlinks=False):
        for name in dirs + files:
            if (Path(parent) / name).is_symlink():
                raise ValueError("Les liens symboliques sont interdits.")
        out.extend(str((Path(parent) / name).relative_to(source)) for name in files)
    if require_video and not any(name.lower().endswith(VIDEO) for name in out):
        raise ValueError("Aucun fichier vidéo dans le dossier source.")
    return sorted(out)


async def plex_get(conn, path, params=None):
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(
            conn.url.rstrip("/") + path,
            params=params,
            headers={"X-Plex-Token": conn.token, "Accept": "application/json"},
        )
        response.raise_for_status()
        return response.json().get("MediaContainer", {}) if response.content else {}


async def plex_files(conn, section, root, kind):
    result = {}
    start = 0
    while True:
        data = await plex_get(
            conn,
            f"/library/sections/{section}/all",
            {
                "type": 4 if kind == "series" else 1,
                "includeMedia": 1,
                "X-Plex-Container-Start": start,
                "X-Plex-Container-Size": 200,
            },
        )
        items = data.get("Metadata", [])
        for item in items:
            for media in item.get("Media", []):
                for part in media.get("Part", []):
                    name = part.get("file", "")
                    if name.startswith(root.rstrip("/") + "/") and name.lower().endswith(VIDEO):
                        result.setdefault(name[len(root.rstrip("/")) + 1 :], set()).add(str(item["ratingKey"]))
        start += len(items)
        if not items or start >= data.get("totalSize", data.get("size", len(items))):
            break
    return {name: sorted(keys) for name, keys in result.items()}


async def is_playing(conn, snapshot):
    sessions = await plex_get(conn, "/status/sessions")
    roots = (snapshot["source_plex"].rstrip("/") + "/", snapshot["destination_plex"].rstrip("/") + "/")
    return any(
        part.get("file", "").startswith(roots)
        for m in sessions.get("Metadata", [])
        for media in m.get("Media", [])
        for part in media.get("Part", [])
    )


async def confirm_media_identity(conn, originals, snapshot, kind):
    """Check TMDB/TVDB, not a title match, even if folder names happen to coincide."""
    keys = sorted({key for values in originals.values() for key in values})
    if not keys:
        raise ValueError("Référence Plex absente.")
    parents = set()
    for start in range(0, len(keys), 50):
        details = await plex_get(conn, "/library/metadata/" + ",".join(keys[start : start + 50]), {"includeGuids": 1})
        metadata = details.get("Metadata", [])
        if len(metadata) != len(keys[start : start + 50]):
            raise ValueError("Références Plex incomplètes.")
        for item in metadata:
            if kind == "series":
                if not item.get("grandparentRatingKey"):
                    raise ValueError("Série Plex non identifiée.")
                parents.add(str(item["grandparentRatingKey"]))
            else:
                ids = {g.get("id") for g in item.get("Guid", [])}
                if "tmdb://" + str(snapshot.get("tmdb_id")) not in ids:
                    raise ValueError("Identité TMDB différente entre Arr et Plex : transfert refusé.")
    if kind == "series":
        if len(parents) != 1:
            raise ValueError("Les épisodes ne correspondent pas à une seule série Plex.")
        data = await plex_get(conn, "/library/metadata/" + next(iter(parents)), {"includeGuids": 1})
        ids = {g.get("id") for item in data.get("Metadata", []) for g in item.get("Guid", [])}
        if "tvdb://" + str(snapshot.get("tvdb_id")) not in ids:
            raise ValueError("Identité TVDB différente entre Arr et Plex : transfert refusé.")


async def no_arr_download(instance, item):
    queue = await arr_request(
        instance, "GET", "queue?pageSize=10000&includeUnknownMovieItems=true&includeSeries=true&includeMovie=true"
    )
    key = "movieId" if item.media_type == "movie" else "seriesId"
    if any(r.get(key) == item.arr_id for r in queue.get("records", [])):
        raise ValueError("Un téléchargement ou import est en cours pour ce titre.")


async def update_item(db, item, status, reason=None, **changes):
    telemetry = dict(item.progress or {})
    previous = item.status
    next_progress = changes.pop("progress", None)
    if next_progress is not None:
        telemetry.update(next_progress)
    if status in ("prepared", "copying", "verifying", "switching", "plex_pending", "cleaning", "arr_pending"):
        telemetry.setdefault("started_at", now_utc_naive().isoformat())
    if previous != status:
        telemetry["phase_started_at"] = time.time()
        telemetry["bytes_per_second"] = None
    if status == "completed":
        telemetry["finished_at"] = now_utc_naive().isoformat()
    item.progress = telemetry
    item.status = status
    item.reason = reason
    item.updated_at = now_utc_naive()
    for key, value in changes.items():
        setattr(item, key, value)
    await db.commit()


async def process_item(db, job, item, stop):
    if job.params.get("transfer_mode", "rsync") == "arr":
        from .arr_transfer import process_arr

        return await process_arr(db, job, item, stop)
    snap = dict(item.snapshot)
    src = local_media(snap["source_mount"], snap["relative"])
    dst = local_media(snap["destination_mount"], snap["relative"])
    if src == dst or (src.exists() and dst.exists() and os.path.samefile(src, dst)):
        raise ValueError("Source et destination identiques.")
    instance = await db.get(ArrInstance, item.arr_instance_id)
    if not instance or not instance.enabled:
        raise ValueError("Instance Arr indisponible.")
    conn = await connection_for(db, instance.plex_server_id)
    if not conn:
        raise ValueError("Serveur Plex indisponible.")
    discovered = await discover_instance_roots(db, instance)
    for side in ("source", "destination"):
        arr_root = str(PurePosixPath(snap[side + "_arr"]).parent)
        plex_root = str(PurePosixPath(snap[side + "_plex"]).parent)
        if arr_root not in discovered["arr_roots"] or not any(
            root["path"] == plex_root and root["section_id"] == snap["plex_section_id"]
            for root in discovered["plex_roots"]
        ):
            raise ValueError("Racines Arr/Plex modifiées depuis la préparation : déplacement refusé.")
    identity = await plex_get(conn, "/identity")
    machine = identity.get("machineIdentifier")
    if not machine:
        raise ValueError("Identité du serveur Plex indisponible.")
    if snap.get("plex_machine") and snap["plex_machine"] != machine:
        raise ValueError("Le serveur Plex a changé : déplacement refusé.")
    if not snap.get("plex_machine"):
        snap["plex_machine"] = machine
        await update_item(db, item, item.status, snapshot=snap)
    resource = "movie" if item.media_type == "movie" else "series"
    media = await arr_request(instance, "GET", f"{resource}/{item.arr_id}")
    if media["path"] not in (snap["source_arr"], snap["destination_arr"]):
        raise ValueError("Le chemin Arr a changé depuis l’aperçu.")
    roots = await arr_request(instance, "GET", "rootfolder")
    if snap["destination_root"] not in [r["path"].rstrip("/") for r in roots]:
        raise ValueError("Le dossier destination doit être enregistré dans les dossiers racine Arr.")
    await no_arr_download(instance, item)
    if await is_playing(conn, snap):
        await update_item(
            db,
            item,
            "deferred",
            "Lecture Plex active : titre reporté.",
            progress={**item.progress, "quiet_since": None},
        )
        return
    if item.media_type == "series" and item.status == "deferred":
        quiet = item.progress.get("quiet_since")
        if not quiet or time.time() - quiet < 600:
            await update_item(
                db,
                item,
                "deferred",
                "Série protégée : attendre 10 minutes sans lecture puis relancer.",
                progress={**item.progress, "quiet_since": quiet or time.time()},
            )
            return
    mode = job.params.get("verification", "standard")
    ssh_hash.configurer({"hash_destination": "nfs"})
    if "original_plex" not in snap:
        if media["path"] != snap["source_arr"]:
            raise ValueError("Référence Plex originale absente : contrôle manuel nécessaire.")
        snap["original_plex"] = await plex_files(conn, snap["plex_section_id"], snap["source_plex"], item.media_type)
        if not snap["original_plex"] or any(len(keys) != 1 for keys in snap["original_plex"].values()):
            raise ValueError("Les fiches Plex originales ne sont pas identifiées de façon unique.")
        await confirm_media_identity(conn, snap["original_plex"], snap, item.media_type)
        if not src.is_dir():
            raise ValueError("Source absente.")
        snap["files"] = await asyncio.to_thread(inventory, src)
        videos = {n.replace(os.sep, "/") for n in snap["files"] if n.lower().endswith(VIDEO)}
        if videos != set(snap["original_plex"]):
            raise ValueError("Tous les fichiers vidéo source doivent être reconnus par Plex.")
        await update_item(db, item, "prepared", snapshot=snap)
    if stop.is_set():
        raise Interrompu()
    # Validate every destination even when a previous cleanup removed only part of the source.
    if snap.get("cleanup_intent"):
        if set(snap.get("cleanup_signatures", {})) != set(snap["files"]):
            raise ValueError("Preuves de nettoyage incomplètes.")
        for name, signature in snap["cleanup_signatures"].items():
            if integrite.signature(str(dst / name)) != signature:
                raise ValueError("Destination modifiée après interruption du nettoyage.")
    # A crash after deletion is only accepted with a previously committed cleanup intent.
    if not src.exists():
        if not snap.get("cleanup_intent"):
            raise ValueError("Source absente sans intention de nettoyage enregistrée.")
        for name, proof in item.proofs.items():
            if integrite.signature(str(dst / name)) != snap.get("cleanup_signatures", {}).get(name):
                raise ValueError("Destination modifiée après interruption du nettoyage.")
            if (
                proof.get("sha256")
                and await asyncio.to_thread(integrite.empreinte, str(dst / name), stop) != proof["sha256"]
            ):
                raise ValueError("Intégrité destination incorrecte après interruption du nettoyage.")
        if (
            await plex_files(conn, snap["plex_section_id"], snap["destination_plex"], item.media_type)
            != snap["original_plex"]
        ):
            raise ValueError("Confirmation Plex manquante après nettoyage.")
        await update_item(db, item, "completed", progress={})
        return
    if media["path"] == snap["source_arr"]:
        destination = await db.get(StorageLocation, job.destination_id)
        needed = sum((src / name).stat().st_size for name in snap["files"])
        if shutil.disk_usage(dst.parent).free - needed < destination.reserve_bytes:
            raise ValueError("Réserve de destination insuffisante au début de la copie.")
        if dst.exists():
            found = await asyncio.to_thread(inventory, dst, False)
            if any(name.removesuffix(".partiel") not in snap["files"] for name in found):
                raise ValueError("La destination contient des fichiers étrangers au titre.")
            existing_plex = await plex_files(conn, snap["plex_section_id"], snap["destination_plex"], item.media_type)
            if existing_plex and any(snap["original_plex"].get(name) != keys for name, keys in existing_plex.items()):
                raise ValueError("La destination appartient à une autre fiche Plex : copie refusée.")
        dst.mkdir(exist_ok=True)
        proofs = dict(item.proofs)
        loop = asyncio.get_running_loop()
        last = [0.0]
        copied = [0]
        base = [0]
        sample = [time.monotonic(), 0]
        speed = [None]

        async def progress(name, bytes_done):
            await update_item(
                db,
                item,
                "copying",
                progress={
                    "file": name,
                    "bytes": bytes_done,
                    "copied_bytes": base[0] + bytes_done,
                    "bytes_per_second": speed[0],
                    "updated_at": time.time(),
                },
            )

        for name in snap["files"]:
            if stop.is_set():
                raise Interrompu()
            # Never overwrite a destination that becomes actively read while copying.
            if await is_playing(conn, snap):
                await update_item(db, item, "deferred", "Lecture Plex active : copie reportée.")
                return
            source = src / name
            target = dst / name
            target.parent.mkdir(parents=True, exist_ok=True)
            copied[0] = 0
            sample[:] = [time.monotonic(), 0]
            speed[0] = None
            await progress(name, 0)

            def advance(delta):
                copied[0] += delta
                if time.monotonic() - last[0] > 1:
                    last[0] = time.monotonic()
                    elapsed = last[0] - sample[0]
                    if elapsed >= 3:
                        speed[0] = (copied[0] - sample[1]) / elapsed
                        sample[:] = [last[0], copied[0]]
                    asyncio.run_coroutine_threadsafe(progress(name, copied[0]), loop).result(timeout=30)

            def phase(label):
                asyncio.run_coroutine_threadsafe(update_item(db, item, "verifying"), loop).result(timeout=30)

            proof = await asyncio.to_thread(
                copier_fichier, str(source), str(target), advance, stop, proofs.get(name), phase, mode
            )
            proofs[name] = proof
            await progress(name, source.stat().st_size)
            base[0] += source.stat().st_size
            await update_item(db, item, "copying", proofs=dict(proofs))
        await update_item(db, item, "verifying")
        await asyncio.to_thread(verifier_dossier, str(src), str(dst), stop, proofs, mode)
        if await is_playing(conn, snap):
            await update_item(db, item, "deferred", "Lecture active : bascule reportée.")
            return
        await no_arr_download(instance, item)
        if stop.is_set():
            raise Interrompu()
        await update_item(db, item, "switching")
        media.update(path=snap["destination_arr"], rootFolderPath=snap["destination_root"])
        await arr_request(instance, "PUT", f"{resource}/{item.arr_id}?moveFiles=false", media)
    if stop.is_set():
        raise Interrompu()
    command = await arr_request(
        instance,
        "POST",
        "command",
        {
            "name": "RescanMovie" if item.media_type == "movie" else "RescanSeries",
            "movieId" if item.media_type == "movie" else "seriesId": item.arr_id,
        },
    )
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        if stop.is_set():
            raise Interrompu()
        state = await arr_request(instance, "GET", f"command/{command['id']}")
        if state["status"] == "completed":
            break
        if state["status"] in ("failed", "aborted"):
            raise ValueError("Rescan Arr échoué : original conservé.")
        await asyncio.sleep(2)
    else:
        raise ValueError("Rescan Arr trop long : original conservé.")
    media = await arr_request(instance, "GET", f"{resource}/{item.arr_id}")
    files = await arr_request(
        instance,
        "GET",
        f"moviefile?movieId={item.arr_id}" if item.media_type == "movie" else f"episodefile?seriesId={item.arr_id}",
    )
    expected = {n.replace(os.sep, "/") for n in snap["files"] if n.lower().endswith(VIDEO)}
    if media["path"] != snap["destination_arr"] or not expected.issubset({f.get("relativePath", "") for f in files}):
        raise ValueError("Arr ne reconnaît pas tous les fichiers destination : original conservé.")
    await plex_get(conn, f"/library/sections/{snap['plex_section_id']}/refresh", {"path": snap["destination_plex"]})
    await update_item(db, item, "plex_pending", "Confirmation des fiches Plex en attente ; original conservé.")
    if (
        await plex_files(conn, snap["plex_section_id"], snap["destination_plex"], item.media_type)
        != snap["original_plex"]
    ):
        return
    if await is_playing(conn, snap):
        await update_item(db, item, "deferred", "Lecture active : nettoyage reporté.")
        return
    await no_arr_download(instance, item)
    remaining = await asyncio.to_thread(inventory, src, False)
    destination_files = await asyncio.to_thread(inventory, dst, False)
    if set(destination_files) != set(snap["files"]) or not set(remaining).issubset(snap["files"]):
        raise ValueError("Inventaire modifié : nettoyage refusé.")
    if not snap.get("cleanup_intent") and set(remaining) != set(snap["files"]):
        raise ValueError("Fichiers source disparus : nettoyage refusé.")
    await asyncio.to_thread(verifier_dossier, str(src), str(dst), stop, dict(item.proofs), mode)
    # The cleanup intent is committed after validation. Standard mode adds no full reread.
    proofs = dict(item.proofs)
    snap["cleanup_signatures"] = {name: integrite.signature(str(dst / name)) for name in snap["files"]}
    if stop.is_set():
        raise Interrompu()
    snap["cleanup_intent"] = True
    await update_item(db, item, "cleaning", proofs=proofs, snapshot=snap)
    local_media(snap["source_mount"], snap["relative"])
    local_media(snap["destination_mount"], snap["relative"])
    await asyncio.to_thread(shutil.rmtree, src)
    await update_item(db, item, "completed", progress={})
    try:
        await plex_get(
            conn,
            f"/library/sections/{snap['plex_section_id']}/refresh",
            {"path": str(PurePosixPath(snap["source_plex"]).parent)},
        )
    except Exception:
        log.exception("Déplacement terminé, rafraîchissement du dossier source Plex à réessayer.")


async def refresh_storage():
    async with AsyncSessionLocal() as db:
        for location in (await db.execute(select(StorageLocation))).scalars():
            if not location.mount_path:
                continue
            try:
                root = mounted_root(location.mount_path)
                usage = shutil.disk_usage(root)
                location.free_bytes = usage.free
                location.total_bytes = usage.total
                location.health = "ok"
            except (OSError, ValueError):
                location.free_bytes = None
                location.total_bytes = None
                location.health = "unavailable"
            location.checked_at = now_utc_naive()
        await db.commit()


async def run_transfer(transfer_id, lease):
    stop = threading.Event()
    lease_failed = threading.Event()

    async def monitor():
        last_space = 0
        while not stop.is_set():
            try:
                # Loss of the session owning the advisory lock stops rsync, never proceeds to cleanup.
                await lease.execute(text("SELECT 1"))
                if time.monotonic() - last_space > 15:
                    await refresh_storage()
                    last_space = time.monotonic()
                async with AsyncSessionLocal() as db:
                    job = await db.get(StorageTransfer, transfer_id)
                    if SHUTDOWN.is_set() or job.desired_state != "run":
                        stop.set()
                    job.worker_seen_at = now_utc_naive()
                    await db.commit()
                    HEARTBEAT.touch()
            except Exception:
                lease_failed.set()
                stop.set()
                log.exception("Transfert interrompu : verrou ou base indisponible")
            await asyncio.sleep(1)

    watch = asyncio.create_task(monitor())
    try:
        async with AsyncSessionLocal() as db:
            job = await db.get(StorageTransfer, transfer_id)
            job.status = "running"
            job.error = None
            await db.commit()
            items = (
                (
                    await db.execute(
                        select(StorageTransferItem)
                        .where(StorageTransferItem.transfer_id == job.id)
                        .order_by(StorageTransferItem.id)
                    )
                )
                .scalars()
                .all()
            )
            for item in items:
                if item.status == "completed":
                    continue
                if stop.is_set():
                    break
                try:
                    await process_item(db, job, item, stop)
                except Interrompu:
                    break
                except Exception as exc:
                    log.exception("Titre %s reporté", item.id)
                    await update_item(db, item, "blocked", str(exc))
            await db.refresh(job)
            if stop.is_set():
                job.status = (
                    "paused"
                    if job.desired_state == "pause"
                    else "stopped"
                    if job.desired_state == "stop"
                    else "running"
                )
            else:
                job.status = "completed" if all(i.status == "completed" for i in items) else "blocked"
            job.updated_at = now_utc_naive()
            await db.commit()
    finally:
        stop.set()
        watch.cancel()
        await asyncio.gather(watch, return_exceptions=True)
    if lease_failed.is_set():
        raise RuntimeError("Verrou perdu : arrêt du moteur avant tout autre lot.")


async def run_engine():
    if not shutil.which("rsync"):
        raise RuntimeError("rsync absent de l’image.")
    async with async_engine.connect() as lease:
        if not (await lease.execute(text("SELECT pg_try_advisory_lock(190041, 1)"))).scalar():
            raise RuntimeError("Un moteur de transfert est déjà actif.")
        await lease.commit()
        async with AsyncSessionLocal() as db:
            for job in (await db.execute(select(StorageTransfer).where(StorageTransfer.status == "running"))).scalars():
                if job.desired_state == "run" and job.auto_resume:
                    job.status = "queued"
                else:
                    job.status = "paused"
                    job.desired_state = "pause"
            await db.commit()
        while not SHUTDOWN.is_set():
            await refresh_storage()
            HEARTBEAT.touch()
            async with AsyncSessionLocal() as db:
                # A queued pause is durable even before any file starts copying.
                for job in (
                    await db.execute(
                        select(StorageTransfer).where(
                            StorageTransfer.status == "queued", StorageTransfer.desired_state != "run"
                        )
                    )
                ).scalars():
                    job.status = "paused" if job.desired_state == "pause" else "stopped"
                await db.commit()
                job = (
                    await db.execute(
                        select(StorageTransfer)
                        .where(StorageTransfer.status == "queued", StorageTransfer.desired_state == "run")
                        .order_by(StorageTransfer.id)
                        .limit(1)
                    )
                ).scalar_one_or_none()
                transfer_id = job.id if job else None
            if transfer_id:
                await run_transfer(transfer_id, lease)
            else:
                await asyncio.sleep(3)


async def main():
    from .discovery import serve_discovery

    discovery_task = asyncio.create_task(serve_discovery())
    try:
        await run_engine()
    finally:
        discovery_task.cancel()
        await asyncio.gather(discovery_task, return_exceptions=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: SHUTDOWN.set())
    asyncio.run(main())
