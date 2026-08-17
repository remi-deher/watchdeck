"""Historique d'import authoritative lu directement depuis Sonarr et Radarr."""

import asyncio
import logging
from datetime import datetime

from sqlalchemy.future import select

from .arr_http_client import ArrClient

logger = logging.getLogger(__name__)
_sync_locks: dict[int, asyncio.Lock] = {}


def _date(value: str | None) -> datetime:
    if not value:
        return datetime.min
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return datetime.min


def normalize_arr_import(record: dict, instance, arr_type: str) -> dict | None:
    """Convertit uniquement les imports terminés; les grabs/échecs restent hors historique."""
    if str(record.get("eventType") or "").lower() != "downloadfolderimported":
        return None
    media = record.get("movie") if arr_type == "radarr" else record.get("series")
    media = media or {}
    episode = record.get("episode") or {}
    title = media.get("title") or record.get("sourceTitle") or "Import sans titre"
    if arr_type == "sonarr" and episode:
        number = f"S{int(episode.get('seasonNumber') or 0):02d}E{int(episode.get('episodeNumber') or 0):02d}"
        title = f"{title} · {number}"
        if episode.get("title"):
            title += f" · {episode['title']}"
    download_id = record.get("downloadId") or (record.get("data") or {}).get("downloadId")
    # Completed Download Handling rattache l'import au téléchargement. Les commandes
    # ManualImport n'ont pas ce lien. Les événements incomplets restent explicitement
    # indéterminés plutôt que d'être présentés comme automatiques.
    mode = "automatic" if download_id else "manual"
    poster_url = None
    images = media.get("images") or []
    for img in images:
        if isinstance(img, dict) and img.get("coverType") == "poster":
            url = img.get("remoteUrl") or img.get("url")
            if url:
                if url.startswith("/"):
                    url = f"{instance.url.rstrip('/')}{url}"
                poster_url = url
                break

    return {
        "id": f"{arr_type}:{instance.id}:{record.get('id')}",
        "arr_history_id": record.get("id"),
        "title": title,
        "year": media.get("year"),
        "media_type": "movie" if arr_type == "radarr" else "show",
        "source": arr_type,
        "instance_id": instance.id,
        "instance_name": instance.name,
        "poster_url": poster_url,
        "request_id": None,
        "completed_at": record.get("date"),
        "processing_mode": mode,
        "event_type": record.get("eventType"),
    }


async def fetch_instance_history(instance, *, page_size: int = 100, page: int = 1) -> list[dict]:
    client = ArrClient(instance.url, instance.api_key, timeout=20, raise_for_status=True)
    params = {
        "page": page,
        "pageSize": page_size,
        "sortKey": "date",
        "sortDirection": "descending",
        "includeSeries": "true",
        "includeEpisode": "true",
        "includeMovie": "true",
    }
    response = await client.get("/api/v3/history", params=params)
    payload = response.json()
    records = payload.get("records", payload if isinstance(payload, list) else [])
    return [item for record in records if (item := normalize_arr_import(record, instance, instance.arr_type))]


async def fetch_all_instance_history(instance, *, page_size: int = 1000) -> list[dict]:
    """Charge tout l'historique par pages, sans supposer la limite de l'instance."""
    client = ArrClient(instance.url, instance.api_key, timeout=30, raise_for_status=True)
    page, items = 1, []  # type: int, list[dict]
    while True:
        response = await client.get(
            "/api/v3/history",
            params={
                "page": page,
                "pageSize": page_size,
                "sortKey": "date",
                "sortDirection": "descending",
                "includeSeries": "true",
                "includeEpisode": "true",
                "includeMovie": "true",
            },
        )
        payload = response.json()
        records = payload.get("records", payload if isinstance(payload, list) else [])
        items.extend(item for record in records if (item := normalize_arr_import(record, instance, instance.arr_type)))
        if len(records) < page_size or page * page_size >= int(payload.get("totalRecords", 0) or 0):
            break
        page += 1
    return items


async def sync_instance_history(db, instance) -> dict:
    """Rattrape une instance en base, sans doublon ni course entre événements."""
    from ..models import DownloadHistory

    lock = _sync_locks.setdefault(instance.id, asyncio.Lock())
    async with lock:
        items = await fetch_all_instance_history(instance)
        existing_rows = (
            (
                await db.execute(
                    select(DownloadHistory).filter(
                        DownloadHistory.arr_instance_id == instance.id,
                        DownloadHistory.arr_history_id.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        existing = {row.arr_history_id: row for row in existing_rows}
        imported, updated = 0, 0
        for item in items:
            row = existing.get(item["arr_history_id"])
            completed_at = item.get("completed_at")
            if completed_at:
                completed_at = datetime.fromisoformat(completed_at.replace("Z", "+00:00")).replace(tzinfo=None)
            if row:
                values = {
                    "title": item["title"],
                    "year": item.get("year"),
                    "media_type": item["media_type"],
                    "source": instance.arr_type,
                    "instance_name": instance.name,
                    "processing_mode": item["processing_mode"],
                    "completed_at": completed_at,
                    "poster_url": item.get("poster_url"),
                }
                changed = any(getattr(row, key) != value for key, value in values.items())
                for key, value in values.items():
                    setattr(row, key, value)
                updated += int(changed)
                continue
            db.add(
                DownloadHistory(
                    title=item["title"],
                    year=item.get("year"),
                    media_type=item["media_type"],
                    source=instance.arr_type,
                    instance_name=instance.name,
                    poster_url=item.get("poster_url"),
                    request_id=None,
                    arr_instance_id=instance.id,
                    arr_history_id=item["arr_history_id"],
                    processing_mode=item["processing_mode"],
                    completed_at=completed_at,
                )
            )
            imported += 1
        await db.commit()
        return {
            "instance_id": instance.id,
            "found": len(items),
            "imported": imported,
            "updated": updated,
            "existing": len(items) - imported,
        }


async def sync_all_enabled_instances() -> list[dict]:
    """Rattrapage au démarrage; une panne isolée ne bloque pas les autres instances."""
    from ..database import AsyncSessionLocal
    from ..models import ArrInstance

    async with AsyncSessionLocal() as db:
        instances = (
            (
                await db.execute(
                    select(ArrInstance).filter(ArrInstance.enabled, ArrInstance.arr_type.in_(["sonarr", "radarr"]))
                )
            )
            .scalars()
            .all()
        )
    results = []
    for instance in instances:
        try:
            async with AsyncSessionLocal() as db:
                results.append(await sync_instance_history(db, instance))
        except Exception:
            logger.exception("Rattrapage historique %s impossible", instance.name)
    logger.info("Rattrapage historique *Arr terminé: %s", results)
    return results


async def sync_instance_after_event(instance_id: int | None, arr_type: str, *, delay: float = 2) -> None:
    """Rattrape l'événement après que *Arr a eu le temps d'écrire son historique."""
    from ..database import AsyncSessionLocal
    from ..models import ArrInstance

    await asyncio.sleep(delay)
    try:
        async with AsyncSessionLocal() as db:
            query = select(ArrInstance).filter(ArrInstance.enabled, ArrInstance.arr_type == arr_type)
            if instance_id is not None:
                query = query.filter(ArrInstance.id == instance_id)
            else:
                query = query.order_by(ArrInstance.is_default.desc(), ArrInstance.id.asc())
            instance = (await db.execute(query)).scalars().first()
            if instance:
                await sync_instance_history(db, instance)
    except Exception:
        logger.exception("Synchronisation événementielle %s/%s impossible", arr_type, instance_id)


async def fetch_arr_history(instances, *, limit: int, offset: int) -> tuple[list[dict], list[dict]]:
    """Fusionne chronologiquement les instances, en isolant leurs erreurs réseau."""

    async def load(instance):
        try:
            return await fetch_instance_history(instance, page_size=min(1000, limit + offset)), None
        except Exception as exc:
            return [], {"instance_id": instance.id, "instance_name": instance.name, "message": str(exc)}

    results = await asyncio.gather(*(load(instance) for instance in instances))
    items = [item for rows, _error in results for item in rows]
    items.sort(key=lambda item: _date(item.get("completed_at")), reverse=True)
    return items[offset : offset + limit], [error for _rows, error in results if error]
