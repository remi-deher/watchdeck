"""One-pass activity aggregation: bounded database batches instead of ORM history."""

import asyncio
import heapq
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from types import SimpleNamespace

from sqlalchemy import case, func, literal, select, union_all

from ..models import PlaybackSession as P
from ..utils import APP_TIMEZONE
from .playback_activity import (
    _container_converted,
    _container_route,
    _direct_stream_reason,
    _local,
    _media_label,
    _percent,
    _percentile,
    _thumb_url,
    _transcode_reason,
    _utc_iso,
)

FIELDS = (
    "id",
    "source",
    "user_name",
    "media_type",
    "title",
    "grandparent_title",
    "rating_key",
    "thumb_url",
    "server_id",
    "player_title",
    "platform",
    "product",
    "playback_method",
    "video_decision",
    "audio_decision",
    "quality",
    "video_codec",
    "container",
    "subtitle_decision",
    "plex_decision_text",
    "transcode_details",
    "bandwidth_kbps",
    "media_size_bytes",
    "progress_ms",
    "duration_ms",
    "progress_percent",
    "watched_status",
    "group_count",
    "watched_ms",
    "started_at",
    "last_seen_at",
    "ended_at",
)


class Accumulator:
    def __init__(self):
        self.total = self.watch_ms = 0
        self.heatmap = defaultdict(lambda: {"sessions": 0, "watch_ms": 0})
        self.completions = {}
        self.media = {}
        self.repeats = {}
        self.methods, self.codecs, self.resolutions = Counter(), Counter(), Counter()
        self.devices, self.containers, self.users, self.storage = {}, {}, {}, {}
        self.bandwidth = []
        self.bandwidth_users = defaultdict(list)
        self.transcode, self.direct_stream = Counter(), Counter()

    def feed(self, batch):
        for values in batch:
            row = SimpleNamespace(**values)
            self.total += 1
            watched = row.watched_ms or 0
            self.watch_ms += watched
            if row.started_at:
                local = _local(row.started_at)
                heat = self.heatmap[(local.weekday(), local.hour)]
                heat["sessions"] += 1
                heat["watch_ms"] += watched
            progress = row.progress_percent
            if progress is None and row.duration_ms:
                progress = min(100, (row.progress_ms or row.watched_ms or 0) / row.duration_ms * 100)
            completed = row.watched_status == 1 if row.watched_status is not None else (progress or 0) >= 85
            if progress is not None:
                comp = self.completions.setdefault(row.media_type or "other", [0, 0, 0])
                comp[0] += 1
                comp[1] += int(completed)
                comp[2] += progress
            label = _media_label(row)
            key = (row.media_type or "other", label)
            item = self.media.get(key)
            if item is None:
                item = self.media[key] = dict(
                    title=label,
                    media_type="show" if row.grandparent_title else row.media_type,
                    sessions=0,
                    watch_ms=0,
                    users=set(),
                    thumb_url=_thumb_url(row),
                    rating_key=row.rating_key,
                    size_bytes=0,
                    completed=0,
                    abandoned=0,
                    resumed=0,
                    rewatches=0,
                )
            item["sessions"] += 1
            item["watch_ms"] += watched
            if row.user_name:
                item["users"].add(row.user_name)
            item["size_bytes"] = max(item["size_bytes"], row.media_size_bytes or 0)
            item["completed"] += int(completed)
            item["abandoned"] += int(not completed and (progress or 0) < 21.25)
            item["resumed"] += int((row.group_count or 1) > 1)
            if row.user_name and row.rating_key:
                repeat = (row.user_name, row.rating_key)
                if repeat in self.repeats:
                    self.media[self.repeats[repeat]]["rewatches"] += 1
                self.repeats[repeat] = key
            self.methods[row.playback_method or "unknown"] += 1
            self.codecs[(row.video_codec or "Inconnu").upper()] += 1
            self.resolutions[row.quality or "Inconnue"] += 1
            device = row.player_title or row.product or row.platform or "Inconnu"
            item = self.devices.setdefault(
                device, dict(device=device, sessions=0, direct=0, direct_streams=0, transcodes=0)
            )
            item["sessions"] += 1
            item["transcodes"] += int(row.playback_method == "transcode")
            item["direct"] += int(row.playback_method in ("direct_play", "direct_stream"))
            item["direct_streams"] += int(row.playback_method == "direct_stream")
            if row.bandwidth_kbps:
                self.bandwidth.append(row.bandwidth_kbps)
                self.bandwidth_users[row.user_name or "Inconnu"].append(row.bandwidth_kbps)
            if row.playback_method == "transcode":
                self.transcode[_transcode_reason(row)] += 1
            if row.playback_method == "direct_stream":
                self.direct_stream[_direct_stream_reason(row)] += 1
            source, _ = _container_route(row)
            if source:
                item = self.containers.setdefault(source, dict(label=source, count=0, converted=0))
                item["count"] += 1
                item["converted"] += int(_container_converted(row))
            if row.user_name:
                item = self.users.setdefault(
                    row.user_name,
                    dict(
                        name=row.user_name,
                        sessions=0,
                        watch_ms=0,
                        titles=Counter(),
                        devices=Counter(),
                        last_seen_at=None,
                    ),
                )
                item["sessions"] += 1
                item["watch_ms"] += watched
                item["titles"][label] += 1
                item["devices"][device] += 1
                seen = row.last_seen_at or row.ended_at or row.started_at
                if seen and (item["last_seen_at"] is None or seen > item["last_seen_at"]):
                    item["last_seen_at"] = seen
            if row.rating_key and row.media_size_bytes:
                self.storage[row.rating_key] = max(self.storage.get(row.rating_key, 0), row.media_size_bytes)

    def finish(self, previous, concurrency, binge_items):
        total, watch_ms = self.total, self.watch_ms
        previous_total = sum(n for _, n, _ in previous)
        previous_watch_ms = sum(w for _, _, w in previous)
        previous_users = {name: dict(sessions=n, watch_ms=w) for name, n, w in previous if name}
        heatmap = self.heatmap
        peak, peak_at, concurrent_daily = concurrency
        completion = [
            dict(
                media_type=kind,
                sessions=n,
                completed=c,
                completion_rate=_percent(c, n),
                average_progress=round(p / n, 1),
            )
            for kind, (n, c, p) in self.completions.items()
        ]
        ranked_media = list(self.media.values())
        for item in ranked_media:
            item["users"] = len(item["users"])
            item["completion_rate"] = _percent(item["completed"], item["sessions"])
            size_gb = item["size_bytes"] / 1024**3
            item["watch_hours_per_gb"] = round(item["watch_ms"] / 3_600_000 / size_gb, 2) if size_gb else None
        popular = sorted(ranked_media, key=lambda i: i["watch_ms"], reverse=True)[:10]
        popular_by_audience = sorted(
            ranked_media, key=lambda i: (i["users"], i["sessions"], i["watch_ms"]), reverse=True
        )[:10]
        method_counts, codec_counts, resolution_counts = self.methods, self.codecs, self.resolutions
        devices = sorted(self.devices.values(), key=lambda i: i["sessions"], reverse=True)[:10]
        for item in devices:
            item["compatibility_score"] = round(item["direct"] / item["sessions"] * 100) if item["sessions"] else 0
        bandwidth_values, bandwidth_by_user = self.bandwidth, self.bandwidth_users
        transcode_reasons, direct_stream_reasons = self.transcode, self.direct_stream
        containers = self.containers
        user_trends = []
        for item in self.users.values():
            prev = previous_users.get(item["name"], dict(watch_ms=0))
            user_trends.append(
                dict(
                    name=item["name"],
                    sessions=item["sessions"],
                    watch_ms=item["watch_ms"],
                    watch_change=_percent(item["watch_ms"] - prev["watch_ms"], prev["watch_ms"])
                    if prev["watch_ms"]
                    else (100 if item["watch_ms"] else 0),
                    favorite_title=item["titles"].most_common(1)[0][0] if item["titles"] else None,
                    favorite_device=item["devices"].most_common(1)[0][0] if item["devices"] else None,
                    last_seen_at=_utc_iso(item["last_seen_at"]),
                )
            )
        user_trends.sort(key=lambda item: item["watch_ms"], reverse=True)
        known_storage = self.storage
        storage_bytes = sum(known_storage.values())
        return {
            "comparison": {
                "sessions_change": _percent(total - previous_total, previous_total)
                if previous_total
                else (100 if total else 0),
                "watch_change": _percent(watch_ms - previous_watch_ms, previous_watch_ms)
                if previous_watch_ms
                else (100 if watch_ms else 0),
            },
            "heatmap": [
                {"weekday": weekday, "hour": hour, **heatmap[(weekday, hour)]}
                for weekday in range(7)
                for hour in range(24)
            ],
            "concurrency": {
                "peak": peak,
                "peak_at": _utc_iso(peak_at),
                "daily": [{"date": day, "peak": value} for day, value in sorted(concurrent_daily.items())],
            },
            "completion": completion,
            "popular": popular,
            "popular_by_audience": popular_by_audience,
            "engagement": {
                "completed": sum(item["completed"] for item in ranked_media),
                "abandoned": sum(item["abandoned"] for item in ranked_media),
                "resumed": sum(item["resumed"] for item in ranked_media),
                "rewatches": sum(item["rewatches"] for item in ranked_media),
            },
            "quality": {
                # Couverture des mesures : `playback_method` et `bandwidth_kbps` ne sont pas
                # toujours renseignes par Plex. Sans ce denominateur, une moyenne calculee sur
                # un cinquieme des lectures se lisait comme une moyenne sur tout.
                "coverage": {
                    "sessions": total,
                    "method_known": total - method_counts.get("unknown", 0),
                    "bandwidth_measured": len(bandwidth_values),
                },
                "methods": [
                    {"key": key, "count": count, "rate": _percent(count, total)}
                    for key, count in method_counts.most_common()
                ],
                "codecs": [{"label": key, "count": count} for key, count in codec_counts.most_common(8)],
                "resolutions": [{"label": key, "count": count} for key, count in resolution_counts.most_common(8)],
                "devices": devices,
                "transcode_reasons": [{"label": key, "count": count} for key, count in transcode_reasons.most_common()],
                "direct_stream_reasons": [
                    {"label": key, "count": count} for key, count in direct_stream_reasons.most_common()
                ],
                "containers": sorted(containers.values(), key=lambda item: item["count"], reverse=True)[:8],
            },
            "bandwidth": {
                "measured": len(bandwidth_values),
                "sessions": total,
                "average_kbps": round(sum(bandwidth_values) / len(bandwidth_values)) if bandwidth_values else 0,
                "peak_kbps": max(bandwidth_values, default=0),
                "p95_kbps": _percentile(bandwidth_values, 0.95),
                "by_user": [
                    {"name": name, "average_kbps": round(sum(values) / len(values)), "peak_kbps": max(values)}
                    for name, values in sorted(bandwidth_by_user.items(), key=lambda item: sum(item[1]), reverse=True)[
                        :10
                    ]
                ],
            },
            "binges": binge_items,
            "users": user_trends[:20],
            "storage": {
                "known_items": len(known_storage),
                "known_bytes": storage_bytes,
                "watch_hours_per_gb": round(watch_ms / 3_600_000 / (storage_bytes / (1024**3)), 2)
                if storage_bytes
                else None,
            },
        }


async def concurrency(db, filters):
    events = union_all(
        select(P.started_at.label("moment"), literal(1).label("delta")).where(*filters),
        select(func.greatest(func.coalesce(P.ended_at, P.last_seen_at, P.started_at), P.started_at), literal(-1)).where(
            *filters
        ),
    ).cte("events")
    moments = (
        select(
            events.c.moment,
            func.sum(case((events.c.delta == 1, 1), else_=0)).label("starts"),
            func.sum(case((events.c.delta == -1, 1), else_=0)).label("ends"),
        )
        .group_by(events.c.moment)
        .cte("moments")
    )
    before = func.coalesce(
        func.sum(moments.c.starts - moments.c.ends).over(order_by=moments.c.moment, rows=(None, -1)), 0
    )
    peaks = select(
        moments.c.moment, (before + case((moments.c.starts > 0, moments.c.starts), else_=-1)).label("peak")
    ).cte("peaks")
    top = (
        await db.execute(select(peaks.c.peak, peaks.c.moment).order_by(peaks.c.peak.desc(), peaks.c.moment).limit(1))
    ).first()
    local_day = func.date(func.timezone(APP_TIMEZONE, func.timezone("UTC", peaks.c.moment)))
    days = (await db.execute(select(local_day, func.max(peaks.c.peak)).group_by(local_day).order_by(local_day))).all()
    return (int(top[0]), top[1], {d.isoformat(): max(0, int(p)) for d, p in days}) if top else (0, None, {})


async def binges(db, filters):
    query = (
        select(P.user_name, P.grandparent_title, P.started_at, P.ended_at, P.last_seen_at, P.watched_ms)
        .where(
            *filters,
            P.media_type == "episode",
            P.user_name.isnot(None),
            P.user_name != "",
            P.grandparent_title.isnot(None),
            P.grandparent_title != "",
        )
        .order_by(P.user_name, P.grandparent_title, P.started_at, P.id)
    )
    stream = await db.stream(query.execution_options(yield_per=1000))
    top, chain, sequence = [], None, 0

    def keep(item):
        nonlocal sequence
        if item and item["episodes"] >= 3:
            entry = (item["watch_ms"], -sequence, dict(item))
            sequence += 1
            heapq.heappush(top, entry)
            if len(top) > 10:
                heapq.heappop(top)

    try:
        async for batch in stream.mappings().partitions(1000):
            for row in batch:
                end = row["ended_at"] or row["last_seen_at"] or row["started_at"]
                same = (
                    chain
                    and chain["user_name"] == row["user_name"]
                    and chain["title"] == row["grandparent_title"]
                    and row["started_at"] - chain["end"] <= timedelta(hours=2)
                )
                if not same:
                    keep(chain)
                    chain = dict(
                        user_name=row["user_name"],
                        title=row["grandparent_title"],
                        episodes=0,
                        watch_ms=0,
                        started_at=_utc_iso(row["started_at"]),
                        end=end,
                    )
                chain["episodes"] += 1
                chain["watch_ms"] += row["watched_ms"] or 0
                chain["end"] = end
        keep(chain)
    finally:
        await stream.close()
    return [
        {k: v for k, v in item.items() if k != "end"}
        for _, _, item in sorted(top, key=lambda e: (e[0], e[1]), reverse=True)
    ]


async def aggregate(db, cutoff, previous_cutoff, user):
    filters = [P.started_at >= cutoff]
    previous_filter = [P.started_at >= previous_cutoff, P.started_at < cutoff]
    if user:
        filters.append(P.user_name == user)
        previous_filter.append(P.user_name == user)
    previous = (
        await db.execute(
            select(P.user_name, func.count(), func.coalesce(func.sum(P.watched_ms), 0))
            .where(*previous_filter)
            .group_by(P.user_name)
        )
    ).all()
    previous = [(name, int(n), int(w)) for name, n, w in previous]
    acc = Accumulator()
    stream = await db.stream(
        select(*(getattr(P, key) for key in FIELDS))
        .where(*filters)
        .order_by(P.started_at, P.id)
        .execution_options(yield_per=1000)
    )
    try:
        async for batch in stream.mappings().partitions(1000):
            await asyncio.to_thread(acc.feed, batch)
    finally:
        await stream.close()
    peaks = await concurrency(db, filters)
    binge_items = await binges(db, filters)
    return await asyncio.to_thread(acc.finish, previous, peaks, binge_items)
