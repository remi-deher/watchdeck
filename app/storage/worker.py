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
from sqlalchemy import and_, or_, select, text

from ..database import AsyncSessionLocal, async_engine
from ..models import ArrInstance, StorageLocation, StorageTransfer, StorageTransferItem
from ..services.plex_servers import connection_for
from ..utils import now_utc_naive
from . import integrite, ssh_hash
from .integrite import Interrompu, copier_fichier, verifier_dossier
from .local_mounts import mounted_root  # re-exported for discovery and existing callers
from .service import arr_request

log = logging.getLogger(__name__)
VIDEO = (".mkv", ".mp4", ".avi", ".m4v", ".mov", ".ts", ".m2ts", ".wmv")
SHUTDOWN = threading.Event()
HEARTBEAT = Path("/tmp/watchdeck-transfers-heartbeat")


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
    from .preview_cache import read_inventory

    return await read_inventory(
        ("plex", conn.url, conn.token, path, tuple(sorted((params or {}).items()))),
        lambda: _plex_get(conn, path, params),
    )


async def _plex_get(conn, path, params=None):
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(
            conn.url.rstrip("/") + path,
            params=params,
            headers={"X-Plex-Token": conn.token, "Accept": "application/json"},
        )
        response.raise_for_status()
        return response.json().get("MediaContainer", {}) if response.content else {}


def _files_under_root(items, root):
    result = {}
    prefix = root.rstrip("/") + "/"
    for item in items:
        rating_key = item.get("ratingKey")
        if not rating_key:
            continue
        for media in item.get("Media", []):
            for part in media.get("Part", []):
                name = part.get("file", "")
                if name.startswith(prefix) and name.lower().endswith(VIDEO):
                    result.setdefault(name[len(prefix) :], set()).add(str(rating_key))
    return {name: sorted(keys) for name, keys in result.items()}


def plex_title_queries(title, snapshot):
    """Bounded searches for Arr aliases; paths and provider IDs remain the proof."""
    import re

    queries = []
    names = [title, *snapshot.get("alternate_titles", [])]
    for name in names:
        if not isinstance(name, str) or not name.strip():
            continue
        name = name.strip()
        clean = re.sub(r"\s*[\[(]?(?:19|20)\d{2}[\])]?$", "", name).strip()
        for query in (name, clean, clean.split(":", 1)[0].strip()):
            if query and query not in queries:
                queries.append(query)
    # Plex sometimes uses a shortened or translated subtitle. The prefix only
    # discovers candidates; it never replaces the path and TMDB/TVDB checks.
    prefix = " ".join(re.split(r"[:\s]+", title.strip())[:3])
    if prefix and prefix not in queries:
        queries.append(prefix)
    return queries[:12]


async def plex_files(conn, section, root, kind, *, snapshot=None, title=None, rating_keys=None, db=None):
    """Read files for one title when its identity is known; keep full enumeration for root setup checks."""
    if rating_keys is not None:
        keys = sorted({str(key) for values in rating_keys.values() for key in values})
        result = {}
        for start in range(0, len(keys), 50):
            data = await plex_get(
                conn,
                "/library/metadata/" + ",".join(keys[start : start + 50]),
                {"includeMedia": 1},
            )
            result.update(_files_under_root(data.get("Metadata", []), root))
        return result

    if snapshot is not None and title:
        provider = "tvdb" if kind == "series" else "tmdb"
        expected_guid = f"{provider}://{snapshot.get(provider + '_id')}"
        search_snapshot = dict(snapshot)
        if db is not None and getattr(conn, "id", None) and snapshot.get(provider + "_id"):
            from ..models import LibraryItem, LibraryItemLocation

            # The local Plex mirror supplies translated names without a library
            # scan. It only locates candidates; live files and IDs are rechecked.
            names = (
                (
                    await db.execute(
                        select(LibraryItem.title)
                        .join(LibraryItemLocation, LibraryItemLocation.library_item_id == LibraryItem.id)
                        .where(
                            LibraryItemLocation.server_id == conn.id,
                            getattr(LibraryItem, provider + "_id") == str(snapshot[provider + "_id"]),
                        )
                        .limit(12)
                    )
                )
                .scalars()
                .all()
            )
            search_snapshot["alternate_titles"] = [*names, *snapshot.get("alternate_titles", [])]
        seen = set()
        moved_paths = []
        known = []
        if db is not None and getattr(conn, "url", None) and snapshot.get(provider + "_id"):
            from .inventory import candidate_keys

            known = await candidate_keys(db, conn, kind, snapshot[provider + "_id"])
        for query in [None] * bool(known) + plex_title_queries(title, search_snapshot):
            try:
                data = await plex_get(
                    conn,
                    "/library/metadata/" + ",".join(known) if query is None else f"/library/sections/{section}/all",
                    {"includeMedia": 1, "includeGuids": 1}
                    if query is None
                    else {"type": 2 if kind == "series" else 1, "title": query, "includeMedia": 1, "includeGuids": 1},
                )
            except httpx.HTTPStatusError as exc:
                if query is None and exc.response.status_code == 404:
                    continue
                raise
            matches = []
            for item in data.get("Metadata", []):
                key = item.get("ratingKey")
                if query is None and str(item.get("librarySectionID")) != str(section):
                    continue
                if not key or str(key) in seen:
                    continue
                seen.add(str(key))
                guids = {g.get("id") for g in item.get("Guid", [])}
                if guids and expected_guid not in guids:
                    continue
                leaves = [item]
                if kind == "series":
                    all_leaves = await plex_get(conn, f"/library/metadata/{key}/allLeaves", {"includeMedia": 1})
                    leaves = all_leaves.get("Metadata", [])
                files = _files_under_root(leaves, root)
                if query is None and expected_guid in guids:
                    from .inventory import files_from_metadata, safe_record_plex

                    current_files = files_from_metadata(leaves)
                    await safe_record_plex(
                        conn,
                        [
                            dict(
                                title=item.get("title", title),
                                rating_key=str(key),
                                media_type="show" if kind == "series" else "movie",
                                storage_section_id=str(section),
                                storage_files=current_files,
                                **{provider + "_id": str(snapshot[provider + "_id"])},
                            )
                        ],
                    )
                    if not files:
                        moved_paths.extend(f["path"] for f in current_files)
                if files:
                    matches.append(files)
            if len(matches) > 1:
                raise ValueError("Plusieurs fiches Plex correspondent à ce titre et à son identifiant.")
            if matches:
                return matches[0]
        if moved_paths:
            raise ValueError(
                "Plex indique un nouvel emplacement : "
                + ", ".join(sorted(set(moved_paths))[:3])
                + ". Modifiez les réglages et préparez un nouvel aperçu."
            )
        return {}

    # Only association setup uses this broad, paginated inventory. Transfer
    # workers pass either the Arr identity or the Plex ratingKeys above.
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


async def validate_transfer_roots(db, job, items):
    """Validate every selected Arr root once before the lot touches its first title."""
    if not items:
        return
    instances = {}
    root_paths = {}
    needed_by_destination = {}
    mappings = set()
    for item in items:
        instance_id = item.arr_instance_id
        instance = instances.get(instance_id)
        if instance is None:
            instance = await db.get(ArrInstance, instance_id)
            if not instance or not instance.enabled:
                raise ValueError("Instance Arr indisponible au démarrage du lot.")
            instances[instance_id] = instance
            root_paths[instance_id] = set()
        snapshot = item.snapshot
        for side in ("source", "destination"):
            arr_root = str(PurePosixPath(snapshot[f"{side}_arr"]).parent).rstrip("/") or "/"
            plex_root = str(PurePosixPath(snapshot[f"{side}_plex"]).parent)
            root_paths[instance_id].add(arr_root)
            mappings.add((instance_id, arr_root, plex_root, str(snapshot["plex_section_id"])))
        if job.params.get("transfer_mode") == "arr":
            destination_root = str(PurePosixPath(snapshot["destination_arr"]).parent).rstrip("/") or "/"
            key = (instance_id, destination_root)
            needed_by_destination[key] = needed_by_destination.get(key, 0) + int(item.size_bytes)

    from .arr_transfer import snapshot_mapping_matches

    for instance_id, arr_root, plex_root, section_id in mappings:
        if not await snapshot_mapping_matches(db, instances[instance_id], arr_root, plex_root, section_id):
            raise ValueError("Une correspondance Arr/Plex du lot a changé depuis sa préparation.")

    live_by_instance = {}
    for instance_id, instance in instances.items():
        live_roots = await arr_request(instance, "GET", "rootfolder")
        live_by_instance[instance_id] = {str(root.get("path", "")).rstrip("/") or "/": root for root in live_roots}
        for root_path in root_paths[instance_id]:
            root = live_by_instance[instance_id].get(root_path)
            if not root or root.get("accessible") is not True:
                raise ValueError(f"Arr ne confirme plus l’accès à la racine {root_path} du lot.")

    if job.params.get("transfer_mode") == "arr":
        for (instance_id, root_path), needed in needed_by_destination.items():
            root = live_by_instance[instance_id][root_path]
            free_space = root.get("freeSpace")
            if not isinstance(free_space, int) or free_space < needed:
                raise ValueError(f"Espace Arr insuffisant sur {root_path} pour lancer le lot entier.")


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
    if status == "completed" and (previous != "completed" or not telemetry.get("finished_at")):
        telemetry["finished_at"] = now_utc_naive().isoformat()
    item.progress = telemetry
    item.status = status
    if status in ("completed", "cancelled"):
        item.claimed = False
    item.reason = reason
    item.updated_at = now_utc_naive()
    for key, value in changes.items():
        setattr(item, key, value)
    await db.commit()


async def process_item(db, job, item, stop, *, finalize_only=False, preflight_validated=False):
    if not item.claimed:
        raise ValueError("Ce titre n’est pas réservé par une tâche active ; relancez la tâche pour le vérifier.")
    if not preflight_validated and not finalize_only:
        await validate_transfer_roots(db, job, [item])
    if job.params.get("transfer_mode", "rsync") == "arr":
        from .arr_transfer import process_arr

        return await process_arr(db, job, item, stop, finalize_only=finalize_only)
    snap = dict(item.snapshot)
    fs = None
    if job.params.get("transfer_mode") in ("rsync_ssh", "rsync_local"):
        from .access import filesystem_for

        fs = await filesystem_for(db, job, snap)
    path_for = (lambda root, relative: fs.path(str(PurePosixPath(root) / relative))) if fs else local_media
    read_inventory = fs.inventory if fs else inventory
    signature_of = fs.signature if fs else integrite.signature
    hash_file = fs.hash if fs else integrite.empreinte
    copy_file = fs.copy if fs else lambda source, target, *args: copier_fichier(str(source), str(target), *args)
    verify_folder = fs.verify if fs else verifier_dossier
    free_space = fs.free if fs else lambda path: shutil.disk_usage(path).free
    from .peer_fs import PeerFilesystem

    src = path_for(snap["source_mount"], snap["relative"])
    dst = (
        fs.path(str(PurePosixPath(snap["destination_mount"]) / snap["relative"]), "destination")
        if isinstance(fs, PeerFilesystem)
        else path_for(snap["destination_mount"], snap["relative"])
    )
    if src == dst or (not fs and src.exists() and dst.exists() and os.path.samefile(src, dst)):
        raise ValueError("Source et destination identiques.")
    instance = await db.get(ArrInstance, item.arr_instance_id)
    if not instance or not instance.enabled:
        raise ValueError("Instance Arr indisponible.")
    conn = await connection_for(db, instance.plex_server_id)
    if not conn:
        raise ValueError("Serveur Plex indisponible.")
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
    if finalize_only and media["path"] != snap["destination_arr"]:
        raise ValueError("Chemin Arr non confirmé : finalisation refusée, original conservé.")
    if media["path"] not in (snap["source_arr"], snap["destination_arr"]):
        raise ValueError("Le chemin Arr a changé depuis l’aperçu.")
    await no_arr_download(instance, item)
    if await is_playing(conn, snap):
        if finalize_only:
            await update_item(
                db, item, "plex_pending", "Lecture Plex active : original conservé, finalisation reportée."
            )
            return
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
        snap["original_plex"] = await plex_files(
            conn,
            snap["plex_section_id"],
            snap["source_plex"],
            item.media_type,
            snapshot=snap,
            title=item.title,
            db=db,
        )
        if not snap["original_plex"] or any(len(keys) != 1 for keys in snap["original_plex"].values()):
            raise ValueError("Les fiches Plex originales ne sont pas identifiées de façon unique.")
        await confirm_media_identity(conn, snap["original_plex"], snap, item.media_type)
        if not src.is_dir():
            raise ValueError("Source absente.")
        snap["files"] = await asyncio.to_thread(read_inventory, src)
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
            if signature_of(dst / name) != signature:
                raise ValueError("Destination modifiée après interruption du nettoyage.")
    # A crash after deletion is only accepted with a previously committed cleanup intent.
    if not src.exists():
        if not snap.get("cleanup_intent"):
            raise ValueError("Source absente sans intention de nettoyage enregistrée.")
        for name, proof in item.proofs.items():
            if signature_of(dst / name) != snap.get("cleanup_signatures", {}).get(name):
                raise ValueError("Destination modifiée après interruption du nettoyage.")
            if proof.get("sha256") and await asyncio.to_thread(hash_file, dst / name, stop) != proof["sha256"]:
                raise ValueError("Intégrité destination incorrecte après interruption du nettoyage.")
        if (
            await plex_files(
                conn,
                snap["plex_section_id"],
                snap["destination_plex"],
                item.media_type,
                rating_keys=snap["original_plex"],
            )
            != snap["original_plex"]
        ):
            raise ValueError("Confirmation Plex manquante après nettoyage.")
        await update_item(db, item, "completed", progress={"plex_source_refresh_pending": True})
        return
    if media["path"] == snap["source_arr"]:
        destination = await db.get(StorageLocation, job.destination_id)
        needed = sum((src / name).stat().st_size for name in snap["files"])
        if free_space(dst.parent) - needed < destination.reserve_bytes:
            raise ValueError("Réserve de destination insuffisante au début de la copie.")
        if dst.exists():
            found = await asyncio.to_thread(read_inventory, dst, False)
            if any(name.removesuffix(".partiel") not in snap["files"] for name in found):
                raise ValueError("La destination contient des fichiers étrangers au titre.")
            existing_plex = await plex_files(
                conn,
                snap["plex_section_id"],
                snap["destination_plex"],
                item.media_type,
                snapshot=snap,
                title=item.title,
                db=db,
            )
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
            snap["temporary_files"] = list(dict.fromkeys([*snap.get("temporary_files", []), name]))
            await update_item(db, item, "copying", snapshot=dict(snap))

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

            proof = await asyncio.to_thread(copy_file, source, target, advance, stop, proofs.get(name), phase, mode)
            proofs[name] = proof
            await progress(name, source.stat().st_size)
            base[0] += source.stat().st_size
            await update_item(db, item, "copying", proofs=dict(proofs))
        await update_item(db, item, "verifying")
        await asyncio.to_thread(verify_folder, src, dst, stop, proofs, mode)
        if await is_playing(conn, snap):
            await update_item(db, item, "deferred", "Lecture active : bascule reportée.")
            return
        await no_arr_download(instance, item)
        if stop.is_set():
            raise Interrompu()
        from .switch_guard import confirm_complete

        media = await confirm_complete(
            instance,
            item,
            snap,
            await asyncio.to_thread(read_inventory, src, False),
            await asyncio.to_thread(read_inventory, dst, False),
            arr_request,
        )
        if stop.is_set():
            raise Interrompu()
        await update_item(db, item, "switching")
        media.update(path=snap["destination_arr"], rootFolderPath=snap["destination_root"])
        await arr_request(instance, "PUT", f"{resource}/{item.arr_id}?moveFiles=false", media)
    if stop.is_set():
        raise Interrompu()
    if not finalize_only:
        await rescan_arr(instance, item, resource, snap, stop)
        await update_item(
            db,
            item,
            "plex_pending",
            "Copie terminée · finalisation Plex en arrière-plan ; original conservé.",
        )
        return
    media = await arr_request(instance, "GET", f"{resource}/{item.arr_id}")
    files = await arr_request(
        instance,
        "GET",
        f"moviefile?movieId={item.arr_id}" if item.media_type == "movie" else f"episodefile?seriesId={item.arr_id}",
    )
    expected = {n.replace(os.sep, "/") for n in snap["files"] if n.lower().endswith(VIDEO)}
    if media["path"] != snap["destination_arr"] or not expected.issubset({f.get("relativePath", "") for f in files}):
        raise ValueError("Arr ne reconnaît pas tous les fichiers destination : original conservé.")
    recognized = await plex_files(
        conn,
        snap["plex_section_id"],
        snap["destination_plex"],
        item.media_type,
        rating_keys=snap["original_plex"],
    )
    if any(snap["original_plex"].get(name) != keys for name, keys in recognized.items()):
        raise ValueError("Destination associée à une autre fiche Plex : original conservé, contrôle nécessaire.")
    if recognized != snap["original_plex"]:
        await update_item(
            db,
            item,
            "plex_pending",
            "Copie terminée · destination non confirmée sur la même fiche Plex ; original conservé.",
        )
        return
    if await is_playing(conn, snap):
        await update_item(db, item, "plex_pending", "Lecture active : nettoyage reporté, original conservé.")
        return
    await no_arr_download(instance, item)
    remaining = await asyncio.to_thread(read_inventory, src, False)
    destination_files = await asyncio.to_thread(read_inventory, dst, False)
    if set(destination_files) != set(snap["files"]) or not set(remaining).issubset(snap["files"]):
        raise ValueError("Inventaire modifié : nettoyage refusé.")
    if not snap.get("cleanup_intent") and set(remaining) != set(snap["files"]):
        raise ValueError("Fichiers source disparus : nettoyage refusé.")
    proofs = dict(item.proofs)
    await asyncio.to_thread(verify_folder, src, dst, stop, proofs, mode)
    snap["cleanup_signatures"] = {name: signature_of(dst / name) for name in snap["files"]}
    if await is_playing(conn, snap):
        await update_item(db, item, "plex_pending", "Lecture active : nettoyage reporté, original conservé.")
        return
    await no_arr_download(instance, item)
    snap["cleanup_intent"] = True
    await update_item(db, item, "cleaning", proofs=proofs, snapshot=snap)
    if stop.is_set():
        raise Interrompu()
    path_for(snap["source_mount"], snap["relative"])
    path_for(snap["destination_mount"], snap["relative"])
    if fs:
        await asyncio.to_thread(fs.remove, src, dst, snap["files"], snap["cleanup_signatures"], dict(item.proofs))
    else:
        await asyncio.to_thread(shutil.rmtree, src)
    await update_item(db, item, "completed", progress={"plex_source_refresh_pending": True})


async def rescan_arr(instance, item, resource, snap, stop):
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
    from .plex_finalization import FINALIZATION_STATES, MUTATION_LOCK, transfer_status

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
            active_items = [
                item
                for item in items
                if item.claimed and item.status not in ("completed", *FINALIZATION_STATES, "cancelled")
            ]
            preflight_error = None
            try:
                await validate_transfer_roots(db, job, active_items)
            except Exception as exc:
                preflight_error = str(exc)
                log.warning("Lot %s bloqué avant son premier titre : %s", job.id, preflight_error)
                for item in active_items:
                    await update_item(db, item, "blocked", preflight_error)
            for item in items:
                if preflight_error:
                    break
                if item.status in ("completed", *FINALIZATION_STATES):
                    continue
                if stop.is_set():
                    break
                try:
                    async with MUTATION_LOCK:
                        await process_item(db, job, item, stop, preflight_validated=True)
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
                    else "cancelling"
                    if job.desired_state == "cancel"
                    else "running"
                )
            else:
                for item in items:
                    await db.refresh(item)
                job.status = transfer_status(items)
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
            for job in (
                await db.execute(select(StorageTransfer).where(StorageTransfer.status.in_(["running", "finalizing"])))
            ).scalars():
                if job.desired_state == "run" and job.auto_resume:
                    job.status = "finalizing" if job.status == "finalizing" else "queued"
                elif job.desired_state == "cancel":
                    job.status = "cancelling"
                else:
                    job.status = "paused"
                    job.desired_state = "pause"
            await db.commit()
        from .plex_finalization import MUTATION_LOCK, run_finalizer

        finalizer = asyncio.create_task(run_finalizer(SHUTDOWN))

        def finalizer_done(task):
            if not task.cancelled() and task.exception():
                SHUTDOWN.set()

        finalizer.add_done_callback(finalizer_done)
        try:
            while not SHUTDOWN.is_set():
                await refresh_storage()
                HEARTBEAT.touch()
                async with AsyncSessionLocal() as db:
                    # A queued pause is durable even before any file starts copying.
                    for job in (
                        await db.execute(
                            select(StorageTransfer).where(
                                StorageTransfer.status.in_(["queued", "finalizing"]),
                                StorageTransfer.desired_state != "run",
                            )
                        )
                    ).scalars():
                        job.status = (
                            "paused"
                            if job.desired_state == "pause"
                            else "cancelling"
                            if job.desired_state == "cancel"
                            else "stopped"
                        )
                    await db.commit()
                    cancellation = (
                        await db.execute(
                            select(StorageTransfer)
                            .where(
                                StorageTransfer.desired_state == "cancel",
                                or_(
                                    StorageTransfer.status == "cancelling",
                                    and_(
                                        StorageTransfer.status.in_(["cancelled", "completed"]),
                                        StorageTransfer.params["delete_after_cancel"].as_boolean().is_(True),
                                    ),
                                ),
                            )
                            .order_by(StorageTransfer.id)
                            .limit(1)
                        )
                    ).scalar_one_or_none()
                    if cancellation:
                        from .cancellation import cancel_transfer

                        async def heartbeat():
                            while True:
                                HEARTBEAT.touch()
                                await asyncio.sleep(1)

                        pulse = asyncio.create_task(heartbeat())
                        try:
                            async with MUTATION_LOCK:
                                cancellation_done = await cancel_transfer(db, cancellation, lease)
                        finally:
                            pulse.cancel()
                            await asyncio.gather(pulse, return_exceptions=True)
                        if cancellation_done:
                            await asyncio.sleep(1)
                            continue
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

        finally:
            SHUTDOWN.set()
            await finalizer


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
