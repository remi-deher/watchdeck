"""Pilotage de FileFlows, chaque minute : pause pendant les lectures Plex, runners, file.

* **Pause pendant une lecture Plex** (désactivée par défaut). Les fichiers lus sont
  rattachés à un disque par la correspondance « dossier Plex ↔ bibliothèque FileFlows »
  (proposée automatiquement, confirmable dans Encodage → Bibliothèques). L'état est
  publié dans la variable globale FileFlows `WatchdeckPause`, que le flow relit entre ses
  étapes : un fichier du disque concerné (ou de tous, en mode « all ») attend avant
  l'étape suivante. Pour libérer les runners, les fichiers en attente des disques en pause
  passent derrière les autres dans la file. Après la dernière lecture, la reprise attend
  quelques minutes (une pause du film ne relance pas tout).
* **Runners automatiques** : un par disque ayant des fichiers à traiter.
* **Ordre de la file** : fichiers relancés en tête, alternance des bibliothèques choisies
  (si l'option est active), disques en pause à la fin.
* **Débit** : un relevé du nombre de fichiers traités, pour estimer la fin de la file.

Rien n'est fait tant que toutes ces options sont désactivées, hormis le relevé du débit.
"""

import json
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..cache import cache
from ..database import AsyncSessionLocal
from ..models import Settings
from . import fileflows, fileflows_queue, plex_servers

logger = logging.getLogger(__name__)

PAUSE_VARIABLE = "WatchdeckPause"
PAUSE_MODES = ("off", "all", "disk")
RELAUNCHED_POLICIES = ("follow", "ignore")
RUNNERS_MODES = ("manual", "auto")
MAX_RUNNERS = 5  # plafond de l'offre gratuite de FileFlows

LAST_PLAY_KEY = "watchdeck:fileflows:guard:last-play"
RELAUNCHED_KEY = "watchdeck:fileflows:guard:relaunched"
STATE_KEY = "watchdeck:fileflows:guard:state"
SAMPLES_KEY = "watchdeck:fileflows:guard:samples"
LOCATIONS_KEY = "watchdeck:fileflows:plex-locations"
SAMPLE_WINDOW = timedelta(hours=3)


# --------------------------------------------------------------------------- chemins


def disk_of(path: str | None) -> str:
    """Premier composant du chemin : le disque (`/usb2/MEDIA/FILMS/...` -> `usb2`)."""
    parts = [p for p in (path or "").replace("\\", "/").split("/") if p]
    return parts[0] if parts else ""


def _parts(path: str | None) -> list[str]:
    return [p for p in (path or "").replace("\\", "/").split("/") if p]


def suffix_score(plex_path: str, ff_path: str) -> int:
    """Nombre de dossiers communs en fin de chemin (`/data/usb2/MEDIA/FILMS` et
    `/usb2/MEDIA/FILMS` -> 3). Sensible a la casse, comme les chemins Linux."""
    a, b = _parts(plex_path), _parts(ff_path)
    score = 0
    while score < min(len(a), len(b)) and a[-1 - score] == b[-1 - score]:
        score += 1
    return score


def suggest_locations(libraries: list[dict[str, Any]], locations: list[dict[str, Any]]) -> dict[str, str | None]:
    """{uid bibliothèque FileFlows: dossier Plex proposé}.

    Tout le chemin de la bibliothèque FileFlows doit se retrouver à la fin du dossier Plex,
    disque compris (`/usb2/MEDIA/FILMS` ↔ `/data/usb2/MEDIA/FILMS`) : seul le préfixe de
    montage peut différer. Plusieurs candidats : aucune proposition."""
    out: dict[str, str | None] = {}
    for lib in libraries:
        needed = len(_parts(lib.get("Path")))
        matches = [
            loc["path"] for loc in locations if needed and suffix_score(loc["path"], lib.get("Path") or "") >= needed
        ]
        out[lib["Uid"]] = matches[0] if len(set(matches)) == 1 else None
    return out


def effective_locations(settings: Settings | None, suggested: dict[str, str | None]) -> dict[str, str | None]:
    """Propositions, remplacées par les correspondances confirmées (vide = dissociée)."""
    try:
        confirmed = json.loads((settings.fileflows_plex_locations if settings else None) or "{}")
    except ValueError:
        confirmed = {}
    if not isinstance(confirmed, dict):
        confirmed = {}
    merged = dict(suggested)
    for uid, path in confirmed.items():
        merged[str(uid)] = str(path) if path else None
    return merged


def library_for_file(path: str, mapping: dict[str, str | None]) -> str | None:
    """Bibliothèque FileFlows du fichier lu : le dossier Plex le plus précis qui le contient."""
    best, best_len = None, -1
    norm = "/" + "/".join(_parts(path)) + "/"
    for uid, location in mapping.items():
        if not location:
            continue
        prefix = "/" + "/".join(_parts(location)) + "/"
        if norm.startswith(prefix) and len(prefix) > best_len:
            best, best_len = uid, len(prefix)
    return best


# --------------------------------------------------------------------------- Plex


async def _plex_get(conn, path: str, verify: bool) -> ET.Element | None:
    headers = {"X-Plex-Token": conn.token, "Accept": "application/xml"}
    try:
        async with httpx.AsyncClient(timeout=10, verify=verify) as client:
            response = await client.get(f"{conn.url.rstrip('/')}{path}", headers=headers)
            response.raise_for_status()
        return ET.fromstring(response.content)
    except Exception as exc:  # noqa: BLE001 -- un serveur injoignable n'arrête pas les autres
        logger.info("Plex %s injoignable (%s) : %s", getattr(conn, "name", ""), path, exc)
        return None


async def plex_locations(db: AsyncSession, settings: Settings | None) -> list[dict[str, Any]]:
    """Dossiers des bibliothèques Plex (films et séries), gardés une heure en cache."""
    cached = await cache.get_json(LOCATIONS_KEY)
    if cached and isinstance(cached.get("items"), list):
        return cached["items"]
    verify = bool(settings.plex_verify_ssl) if settings else True
    items: list[dict[str, Any]] = []
    for conn in await plex_servers.active_connections(db, settings):
        root = await _plex_get(conn, "/library/sections", verify)
        if root is None:
            continue
        for directory in root.iter("Directory"):
            if directory.get("type") not in ("movie", "show"):
                continue
            for location in directory.iter("Location"):
                if location.get("path"):
                    items.append(
                        {"server": conn.name, "library": directory.get("title") or "", "path": location.get("path")}
                    )
    await cache.set_json(LOCATIONS_KEY, {"items": items}, ttl_seconds=3600)
    return items


async def playing_files(db: AsyncSession, settings: Settings | None) -> list[str]:
    """Chemins des fichiers en cours de lecture sur les serveurs Plex suivis."""
    verify = bool(settings.plex_verify_ssl) if settings else True
    paths: list[str] = []
    for conn in await plex_servers.active_connections(db, settings):
        root = await _plex_get(conn, "/status/sessions", verify)
        if root is None:
            continue
        for part in root.iter("Part"):
            if part.get("file"):
                paths.append(part.get("file"))
    return paths


# --------------------------------------------------------------------------- FileFlows


async def publish_pause(url: str, api_key: str | None, state: dict[str, Any]) -> None:
    """Écrit l'état dans la variable globale FileFlows lue par le flow."""
    value = json.dumps(state)
    variables = await fileflows._call(url, api_key, "GET", "variable") or []
    current = next((v for v in variables if isinstance(v, dict) and v.get("Name") == PAUSE_VARIABLE), None)
    if current and current.get("Value") == value:
        return
    body = {
        "Uid": current["Uid"] if current else "00000000-0000-0000-0000-000000000000",
        "Name": PAUSE_VARIABLE,
        "Value": value,
    }
    await fileflows._call(url, api_key, "POST", "variable", json=body)


async def set_runners(url: str, api_key: str | None, runners: int) -> int | None:
    """Règle le nombre de runners du nœud principal ; renvoie l'ancienne valeur si changée."""
    nodes = await fileflows._call(url, api_key, "GET", "node") or []
    node = next((n for n in nodes if isinstance(n, dict) and n.get("Uid")), None)
    if node is None:
        return None
    detail = await fileflows._call(url, api_key, "GET", f"node/{node['Uid']}")
    previous = int(detail.get("FlowRunners") or 0)
    runners = max(1, min(MAX_RUNNERS, int(runners)))
    if previous == runners:
        return None
    detail["FlowRunners"] = runners
    await fileflows._call(url, api_key, "POST", "node", json=detail)
    return previous


# --------------------------------------------------------------------------- passage


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _record_sample(processed: int) -> None:
    now = _now()
    samples = ((await cache.get_json(SAMPLES_KEY)) or {}).get("items") or []
    samples = [s for s in samples if datetime.fromisoformat(s["at"]) >= now - SAMPLE_WINDOW]
    samples.append({"at": now.isoformat(), "processed": processed})
    await cache.set_json(SAMPLES_KEY, {"items": samples[-240:]}, ttl_seconds=int(SAMPLE_WINDOW.total_seconds()))


async def throughput() -> dict[str, Any]:
    """Fichiers traités par heure sur la dernière heure (ou ce qui est disponible)."""
    samples = ((await cache.get_json(SAMPLES_KEY)) or {}).get("items") or []
    if len(samples) < 2:
        return {"per_hour": None, "window_minutes": 0}
    recent = [s for s in samples if datetime.fromisoformat(s["at"]) >= _now() - timedelta(hours=1)] or samples
    first, last = (recent[0] if len(recent) > 1 else samples[-2]), samples[-1]
    minutes = (datetime.fromisoformat(last["at"]) - datetime.fromisoformat(first["at"])).total_seconds() / 60
    done = max(0, int(last["processed"]) - int(first["processed"]))
    if minutes < 5:
        return {"per_hour": None, "window_minutes": round(minutes)}
    return {"per_hour": round(done * 60 / minutes, 1), "window_minutes": round(minutes)}


async def run() -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        inst = await fileflows.get_instance(db)
        if inst is None:
            return {"status": "not_configured"}
        url, api_key = inst.url, inst.api_key
        mode = (settings.fileflows_plex_pause if settings else "off") or "off"
        runners_mode = (settings.fileflows_runners_mode if settings else "manual") or "manual"
        reorder_on = bool(settings and settings.fileflows_reorder_enabled)
        chosen = fileflows_queue.parse_libraries(settings.fileflows_reorder_libraries if settings else None)
        locations = await plex_locations(db, settings) if mode != "off" else []
        playing = await playing_files(db, settings) if mode != "off" else []

    try:
        libraries = await fileflows_queue._libraries(url, api_key)
        queue = await fileflows_queue._queue(url, api_key)
        status = await fileflows._call(url, api_key, "GET", "status") or {}
    except fileflows.FileFlowsError as exc:
        return {"status": "error", "error": str(exc)}
    await _record_sample(int(status.get("processed") or 0))

    disk_of_lib = {lib["Uid"]: disk_of(lib.get("Path")) for lib in libraries}
    result: dict[str, Any] = {"status": "ok", "pause_mode": mode}

    # Fichiers relancés : vus en file avec un flow déjà associé. On les retient un jour, pour
    # les reconnaître aussi une fois en cours de traitement.
    relaunched = set(((await cache.get_json(RELAUNCHED_KEY)) or {}).get("uids") or [])
    relaunched |= {row["u"] for row in queue if fileflows_queue.relaunched(row)}
    await cache.set_json(RELAUNCHED_KEY, {"uids": sorted(relaunched)[-500:]}, ttl_seconds=24 * 3600)

    # --- Pause pendant une lecture Plex
    paused_disks: list[str] = []
    playing_disks: list[str] = []
    if mode != "off":
        mapping = effective_locations(settings, suggest_locations(libraries, locations))
        for path in playing:
            uid = library_for_file(path, mapping)
            if uid and disk_of_lib.get(uid) and disk_of_lib[uid] not in playing_disks:
                playing_disks.append(disk_of_lib[uid])
        now = _now()
        last_play = ((await cache.get_json(LAST_PLAY_KEY)) or {}).get("disks") or {}
        if mode == "all" and playing:
            last_play["*"] = now.isoformat()
        for disk in playing_disks:
            last_play[disk] = now.isoformat()
        delay = timedelta(minutes=max(0, int(settings.fileflows_plex_resume_minutes or 0)))
        last_play = {
            k: v for k, v in last_play.items() if datetime.fromisoformat(v) >= now - delay - timedelta(minutes=1)
        }
        await cache.set_json(LAST_PLAY_KEY, {"disks": last_play}, ttl_seconds=24 * 3600)
        held = {k for k, v in last_play.items() if datetime.fromisoformat(v) >= now - delay}
        all_paused = mode == "all" and "*" in held
        paused_disks = sorted(set(disk_of_lib.values()) if all_paused else {d for d in held if d != "*"})
        state = {
            "updated": now.isoformat(),
            "all": all_paused,
            "disks": paused_disks,
            "exempt": sorted(relaunched) if settings.fileflows_plex_pause_relaunched == "ignore" else [],
        }
    else:
        state = {"updated": _now().isoformat(), "all": False, "disks": [], "exempt": []}
    try:
        await publish_pause(url, api_key, state)
    except fileflows.FileFlowsError as exc:
        result["pause_error"] = str(exc)
    result.update({"playing_disks": playing_disks, "paused_disks": paused_disks})

    # --- Ordre de la file
    paused_libs = {uid for uid, disk in disk_of_lib.items() if disk in paused_disks}
    if reorder_on or paused_libs:
        relaunched_pass = not paused_libs or settings.fileflows_plex_pause_relaunched == "ignore"
        order, _, _ = fileflows_queue.desired_order(
            queue, set(chosen) if reorder_on else set(), paused=paused_libs, relaunched_pass=relaunched_pass
        )
        if order != [row["u"] for row in queue]:
            try:
                await fileflows._call(
                    url, api_key, "POST", "library-file/move-to-top", json={"Uids": order}, timeout=120
                )
                result["reordered"] = True
            except fileflows.FileFlowsError as exc:
                result["reorder_error"] = str(exc)

    # --- Runners automatiques : un par disque avec des fichiers à traiter (hors pause).
    if runners_mode == "auto":
        active = {disk_of_lib.get(row.get("lu")) for row in queue if row.get("lu") in disk_of_lib}
        active |= {disk_of(r.get("name")) for r in status.get("processingFiles") or []}
        active = {d for d in active if d and d not in paused_disks}
        try:
            changed = await set_runners(url, api_key, max(1, len(active)))
            if changed is not None:
                result["runners"] = {"from": changed, "to": max(1, min(MAX_RUNNERS, len(active)))}
        except fileflows.FileFlowsError as exc:
            result["runners_error"] = str(exc)

    await cache.set_json(STATE_KEY, {**result, "at": _now().isoformat()}, ttl_seconds=3600)
    return result


async def last_state() -> dict[str, Any] | None:
    try:
        return await cache.get_json(STATE_KEY)
    except Exception:  # noqa: BLE001
        return None
