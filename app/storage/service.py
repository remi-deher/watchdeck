"""Administrative inventory and previews; the API never mounts media folders."""

from datetime import timedelta

import httpx
from sqlalchemy import delete, func, select

from ..crypto import fingerprint_secret
from ..models import ArrInstance, StorageLocation, StorageTransfer, StorageTransferItem
from ..services.plex_servers import connection_for
from ..utils import now_utc_naive
from .planning import absolute_path, choose_candidates, relative_path


async def arr_request(instance, method, path, body=None):
    from .preview_cache import read_inventory

    async def fetch():
        return await _arr_request(instance, method, path, body)

    if method == "GET":
        return await read_inventory(("arr", instance.id, instance.url, path), fetch)
    return await fetch()


async def _arr_request(instance, method, path, body=None):
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.request(
            method, instance.url.rstrip("/") + "/api/v3/" + path, headers={"X-Api-Key": instance.api_key}, json=body
        )
        response.raise_for_status()
        return response.json() if response.content else None


async def discover_instance_roots(db, instance):
    """Read actual roots in both applications. Never infer one path from the other."""
    conn = await connection_for(db, instance.plex_server_id)
    if not conn:
        raise ValueError("Serveur Plex non configuré pour cette instance.")
    arr_roots = await arr_request(instance, "GET", "rootfolder")
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(
            conn.url.rstrip("/") + "/library/sections",
            headers={"X-Plex-Token": conn.token, "Accept": "application/json"},
        )
        response.raise_for_status()
        sections = response.json().get("MediaContainer", {}).get("Directory", [])
    expected = "movie" if instance.arr_type == "radarr" else "show"
    return dict(
        arr_instance_id=instance.id,
        name=instance.name,
        arr_type=instance.arr_type,
        plex_server_id=conn.id,
        plex_url=conn.url,
        plex_token_fingerprint=fingerprint_secret(conn.token),
        arr_roots=[r["path"].rstrip("/") for r in arr_roots],
        capacities={r["path"].rstrip("/"): dict(free_bytes=r.get("freeSpace")) for r in arr_roots},
        plex_roots=[
            dict(section_id=str(s["key"]), library=s["title"], path=location["path"].rstrip("/"))
            for s in sections
            if s.get("type") == expected
            for location in s.get("Location", [])
        ],
    )


def location_json(location):
    return {
        key: getattr(location, key)
        for key in (
            "id",
            "name",
            "mount_path",
            "mappings",
            "reserve_bytes",
            "enabled",
            "free_bytes",
            "total_bytes",
            "checked_at",
            "health",
        )
    } | {"virtual": location.virtual_key is not None}


async def preview(db, body):
    from .preview_cache import inventory_cache

    with inventory_cache():
        return await _preview(db, body)


async def _preview(db, body):
    from .preview_progress import report

    if getattr(body, "routes", None):
        from .objectives import preview_batch

        return await preview_batch(db, body)
    if getattr(body, "transfer_methods", None):
        from .access import preview_priority

        return await preview_priority(db, body)

    if getattr(body, "transfer_mode", "") in ("rsync_ssh", "rsync_local"):
        from .access import preview_rsync

        return await preview_rsync(db, body)
    if getattr(body, "transfer_mode", "rsync") == "arr":
        from .arr_transfer import preview_arr

        return await preview_arr(db, body)
    await report("Préparation des stockages et correspondances…")
    if body.source_id == body.destination_id:
        raise ValueError("Choisir deux stockages différents.")
    source, destination = (
        await db.get(StorageLocation, body.source_id),
        await db.get(StorageLocation, body.destination_id),
    )
    if not source or not destination or not source.enabled or not destination.enabled:
        raise ValueError("Stockage absent ou désactivé.")
    cutoff = now_utc_naive() - timedelta(seconds=90)
    for location in (source, destination):
        if location.health != "ok" or not location.checked_at or location.checked_at < cutoff:
            raise ValueError(
                "Le moteur doit confirmer les montages et leur espace libre (contrôle de moins de 90 secondes)."
            )
    from types import SimpleNamespace

    for location in (source, destination):
        for mapping in location.mappings:
            resolved = await resolve_mapping(db, SimpleNamespace(**mapping))
            candidate = next(
                (
                    c
                    for c in resolved["candidates"]
                    if c["mount_path"] == location.mount_path and c["subdirectory"] == mapping.get("subdirectory", "")
                ),
                None,
            )
            status = resolved["comparison"]["status"]
            if (
                not candidate
                or status not in ("sample_matched", "empty")
                or (status == "sample_matched" and not candidate["matched"])
                or (location is source and status != "sample_matched")
            ):
                raise ValueError("rsync : chemins Arr/Plex/moteur non validés pour la source ou la destination.")
    available = max(0, (destination.free_bytes or 0) - destination.reserve_bytes)
    reserved = (
        await db.execute(
            select(func.coalesce(func.sum(StorageTransferItem.size_bytes), 0))
            .join(StorageTransfer, StorageTransfer.id == StorageTransferItem.transfer_id)
            .where(
                StorageTransfer.destination_id == destination.id,
                StorageTransferItem.claimed.is_(True),
            )
        )
    ).scalar()
    available = max(0, available - int(reserved))
    occupied = (
        await db.execute(
            select(StorageTransferItem.arr_instance_id, StorageTransferItem.arr_id)
            .join(StorageTransfer, StorageTransfer.id == StorageTransferItem.transfer_id)
            .where(
                StorageTransferItem.claimed.is_(True),
                StorageTransferItem.transfer_id != getattr(body, "task_id", 0),
            )
        )
    ).all()
    occupied = set(occupied)
    candidates = []
    for mapping in source.mappings:
        instance = await db.get(ArrInstance, mapping["arr_instance_id"])
        if not instance or not instance.enabled or instance.arr_type not in ("radarr", "sonarr"):
            continue
        target = next((m for m in destination.mappings if m["arr_instance_id"] == instance.id), None)
        if not target or target["plex_section_id"] != mapping["plex_section_id"]:
            continue
        kind = "movie" if instance.arr_type == "radarr" else "series"
        if body.media_type != "all" and body.media_type != kind:
            continue
        resource = "movie" if kind == "movie" else "series"
        for media in await arr_request(instance, "GET", resource):
            rel = relative_path(media["path"], mapping["arr_root"])
            if rel is None or (instance.id, media["id"]) in occupied:
                continue
            # A media directory must be a direct child of the configured root.
            if "/" in rel:
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
                        source_mount=source.mount_path
                        + ("/" + mapping["subdirectory"] if mapping.get("subdirectory") else ""),
                        destination_mount=destination.mount_path
                        + ("/" + target["subdirectory"] if target.get("subdirectory") else ""),
                        source_arr=media["path"],
                        destination_arr=target["arr_root"] + "/" + rel,
                        source_plex=mapping["plex_root"] + "/" + rel,
                        destination_plex=target["plex_root"] + "/" + rel,
                        plex_section_id=mapping["plex_section_id"],
                        relative=rel,
                        destination_root=target["arr_root"],
                        tmdb_id=media.get("tmdbId"),
                        tvdb_id=media.get("tvdbId"),
                        alternate_titles=[a["title"] for a in media.get("alternateTitles", []) if a.get("title")],
                    ),
                )
            )
    result = choose_candidates(
        candidates,
        body.mode,
        int(body.goal_gb * 1e9),
        source.free_bytes,
        available,
        body.max_titles,
        set(body.selection) if body.selection is not None else None,
    )
    result.update(
        source=location_json(source),
        destination=location_json(destination),
        note="Espace libéré estimé. Un original conservé en attente Plex ne libère pas encore de place.",
    )
    return result


async def transfer_json(db, job):
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
    return dict(
        id=job.id,
        source_id=job.source_id,
        destination_id=job.destination_id,
        status=job.status,
        desired_state=job.desired_state,
        auto_resume=job.auto_resume,
        params=job.params,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
        worker_seen_at=job.worker_seen_at,
        planned_bytes=sum(t.size_bytes for t in items),
        released_bytes=sum(t.size_bytes for t in items if t.status == "completed"),
        items=[
            dict(
                id=t.id,
                title=t.title,
                media_type=t.media_type,
                size_bytes=t.size_bytes,
                status=t.status,
                reason=t.reason,
                progress=t.progress,
                snapshot=t.snapshot,
                created_at=t.created_at,
                updated_at=t.updated_at,
            )
            for t in items
        ],
    )


async def check_mapping(db, location, mapping_index, discovered=None):
    """Read-only API comparison. A sample never certifies an entire storage mount."""
    from .worker import confirm_media_identity, plex_files

    mapping = location.mappings[mapping_index]
    instance = await db.get(ArrInstance, mapping["arr_instance_id"])
    if not instance or not instance.enabled:
        raise ValueError("Instance Arr indisponible.")
    roots = discovered or await discover_instance_roots(db, instance)
    if mapping["arr_root"] not in roots["arr_roots"] or not any(
        p["path"] == mapping["plex_root"] and p["section_id"] == mapping["plex_section_id"] for p in roots["plex_roots"]
    ):
        raise ValueError("Une racine enregistrée n’est plus déclarée dans Arr/Plex.")
    conn = await connection_for(db, instance.plex_server_id)
    kind = "movie" if instance.arr_type == "radarr" else "series"
    resource = "movie" if kind == "movie" else "series"
    from .preview_progress import report

    await report("Vérification du contenu Plex pour cette correspondance…")
    titles = []
    for media in await arr_request(instance, "GET", resource):
        relative = relative_path(media["path"], mapping["arr_root"])
        if relative and "/" not in relative:
            titles.append((media, relative))
    eligible = [
        (media, relative)
        for media, relative in titles
        if (
            media.get("hasFile")
            or media.get("movieFile")
            or media.get("sizeOnDisk")
            or media.get("statistics", {}).get("episodeFileCount")
            or media.get("statistics", {}).get("sizeOnDisk")
        )
    ]
    results = []
    for media, relative in sorted(eligible, key=lambda t: t[0]["id"])[:5]:
        try:
            plex = await plex_files(
                conn,
                mapping["plex_section_id"],
                mapping["plex_root"] + "/" + relative,
                kind,
                snapshot={
                    "tmdb_id": media.get("tmdbId"),
                    "tvdb_id": media.get("tvdbId"),
                    "alternate_titles": [a["title"] for a in media.get("alternateTitles", []) if a.get("title")],
                },
                title=media["title"],
                db=db,
            )
            if not plex:
                results.append(
                    dict(title=media["title"], status="mismatch", reason="Titre absent du dossier Plex associé.")
                )
                continue
            files = await arr_request(
                instance,
                "GET",
                f"moviefile?movieId={media['id']}" if kind == "movie" else f"episodefile?seriesId={media['id']}",
            )
            expected = {f["relativePath"] for f in files if f.get("relativePath")}
            if not expected:
                results.append(
                    dict(
                        title=media["title"],
                        status="unavailable",
                        reason="Aucun fichier Arr permettant la comparaison.",
                    )
                )
                continue
            missing = expected - set(plex)
            extra = set(plex) - expected
            ambiguous = [name for name, keys in plex.items() if len(keys) != 1]
            if missing or extra or ambiguous:
                reasons = []
                if missing:
                    reasons.append(f"{len(missing)} fichier(s) Arr absents de Plex : " + ", ".join(sorted(missing)[:3]))
                if extra:
                    reasons.append(
                        f"{len(extra)} fichier(s) Plex absents de l’inventaire Arr : " + ", ".join(sorted(extra)[:3])
                    )
                if ambiguous:
                    reasons.append(f"{len(ambiguous)} fichier(s) associés à plusieurs fiches Plex")
                raise ValueError(" ; ".join(reasons))
            await confirm_media_identity(
                conn, plex, {"tmdb_id": media.get("tmdbId"), "tvdb_id": media.get("tvdbId")}, kind
            )
            results.append(dict(title=media["title"], status="matched", files=len(expected)))
        except ValueError as exc:
            results.append(dict(title=media["title"], status="mismatch", reason=str(exc)))
    result = dict(
        checked_at=now_utc_naive(),
        total_titles=len(titles),
        available_titles=len(eligible),
        pending_titles=len(titles) - len(eligible),
        empty_reason="arr_empty" if not eligible else None,
        checked_titles=len(results),
        matched_titles=sum(r["status"] == "matched" for r in results),
        status="empty"
        if not results
        else "mismatch"
        if any(r["status"] == "mismatch" for r in results)
        else "incomplete"
        if any(r["status"] == "unavailable" for r in results)
        else "sample_matched",
        items=results,
        note="Contrôle API de 5 titres maximum. Chaque titre sera revérifié avant son déplacement ; une racine vide ne permet pas de confirmer le contenu.",
    )
    from .mapping_proofs import put

    try:
        await put(instance, roots, mapping, result)
    except Exception:
        # A cache outage must never turn a successful read-only comparison into
        # a failed storage check.
        pass
    return result


async def resolve_mapping(db, body):
    from types import SimpleNamespace

    from .discovery import request_engine
    from .planning import relative_path

    body.arr_root = absolute_path(body.arr_root)
    body.plex_root = absolute_path(body.plex_root)
    comparison = await check_mapping(db, SimpleNamespace(mappings=[body.model_dump()]), 0)
    instance = await db.get(ArrInstance, body.arr_instance_id)
    kind = "movie" if instance.arr_type == "radarr" else "series"
    media = await arr_request(instance, "GET", kind)
    samples = []
    for title in sorted(media, key=lambda t: t["id"]):
        relative = relative_path(title["path"], body.arr_root)
        if (
            not relative
            or "/" in relative
            or not (
                title.get("hasFile")
                or title.get("movieFile")
                or title.get("sizeOnDisk")
                or title.get("statistics", {}).get("episodeFileCount")
            )
        ):
            continue
        files = await arr_request(
            instance,
            "GET",
            f"moviefile?movieId={title['id']}" if kind == "movie" else f"episodefile?seriesId={title['id']}",
        )
        samples.extend(
            dict(path=relative + "/" + f["relativePath"], size=f["size"])
            for f in files
            if f.get("relativePath") and f.get("size") is not None
        )
        if len(samples) >= 5:
            break
    result = await request_engine(dict(arr_root=body.arr_root, plex_root=body.plex_root, files=samples[:20]))
    result["comparison"] = comparison
    if comparison["status"] != "sample_matched":
        result["automatic"] = None
    return result


async def forget_transfer(db, job):
    """Forget terminal metadata only; filesystem cleanup belongs to cancellation."""
    if job.status not in ("draft", "completed", "cancelled"):
        raise ValueError("Terminer l’annulation avant de supprimer cette tâche.")
    await db.execute(delete(StorageTransferItem).where(StorageTransferItem.transfer_id == job.id))
    await db.delete(job)
    await db.commit()
