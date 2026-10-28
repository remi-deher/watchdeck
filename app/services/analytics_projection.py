"""SQL read model; publication is atomic with the legacy rollback snapshot."""

import asyncio
import json
import math
import uuid
from datetime import datetime

from sqlalchemy import Text, any_, bindparam, cast, delete, exists, func, insert, literal, select, tuple_, union_all
from sqlalchemy.dialects.postgresql import ARRAY, aggregate_order_by
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import load_only

from ..models import AnalyticsGeneration as Generation
from ..models import AnalyticsItem as Item
from ..models import AnalyticsPlayback as Play
from ..models import LibraryAnalyticsSnapshot as Snapshot
from ..models import PlaybackSession as Source
from ..utils import now_utc_naive

VERSION = 1
_FIELDS = (
    "rating_key",
    "title",
    "grandparent_title",
    "user_name",
    "watched_ms",
    "progress_ms",
    "started_at",
    "last_seen_at",
    "player_title",
    "product",
    "platform",
)


def match_keys(row):
    rating = str(row.get("rating_key") or "")
    title = str(row.get("title") or "").casefold()
    parent = str(row.get("grandparent_title") or "").casefold()
    fallback = (
        ("p:" + json.dumps([parent, title], ensure_ascii=False, separators=(",", ":"))) if parent else "t:" + title
    )
    return ("r:" + rating if rating else None, fallback if title else None)


def catalog_keys(row):
    primary, fallback = match_keys(row)
    title = str(row.get("title") or "").casefold()
    return tuple(dict.fromkeys((primary, fallback, "t:" + title if title else None)))


async def header(db):
    # Defer the legacy JSON even when migrating an existing installation. Never
    # read a 30+ MB snapshot just to discover the current generation identifier.
    snapshot = await db.get(Snapshot, 1, options=[load_only(Snapshot.id, Snapshot.generation_id)])
    if snapshot is None or not isinstance(snapshot.generation_id, str):
        return None
    return (
        (
            await db.execute(
                select(Generation)
                .join(Snapshot, Snapshot.generation_id == Generation.id)
                .where(Snapshot.id == 1, Generation.format_version == VERSION)
                .with_for_update(read=True, of=Generation)
            )
        )
        .scalars()
        .first()
    )


async def legacy(db, snapshot):
    if "payload_json" not in snapshot.__dict__:
        await db.refresh(snapshot, ["payload_json"])
    return snapshot.payload_json


async def synchronize_playback(db):
    """Detect updates, historical corrections and deletions without loading ORM history.

    The relational diff is evaluated in PostgreSQL; only changed thin records
    cross into Python, in bounded batches, for Unicode casefold normalization.
    """
    deleted = await db.execute(
        delete(Play)
        .where(~exists(select(Source.id).where(Source.id == Play.session_id)))
        .returning(Play.key_primary, Play.key_fallback)
    )
    changed = {key for row in deleted for key in row if key is not None}
    statement = (
        select(
            Source.id.label("session_id"),
            *(getattr(Source, k) for k in _FIELDS),
            Play.key_primary.label("old_primary"),
            Play.key_fallback.label("old_fallback"),
        )
        .outerjoin(Play, Play.session_id == Source.id)
        .where(
            (Play.session_id.is_(None))
            | tuple_(*(getattr(Source, k) for k in _FIELDS)).is_distinct_from(
                tuple_(*(getattr(Play, k) for k in _FIELDS))
            )
        )
    )
    stream = await db.stream(statement.execution_options(yield_per=1000))
    try:
        async for batch in stream.mappings().partitions(1000):
            records = []
            for source in batch:
                row = dict(source)
                changed.update(key for key in (row.pop("old_primary"), row.pop("old_fallback")) if key is not None)
                row["key_primary"], row["key_fallback"] = match_keys(row)
                changed.update(key for key in (row["key_primary"], row["key_fallback"]) if key is not None)
                records.append(row)
            statement = pg_insert(Play.__table__)
            await db.execute(
                statement.on_conflict_do_update(
                    index_elements=[Play.session_id],
                    set_={k: getattr(statement.excluded, k) for k in (*_FIELDS, "key_primary", "key_fallback")},
                ),
                records,
            )
    finally:
        await stream.close()
    return changed


async def playback_aggregates(db, rows):
    needed = {key for row in rows for key in catalog_keys(row) if key is not None}
    if not needed:
        return {}
    columns = [
        Play.session_id,
        Play.user_name,
        Play.watched_ms,
        Play.progress_ms,
        Play.started_at,
        Play.last_seen_at,
        Play.player_title,
        Play.product,
        Play.platform,
    ]
    expanded = union_all(
        select(Play.key_primary.label("key"), *columns).where(Play.key_primary.isnot(None)),
        select(Play.key_fallback.label("key"), *columns).where(Play.key_fallback.isnot(None)),
    ).cte("plays")
    scoped = (
        select(expanded)
        .where(expanded.c.key == any_(bindparam("keys", value=list(needed), type_=ARRAY(Text))))
        .cte("scoped")
    )
    c = scoped.c
    watched = func.coalesce(func.nullif(c.watched_ms, 0), c.progress_ms, 0)
    stats = (
        select(
            c.key,
            func.count().label("play_count"),
            func.sum(watched).label("watch_time_ms"),
            func.array_agg(c.user_name.distinct())
            .filter((c.user_name.isnot(None)) & (c.user_name != ""))
            .label("viewers"),
        )
        .group_by(c.key)
        .cte("stats")
    )
    at = func.coalesce(c.started_at, c.last_seen_at)
    view = func.jsonb_build_object(
        "session_id",
        c.session_id,
        "user",
        c.user_name,
        "at",
        at,
        "watched_ms",
        watched,
        "player",
        func.coalesce(func.nullif(c.player_title, ""), c.product),
        "platform",
        c.platform,
    )
    ranked = select(
        c.key,
        c.session_id,
        at.label("at"),
        view.label("view"),
        func.row_number().over(partition_by=c.key, order_by=(at.desc().nulls_last(), c.session_id)).label("rank"),
    ).cte("ranked")
    latest = (
        select(
            ranked.c.key,
            func.jsonb_agg(aggregate_order_by(ranked.c.view, ranked.c.at.desc(), ranked.c.session_id)).label("views"),
        )
        .where(ranked.c.rank <= 20, ranked.c.at.isnot(None))
        .group_by(ranked.c.key)
        .cte("latest")
    )
    result = await db.execute(select(stats, latest.c.views).outerjoin(latest, stats.c.key == latest.c.key))
    return {row["key"]: dict(row) for row in result.mappings()}


def enrich(rows, aggregates):
    for row in rows:
        value = next((aggregates[key] for key in catalog_keys(row) if key in aggregates), {})
        row["play_count"] = value.get("play_count", 0)
        row["watch_time_ms"] = int(value.get("watch_time_ms", 0))
        row["viewers"] = sorted(value.get("viewers") or [])
        views = value.get("views") or []
        for view in views:
            view["at"] = datetime.fromisoformat(view["at"]).isoformat()
        row["views"] = views
        row["last_viewed_at"] = views[0]["at"] if views else None
    return rows


def _records(identifier, rows, offset):
    from .library_analytics import _resolution_rank

    result = []
    for ordinal, data in enumerate(rows, offset):
        row = dict(
            generation_id=identifier,
            ordinal=ordinal,
            data=data,
            rating_key=str(data.get("rating_key") or ""),
            search_text=" ".join(
                str(data.get(k) or "").lower() for k in ("title", "parent_title", "grandparent_title", "studio")
            ),
        )
        for name in ("title", "library", "studio", "container", "video_codec", "audio_codec"):
            row["sort_" + name] = str(data.get(name) or "").casefold()
        row["sort_viewer"] = (data.get("viewers") or [""])[0].casefold()
        for name in ("size_bytes", "duration_ms", "play_count", "watch_time_ms", "audio_track_count"):
            row[name] = data.get(name) or 0
        row["video_rank"] = _resolution_rank(data.get("video_resolution"))
        row["subtitle_count"] = data.get("subtitle_count")
        row["last_viewed_at"] = data.get("last_viewed_at") or ""
        result.append(row)
    return result


async def publish(db, snapshot, payload, catalog_fingerprint):
    identifier = uuid.uuid4().hex
    summary = {k: v for k, v in payload.items() if k != "items"}
    summary |= {"projection_version": VERSION, "refreshed_at": now_utc_naive().isoformat()}
    await db.execute(
        insert(Generation).values(
            id=identifier,
            created_at=now_utc_naive(),
            generated_at=payload["generated_at"],
            catalog_fingerprint=catalog_fingerprint,
            format_version=VERSION,
            summary=summary,
        )
    )
    for offset in range(0, len(payload["items"]), 500):
        records = await asyncio.to_thread(_records, identifier, payload["items"][offset : offset + 500], offset)
        await db.execute(insert(Item), records)
    snapshot.generation_id = identifier
    # Readers hold a shared lock on their immutable generation. Skip these during
    # collection, keeping the three newest generations in addition to any in use.
    obsolete = (
        select(Generation.id)
        .where(Generation.id != identifier)
        .order_by(Generation.created_at.desc())
        .offset(2)
        .with_for_update(skip_locked=True)
    )
    await db.execute(delete(Generation).where(Generation.id.in_(obsolete)))
    return summary


def filters_for(identifier, filters):
    conditions = [Item.generation_id == identifier]

    def text(name):
        return Item.data[name].astext

    for key in ("media_type", "library", "studio", "video_codec", "audio_codec", "container", "video_resolution"):
        if filters.get(key):
            conditions.append(func.coalesce(text(key), "None") == str(filters[key]))
    if filters.get("search") and str(filters["search"]).strip():
        conditions.append(Item.search_text.contains(str(filters["search"]).strip().lower(), autoescape=True))
    for key, field in (
        ("subtitle_type", "subtitle_types"),
        ("subtitle_language", "subtitle_languages"),
        ("audio_language", "audio_languages"),
        ("viewer", "viewers"),
    ):
        if filters.get(key):
            conditions.append(Item.data.contains({field: [filters[key]]}))
    if filters.get("artist"):
        conditions.append(func.coalesce(text("grandparent_title"), "") == str(filters["artist"]))
    if filters.get("subtitle") == "with":
        conditions.append(Item.subtitle_count > 0)
    elif filters.get("subtitle") == "without":
        conditions.append(Item.subtitle_count == 0)
    if filters.get("watched") in ("yes", "no"):
        conditions.append(Item.play_count > 0 if filters["watched"] == "yes" else Item.play_count == 0)
    if filters.get("min_size_gb") is not None:
        conditions.append(Item.size_bytes >= math.ceil(filters["min_size_gb"] * 1024**3))
    if filters.get("max_size_gb") is not None:
        conditions.append(Item.size_bytes <= math.floor(filters["max_size_gb"] * 1024**3))
    return conditions


def ordering(sort, direction, insight_kind):
    fields = {
        "title": [Item.sort_title.collate("C")],
        "library": [Item.sort_library.collate("C")],
        "studio": [Item.sort_studio.collate("C")],
        "container": [Item.sort_container.collate("C")],
        "size_bytes": [Item.size_bytes],
        "plays": [Item.play_count],
        "watch_time": [Item.watch_time_ms],
        "last_viewed": [Item.last_viewed_at],
        "viewer": [Item.sort_viewer.collate("C")],
        "video": [Item.video_rank, Item.sort_video_codec.collate("C")],
        "audio": [Item.sort_audio_codec.collate("C"), Item.audio_track_count],
        "subtitles": [func.coalesce(Item.subtitle_count, 0)],
    }
    if sort in fields:
        return [f.desc() if direction == "desc" else f.asc() for f in fields[sort]] + [Item.ordinal]
    return [Item.size_bytes.desc(), Item.ordinal] if insight_kind in (None, "storage") else [Item.ordinal]


async def page(
    db,
    generation,
    filters,
    *,
    offset,
    limit,
    insight_kind=None,
    insight_field=None,
    insight_value=None,
    sort=None,
    direction="asc",
):
    from ..pagination import paginated_response

    conditions = filters_for(generation.id, filters)
    if insight_kind == "unwatched":
        conditions.append(Item.play_count == 0)
    elif insight_kind == "subtitles":
        conditions.append(Item.subtitle_count == 0)
    elif (
        insight_kind == "distribution"
        and insight_field in {"media_type", "studio", "video_codec", "audio_codec", "video_resolution", "container"}
        and insight_value
    ):
        conditions.append(func.coalesce(func.nullif(Item.data[insight_field].astext, ""), "Inconnu") == insight_value)
    total = (await db.execute(select(func.count()).select_from(Item).where(*conditions))).scalar_one()
    items = (
        (
            await db.execute(
                select(Item.data)
                .where(*conditions)
                .order_by(*ordering(sort, direction, insight_kind))
                .offset(offset)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return paginated_response(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
        generated_at=generation.generated_at,
        projection_version=generation.format_version,
        refreshed_at=generation.summary.get("refreshed_at"),
    )


async def summary(db, generation, filters):
    if not any(value is not None and value != "" for value in filters.values()):
        return generation.summary
    from .library_analytics import _build_payload

    conditions = filters_for(generation.id, filters)
    count, size, duration, plays, unwatched, missing, known = (
        await db.execute(
            select(
                func.count(),
                func.coalesce(func.sum(Item.size_bytes), 0),
                func.coalesce(func.sum(Item.duration_ms), 0),
                func.coalesce(func.sum(Item.play_count), 0),
                func.count().filter(Item.play_count == 0),
                func.count().filter(Item.subtitle_count == 0),
                func.count(Item.subtitle_count),
            ).where(*conditions)
        )
    ).one()
    count, size, duration, plays, unwatched, missing, known = map(
        int, (count, size, duration, plays, unwatched, missing, known)
    )
    viewers = func.jsonb_array_elements_text(Item.data["viewers"]).label("viewer")
    expanded = select(viewers).where(*conditions).subquery()
    viewers_count = (await db.execute(select(func.count(expanded.c.viewer.distinct())))).scalar_one()
    result = _build_payload([], generation.generated_at, {})
    result["summary"] = dict(items=count, size_bytes=size, duration_ms=duration, plays=plays, viewers=viewers_count)
    for insight, value in zip(result["insights"], (size, unwatched, missing if known else None)):
        insight["value"] = value
    dimensions = (
        ("types", "media_type"),
        ("studios", "studio"),
        ("video_codecs", "video_codec"),
        ("audio_codecs", "audio_codec"),
        ("resolutions", "video_resolution"),
        ("containers", "container"),
        ("artists", "grandparent_title"),
    )
    # Extract facet values once, then reuse the materialized CTE for the seven
    # distributions instead of transferring/scanning whole JSON documents seven times.
    facets = (
        select(
            Item.ordinal,
            Item.data["media_type"].astext.label("media_type"),
            *(func.coalesce(func.nullif(Item.data[key].astext, ""), "Inconnu").label(name) for name, key in dimensions),
        )
        .where(*conditions)
        .cte("facets")
    )
    groups = []
    for name, _ in dimensions:
        label = facets.c[name]
        query = select(
            literal(name).label("kind"),
            label.label("label"),
            func.count().label("n"),
            func.min(facets.c.ordinal).label("first"),
            func.sum(func.count()).over().label("total"),
        )
        if name == "artists":
            query = query.where(facets.c.media_type == "track")
        groups.append(query.group_by(label))
    grouped = union_all(*groups).subquery()
    ranked = select(
        grouped,
        func.row_number()
        .over(partition_by=grouped.c.kind, order_by=(grouped.c.n.desc(), grouped.c.first))
        .label("rank"),
    ).subquery()
    distribution_rows = (
        await db.execute(select(ranked).where(ranked.c.rank <= 12).order_by(ranked.c.kind, ranked.c.rank))
    ).mappings()
    result["distributions"] = {name: [] for name, _ in dimensions}
    for row in distribution_rows:
        result["distributions"][row["kind"]].append(
            dict(label=row["label"], count=row["n"], percent=round(row["n"] / (int(row["total"]) or 1) * 100, 1))
        )
    result["largest"] = (
        (await db.execute(select(Item.data).where(*conditions).order_by(Item.size_bytes.desc(), Item.ordinal).limit(5)))
        .scalars()
        .all()
    )
    result["options"] = generation.summary["options"]
    result.pop("items")
    result.update(projection_version=generation.format_version, refreshed_at=generation.summary.get("refreshed_at"))
    return result
