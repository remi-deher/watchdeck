"""Delegate moves to Arr, with durable command tracking and no local file operations."""

import asyncio
import time
from pathlib import PurePosixPath
from types import SimpleNamespace

from sqlalchemy import func, select

from ..models import ArrInstance, StorageLocation, StorageTransferItem
from ..services.plex_servers import connection_for
from ..utils import now_utc_naive
from .discovery import compatible
from .planning import absolute_path, choose_candidates, relative_path
from .service import arr_request, check_mapping, discover_instance_roots, location_json


async def route(db, instance, root, discovered):
    roots = await arr_request(instance, "GET", "rootfolder")
    declared = next((r for r in roots if r["path"].rstrip("/") == root), None)
    if not declared or declared.get("accessible") is not True or not isinstance(declared.get("freeSpace"), int):
        raise ValueError("Arr doit confirmer une racine accessible et son espace libre.")
    choices = [p for p in discovered["plex_roots"] if compatible(root, p["path"])]
    if len(choices) != 1:
        # An explicitly saved association can disambiguate non-conventional paths.
        locations = (await db.execute(select(StorageLocation))).scalars().all()
        saved = [
            m
            for location in locations
            for m in location.mappings
            if m["arr_instance_id"] == instance.id and m["arr_root"] == root
        ]
        choices = [
            p
            for p in discovered["plex_roots"]
            if any(m["plex_root"] == p["path"] and m["plex_section_id"] == p["section_id"] for m in saved)
        ]
    if len(choices) != 1:
        raise ValueError("Correspondance Arr/Plex ambiguë ou absente : associez cette racine dans Stockages.")
    plex = choices[0]
    mapping = dict(
        arr_instance_id=instance.id,
        arr_root=root,
        plex_root=plex["path"],
        plex_section_id=plex["section_id"],
        subdirectory="",
    )
    comparison = await check_mapping(db, SimpleNamespace(mappings=[mapping]), 0)
    if comparison["status"] not in ("sample_matched", "empty"):
        raise ValueError("Correspondance Arr/Plex non confirmée : déplacement refusé.")
    return declared, mapping, comparison


async def virtual_location(db, instance, root, declared, mapping):
    name = f"Arr {instance.id} · {root}"
    existing = (await db.execute(select(StorageLocation).where(StorageLocation.mount_path == ""))).scalars().all()
    location = next(
        (
            location
            for location in existing
            if len(location.mappings) == 1
            and location.mappings[0]["arr_instance_id"] == instance.id
            and location.mappings[0]["arr_root"] == root
        ),
        None,
    )
    if not location:
        location = StorageLocation(name=name, mount_path="", mappings=[mapping], reserve_bytes=0, enabled=True)
        db.add(location)
        await db.flush()
    location.mappings = [mapping]
    location.free_bytes = declared["freeSpace"]
    location.health = "arr_verified"
    location.checked_at = now_utc_naive()
    return location


async def preview_arr(db, body, capacity_overrides=None):
    instance = await db.get(ArrInstance, body.arr_instance_id)
    if not instance or not instance.enabled or instance.arr_type not in ("radarr", "sonarr"):
        raise ValueError("Choisir une instance Sonarr/Radarr active.")
    sources = list(
        dict.fromkeys(absolute_path(root) for root in (getattr(body, "source_roots", []) or [body.source_root]))
    )
    destination = absolute_path(body.destination_root)
    root_goals = getattr(body, "root_goals", {})
    if any(root not in sources or not 0 < goal <= 1000000 for root, goal in root_goals.items()):
        raise ValueError("Objectif par racine invalide.")

    def goal_for(source):
        return int(root_goals.get(source, body.goal_gb) * 1e9)

    if any(
        source == destination or source.startswith(destination + "/") or destination.startswith(source + "/")
        for source in sources
    ):
        raise ValueError("Les racines source et destination doivent être distinctes et non imbriquées.")
    if any(a != b and a.startswith(b + "/") for a in sources for b in sources):
        raise ValueError("Les racines source ne doivent pas être imbriquées.")
    discovered = await discover_instance_roots(db, instance)
    dst, dm, _ = await route(db, instance, destination, discovered)
    if capacity_overrides is not None:
        dst = {**dst, "freeSpace": capacity_overrides[destination]}
    source_routes = []
    for source in sources:
        src, sm, comparison = await route(db, instance, source, discovered)
        if capacity_overrides is not None:
            src = {**src, "freeSpace": capacity_overrides[source]}
        if sm["plex_section_id"] != dm["plex_section_id"]:
            raise ValueError("Le déplacement doit rester dans la même bibliothèque Plex.")
        if comparison["status"] != "sample_matched":
            raise ValueError("Aucun fichier source permettant de confirmer la correspondance.")
        sl = await virtual_location(db, instance, source, src, sm)
        source_routes.append((source, src, sm, sl))
    kind = "movie" if instance.arr_type == "radarr" else "series"
    occupied = set(
        (
            await db.execute(
                select(StorageTransferItem.arr_instance_id, StorageTransferItem.arr_id).where(
                    StorageTransferItem.status != "completed",
                    StorageTransferItem.transfer_id != getattr(body, "task_id", 0),
                )
            )
        ).all()
    )
    reserved = (
        await db.execute(
            select(func.coalesce(func.sum(StorageTransferItem.size_bytes), 0)).where(
                StorageTransferItem.arr_instance_id == instance.id,
                StorageTransferItem.snapshot["destination_root"].as_string() == destination,
                StorageTransferItem.status != "completed",
                StorageTransferItem.transfer_id != getattr(body, "task_id", 0),
            )
        )
    ).scalar()
    candidates = []
    for media in await arr_request(instance, "GET", kind):
        matching = next((entry for entry in source_routes if relative_path(media["path"], entry[0])), None)
        if matching is None:
            continue
        source, src, sm, sl = matching
        if body.mode == "minimum_free" and src["freeSpace"] >= goal_for(source):
            continue
        relative = relative_path(media["path"], source)
        if (
            not relative
            or "/" in relative
            or (instance.id, media["id"]) in occupied
            or body.media_type not in ("all", kind)
        ):
            continue
        size = media.get("sizeOnDisk") or media.get("statistics", {}).get("sizeOnDisk") or 0
        candidates.append(
            dict(
                key=f"{instance.id}:{media['id']}",
                arr_instance_id=instance.id,
                arr_id=media["id"],
                title=media["title"],
                media_type=kind,
                size_bytes=int(size),
                snapshot=dict(
                    source_location_id=sl.id,
                    source_arr=media["path"],
                    destination_arr=destination + "/" + relative,
                    destination_root=destination,
                    source_plex=sm["plex_root"] + "/" + relative,
                    destination_plex=dm["plex_root"] + "/" + relative,
                    plex_section_id=sm["plex_section_id"],
                    tmdb_id=media.get("tmdbId"),
                    tvdb_id=media.get("tvdbId"),
                ),
            )
        )
    # Minimum-free applies to each source, not the sum of potentially shared disks.
    if body.mode == "minimum_free" or root_goals:
        chosen, excluded, requested = [], [], 0
        covered = True
        available = max(0, dst["freeSpace"] - int(reserved))
        for source, src, sm, sl in source_routes:
            part = choose_candidates(
                [item for item in candidates if item["snapshot"]["source_location_id"] == sl.id],
                body.mode,
                goal_for(source),
                src["freeSpace"],
                available,
                max(1, body.max_titles - len(chosen)),
                set(body.selection) if body.selection is not None else None,
            )
            if len(chosen) >= body.max_titles:
                part["excluded"].extend(dict(item, explanation="Limite de titres atteinte") for item in part["items"])
                part["items"] = []
                part["planned_bytes"] = 0
            covered = covered and part["planned_bytes"] >= part["requested_bytes"]
            chosen.extend(part["items"])
            excluded.extend(part["excluded"])
            requested += part["requested_bytes"]
            available -= part["planned_bytes"]
        total = sum(item["size_bytes"] for item in chosen)
        result = dict(
            items=chosen,
            excluded=excluded,
            planned_bytes=total,
            requested_bytes=requested,
            goal_covered=covered,
            remaining_capacity_bytes=available,
        )
    else:
        result = choose_candidates(
            candidates,
            body.mode,
            int(body.goal_gb * 1e9),
            None,
            max(0, dst["freeSpace"] - int(reserved)),
            body.max_titles,
            set(body.selection) if body.selection is not None else None,
        )
    dl = await virtual_location(db, instance, destination, dst, dm)
    result.update(
        source=location_json(source_routes[0][3]),
        sources=[location_json(entry[3]) for entry in source_routes],
        destination=location_json(dl),
        note="Arr gère le déplacement. Pause/arrêt suspendent les prochains titres ; une commande déjà confiée à Arr peut continuer.",
    )
    return result


async def process_arr(db, job, item, stop):
    from .integrite import Interrompu
    from .worker import confirm_media_identity, is_playing, no_arr_download, plex_files, plex_get, update_item

    instance = await db.get(ArrInstance, item.arr_instance_id)
    if not instance or not instance.enabled:
        raise ValueError("Instance Arr indisponible.")
    snap = dict(item.snapshot)
    resource = "movie" if item.media_type == "movie" else "series"
    conn = await connection_for(db, instance.plex_server_id)
    if not conn:
        raise ValueError("Connexion Plex indisponible.")
    if not snap.get("arr_command_id"):
        if snap.get("arr_submission_intent"):
            raise ValueError(
                "Envoi Arr incertain après interruption : contrôler la commande dans Arr avant toute nouvelle soumission."
            )
        discovered = await discover_instance_roots(db, instance)
        for side in ("source", "destination"):
            declared, _, _ = await route(db, instance, str(PurePosixPath(snap[side + "_arr"]).parent), discovered)
            if side == "destination" and declared["freeSpace"] < item.size_bytes:
                raise ValueError("Espace destination insuffisant au moment du déplacement.")
        media = await arr_request(instance, "GET", f"{resource}/{item.arr_id}")
        if media["path"] != snap["source_arr"]:
            raise ValueError("Chemin Arr modifié depuis l’aperçu.")
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
        originals = await plex_files(conn, snap["plex_section_id"], snap["source_plex"], item.media_type)
        await confirm_media_identity(conn, originals, snap, item.media_type)
        if stop.is_set():
            raise Interrompu()
        snap["original_plex"] = originals
        snap["arr_submission_intent"] = True
        await update_item(db, item, "arr_pending", snapshot=snap)
        command = await arr_request(
            instance,
            "POST",
            "command",
            dict(
                name="BulkMoveMovie" if resource == "movie" else "BulkMoveSeries",
                destinationRootFolder=snap["destination_root"],
                **{
                    "movies" if resource == "movie" else "series": [
                        {
                            "movieId" if resource == "movie" else "seriesId": item.arr_id,
                            "sourcePath": snap["source_arr"],
                        }
                    ]
                },
            ),
        )
        snap["arr_command_id"] = command["id"]
        await update_item(db, item, "arr_pending", snapshot=snap)
    while True:
        if stop.is_set():
            raise Interrompu()
        command = await arr_request(instance, "GET", f"command/{snap['arr_command_id']}")
        if command["status"] in ("failed", "aborted", "cancelled"):
            raise ValueError("La commande de déplacement Arr a échoué : vérifier ses journaux.")
        if command["status"] == "completed":
            break
        await asyncio.sleep(3)
    media = await arr_request(instance, "GET", f"{resource}/{item.arr_id}")
    if media["path"] != snap["destination_arr"]:
        raise ValueError("Commande terminée mais chemin destination non confirmé par Arr.")
    await plex_get(conn, f"/library/sections/{snap['plex_section_id']}/refresh", {"path": snap["destination_plex"]})
    destination = await plex_files(conn, snap["plex_section_id"], snap["destination_plex"], item.media_type)
    if destination != snap["original_plex"]:
        await update_item(db, item, "plex_pending", "Déplacement Arr terminé ; confirmation des fiches Plex attendue.")
        return
    await confirm_media_identity(conn, destination, snap, item.media_type)
    await update_item(db, item, "completed")
