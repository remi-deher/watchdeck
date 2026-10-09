"""Centre de commande FileFlows : vue par disque, bibliothèques, flows, pilotage.

Complète `fileflows_api` (état, fichiers, journaux, relance). Réservé aux administrateurs.
"""

import asyncio
import json
import logging
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..cache import cache
from ..database import get_db_async
from ..dependencies import require_admin
from ..models import ArrInstance, Settings
from ..realtime import publish
from ..services import admin_alerts, fileflows, fileflows_guard, fileflows_history, fileflows_monitor, fileflows_queue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fileflows", tags=["fileflows"], dependencies=[Depends(require_admin)])

FLOWS_CACHE_KEY = "watchdeck:fileflows:flows:{instance_id}"
WAIT_STEP = fileflows.WAIT_STEP_PREFIX


async def _instance(db: AsyncSession) -> ArrInstance:
    inst = await fileflows.get_instance(db)
    if inst is None:
        raise HTTPException(404, "FileFlows n'est pas configuré")
    return inst


async def _settings(db: AsyncSession) -> Settings:
    settings = (await db.execute(select(Settings))).scalars().first()
    if settings is None:
        raise HTTPException(404, "Réglages introuvables")
    return settings


async def _guard(call):
    try:
        return await call
    except fileflows.FileFlowsError as exc:
        raise HTTPException(502, str(exc)) from exc


async def _changed() -> None:
    await publish("fileflows.updated", {"control": True}, admin_only=True)


# --------------------------------------------------------------------------- vue d'ensemble


@router.get("/overview")
async def fileflows_overview(db: AsyncSession = Depends(get_db_async)):
    """Une ligne par disque : fichier en cours, attente du verrou, file, pause Plex."""
    inst = await _instance(db)
    settings = await _settings(db)
    state, libraries, queue = await asyncio.gather(
        _guard(fileflows.dashboard(inst.url, inst.api_key)),
        _guard(fileflows_queue._libraries(inst.url, inst.api_key)),
        _guard(fileflows_queue._queue(inst.url, inst.api_key)),
    )
    index = await fileflows.folder_index(db)
    guard_state = await fileflows_guard.last_state() or {}
    paused = set(guard_state.get("paused_disks") or []) if settings.fileflows_plex_pause != "off" else set()
    playing = set(guard_state.get("playing_disks") or []) if settings.fileflows_plex_pause != "off" else set()

    disks: dict[str, dict[str, Any]] = {}

    def disk(name: str) -> dict[str, Any]:
        return disks.setdefault(
            name,
            {
                "disk": name,
                "libraries": [],
                "waiting": 0,
                "running": [],
                "lock_waiting": 0,
                "plex_paused": name in paused,
                "plex_playing": name in playing,
            },
        )

    lib_disk = {}
    for lib in libraries:
        name = fileflows_guard.disk_of(lib.get("Path"))
        lib_disk[lib["Uid"]] = name
        disk(name)["libraries"].append(lib.get("Name") or "")
    for row in queue:
        name = lib_disk.get(row.get("lu"))
        if name:
            disk(name)["waiting"] += 1
    for runner in state["runners"]:
        entry = disk(fileflows_guard.disk_of(runner["path"]))
        if (runner.get("step") or "").startswith(WAIT_STEP):
            entry["lock_waiting"] += 1
            continue
        entry["running"].append({**runner, "media": fileflows.match_media(index, runner["name"])})

    rate = await fileflows_guard.throughput()
    per_hour = rate.get("per_hour")
    return {
        "state": {k: state[k] for k in ("queue", "processing", "processed", "failed", "paused", "paused_until")},
        "disks": sorted(disks.values(), key=lambda d: d["disk"]),
        "throughput": rate,
        "eta_hours": round(state["queue"] / per_hour, 1) if per_hour else None,
        "automations": {
            "reorder": bool(settings.fileflows_reorder_enabled),
            "plex_pause": settings.fileflows_plex_pause,
            "runners_mode": settings.fileflows_runners_mode,
        },
        "guard": guard_state,
    }


@router.post("/files/{uid}/top")
async def fileflows_file_top(uid: str, db: AsyncSession = Depends(get_db_async)):
    """Met un fichier en tête de file."""
    if not fileflows.UUID_RE.fullmatch(uid):
        raise HTTPException(422, "Identifiant de fichier invalide")
    inst = await _instance(db)
    await _guard(fileflows._call(inst.url, inst.api_key, "POST", "library-file/move-to-top", json={"Uids": [uid]}))
    await _changed()
    return {"ok": True}


# --------------------------------------------------------------------------- bibliothèques


def _plex_confirmed(settings: Settings) -> dict[str, Optional[str]]:
    try:
        data = json.loads(settings.fileflows_plex_locations or "{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


@router.get("/libraries")
async def fileflows_libraries(db: AsyncSession = Depends(get_db_async)):
    """Toutes les bibliothèques FileFlows, avec flow, disque, file et dossier Plex associé."""
    inst = await _instance(db)
    settings = await _settings(db)
    raw, queue, flows = await asyncio.gather(
        _guard(fileflows._call(inst.url, inst.api_key, "GET", "library")),
        _guard(fileflows_queue._queue(inst.url, inst.api_key)),
        _guard(_video_flows(inst)),
    )
    locations = await fileflows_guard.plex_locations(db, settings)
    libraries = [lib for lib in raw or [] if isinstance(lib, dict) and lib.get("Uid")]
    suggested = fileflows_guard.suggest_locations(libraries, locations)
    confirmed = _plex_confirmed(settings)
    chosen = set(fileflows_queue.parse_libraries(settings.fileflows_reorder_libraries))
    waiting: dict[str, int] = {}
    for row in queue:
        waiting[row.get("lu")] = waiting.get(row.get("lu"), 0) + 1
    disk_count: dict[str, int] = {}
    for lib in libraries:
        name = fileflows_guard.disk_of(lib.get("Path"))
        if lib.get("Enabled"):
            disk_count[name] = disk_count.get(name, 0) + 1
    rows = []
    for lib in sorted(libraries, key=lambda x: x.get("Name") or ""):
        uid, name = lib["Uid"], fileflows_guard.disk_of(lib.get("Path"))
        rows.append(
            {
                "uid": uid,
                "name": lib.get("Name") or "",
                "path": lib.get("Path") or "",
                "disk": name,
                "enabled": bool(lib.get("Enabled")),
                "flow": {"uid": (lib.get("Flow") or {}).get("Uid"), "name": (lib.get("Flow") or {}).get("Name")},
                "waiting": waiting.get(uid, 0),
                "last_scanned": lib.get("LastScanned"),
                "reorder": uid in chosen,
                "plex_location": confirmed[uid] if uid in confirmed else suggested.get(uid),
                "plex_location_confirmed": uid in confirmed,
                "plex_location_suggested": suggested.get(uid),
                "shared_disk": lib.get("Enabled") and disk_count.get(name, 0) > 1,
            }
        )
    return {
        "libraries": rows,
        "flows": flows,
        "plex_locations": locations,
    }


class LibraryPatch(BaseModel):
    enabled: Optional[bool] = None
    flow_uid: Optional[str] = None
    reorder: Optional[bool] = None


@router.patch("/libraries/{uid}")
async def fileflows_library_patch(uid: str, body: LibraryPatch, db: AsyncSession = Depends(get_db_async)):
    if not fileflows.UUID_RE.fullmatch(uid):
        raise HTTPException(422, "Identifiant de bibliothèque invalide")
    inst = await _instance(db)
    if body.flow_uid is not None:
        flows = {f["uid"]: f for f in await _guard(_video_flows(inst))}
        flow = flows.get(body.flow_uid)
        if flow is None:
            raise HTTPException(422, "Flow inconnu")
        library = await _guard(fileflows._call(inst.url, inst.api_key, "GET", f"library/{uid}"))
        if not library:
            raise HTTPException(404, "Bibliothèque introuvable")
        library["Flow"] = {"Uid": flow["uid"], "Name": flow["name"], "Type": "FileFlows.Shared.Models.Flow"}
        await _guard(fileflows._call(inst.url, inst.api_key, "POST", "library", json=library))
        await cache.delete(FLOWS_CACHE_KEY.format(instance_id=inst.id))
    if body.enabled is not None:
        await _guard(
            fileflows._call(
                inst.url,
                inst.api_key,
                "PUT",
                f"library/state/{uid}",
                params={"enable": "true" if body.enabled else "false"},
            )
        )
    if body.reorder is not None:
        settings = await _settings(db)
        chosen = fileflows_queue.parse_libraries(settings.fileflows_reorder_libraries)
        chosen = [u for u in chosen if u != uid] + ([uid] if body.reorder else [])
        settings.fileflows_reorder_libraries = json.dumps(chosen)
        await db.commit()
    await _changed()
    return {"ok": True}


@router.post("/libraries/{uid}/rescan")
async def fileflows_library_rescan(uid: str, db: AsyncSession = Depends(get_db_async)):
    if not fileflows.UUID_RE.fullmatch(uid):
        raise HTTPException(422, "Identifiant de bibliothèque invalide")
    inst = await _instance(db)
    await _guard(fileflows._call(inst.url, inst.api_key, "PUT", "library/rescan", json={"Uids": [uid]}))
    return {"ok": True}


class PlexLocationBody(BaseModel):
    # None = revenir à la proposition automatique ; "" = dissocier.
    path: Optional[str] = Field(default=None, max_length=1000)


@router.put("/libraries/{uid}/plex-location")
async def fileflows_library_plex_location(uid: str, body: PlexLocationBody, db: AsyncSession = Depends(get_db_async)):
    settings = await _settings(db)
    confirmed = _plex_confirmed(settings)
    if body.path is None:
        confirmed.pop(uid, None)
    else:
        confirmed[uid] = body.path
    settings.fileflows_plex_locations = json.dumps(confirmed)
    await db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- flows


async def _video_flows(inst: ArrInstance) -> list[dict[str, Any]]:
    """Flows de traitement de fichiers (pas les modèles), avec les bibliothèques qui les utilisent."""
    key = FLOWS_CACHE_KEY.format(instance_id=inst.id)
    cached = await cache.get_json(key)
    if cached and isinstance(cached.get("items"), list):
        return cached["items"]
    listing = await fileflows._call(inst.url, inst.api_key, "GET", "flow/list-all") or []
    candidates = [f for f in listing if isinstance(f, dict) and f.get("Type") == 0 and f.get("Uid")]
    semaphore = asyncio.Semaphore(6)

    async def detail(flow):
        async with semaphore:
            return await fileflows._call(inst.url, inst.api_key, "GET", f"flow/{flow['Uid']}")

    details = await asyncio.gather(*(detail(f) for f in candidates))
    items = []
    for flow in details:
        if not isinstance(flow, dict):
            continue
        # Les bibliothèques utilisatrices ne figurent que dans la liste globale.
        listed = next((f for f in candidates if f["Uid"] == flow["Uid"]), {})
        used_by = [u.get("Name") for u in listed.get("UsedBy") or flow.get("UsedBy") or [] if isinstance(u, dict)]
        items.append(
            {
                "uid": flow["Uid"],
                "name": flow.get("Name") or "",
                "description": flow.get("Description") or "",
                "revision": flow.get("Revision"),
                "modified": flow.get("DateModified"),
                "steps": [
                    p.get("Name") or (p.get("FlowElementUid") or "").split(".")[-1]
                    for p in flow.get("Parts") or []
                    if isinstance(p, dict)
                ],
                "used_by": used_by,
            }
        )
    items.sort(key=lambda f: (not f["used_by"], f["name"]))
    await cache.set_json(key, {"items": items}, ttl_seconds=60)
    return items


@router.get("/flows")
async def fileflows_flows(db: AsyncSession = Depends(get_db_async)):
    inst = await _instance(db)
    return {"flows": await _guard(_video_flows(inst))}


class ReprocessWithFlow(BaseModel):
    uids: list[str] = Field(min_length=1, max_length=fileflows.MAX_REPROCESS)
    flow_uid: str


@router.post("/reprocess-with-flow")
async def fileflows_reprocess_with_flow(body: ReprocessWithFlow, db: AsyncSession = Depends(get_db_async)):
    """Relance des fichiers avec un flow précis, sans changer leur bibliothèque (test d'un flow)."""
    inst = await _instance(db)
    flows = {f["uid"]: f for f in await _guard(_video_flows(inst))}
    flow = flows.get(body.flow_uid)
    if flow is None:
        raise HTTPException(422, "Flow inconnu")
    if any(not fileflows.UUID_RE.fullmatch(u) for u in body.uids):
        raise HTTPException(422, "Identifiant de fichier invalide")
    await _guard(
        fileflows._call(
            inst.url,
            inst.api_key,
            "POST",
            "library-file/reprocess",
            json={
                "Uids": body.uids,
                "Mode": 0,
                "CustomVariables": {},
                "Flow": {"Uid": flow["uid"], "Name": flow["name"]},
                "BottomOfQueue": False,
            },
        )
    )
    await _changed()
    return {"queued": len(body.uids), "flow": flow["name"]}


# --------------------------------------------------------------------------- pilotage


class ControlBody(BaseModel):
    runners_mode: Literal["manual", "auto"]
    runners: int = Field(ge=1, le=fileflows_guard.MAX_RUNNERS)
    plex_pause: Literal["off", "all", "disk"]
    plex_pause_relaunched: Literal["follow", "ignore"]
    plex_resume_minutes: int = Field(ge=0, le=120)
    reorder_enabled: bool
    alert_channels: list[Literal["email", "discord", "telegram", "ntfy", "gotify"]] = Field(default_factory=list)
    # None (ou "custom") : le planning du nœud n'est pas modifié.
    schedule_preset: Optional[Literal["always", "night", "not_evening", "daytime", "custom"]] = None


async def _node(inst: ArrInstance) -> tuple[str, dict[str, Any]]:
    return await fileflows.main_node(inst.url, inst.api_key)


@router.get("/control")
async def fileflows_control(db: AsyncSession = Depends(get_db_async)):
    inst = await _instance(db)
    settings = await _settings(db)
    _, node = await _guard(_node(inst))
    schedule = str(node.get("Schedule") or "")
    return {
        "runners_mode": settings.fileflows_runners_mode,
        "runners": int(node.get("FlowRunners") or 1),
        "max_runners": fileflows_guard.MAX_RUNNERS,
        "plex_pause": settings.fileflows_plex_pause,
        "plex_pause_relaunched": settings.fileflows_plex_pause_relaunched,
        "plex_resume_minutes": settings.fileflows_plex_resume_minutes,
        "reorder_enabled": bool(settings.fileflows_reorder_enabled),
        "schedule_restricted": bool(schedule) and set(schedule) != {"1"},
        "schedule_preset": fileflows_guard.preset_of(schedule),
        "alert_channels": fileflows_monitor.alert_channels(settings),
        # Canal activé et configuré dans Notifications : sinon, le cocher n'enverrait rien.
        "channels_ready": {c: admin_alerts.channel_ready(settings, c) for c in admin_alerts.CHANNELS},
        "guard": await fileflows_guard.last_state(),
    }


@router.put("/control")
async def fileflows_control_save(body: ControlBody, db: AsyncSession = Depends(get_db_async)):
    inst = await _instance(db)
    settings = await _settings(db)
    settings.fileflows_runners_mode = body.runners_mode
    settings.fileflows_plex_pause = body.plex_pause
    settings.fileflows_plex_pause_relaunched = body.plex_pause_relaunched
    settings.fileflows_plex_resume_minutes = body.plex_resume_minutes
    settings.fileflows_reorder_enabled = body.reorder_enabled
    settings.fileflows_alert_channels = json.dumps(list(dict.fromkeys(body.alert_channels)))
    await db.commit()
    if body.runners_mode == "manual":
        await _guard(fileflows_guard.set_runners(inst.url, inst.api_key, body.runners))
    if body.schedule_preset and body.schedule_preset != "custom":
        route, node = await _guard(_node(inst))
        schedule = fileflows_guard.schedule_for(body.schedule_preset)
        if node.get("Schedule") != schedule:
            node["Schedule"] = schedule
            await _guard(fileflows.save_node(inst.url, inst.api_key, route, node))
    await _changed()
    return {"ok": True}


# --------------------------------------------------------------------------- historique


@router.get("/history")
async def fileflows_history_route(
    days: int = 30, offset: int = 0, recent_limit: int = 50, db: AsyncSession = Depends(get_db_async)
):
    """Statistiques des traitements sur la période (jusqu'à cent ans : « Tout »), décalées
    de `offset` jours pour la période précédente, et derniers passages enregistrés."""
    days = max(1, min(days, 36500))
    offset = max(0, min(offset, 36500))
    return {
        "stats": await fileflows_history.statistics(db, days, offset),
        "recent": await fileflows_history.recent(db, max(1, min(recent_limit, 500))),
    }
