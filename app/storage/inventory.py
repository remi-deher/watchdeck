"""Disposable, dated observations. Failures never alter business media records."""

import asyncio
import hashlib
import json
import logging
from datetime import timedelta

import httpx
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError

from ..crypto import fingerprint_secret
from ..database import AsyncSessionLocal
from ..models import ArrInstance, LibraryItem, LibraryItemLocation, StorageInventory, StorageInventoryScope
from ..utils import now_utc_naive

logger = logging.getLogger(__name__)
CATALOG_AGE = timedelta(minutes=30)
FILE_AGE = timedelta(hours=6)


def revision(endpoint, secret):
    return hashlib.sha256((endpoint.rstrip("/") + fingerprint_secret(secret)).encode()).hexdigest()


def arr_revision(instance):
    return revision(instance.url, instance.api_key)


async def record(source, endpoint_id, endpoint_revision, observations, *, complete=False):
    """Only a complete, successful catalogue can mark unseen records absent."""
    now = now_utc_naive()
    async with AsyncSessionLocal() as db:
        keys = [str(item["entity_id"]) for item in observations]
        old_rows = (
            (
                await db.execute(
                    select(StorageInventory).where(
                        StorageInventory.source == source,
                        StorageInventory.endpoint_id == endpoint_id,
                        StorageInventory.entity_id.in_(keys),
                    )
                )
            )
            .scalars()
            .all()
        )
        old_by_key = {row.entity_id: row for row in old_rows}
        values_by_key = {}
        for item in observations:
            key = str(item["entity_id"])
            data = jsonable_encoder(item["data"])
            old = old_by_key.get(key)
            if "files" not in data and old and old.endpoint_revision == endpoint_revision:
                data = {**old.data, **data}
            elif "files" in data and old and old.endpoint_revision == endpoint_revision:
                paths = {file["path"] for file in data["files"]}
                data["files"] += [
                    {**file, "present": False} for file in old.data.get("files", []) if file["path"] not in paths
                ]
            values_by_key[key] = dict(
                source=source,
                endpoint_id=endpoint_id,
                entity_id=key,
                endpoint_revision=endpoint_revision,
                media_type=item["media_type"],
                provider_id=item.get("provider_id"),
                data=data,
                observed_at=now,
                present=True,
            )
        values = list(values_by_key.values())
        for start in range(0, len(values), 200):
            statement = insert(StorageInventory).values(values[start : start + 200])
            await db.execute(
                statement.on_conflict_do_update(
                    constraint="uq_storage_inventory_entity",
                    set_={
                        key: getattr(statement.excluded, key)
                        for key in ("endpoint_revision", "media_type", "provider_id", "data", "observed_at", "present")
                    },
                )
            )
        if complete:
            await db.execute(
                update(StorageInventory)
                .where(
                    StorageInventory.source == source,
                    StorageInventory.endpoint_id == endpoint_id,
                    StorageInventory.entity_id.not_in(keys),
                )
                .values(present=False)
            )
            scope = dict(source=source, endpoint_id=endpoint_id, endpoint_revision=endpoint_revision, observed_at=now)
            await db.execute(
                insert(StorageInventoryScope)
                .values(**scope)
                .on_conflict_do_update(
                    constraint="uq_storage_inventory_scope",
                    set_={"observed_at": now, "endpoint_revision": endpoint_revision},
                )
            )
        await db.commit()


async def safe_record_arr(instance, items):
    try:
        observations = [
            dict(
                entity_id=str(m["id"]),
                media_type="movie" if instance.arr_type == "radarr" else "series",
                provider_id=str(m.get("tmdbId") if instance.arr_type == "radarr" else m.get("tvdbId")),
                data=m,
            )
            for m in items
        ]
        await asyncio.wait_for(record("arr", instance.id, arr_revision(instance), observations, complete=True), 10)
    except Exception:
        logger.warning("Storage inventory: Arr observation unavailable for %s", instance.id, exc_info=True)


async def refresh_arr_files(instance, observation):
    """Fetch files for one known title, independently of business synchronization."""
    from .service import arr_request

    is_movie = instance.arr_type == "radarr"
    rows = await arr_request(
        instance,
        "GET",
        f"moviefile?movieId={int(observation.entity_id)}"
        if is_movie
        else f"episodefile?seriesId={int(observation.entity_id)}",
    )
    files = []
    for row in rows:
        path = row.get("path")
        if not path and row.get("relativePath") and observation.data.get("path"):
            path = observation.data["path"].rstrip("/") + "/" + row["relativePath"]
        if not path or not path.startswith("/"):
            continue
        files.append(
            dict(
                path=path,
                size_bytes=row.get("size"),
                file_id=row.get("id"),
                added_at=row.get("dateAdded"),
                quality=row.get("quality"),
                present=True,
            )
        )
    active = {f["path"] for f in files}
    files += [{**f, "present": False} for f in observation.data.get("files", []) if f["path"] not in active]
    data = {**observation.data, "files": files, "files_observed_at": now_utc_naive().isoformat()}
    await record(
        "arr",
        instance.id,
        arr_revision(instance),
        [
            dict(
                entity_id=observation.entity_id,
                media_type=observation.media_type,
                provider_id=observation.provider_id,
                data=data,
            )
        ],
    )
    return data


async def safe_record_plex(conn, items):
    try:
        observations = []
        for item in items:
            if item.get("media_type") not in ("movie", "show") or not item.get("rating_key"):
                continue
            kind = "movie" if item["media_type"] == "movie" else "series"
            data = dict(
                title=item["title"],
                section_id=item.get("storage_section_id"),
                tmdb_id=item.get("tmdb_id"),
                tvdb_id=item.get("tvdb_id"),
            )
            if item.get("storage_files"):
                data.update(files=item["storage_files"], files_observed_at=now_utc_naive().isoformat())
            observations.append(
                dict(
                    entity_id=item["rating_key"],
                    media_type=kind,
                    provider_id=str(item.get("tmdb_id" if kind == "movie" else "tvdb_id")),
                    data=data,
                )
            )
        await asyncio.wait_for(record("plex", conn.id, revision(conn.url, conn.token), observations), 10)
    except Exception:
        logger.warning("Storage inventory: Plex observation unavailable for %s", conn.id, exc_info=True)


async def arr_catalog(db, instance, fetch=None):
    """Cache is optional. A missing/old/changed endpoint falls back to live Arr."""
    from .service import arr_request

    if fetch is None:

        async def fetch():
            return await arr_request(instance, "GET", "movie" if instance.arr_type == "radarr" else "series")

    if not getattr(instance, "url", None):
        return await fetch()

    try:
        async with AsyncSessionLocal() as cache_db:
            scope = (
                await cache_db.execute(
                    select(StorageInventoryScope).where(
                        StorageInventoryScope.source == "arr",
                        StorageInventoryScope.endpoint_id == instance.id,
                    )
                )
            ).scalar_one_or_none()
            if (
                scope
                and scope.endpoint_revision == arr_revision(instance)
                and now_utc_naive() - scope.observed_at <= CATALOG_AGE
            ):
                rows = (
                    (
                        await cache_db.execute(
                            select(StorageInventory).where(
                                StorageInventory.source == "arr",
                                StorageInventory.endpoint_id == instance.id,
                                StorageInventory.present.is_(True),
                                StorageInventory.endpoint_revision == scope.endpoint_revision,
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                return [r.data for r in rows]
    except (AttributeError, SQLAlchemyError):  # Optional cache; preserve the business transaction.
        pass
    return await fetch()


def files_from_metadata(items):
    files = {}
    for item in items:
        for media in item.get("Media", []):
            for part in media.get("Part", []):
                path = part.get("file")
                if path and path.startswith("/"):
                    files[(path, str(item.get("ratingKey")))] = dict(
                        path=path, size_bytes=part.get("size"), rating_key=str(item.get("ratingKey")), present=True
                    )
    return list(files.values())


async def refresh_plex_item(db, conn, rating_key, kind, provider_id=None):
    """Read a known fiche first; recover recreated keys from the local ID mirror."""
    from .worker import plex_get

    keys = [str(rating_key)]
    identity = LibraryItem.tmdb_id if kind == "movie" else LibraryItem.tvdb_id
    if provider_id:
        keys += list(
            (
                await db.execute(
                    select(LibraryItemLocation.rating_key)
                    .join(LibraryItem, LibraryItem.id == LibraryItemLocation.library_item_id)
                    .where(LibraryItemLocation.server_id == conn.id, identity == str(provider_id))
                )
            )
            .scalars()
            .all()
        )
    for index, key in enumerate(dict.fromkeys(keys)):
        if index and len(set(keys) - {str(rating_key)}) > 1:
            raise ValueError(
                "Plusieurs fiches Plex ont cette identité : sélectionnez l’emplacement après synchronisation."
            )
        try:
            metadata = await plex_get(conn, f"/library/metadata/{key}", {"includeMedia": 1, "includeGuids": 1})
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                continue
            raise
        items = metadata.get("Metadata", [])
        if len(items) != 1 or items[0].get("type") not in ("movie", "show"):
            continue
        item = items[0]
        expected = ("tmdb" if kind == "movie" else "tvdb") + "://" + str(provider_id)
        guids = {g.get("id") for g in item.get("Guid", [])}
        if provider_id and expected not in guids:
            continue
        leaves = items
        if kind == "series":
            leaves = []
            start = 0
            while True:
                page = await plex_get(
                    conn,
                    f"/library/metadata/{key}/allLeaves",
                    {"includeMedia": 1, "X-Plex-Container-Start": start, "X-Plex-Container-Size": 200},
                )
                rows = page.get("Metadata", [])
                leaves.extend(rows)
                start += len(rows)
                if not rows or start >= page.get("totalSize", page.get("size", len(rows))):
                    break
        files = files_from_metadata(leaves)
        old = (
            await db.execute(
                select(StorageInventory).where(
                    StorageInventory.source == "plex",
                    StorageInventory.endpoint_id == conn.id,
                    StorageInventory.entity_id == key,
                )
            )
        ).scalar_one_or_none()
        active_paths = {f["path"] for f in files}
        if old:
            files += [{**f, "present": False} for f in old.data.get("files", []) if f["path"] not in active_paths]
        data = dict(
            title=item.get("title"),
            section_id=str(item.get("librarySectionID", "")),
            files=files,
            files_observed_at=now_utc_naive().isoformat(),
            tmdb_id=next((g.removeprefix("tmdb://") for g in guids if g and g.startswith("tmdb://")), None),
            tvdb_id=next((g.removeprefix("tvdb://") for g in guids if g and g.startswith("tvdb://")), None),
        )
        await record(
            "plex",
            conn.id,
            revision(conn.url, conn.token),
            [dict(entity_id=key, media_type=kind, provider_id=str(provider_id) if provider_id else None, data=data)],
        )
        return data
    # No deletion on a failed request or an incomplete catalogue. Report unresolved.
    raise ValueError("Fiche Plex introuvable ou ambiguë : actualisez la bibliothèque Plex puis réessayez.")


async def candidate_keys(db, conn, kind, provider_id):
    """Hints only: workers must fetch current metadata and recheck IDs/paths."""
    try:
        async with AsyncSessionLocal() as cache_db:
            rows = (
                (
                    await cache_db.execute(
                        select(StorageInventory)
                        .where(
                            StorageInventory.source == "plex",
                            StorageInventory.endpoint_id == conn.id,
                            StorageInventory.endpoint_revision == revision(conn.url, conn.token),
                            StorageInventory.media_type == kind,
                            StorageInventory.provider_id == str(provider_id),
                            StorageInventory.present.is_(True),
                        )
                        .limit(10)
                    )
                )
                .scalars()
                .all()
            )
            return [r.entity_id for r in rows if isinstance(r, StorageInventory)]
    except SQLAlchemyError:
        return []


async def refresh_background():
    """Small independent batches; network failure cannot roll back a business scan."""
    from ..services.plex_servers import connection_for
    from .service import arr_request

    async with AsyncSessionLocal() as db:
        for instance in (await db.execute(select(ArrInstance).where(ArrInstance.enabled.is_(True)))).scalars().all():
            if instance.arr_type not in ("radarr", "sonarr"):
                continue
            try:
                items = await asyncio.wait_for(
                    arr_request(instance, "GET", "movie" if instance.arr_type == "radarr" else "series"), 15
                )
                await safe_record_arr(instance, items)
            except Exception:
                logger.warning("Storage inventory: cannot refresh Arr %s", instance.id)
        arr_candidates = (
            await db.execute(
                select(StorageInventory, ArrInstance)
                .join(ArrInstance, ArrInstance.id == StorageInventory.endpoint_id)
                .where(
                    StorageInventory.source == "arr",
                    StorageInventory.present.is_(True),
                    ArrInstance.enabled.is_(True),
                    ArrInstance.arr_type.in_(["radarr", "sonarr"]),
                    (StorageInventory.data["files_observed_at"].as_string().is_(None))
                    | (
                        StorageInventory.data["files_observed_at"].as_string()
                        < (now_utc_naive() - FILE_AGE).isoformat()
                    ),
                )
                .order_by(StorageInventory.data["files_observed_at"].as_string().asc().nullsfirst())
                .limit(10)
            )
        ).all()
        for observation, instance in arr_candidates:
            try:
                if observation.endpoint_revision != arr_revision(instance):
                    continue
                await asyncio.wait_for(refresh_arr_files(instance, observation), 10)
            except Exception:
                logger.warning(
                    "Storage inventory: cannot refresh Arr files for %s/%s", instance.id, observation.entity_id
                )
        candidates = (
            await db.execute(
                select(LibraryItemLocation, LibraryItem)
                .join(LibraryItem, LibraryItem.id == LibraryItemLocation.library_item_id)
                .outerjoin(
                    StorageInventory,
                    (StorageInventory.source == "plex")
                    & (StorageInventory.endpoint_id == LibraryItemLocation.server_id)
                    & (StorageInventory.entity_id == LibraryItemLocation.rating_key),
                )
                .where(
                    LibraryItem.media_type.in_(["movie", "show"]),
                    (StorageInventory.data["files_observed_at"].as_string().is_(None))
                    | (
                        StorageInventory.data["files_observed_at"].as_string()
                        < (now_utc_naive() - FILE_AGE).isoformat()
                    ),
                )
                .order_by(StorageInventory.data["files_observed_at"].as_string().asc().nullsfirst())
                .limit(20)
            )
        ).all()
        for location, item in candidates:
            try:
                conn = await connection_for(db, location.server_id)
                await asyncio.wait_for(
                    refresh_plex_item(
                        db,
                        conn,
                        location.rating_key,
                        "movie" if item.media_type == "movie" else "series",
                        item.tmdb_id if item.media_type == "movie" else item.tvdb_id,
                    ),
                    10,
                )
            except Exception:
                logger.warning(
                    "Storage inventory: cannot refresh Plex key %s on %s", location.rating_key, location.server_id
                )
