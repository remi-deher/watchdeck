"""Client pour FileFlows (traitement et réencodage des fichiers médias).

FileFlows passe chaque fichier de ses bibliothèques dans un « flow » : chez nous, il
corrige les sous-titres (ASS, polices), uniformise l'audio et réencode la vidéo. Watchdeck
s'en sert pour suivre ces traitements, relancer un fichier et mettre FileFlows en pause.

Les routes lues ici sont celles qu'emploie l'interface web de FileFlows, pas une API
publique documentée : `library-file/list-all` renvoie par exemple des clés raccourcies
(`u`, `dn`, `fr`...). Tout ce qui en dépend reste dans ce module, et ce qui en sort est
converti en dictionnaires stables : une version de FileFlows qui change ces routes ne
demande de corriger que ce fichier.

FileFlows n'a pas d'authentification par défaut ; s'il en a une, sa clé part dans
l'en-tête `x-token`.
"""

import asyncio
import html
import json
import logging
import re
import time
from html.parser import HTMLParser
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models import ArrInstance, LibraryItem
from . import arr_catalog
from .arr_http_client import ArrClient

logger = logging.getLogger(__name__)

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")

# FileStatus de FileFlows. Les codes absents (version plus récente) restent affichés tels quels.
STATUS_LABELS: dict[int, str] = {
    -3: "Bibliothèque introuvable",
    -2: "Bibliothèque désactivée",
    -1: "Hors plage horaire",
    0: "En attente",
    1: "Traité",
    2: "En cours",
    3: "Flow introuvable",
    4: "Échec",
    5: "Doublon",
    6: "Problème de chemin",
    7: "En pause",
}
STATUS_QUEUED, STATUS_PROCESSED, STATUS_PROCESSING, STATUS_FAILED = 0, 1, 2, 4
# Filtres proposés par l'écran : ceux que `list-all` sait servir.
LISTABLE_STATUSES = (STATUS_QUEUED, STATUS_PROCESSED, STATUS_PROCESSING, STATUS_FAILED, -2, -1, -3)

MAX_REPROCESS = 100
LOG_MAX_CHARS = 300_000
PAUSE_MAX_MINUTES = 7 * 24 * 60


class FileFlowsError(Exception):
    """FileFlows injoignable ou réponse inattendue : le message se montre tel quel."""


def _client(url: str, api_key: str | None, timeout: int = 20) -> ArrClient:
    client = ArrClient(url, api_key or "", timeout=timeout)
    client.headers = {"Accept": "application/json", **({"x-token": api_key} if api_key else {})}
    return client


def scrub(text: str) -> str:
    """Masque les secrets qu'un journal de traitement peut contenir (jetons Plex, clés)."""
    text = re.sub(r"(?i)(X-Plex-Token\s*=\s*)[^&\s<]+", r"\1[masqué]", text)
    return re.sub(
        r"(?i)((?:AccessToken|ApiKey|Api-Key|Password|Authorization|x-token)\s*[=:]\s*[\"']?)[^\s,\"'<]+",
        r"\1[masqué]",
        text,
    )


async def _call(
    url: str, api_key: str | None, method: str, path: str, *, timeout: int = 20, text: bool = False, **kwargs
) -> Any:
    try:
        response = await _client(url, api_key, timeout)._request(method, "/api/" + path.lstrip("/"), **kwargs)
    except Exception as exc:
        raise FileFlowsError(f"FileFlows injoignable : {exc.__class__.__name__}") from exc
    if response.status_code in (401, 403):
        raise FileFlowsError("FileFlows refuse l'accès : vérifiez la clé API")
    if response.status_code >= 400:
        raise FileFlowsError(f"FileFlows a répondu {response.status_code}")
    raw = response.content or b""
    # Une route inconnue renvoie la page d'accueil de l'interface, en 200.
    if raw.lstrip()[:15].lower().startswith(b"<!doctype html"):
        raise FileFlowsError("Route FileFlows inconnue (version incompatible ?)")
    if text:
        return raw.decode("utf-8-sig", errors="replace")
    if not raw.strip():
        return {}
    try:
        return response.json()
    except ValueError as exc:
        raise FileFlowsError("Réponse FileFlows illisible") from exc


async def check_connection(url: str, api_key: str | None = None) -> tuple[bool, str]:
    try:
        nodes = await _call(url, api_key, "GET", "node", timeout=10)
    except FileFlowsError as exc:
        return False, str(exc)
    version = next((n.get("Version") for n in nodes if isinstance(n, dict) and n.get("Version")), "")
    return True, f"FileFlows connecté{f' (v{version})' if version else ''}"


# --------------------------------------------------------------------------- lecture


def status_label(code: int | None) -> str:
    return STATUS_LABELS.get(int(code), f"Statut {code}") if code is not None else ""


def _clean_duration(value: Any) -> str | None:
    """`00:04:25.123` -> `00:04:25` ; FileFlows note parfois une durée négative ou nulle."""
    text = str(value or "").lstrip("-").split(".")[0]
    return text if text and text not in ("00:00:00", "0:00:00") else None


def normalize_file(row: dict) -> dict[str, Any]:
    """Une ligne de `list-all` ou de `search`, en clés lisibles."""
    status = row.get("s")
    return {
        "uid": row.get("u"),
        "name": row.get("dn") or "",
        "library": row.get("l") or "",
        "library_uid": row.get("lu"),
        "flow": row.get("fn") or "",
        "node": row.get("pn") or "",
        "status": status,
        "status_label": status_label(status),
        "failure_reason": scrub(row.get("fr") or ""),
        "original_size": row.get("os") or None,
        "final_size": row.get("fs") or None,
        "duration": _clean_duration(row.get("pt")),
        "date": row.get("dt"),
        "tags": [t for t in (row.get("t") or []) if isinstance(t, str)],
    }


async def dashboard(url: str, api_key: str | None) -> dict[str, Any]:
    """État global : file, traitements en cours, compteurs par statut, pause."""
    status, settings, counts = await asyncio.gather(
        _call(url, api_key, "GET", "status"),
        _call(url, api_key, "GET", "settings"),
        _call(url, api_key, "GET", "library-file/status"),
    )
    by_status = {int(r.get("Status")): int(r.get("StatusCount") or 0) for r in counts or [] if "Status" in r}
    runners = [
        {
            "path": runner.get("name") or "",
            "name": runner.get("relativePath") or runner.get("name") or "",
            "library": runner.get("library") or "",
            "step": runner.get("step") or "",
            "percent": runner.get("stepPercent") or 0,
        }
        for runner in status.get("processingFiles") or []
    ]
    paused = bool(settings.get("IsPaused"))
    return {
        "queue": int(status.get("queue") or 0),
        "processing": int(status.get("processing") or 0),
        "processed": by_status.get(STATUS_PROCESSED, int(status.get("processed") or 0)),
        "failed": by_status.get(STATUS_FAILED, 0),
        "counts": by_status,
        "time": status.get("time") or None,
        "paused": paused,
        "paused_until": settings.get("PausedUntil") if paused else None,
        "page_size": int(settings.get("MaxPageSize") or 500),
        "runners": runners,
    }


async def list_files(
    url: str, api_key: str | None, status: int, *, page: int = 0, search: str = ""
) -> list[dict[str, Any]]:
    rows = await _call(
        url,
        api_key,
        "GET",
        "library-file/list-all",
        params={"status": status, "page": page, "filter": search[:300]},
        timeout=30,
    )
    return [normalize_file(r) for r in rows or [] if isinstance(r, dict)]


async def search_files(url: str, api_key: str | None, text: str, *, limit: int = 200) -> list[dict[str, Any]]:
    """Fichiers dont le chemin contient `text`, tous statuts confondus."""
    rows = await _call(url, api_key, "POST", "library-file/search", json={"Path": text, "Limit": limit}, timeout=30)
    return [normalize_file(r) for r in rows or [] if isinstance(r, dict)]


async def file_detail(url: str, api_key: str | None, uid: str) -> dict[str, Any]:
    if not UUID_RE.fullmatch(uid):
        raise ValueError("Identifiant de fichier invalide")
    return await _call(url, api_key, "GET", f"library-file/{uid}")


class _LogText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in ("div", "p", "br", "li"):
            self.parts.append("\n")


async def file_log(url: str, api_key: str | None, uid: str) -> str:
    if not UUID_RE.fullmatch(uid):
        raise ValueError("Identifiant de fichier invalide")
    raw = (await _call(url, api_key, "GET", f"library-file/{uid}/log", text=True, timeout=30)).strip()
    # La route renvoie le journal en chaîne JSON, elle-même faite de HTML (une `div` par ligne).
    if raw.startswith('"'):
        try:
            raw = json.loads(raw)
        except ValueError:
            pass
    if raw.lstrip().startswith("<"):
        parser = _LogText()
        parser.feed(raw)
        raw = "".join(parser.parts)
    text = re.sub(r"\n[ \t]*\n+", "\n", scrub(html.unescape(raw)))
    if len(text) > LOG_MAX_CHARS:
        # La fin du journal est celle qui explique un échec.
        text = "[… début du journal tronqué …]\n" + text[-LOG_MAX_CHARS:]
    return text


# --------------------------------------------------------------------------- commandes


async def set_paused(url: str, api_key: str | None, minutes: int) -> None:
    """`minutes=0` reprend. La pause laisse terminer le fichier en cours (`abort=false`)."""
    minutes = max(0, min(int(minutes), PAUSE_MAX_MINUTES))
    await _call(url, api_key, "POST", "system/pause", params={"duration": minutes, "abort": "false"}, json={})


async def reprocess(url: str, api_key: str | None, uids: list[str]) -> dict[str, Any]:
    """Remet des fichiers en file, chacun dans le flow de sa bibliothèque.

    Les fichiers déjà en file ou en cours sont ignorés. FileFlows attend un flow par
    appel : les fichiers sont donc groupés par flow.
    """
    uids = list(dict.fromkeys(uids or []))
    if not 1 <= len(uids) <= MAX_REPROCESS:
        raise ValueError(f"Sélectionnez entre 1 et {MAX_REPROCESS} fichiers")
    if any(not isinstance(u, str) or not UUID_RE.fullmatch(u) for u in uids):
        raise ValueError("Identifiant de fichier invalide")
    libraries = {lib.get("Uid"): lib for lib in await _call(url, api_key, "GET", "library") or []}
    groups: dict[str, dict[str, Any]] = {}
    skipped, warnings = 0, []
    for uid in uids:
        detail = await file_detail(url, api_key, uid)
        if detail.get("Status") in (STATUS_QUEUED, STATUS_PROCESSING):
            skipped += 1
            continue
        library = libraries.get(detail.get("LibraryUid"))
        if not library:
            raise ValueError("Bibliothèque FileFlows du fichier introuvable")
        flow = library.get("Flow") or {}
        flow_uid = str(flow.get("Uid") or "")
        if not UUID_RE.fullmatch(flow_uid) or flow_uid.startswith("00000000"):
            raise ValueError(f"Aucun flow configuré pour {library.get('Name', 'cette bibliothèque')}")
        groups.setdefault(flow_uid, {"flow": flow, "uids": []})["uids"].append(uid)
        if not library.get("Enabled"):
            message = f"Bibliothèque désactivée dans FileFlows : {library.get('Name', '')}"
            if message not in warnings:
                warnings.append(message)
    queued = 0
    for group in groups.values():
        try:
            await _call(
                url,
                api_key,
                "POST",
                "library-file/reprocess",
                json={
                    "Uids": group["uids"],
                    "Mode": 0,
                    "CustomVariables": {},
                    "Flow": group["flow"],
                    "BottomOfQueue": False,
                },
            )
        except FileFlowsError as exc:
            if queued:
                raise FileFlowsError(f"{queued} fichier(s) remis en file, puis échec : {exc}") from exc
            raise
        queued += len(group["uids"])
    return {"queued": queued, "skipped": skipped, "warnings": warnings}


# --------------------------------------------------------------------------- instance


async def get_instance(db: AsyncSession) -> ArrInstance | None:
    """L'instance FileFlows active (celle par défaut d'abord)."""
    rows = (
        (
            await db.execute(
                select(ArrInstance)
                .filter(ArrInstance.arr_type == "fileflows", ArrInstance.enabled)
                .order_by(ArrInstance.is_default.desc(), ArrInstance.id)
            )
        )
        .scalars()
        .all()
    )
    return rows[0] if rows else None


# --------------------------------------------------------------------------- médias

# FileFlows connaît des chemins, Watchdeck des médias. Le lien passe par le dossier du
# média : Radarr/Sonarr le connaissent (`path`), et FileFlows le donne dans le chemin
# relatif de chaque fichier (`Titre (2009)/Titre (2009).mkv`). Seul le nom du dossier est
# comparé : les points de montage diffèrent d'un conteneur à l'autre.


def folder_name(path: str | None) -> str:
    return (path or "").replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]


def folders_of(relative_path: str) -> list[str]:
    """Les dossiers d'un chemin relatif FileFlows, sans le nom du fichier."""
    return [part for part in (relative_path or "").replace("\\", "/").split("/")[:-1] if part]


async def media_folder(db: AsyncSession, item: LibraryItem) -> str | None:
    """Nom du dossier du média selon Radarr/Sonarr, sinon `Titre (Année)`."""
    if item.arr_instance_id and item.arr_id:
        inst = await db.get(ArrInstance, item.arr_instance_id)
        if inst and inst.arr_type in ("radarr", "sonarr"):
            catalog = await arr_catalog.get_catalog(inst.arr_type, inst.url, inst.api_key) or []
            entry = next((row for row in catalog if row.get("id") == item.arr_id), None)
            if entry and entry.get("path"):
                return folder_name(entry["path"])
    if item.title:
        return f"{item.title} ({item.year})" if item.year else item.title
    return None


async def files_for_item(url: str, api_key: str | None, folder: str) -> list[dict[str, Any]]:
    """Fichiers FileFlows rangés dans ce dossier, les plus récents d'abord."""
    rows = await search_files(url, api_key, folder)
    wanted = folder.casefold()
    matches = [row for row in rows if wanted in (part.casefold() for part in folders_of(row["name"]))]
    return sorted(matches, key=lambda row: row.get("date") or "", reverse=True)


# L'index est relu par chaque actualisation de l'état (accueil, page Encodage) ; il ne
# change qu'a l'ajout d'un media. Quelques minutes de cache evitent de reparcourir les
# catalogues Radarr/Sonarr (plusieurs Mo) toutes les quinze secondes.
_INDEX_TTL_SECONDS = 300.0
_index_cache: tuple[float, dict[str, dict[str, Any]]] | None = None


async def folder_index(db: AsyncSession) -> dict[str, dict[str, Any]]:
    """{nom de dossier (minuscules): média} pour les médias suivis par Radarr/Sonarr."""
    global _index_cache
    if _index_cache and time.monotonic() - _index_cache[0] < _INDEX_TTL_SECONDS:
        return _index_cache[1]
    index = await _build_folder_index(db)
    _index_cache = (time.monotonic(), index)
    return index


async def _build_folder_index(db: AsyncSession) -> dict[str, dict[str, Any]]:
    instances = (
        (
            await db.execute(
                select(ArrInstance).filter(ArrInstance.arr_type.in_(("radarr", "sonarr")), ArrInstance.enabled)
            )
        )
        .scalars()
        .all()
    )
    if not instances:
        return {}
    items = (
        await db.execute(
            select(
                LibraryItem.id,
                LibraryItem.title,
                LibraryItem.year,
                LibraryItem.media_type,
                LibraryItem.poster_url,
                LibraryItem.arr_instance_id,
                LibraryItem.arr_id,
            ).filter(LibraryItem.arr_instance_id.in_([i.id for i in instances]), LibraryItem.arr_id.isnot(None))
        )
    ).all()
    by_arr = {(row.arr_instance_id, row.arr_id): row for row in items}
    catalogs = await asyncio.gather(
        *(arr_catalog.get_catalog(inst.arr_type, inst.url, inst.api_key) for inst in instances)
    )
    index: dict[str, dict[str, Any]] = {}
    for inst, catalog in zip(instances, catalogs):
        for entry in catalog or []:
            row = by_arr.get((inst.id, entry.get("id")))
            name = folder_name(entry.get("path"))
            if row is None or not name:
                continue
            index[name.casefold()] = {
                "id": row.id,
                "title": row.title,
                "year": row.year,
                "media_type": row.media_type,
                "poster_url": row.poster_url,
            }
    return index


def match_media(index: dict[str, dict[str, Any]], relative_path: str) -> dict[str, Any] | None:
    for part in folders_of(relative_path):
        media = index.get(part.casefold())
        if media:
            return media
    return None
