"""Telechargements directs en cours et historique des telechargements termines."""

import asyncio
import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..cache import cache
from ..database import AsyncSessionLocal, get_db_async
from ..dependencies import require_admin
from ..models import ArrInstance, DownloadClient, MediaRequest
from ..realtime import publish
from ..utils import wrap_image_proxy
from .arr_shared import _QUEUE_CACHE_TTL, DOWNLOAD_CLIENTS_CACHE_KEY, _direct_cache, invalidate_download_clients_cache

router = APIRouter(prefix="/api", tags=["arr"], dependencies=[Depends(require_admin)])
logger = logging.getLogger(__name__)


class TorrentControlRequest(BaseModel):
    action: str
    delete_files: bool = False
    category: Optional[str] = None
    tags: Optional[str] = None


class TorrentMetadataRequest(BaseModel):
    kind: str
    action: str
    name: str
    new_name: Optional[str] = None


_torrent_client_cache = {}


@router.get("/downloads/tracker-favicon")
async def tracker_favicon(tracker: str = Query(..., min_length=1, max_length=2048), db: AsyncSession = Depends(get_db_async)):
    from ..services.tracker_favicons import get_tracker_favicon

    result = await get_tracker_favicon(db, tracker)
    headers = {"Cache-Control": "private, max-age=86400, stale-while-revalidate=604800"}
    if not result:
        return Response(status_code=204, headers=headers)
    content, content_type = result
    return Response(content=content, media_type=content_type, headers=headers)


@router.get("/downloads/clients")
async def download_client_queue(db: AsyncSession = Depends(get_db_async)):
    """File torrent complète, servie en SWR pour éviter une connexion à chaque navigation."""
    async def _background():
        async with AsyncSessionLocal() as fresh_db:
            return await _compute_download_client_queue(fresh_db)

    return await cache.get_or_refresh(
        DOWNLOAD_CLIENTS_CACHE_KEY,
        soft_ttl_seconds=2,
        hard_ttl_seconds=20,
        compute_sync=lambda: _compute_download_client_queue(db),
        compute_background=_background,
    )


async def _compute_download_client_queue(db: AsyncSession) -> list[dict]:
    """Interroge réellement tous les clients et projette leurs torrents."""
    import time

    from ..services.download_clients import list_client_torrents

    clients = (await db.execute(
        select(DownloadClient).filter(DownloadClient.enabled, DownloadClient.client_type.in_(("qbittorrent", "transmission")))
    )).scalars().all()
    requests = (await db.execute(select(MediaRequest).filter(MediaRequest.torrent_hash.isnot(None)))).scalars().all()
    requests_by_hash = {str(row.torrent_hash).lower(): row for row in requests if row.torrent_hash}

    async def load(client):
        try:
            torrents = await list_client_torrents(client.client_type, client.url, client.username, client.password)
            _torrent_client_cache[client.id] = {"torrents": torrents, "ts": time.time()}
            return client, torrents, None, False, 0
        except Exception as exc:
            logger.warning("Lecture client torrent impossible pour %s: %s", client.name, exc)
            cached = _torrent_client_cache.get(client.id)
            if cached and cached.get("torrents"):
                stale_sec = int(time.time() - (cached.get("ts") or time.time()))
                return client, cached["torrents"], str(exc), True, stale_sec
            return client, [], str(exc), False, 0

    results = await asyncio.gather(*(load(client) for client in clients))
    output = []
    for client, torrents, client_error, is_stale, stale_sec in results:
        if client_error and not is_stale:
            output.append({"client_id": client.id, "client_name": client.name, "client_error": client_error})
            continue
        for torrent in torrents:
            torrent_hash = str(torrent.get("hash") or "").lower()
            request = requests_by_hash.get(torrent_hash)
            output.append({
                "client_id": client.id,
                "client_name": client.name,
                "client_type": client.client_type,
                "hash": torrent_hash,
                "title": torrent.get("name") or "Torrent sans nom",
                "status": torrent.get("state") or "unknown",
                "progress": round(float(torrent.get("progress") or 0) * 100, 1),
                "size": torrent.get("size") or 0,
                "download_speed": 0 if is_stale else (torrent.get("dlspeed") or 0),
                "upload_speed": 0 if is_stale else (torrent.get("upspeed") or 0),
                "ratio": torrent.get("ratio") or 0,
                "eta": torrent.get("eta") or 0,
                "category": torrent.get("category") or "",
                "tags": torrent.get("tags") or "",
                "comment": torrent.get("comment") or "",
                "added_on": torrent.get("added_on") or torrent.get("addedDate"),
                "completed_on": torrent.get("completed_on") or torrent.get("completion_on") or torrent.get("doneDate"),
                "tracker": torrent.get("tracker") or "",
                "trackers": torrent.get("trackers") or torrent.get("tracker") or "",
                "request_id": request.id if request else None,
                "library_id": request.library_item_id if request else None,
                "managed_by": "watchdeck" if request else "external",
                "is_stale": is_stale,
                "stale_since_seconds": stale_sec,
                "client_error": client_error if is_stale else None,
            })
    return output


@router.post("/downloads/clients/{client_id}/{torrent_hash}/control")
async def control_client_torrent(
    client_id: int,
    torrent_hash: str,
    body: TorrentControlRequest,
    db: AsyncSession = Depends(get_db_async),
):
    from ..services.download_clients import control_client_torrent

    if body.action not in {"pause", "resume", "recheck", "reannounce", "set_category", "set_tags", "delete"}:
        raise HTTPException(400, f"Action client torrent inconnue : {body.action}")
    client = (await db.execute(
        select(DownloadClient).filter(
            DownloadClient.id == client_id,
            DownloadClient.enabled,
            DownloadClient.client_type.in_(("qbittorrent", "transmission")),
        )
    )).scalars().first()
    if not client:
        raise HTTPException(404, "Client torrent introuvable")
    try:
        ok = await control_client_torrent(
            client.client_type,
            client.url,
            client.username,
            client.password,
            torrent_hash,
            body.action,
            delete_files=body.delete_files,
            category=body.category,
            tags=body.tags,
        )
    except Exception as exc:
        raise HTTPException(502, f"Commande du client torrent impossible : {exc}") from exc
    if not ok:
        raise HTTPException(502, "Commande client torrent refusée")
    await invalidate_download_clients_cache()
    await publish("download.updated", {"client_id": client.id, "hash": torrent_hash, "action": body.action}, admin_only=True)
    return {"ok": True, "action": body.action}


@router.get("/downloads/clients/{client_id}/metadata")
async def get_client_metadata(client_id: int, db: AsyncSession = Depends(get_db_async)):
    from ..services.download_clients import get_qbittorrent_metadata, list_client_torrents

    client = (await db.execute(select(DownloadClient).filter(DownloadClient.id == client_id, DownloadClient.enabled))).scalars().first()
    if not client:
        raise HTTPException(404, "Client torrent introuvable")
    try:
        if client.client_type == "qbittorrent":
            return await get_qbittorrent_metadata(client.url, client.username, client.password)
        torrents = await list_client_torrents(client.client_type, client.url, client.username, client.password)
        tags = sorted({tag.strip() for row in torrents for tag in str(row.get("tags") or "").split(",") if tag.strip()}, key=str.casefold)
        categories = sorted({str(row.get("category") or "").strip() for row in torrents if str(row.get("category") or "").strip()}, key=str.casefold)
        return {"categories": [{"name": name, "save_path": ""} for name in categories], "tags": tags, "mutable": False}
    except Exception as exc:
        raise HTTPException(502, f"Lecture des catégories et tags impossible : {exc}") from exc


@router.post("/downloads/clients/{client_id}/metadata")
async def mutate_client_metadata(client_id: int, body: TorrentMetadataRequest, db: AsyncSession = Depends(get_db_async)):
    from ..services.download_clients import mutate_qbittorrent_metadata

    if body.kind not in {"category", "tag"} or body.action not in {"create", "rename", "delete"}:
        raise HTTPException(400, "Opération de métadonnées invalide")
    name = body.name.strip()
    new_name = (body.new_name or "").strip() or None
    if not name or body.action == "rename" and not new_name:
        raise HTTPException(400, "Nom requis")
    client = (await db.execute(select(DownloadClient).filter(DownloadClient.id == client_id, DownloadClient.enabled))).scalars().first()
    if not client:
        raise HTTPException(404, "Client torrent introuvable")
    if client.client_type != "qbittorrent":
        raise HTTPException(400, "Ce client ne permet pas de gérer un registre global de catégories et tags")
    try:
        metadata = await get_client_metadata(client_id, db)
        values = [item["name"] for item in metadata["categories"]] if body.kind == "category" else metadata["tags"]
        canonical = {value.casefold(): value for value in values}
        if body.action == "create" and name.casefold() in canonical:
            return {"ok": True, "name": canonical[name.casefold()], "existing": True}
        if body.action == "rename" and new_name.casefold() in canonical and new_name.casefold() != name.casefold():
            raise HTTPException(409, "Une valeur portant ce nom existe déjà")
        await mutate_qbittorrent_metadata(client.url, client.username, client.password, kind=body.kind, action=body.action, name=canonical.get(name.casefold(), name), new_name=new_name)
        await invalidate_download_clients_cache()
        await publish("download.updated", {"client_id": client.id, "action": f"metadata_{body.action}"}, admin_only=True)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Gestion des catégories et tags impossible : {exc}") from exc


@router.get("/downloads/direct")
async def direct_downloads(db: AsyncSession = Depends(get_db_async)):
    """Torrents poussés en direct-client (hors *arr), suivis via download_client_id + torrent_hash sur les demandes."""
    from ..services.download_clients import get_torrent_status

    now = time.monotonic()
    if _direct_cache["data"] is not None and now - _direct_cache["ts"] < _QUEUE_CACHE_TTL:
        return _direct_cache["data"]

    reqs = (
        await db.execute(
            select(MediaRequest).filter(
                MediaRequest.torrent_hash.isnot(None),
                MediaRequest.download_client_id.isnot(None),
            )
        )
    ).scalars().all()
    clients = {c.id: c for c in (await db.execute(select(DownloadClient))).scalars().all()}
    tracked = [(req, clients.get(req.download_client_id)) for req in reqs]
    tracked = [(req, client) for req, client in tracked if client and client.enabled]

    async def _status(req, client):
        try:
            return await get_torrent_status(
                client.client_type, client.url, client.username, client.password, req.torrent_hash
            )
        except Exception:
            return None

    statuses = await asyncio.gather(*[_status(req, client) for req, client in tracked])

    out = []
    for (req, client), st in zip(tracked, statuses):
        if not st:
            continue
        progress = round(st.get("progress") or 0, 1)
        eta = st.get("eta") or 0
        if progress >= 100 or eta <= 0:
            timeleft = "—"
        else:
            h, m = eta // 3600, (eta % 3600) // 60
            timeleft = f"{h}h {m}m" if h else f"{m}m"
        out.append(
            {
                "title": req.title + (f" ({req.year})" if req.year else ""),
                "status": "completed" if progress >= 100 else "downloading",
                "progress": progress,
                "size": None,
                "sizeleft": None,
                "timeleft": timeleft,
                "download_client": client.name,
                "indexer": None,
                "instance": client.name,
                "arr_type": "direct",
                "error": None,
                "request_id": req.id,
                "library_id": req.library_item_id,
            }
        )
    _direct_cache["data"] = out
    _direct_cache["ts"] = now
    return out

@router.get("/downloads/history")
async def downloads_history(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    media_type: Optional[str] = None,
    source: Optional[str] = None,
    instance_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db_async),
):
    """Historique local; aucune consultation des instances *Arr à l'affichage."""
    from ..models import DownloadHistory

    eff_limit = limit
    eff_offset = offset

    arr_types = {"sonarr", "radarr"}
    q = select(DownloadHistory)
    if media_type in ("movie", "show"):
        q = q.filter(DownloadHistory.media_type == media_type)
    if source:
        q = q.filter(DownloadHistory.source == source)
        if source in arr_types:
            q = q.filter(DownloadHistory.arr_history_id.is_not(None))
    else:
        q = q.filter(
            DownloadHistory.source != "plex_sync",
            (~DownloadHistory.source.in_(arr_types)) | DownloadHistory.arr_history_id.is_not(None),
        )
    if instance_id is not None:
        q = q.filter(DownloadHistory.arr_instance_id == instance_id)
    rows = (
        await db.execute(q.order_by(DownloadHistory.completed_at.desc()).offset(eff_offset).limit(eff_limit))
    ).scalars().all()

    req_ids = [h.request_id for h in rows if h.request_id]
    req_posters = {}
    if req_ids:
        reqs = (await db.execute(select(MediaRequest).filter(MediaRequest.id.in_(req_ids)))).scalars().all()
        req_posters = {r.id: r.poster_url for r in reqs if r.poster_url}

    arr_insts = (await db.execute(select(ArrInstance))).scalars().all()
    arr_urls = {i.id: i.url for i in arr_insts if i.url}

    local_items = []
    for h in rows:
        poster = h.poster_url or req_posters.get(h.request_id)
        if poster:
            if poster.startswith("/") and h.arr_instance_id in arr_urls:
                poster = f"{arr_urls[h.arr_instance_id].rstrip('/')}{poster}"
            poster = wrap_image_proxy(poster)
        local_items.append({
            "id": h.id,
            "title": h.title,
            "year": h.year,
            "media_type": h.media_type,
            "source": h.source,
            "instance_name": h.instance_name,
            "poster_url": poster,
            "request_id": h.request_id,
            "completed_at": h.completed_at.isoformat() if h.completed_at else None,
            "processing_mode": h.processing_mode or "observed",
        })
    return {"items": local_items, "errors": [], "authoritative": True}


class FilePriorityRequest(BaseModel):
    file_ids: list[int]
    priority: int


@router.get("/downloads/clients/{client_id}/{torrent_hash}/files")
async def get_torrent_files_api(client_id: int, torrent_hash: str, db: AsyncSession = Depends(get_db_async)):
    from ..services.download_clients import list_torrent_files
    client = (await db.execute(select(DownloadClient).filter(DownloadClient.id == client_id, DownloadClient.enabled))).scalars().first()
    if not client:
        raise HTTPException(404, "Client torrent introuvable")
    return await list_torrent_files(client.client_type, client.url, client.username, client.password, torrent_hash)


@router.post("/downloads/clients/{client_id}/{torrent_hash}/files/priority")
async def set_torrent_file_priority_api(client_id: int, torrent_hash: str, body: FilePriorityRequest, db: AsyncSession = Depends(get_db_async)):
    from ..services.download_clients import set_torrent_file_priority
    client = (await db.execute(select(DownloadClient).filter(DownloadClient.id == client_id, DownloadClient.enabled))).scalars().first()
    if not client:
        raise HTTPException(404, "Client torrent introuvable")
    ok = await set_torrent_file_priority(client.client_type, client.url, client.username, client.password, torrent_hash, body.file_ids, body.priority)
    if not ok:
        raise HTTPException(502, "Modification des priorités impossible")
    return {"ok": True}


@router.get("/downloads/clients/{client_id}/{torrent_hash}/trackers")
async def get_torrent_trackers_api(client_id: int, torrent_hash: str, db: AsyncSession = Depends(get_db_async)):
    from ..services.download_clients import list_torrent_trackers
    client = (await db.execute(select(DownloadClient).filter(DownloadClient.id == client_id, DownloadClient.enabled))).scalars().first()
    if not client:
        raise HTTPException(404, "Client torrent introuvable")
    return await list_torrent_trackers(client.client_type, client.url, client.username, client.password, torrent_hash)


@router.get("/downloads/clients/{client_id}/{torrent_hash}/peers")
async def get_torrent_peers_api(client_id: int, torrent_hash: str, db: AsyncSession = Depends(get_db_async)):
    from ..services.download_clients import list_torrent_peers
    client = (await db.execute(select(DownloadClient).filter(DownloadClient.id == client_id, DownloadClient.enabled))).scalars().first()
    if not client:
        raise HTTPException(404, "Client torrent introuvable")
    return await list_torrent_peers(client.client_type, client.url, client.username, client.password, torrent_hash)


@router.get("/downloads/global-stats")
async def get_global_stats_api(client_id: Optional[int] = None, db: AsyncSession = Depends(get_db_async)):
    from ..services.download_clients import get_client_global_stats
    query = select(DownloadClient).filter(DownloadClient.enabled)
    if client_id is not None:
        query = query.filter(DownloadClient.id == client_id)
    clients = (await db.execute(query)).scalars().all()
    total_dl = 0
    total_up = 0
    alt_speed = False
    results = await asyncio.gather(*(
        get_client_global_stats(client.client_type, client.url, client.username, client.password)
        for client in clients
    ), return_exceptions=True)
    connected = 0
    client_stats = []
    for client, stats in zip(clients, results):
        if isinstance(stats, Exception):
            client_stats.append({"client_id": client.id, "connected": False})
            continue
        is_connected = bool(stats.get("connected", True))
        connected += int(is_connected)
        total_dl += stats.get("download_speed", 0)
        total_up += stats.get("upload_speed", 0)
        if stats.get("alt_speed_enabled"):
            alt_speed = True
        client_stats.append({"client_id": client.id, **stats, "connected": is_connected})
    return {
        "download_speed": total_dl,
        "upload_speed": total_up,
        "alt_speed_enabled": alt_speed,
        "connected": connected,
        "total": len(clients),
        "clients": client_stats,
    }


@router.post("/downloads/global-alt-speed")
async def toggle_global_alt_speed_api(db: AsyncSession = Depends(get_db_async)):
    from ..services.download_clients import toggle_client_alt_speed
    clients = (await db.execute(select(DownloadClient).filter(DownloadClient.enabled))).scalars().all()
    results = await asyncio.gather(*(toggle_client_alt_speed(client.client_type, client.url, client.username, client.password) for client in clients))
    await invalidate_download_clients_cache()
    return {"ok": any(results)}


class AddTorrentApiRequest(BaseModel):
    client_id: Optional[int] = None
    torrent_url_or_magnet: str
    category: Optional[str] = None
    tags: Optional[str] = None


@router.post("/downloads/add")
async def add_torrent_api(body: AddTorrentApiRequest, db: AsyncSession = Depends(get_db_async)):
    from ..services.download_clients import add_torrent_to_client

    if body.client_id:
        client = (await db.execute(select(DownloadClient).filter(DownloadClient.id == body.client_id, DownloadClient.enabled))).scalars().first()
    else:
        client = (await db.execute(select(DownloadClient).filter(DownloadClient.enabled))).scalars().first()

    if not client:
        raise HTTPException(404, "Aucun client torrent actif trouvé")

    success, msg, info_hash = await add_torrent_to_client(
        client.client_type, client.url, client.username, client.password,
        body.torrent_url_or_magnet, body.category, body.tags
    )
    if not success:
        raise HTTPException(502, f"Erreur lors de l'ajout du torrent : {msg}")
    await invalidate_download_clients_cache()
    await publish("download.updated", {"client_id": client.id, "action": "add"}, admin_only=True)
    return {"ok": True, "message": msg, "hash": info_hash}


@router.post("/downloads/add-file")
async def add_torrent_file_api(
    file: UploadFile = File(...),
    client_id: Optional[int] = Form(None),
    category: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db_async),
):
    from ..services.download_clients import add_torrent_file_to_client

    if client_id:
        client = (await db.execute(select(DownloadClient).filter(DownloadClient.id == client_id, DownloadClient.enabled))).scalars().first()
    else:
        client = (await db.execute(select(DownloadClient).filter(DownloadClient.enabled))).scalars().first()

    if not client:
        raise HTTPException(404, "Aucun client torrent actif trouvé")

    content = await file.read()
    filename = file.filename or "upload.torrent"

    success, msg, info_hash = await add_torrent_file_to_client(
        client.client_type, client.url, client.username, client.password,
        content, filename, category, tags
    )
    if not success:
        raise HTTPException(502, f"Erreur lors de l'envoi du fichier torrent : {msg}")
    await invalidate_download_clients_cache()
    await publish("download.updated", {"client_id": client.id, "action": "add"}, admin_only=True)
    return {"ok": True, "message": msg, "hash": info_hash}
