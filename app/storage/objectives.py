"""Objective orchestration and reusable title protection; no file mutations."""

from sqlalchemy import select

from ..models.storage import StorageProtectedTitle
from .planning import choose_candidates


async def enrich_candidates(db, instance, candidates, body):
    protected = set(
        (
            await db.execute(
                select(StorageProtectedTitle.arr_id).where(StorageProtectedTitle.arr_instance_id == instance.id)
            )
        )
        .scalars()
        .all()
    )
    for item in candidates:
        item["protected"] = item["arr_id"] in protected
        item["preference_rank"] = (
            item.get("added", "") if getattr(body, "preference", "closest") == "oldest_added" else ""
        )
    if getattr(body, "preference", "closest") != "least_recently_watched" or not candidates:
        return
    from ..services.plex_servers import connection_for
    from .worker import plex_get

    conn = await connection_for(db, instance.plex_server_id)
    sections = {i["snapshot"]["plex_section_id"] for i in candidates}
    viewed = {}
    for section in sections:
        start = 0
        while True:
            data = await plex_get(
                conn,
                f"/library/sections/{section}/all",
                {
                    "type": 1 if instance.arr_type == "radarr" else 2,
                    "includeGuids": 1,
                    "X-Plex-Container-Start": start,
                    "X-Plex-Container-Size": 200,
                },
            )
            rows = data.get("Metadata", [])
            for row in rows:
                for guid in row.get("Guid", []):
                    viewed[guid.get("id")] = int(row.get("lastViewedAt") or 0)
            start += len(rows)
            if not rows or start >= data.get("totalSize", data.get("size", len(rows))):
                break
    for item in candidates:
        snap = item["snapshot"]
        key = f"tmdb://{snap.get('tmdb_id')}" if instance.arr_type == "radarr" else f"tvdb://{snap.get('tvdb_id')}"
        if key not in viewed:
            raise ValueError("Historique Plex indisponible pour certains titres : choisissez un autre critère.")
        item["preference_rank"] = viewed[key]


async def preview_batch(db, body):
    """Gather validated catalogues, then choose across instances for a global goal."""
    from ..routers.storage_api import PreviewBody
    from .preview_progress import report
    from .service import _preview

    groups = []
    for index, route in enumerate(body.routes, 1):
        await report(f"Analyse de l’instance {index}/{len(body.routes)}…")
        child = PreviewBody.model_validate(
            {
                **body.model_dump(),
                **route,
                "routes": [],
                "mode": "selection",
                "root_goals": {},
                "selection": None,
                "target_titles": None,
                "max_titles": 250,
                "catalogue": True,
            }
        )
        result = await _preview(db, child)
        if result.get("transfer_mode"):
            child.transfer_mode = result["transfer_mode"]
            child.access_id = result["access_id"]
            child.preferred_methods = result["preferred_methods"]
            child.transfer_methods = []
        groups.append(
            {
                **result,
                "body": {
                    **child.model_dump(),
                    "mode": body.mode,
                    "goal_gb": body.goal_gb,
                    "max_titles": body.max_titles,
                    "target_titles": body.target_titles,
                    "root_goals": route.get("root_goals", {}),
                },
                "name": str(route.get("name", route["arr_instance_id"])),
                "submitted": False,
            }
        )
    if body.mode == "minimum_free" or any(r.get("root_goals") for r in body.routes):
        # Per-source objectives are explicit; retain their independently checked plans.
        for index, (group, route) in enumerate(zip(groups, body.routes), 1):
            await report(f"Ajustement de l’objectif sur la source {index}/{len(groups)}…")
            child = PreviewBody.model_validate({**group["body"], **route, "routes": [], "selection": body.selection})
            result = await _preview(db, child)
            group.update(result)
        return dict(groups=groups, objective_scope="source")
    candidates = []
    capacities = {}
    for index, group in enumerate(groups):
        capacities[str(index)] = group["remaining_capacity_bytes"] + group["planned_bytes"]
        for item in group["items"]:
            candidates.append({**item, "capacity_group": str(index)})
    # Keep endpoint capacity restrictions when selecting across different destinations.
    # Each catalogue was independently capped to its destination's available capacity.
    available = sum(g["remaining_capacity_bytes"] + g["planned_bytes"] for g in groups)
    result = choose_candidates(
        candidates,
        body.mode,
        int(body.goal_gb * 1e9),
        None,
        available,
        body.max_titles,
        set(body.selection) if body.selection is not None else None,
        body.target_titles,
        body.preference,
        capacities,
    )
    chosen = {i["key"]: i for i in result["items"]}
    for group in groups:
        all_items = group["items"]
        group["items"] = [chosen[i["key"]] for i in all_items if i["key"] in chosen]
        group["excluded"] += [
            dict(i, explanation="Non retenu dans cette proposition") for i in all_items if i["key"] not in chosen
        ]
        group["planned_bytes"] = sum(i["size_bytes"] for i in group["items"])
        group["body"]["target_titles"] = body.target_titles
        group["body"]["mode"] = "selection"
        group["body"]["routes"] = []
        group["body"]["objective_mode"] = body.mode
        group["catalogue"] = all_items
    return {**result, "groups": groups, "objective_scope": "global", "mode": body.mode}
