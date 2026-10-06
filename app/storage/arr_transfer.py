"""Delegate moves to Arr, with durable command tracking and no local file operations."""

import asyncio
import time
from pathlib import PurePosixPath
from types import SimpleNamespace

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..database import AsyncSessionLocal
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
    # An explicitly configured association takes precedence over a path-name
    # heuristic. Virtual rows are temporary preview capacity records, not saved
    # configuration. If one contains a non-obvious association, ask the user to
    # save it from Stockages instead of silently trusting a generated row.
    try:
        locations = (await db.execute(select(StorageLocation))).scalars().all()
    except AttributeError:  # Small test doubles may not implement a DB query.
        locations = []
    persistent = [location for location in locations if location.virtual_key is None]
    saved = [
        m
        for location in persistent
        for m in location.mappings
        if m["arr_instance_id"] == instance.id and m["arr_root"] == root
    ]
    temporary = [
        m
        for location in locations
        if location.virtual_key is not None
        for m in location.mappings
        if m["arr_instance_id"] == instance.id and m["arr_root"] == root
    ]
    saved_pairs = {(m["plex_root"], str(m["plex_section_id"])) for m in saved}
    if len(saved_pairs) > 1:
        raise ValueError("Plusieurs correspondances sont enregistrées pour cette racine : corrigez Stockages.")
    if saved_pairs:
        plex_root, section_id = next(iter(saved_pairs))
        choices = [p for p in discovered["plex_roots"] if p["path"] == plex_root and str(p["section_id"]) == section_id]
    else:
        choices = [p for p in discovered["plex_roots"] if compatible(root, p["path"])]
        temporary_pairs = {(m["plex_root"], str(m["plex_section_id"])) for m in temporary}
        if temporary_pairs and (
            len(temporary_pairs) > 1
            or not choices
            or next(iter(temporary_pairs)) != (choices[0]["path"], str(choices[0]["section_id"]))
        ):
            raise ValueError(
                "Cette correspondance existe seulement dans un stockage temporaire : enregistrez-la dans Stockages."
            )
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
    from .mapping_proofs import get

    comparison = None
    try:
        comparison = await get(instance, discovered, mapping)
    except Exception:
        # Redis is an optimization only; if unavailable, keep the full safety check.
        comparison = None
    if comparison is None:
        comparison = await check_mapping(db, SimpleNamespace(mappings=[mapping]), 0, discovered=discovered)
    if comparison["status"] not in ("sample_matched", "empty"):
        failures = [
            f"{item['title']} : {item.get('reason', item['status'])}"
            for item in comparison.get("items", [])
            if item["status"] != "matched"
        ]
        detail = " ; ".join(failures[:5])
        raise ValueError(
            "Correspondance Arr/Plex non confirmée : déplacement refusé." + (" " + detail if detail else "")
        )
    return declared, mapping, comparison


async def snapshot_mapping_matches(db, instance, root, plex_root, plex_section_id):
    """Compare a planned mapping with saved settings without rescanning Plex."""
    try:
        locations = (await db.execute(select(StorageLocation))).scalars().all()
    except AttributeError:  # Small test doubles may only exercise path heuristics.
        locations = []
    persistent = [location for location in locations if location.virtual_key is None]
    configured = [
        mapping
        for location in persistent
        for mapping in location.mappings
        if mapping["arr_instance_id"] == instance.id and mapping["arr_root"] == root
    ]
    if not configured:
        configured = [
            mapping
            for location in locations
            if location.virtual_key is not None
            for mapping in location.mappings
            if mapping["arr_instance_id"] == instance.id and mapping["arr_root"] == root
        ]
    pairs = {(mapping["plex_root"], str(mapping["plex_section_id"])) for mapping in configured}
    if len(pairs) > 1:
        raise ValueError("Plusieurs correspondances sont enregistrées pour cette racine : corrigez Stockages.")
    if pairs:
        return next(iter(pairs)) == (plex_root, str(plex_section_id))
    # Older jobs may have been prepared from the deterministic path heuristic
    # before the user saved an explicit association.
    return compatible(root, plex_root)


async def virtual_location(db, instance, root, declared, mapping):
    name = f"Arr {instance.id} · {root}"
    virtual_key = f"{instance.id}:{root}"
    free_space = declared.get("freeSpace")
    health = "arr_verified" if isinstance(free_space, int) else "unknown"
    checked_at = now_utc_naive() if isinstance(free_space, int) else None
    # Commit this small registry row independently. Otherwise its unique-key
    # insert would remain uncommitted during the slow Arr/Plex inventory scan,
    # making another read-only preview for the same root wait behind it.
    async with AsyncSessionLocal() as registry:
        location_id = await registry.scalar(
            pg_insert(StorageLocation)
            .values(
                virtual_key=virtual_key,
                name=name,
                mount_path="",
                mappings=[mapping],
                reserve_bytes=0,
                enabled=True,
                free_bytes=free_space,
                health=health,
                checked_at=checked_at,
            )
            .on_conflict_do_update(
                index_elements=[StorageLocation.virtual_key],
                set_={
                    "name": name,
                    "mappings": [mapping],
                    "free_bytes": free_space,
                    "health": health,
                    "checked_at": checked_at,
                },
            )
            .returning(StorageLocation.id)
        )
        await registry.commit()
    location = await db.get(StorageLocation, location_id)
    if not location:
        raise RuntimeError("Impossible de réserver la racine Arr comme stockage virtuel.")
    location.name = name
    location.mappings = [mapping]
    location.free_bytes = free_space
    location.health = health
    location.checked_at = checked_at
    return location


async def configured_route(db, instance, root):
    """Validate only the selected route when calculating a preview."""
    locations = (await db.execute(select(StorageLocation))).scalars().all()
    mappings = [
        mapping
        for location in locations
        if location.virtual_key is None
        for mapping in location.mappings
        if mapping["arr_instance_id"] == instance.id and mapping["arr_root"] == root
    ]
    pairs = {(m["plex_root"], str(m["plex_section_id"])) for m in mappings}
    if len(pairs) != 1:
        raise ValueError(
            f"Aucune correspondance enregistrée et unique pour {root}. Configurez-la dans Stockages avant l’aperçu."
        )
    plex_root, section_id = next(iter(pairs))
    mapping = next(m for m in mappings if (m["plex_root"], str(m["plex_section_id"])) == (plex_root, section_id))
    from .preview_cache import read_inventory

    discovered = await read_inventory(("storage_roots", instance.id), lambda: discover_instance_roots(db, instance))
    declared, mapping, _ = await route(db, instance, root, discovered)
    location = await virtual_location(db, instance, root, declared, mapping)
    return declared, mapping, location


async def preview_arr(db, body, capacity_overrides=None):
    from .preview_progress import report

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
    await report("Lecture des correspondances enregistrées…")
    dst, dm, dl = await configured_route(db, instance, destination)
    if capacity_overrides is not None:
        dst = {**dst, "freeSpace": capacity_overrides.get(destination, dst["freeSpace"])}
    source_routes = []
    for source in sources:
        src, sm, sl = await configured_route(db, instance, source)
        if capacity_overrides is not None:
            src = {**src, "freeSpace": capacity_overrides.get(source, src["freeSpace"])}
        if sm["plex_section_id"] != dm["plex_section_id"]:
            raise ValueError("Le déplacement doit rester dans la même bibliothèque Plex.")
        source_routes.append((source, src, sm, sl))
    kind = "movie" if instance.arr_type == "radarr" else "series"
    occupied = set(
        (
            await db.execute(
                select(StorageTransferItem.arr_instance_id, StorageTransferItem.arr_id).where(
                    StorageTransferItem.claimed.is_(True),
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
                StorageTransferItem.claimed.is_(True),
                StorageTransferItem.transfer_id != getattr(body, "task_id", 0),
            )
        )
    ).scalar()
    await report(f"Lecture du catalogue {instance.arr_type.title()}…")
    candidates = []
    for media in await arr_request(instance, "GET", kind):
        matching = next((entry for entry in source_routes if relative_path(media["path"], entry[0])), None)
        if matching is None:
            continue
        source, src, sm, sl = matching
        if body.mode == "minimum_free" and src["freeSpace"] is not None and src["freeSpace"] >= goal_for(source):
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
                added=media.get("added", ""),
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
                    alternate_titles=[a["title"] for a in media.get("alternateTitles", []) if a.get("title")],
                ),
            )
        )
    await report("Application de l’objectif, des protections et des limites…")
    from .objectives import enrich_candidates

    await enrich_candidates(db, instance, candidates, body)
    # Minimum-free applies to each source, not the sum of potentially shared disks.
    if body.mode == "minimum_free" or root_goals:
        chosen, excluded, requested = [], [], 0
        covered = True
        count_covered = True
        source_objectives = []
        available = max(
            0,
            (dst["freeSpace"] if dst["freeSpace"] is not None else sum(i["size_bytes"] for i in candidates))
            - int(reserved),
        )
        for source, src, sm, sl in source_routes:
            part = choose_candidates(
                [item for item in candidates if item["snapshot"]["source_location_id"] == sl.id],
                body.mode,
                goal_for(source),
                src["freeSpace"] if src["freeSpace"] is not None else 0,
                available,
                max(1, body.max_titles - len(chosen)),
                set(body.selection) if body.selection is not None else None,
                getattr(body, "target_titles", None),
                getattr(body, "preference", "closest"),
            )
            if len(chosen) >= body.max_titles:
                part["excluded"].extend(dict(item, explanation="Limite de titres atteinte") for item in part["items"])
                part["items"] = []
                part["planned_bytes"] = 0
            covered = covered and part["planned_bytes"] >= part["requested_bytes"]
            count_covered = count_covered and part["count_covered"]
            source_objectives.append(
                dict(
                    source_id=sl.id,
                    name=source,
                    requested_bytes=part["requested_bytes"],
                    requested_titles=getattr(body, "target_titles", None),
                )
            )
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
            requested_titles=(getattr(body, "target_titles", None) or 0) * len(source_routes) or None,
            count_covered=count_covered,
            source_objectives=source_objectives,
        )
    else:
        result = choose_candidates(
            candidates,
            body.mode,
            int(body.goal_gb * 1e9),
            None,
            max(
                0,
                (dst["freeSpace"] if dst["freeSpace"] is not None else sum(i["size_bytes"] for i in candidates))
                - int(reserved),
            ),
            body.max_titles,
            set(body.selection) if body.selection is not None else None,
            getattr(body, "target_titles", None),
            getattr(body, "preference", "closest"),
        )
    if getattr(body, "catalogue", False):
        capacity = max(
            0,
            (dst["freeSpace"] if dst["freeSpace"] is not None else sum(i["size_bytes"] for i in candidates))
            - int(reserved),
        )
        result["items"] = [
            dict(i, explanation="Titre disponible")
            for i in candidates
            if not i.get("protected") and 0 < i["size_bytes"] <= capacity
        ]
        result["excluded"] = [
            dict(i, explanation="Titre protégé" if i.get("protected") else "Volume ou capacité insuffisants")
            for i in candidates
            if i.get("protected") or not 0 < i["size_bytes"] <= capacity
        ]
        result["planned_bytes"] = 0
        result["remaining_capacity_bytes"] = capacity
    result.update(
        source=location_json(source_routes[0][3]),
        sources=[location_json(entry[3]) for entry in source_routes],
        destination=location_json(dl),
        note=(
            "Les racines et l’espace seront vérifiés au lancement ; les capacités affichées ici sont les dernières valeurs connues. "
            "Arr gère le déplacement. Pause/arrêt suspendent les prochains titres ; une commande déjà confiée à Arr peut continuer."
        ),
    )
    return result


async def process_arr(db, job, item, stop, *, finalize_only=False):
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
    if finalize_only and (not snap.get("arr_command_id") or not snap.get("original_plex")):
        raise ValueError("Preuves du déplacement Arr absentes : finalisation refusée.")
    if not snap.get("arr_command_id"):
        if snap.get("arr_submission_intent"):
            raise ValueError(
                "Envoi Arr incertain après interruption : contrôler la commande dans Arr avant toute nouvelle soumission."
            )
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
        originals = await plex_files(
            conn,
            snap["plex_section_id"],
            snap["source_plex"],
            item.media_type,
            snapshot=snap,
            title=item.title,
        )
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
    while not finalize_only:
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
    if not finalize_only:
        await update_item(db, item, "plex_pending", "Déplacement Arr terminé · finalisation Plex en arrière-plan.")
        return
    if stop.is_set():
        raise Interrompu()
    destination = await plex_files(
        conn,
        snap["plex_section_id"],
        snap["destination_plex"],
        item.media_type,
        rating_keys=snap["original_plex"],
    )
    if destination != snap["original_plex"]:
        await update_item(db, item, "plex_pending", "Déplacement Arr terminé ; confirmation des fiches Plex attendue.")
        return
    await confirm_media_identity(conn, destination, snap, item.media_type)
    await update_item(db, item, "completed")
