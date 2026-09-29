"""Collecte et normalisation de l'activité Plex, avec import historique Tautulli."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import re
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from datetime import time as datetime_time
from urllib.parse import parse_qs, quote, unquote, urlparse
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import and_, case, delete, func, or_, update
from sqlalchemy.future import select
from sqlalchemy.orm import load_only, selectinload
from sqlalchemy.orm.attributes import set_committed_value

from ..cache import cache
from ..database import AsyncSessionLocal
from ..models import (
    LibraryItem,
    PlaybackDailyAggregate,
    PlaybackIpLocation,
    PlaybackSession,
    PlaybackSessionSegment,
    Settings,
)
from ..realtime import publish
from ..utils import APP_TIMEZONE, now_utc_naive, wrap_image_proxy
from . import plex_decision_logs
from .distributed_lock import acquire_distributed_lock, release_distributed_lock
from .ip_geolocation import lookup_ip_location, lookup_ip_locations

logger = logging.getLogger(__name__)

#: Borne haute des périodes. « Tout l'historique » est demandé comme un siècle : la
#: requête reste bornée, et aucun appelant n'a besoin d'un chemin sans date de coupe.
MAX_PERIOD_DAYS = 36500
_plex_collection_lock = asyncio.Lock()
_PLEX_COLLECTION_LOCK_KEY = "watchdeck:locks:playback-activity"
_STALE_SESSION_TIMEOUT = timedelta(minutes=5)
_RESUME_WINDOW = timedelta(hours=24)
_MAX_ACTIVE_SESSION_AGE = timedelta(days=7)

# Tolérance aux ratés de polling avant de clôturer une session encore ouverte (hoquet
# réseau/PMS, session momentanément absente de /status/sessions). Le websocket Plex
# (plex_activity_ws.py) reste le signal faisant autorité et ferme immédiatement une
# session sur un évènement "stopped" explicite -- ce compteur ne couvre que le filet de
# sécurité du polling. Volontairement en mémoire de process (pas de colonne dédiée) :
# une remise à zéro au redémarrage du worker n'a qu'un impact mineur (un cycle de
# tolérance perdu au pire).
_MISS_THRESHOLD = 2
_STICKY_TRANSCODE_FIELDS = frozenset({"transcode_session", "transcode_reason", "transcode_hw", "transcode_details"})
_miss_counts: dict[int, int] = {}
_GEO_FIELDS = (
    "geo_status",
    "geo_city",
    "geo_region",
    "geo_country",
    "geo_country_code",
    "geo_lat",
    "geo_lon",
    "geo_isp",
    "geo_organization",
    "geo_asn",
)
_GEO_LOCATION_FIELDS = _GEO_FIELDS[:7]  # geo_status .. geo_lon
_GEO_NETWORK_FIELDS = _GEO_FIELDS[7:]  # geo_isp, geo_organization, geo_asn


def _has_resolved_location(row: PlaybackSession) -> bool:
    """La session porte déjà une ville/région/pays/coordonnées (ou un statut figé
    local/anonymisé) : cette partie ne doit plus jamais être réécrite."""
    return row.geo_status in {"resolved", "local", "anonymized"} or any(
        getattr(row, field) is not None for field in _GEO_LOCATION_FIELDS[1:]
    )


def _protect_resolved_location(row: PlaybackSession, values: dict) -> None:
    """Retire d'un dict de mise à jour tout ce qui écraserait une localisation déjà
    valide, tout en laissant passer un FAI/organisation/ASN qui manquerait encore."""
    if not _has_resolved_location(row):
        return
    for field in _GEO_LOCATION_FIELDS:
        values.pop(field, None)
    for field in _GEO_NETWORK_FIELDS:
        if getattr(row, field) is not None:
            values.pop(field, None)


def _row_location(row: PlaybackSession) -> dict:
    return {field: getattr(row, field) for field in _GEO_FIELDS}


def _percent(value: int | float, total: int | float) -> float:
    return round(value / total * 100, 1) if total else 0


def _percentile(values: list[int], percentile: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * percentile)))
    return int(ordered[index])


def _media_label(row: PlaybackSession) -> str:
    return row.grandparent_title or row.title


def _deduced_reason(row: PlaybackSession) -> str | None:
    """Raison deduite, y compris pour les lectures enregistrees avant qu'on la capture.

    Celles-la n'ont garde que les decisions par flux : on dit au moins quel flux est
    converti, sans codec de sortie qu'on n'a jamais lu.
    """
    if row.transcode_reason:
        return row.transcode_reason
    parts = []
    if str(row.video_decision or "").lower() == "transcode":
        parts.append("Vidéo convertie")
    if str(row.audio_decision or "").lower() == "transcode":
        parts.append("Audio converti")
    if str(row.subtitle_decision or "").lower() in {"burn", "transcode"}:
        parts.append("Sous-titres convertis")
    return " · ".join(parts) or None


def _json_or_none(value: str | None) -> dict | None:
    if not value:
        return None
    try:
        return json.loads(value)
    except ValueError:
        return None


def _plex_decision_details(row: PlaybackSession) -> dict | None:
    return _json_or_none(row.plex_decision_details)


def _transcode_reason(row: PlaybackSession) -> str:
    # La raison de Plex prime : elle regroupe les lectures par vraie cause (3000, 3001...).
    if row.plex_decision_text:
        return row.plex_decision_text
    if str(row.subtitle_decision or "").lower() in {"burn", "transcode"}:
        return "Sous-titres"
    if str(row.video_decision or "").lower() == "transcode":
        return "Vidéo / résolution"
    if str(row.audio_decision or "").lower() == "transcode":
        return "Audio"
    if row.container:
        return "Conteneur"
    return "Non déterminée"


def _container_route(row: PlaybackSession) -> tuple[str | None, str | None]:
    """Conteneur du fichier source et conteneur envoyé au lecteur, en majuscules.

    Sans `TranscodeSession` (lecture directe), le fichier part tel quel : la sortie est
    la source. Pendant une conversion, `Media/@container` décrit déjà la sortie, d'où la
    préférence pour la fiche du média lue au moment de la collecte.
    """
    details = _json_or_none(row.transcode_details) or {}
    container = details.get("container") or {}
    source = container.get("from") or (None if details else row.container)
    target = container.get("to") or source if details else source
    return (str(source).upper() if source else None, str(target).upper() if target else None)


def _container_converted(row: PlaybackSession) -> bool:
    source, target = _container_route(row)
    return bool(source and target and source != target)


def _direct_stream_reason(row: PlaybackSession) -> str:
    """Ce qui fait passer une lecture par la conversion légère (Direct Stream)."""
    if row.plex_decision_text:
        return row.plex_decision_text
    if str(row.subtitle_decision or "").lower() in {"burn", "transcode"}:
        return "Sous-titres"
    source, target = _container_route(row)
    if source and target and source != target:
        return f"Conteneur {source} → {target}"
    protocol = str((_json_or_none(row.transcode_details) or {}).get("protocol") or "").lower()
    if protocol in {"dash", "hls"}:
        return f"Diffusion en segments {protocol.upper()}"
    if str(row.audio_decision or "").lower() == "copy" or str(row.video_decision or "").lower() == "copy":
        return "Flux recopiés"
    return "Non déterminée"


def _utc_iso(value: datetime | None) -> str | None:
    """Instant stocke en UTC naif, envoye avec son fuseau : le navigateur le lisait
    sinon comme une heure locale, et toutes les heures des sessions avaient une a deux
    heures de retard."""
    if not value:
        return None
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


def _local(value: datetime) -> datetime:
    """Heure murale (APP_TIMEZONE) d'un instant stocke en UTC naif."""
    return value.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(APP_TIMEZONE))


def _analytics(rows: list[PlaybackSession], previous_rows: list[PlaybackSession]) -> dict:
    total = len(rows)
    watch_ms = sum(row.watched_ms or 0 for row in rows)
    previous_total = len(previous_rows)
    previous_watch_ms = sum(row.watched_ms or 0 for row in previous_rows)

    heatmap: dict[tuple[int, int], dict[str, int]] = defaultdict(lambda: {"sessions": 0, "watch_ms": 0})
    for row in rows:
        if row.started_at:
            # Les heures de pointe se lisent a l'heure locale, pas en UTC.
            local = _local(row.started_at)
            key = (local.weekday(), local.hour)
            heatmap[key]["sessions"] += 1
            heatmap[key]["watch_ms"] += row.watched_ms or 0

    events: list[tuple[datetime, int]] = []
    concurrent_daily: dict[str, int] = defaultdict(int)
    for row in rows:
        if not row.started_at:
            continue
        end = row.ended_at or row.last_seen_at or row.started_at
        if end < row.started_at:
            end = row.started_at
        events.extend(((row.started_at, 1), (end, -1)))
    current = peak = 0
    peak_at = None
    for moment, delta in sorted(events, key=lambda value: (value[0], -value[1])):
        current += delta
        if current > peak:
            peak, peak_at = current, moment
        day = _local(moment).date().isoformat()
        concurrent_daily[day] = max(concurrent_daily[day], current)

    completion_groups: dict[str, list[tuple[float, bool]]] = defaultdict(list)
    for row in rows:
        progress = row.progress_percent
        if progress is None and row.duration_ms:
            progress = min(100, (row.progress_ms or row.watched_ms or 0) / row.duration_ms * 100)
        if progress is not None:
            completed = row.watched_status == 1 if row.watched_status is not None else progress >= 85
            completion_groups[row.media_type or "other"].append((progress, completed))
    completion = []
    for media_type, values in completion_groups.items():
        completed = sum(is_completed for _, is_completed in values)
        completion.append(
            {
                "media_type": media_type,
                "sessions": len(values),
                "completed": completed,
                "completion_rate": _percent(completed, len(values)),
                "average_progress": round(sum(value for value, _ in values) / len(values), 1),
            }
        )

    media_groups: dict[tuple[str, str], dict] = {}
    for row in rows:
        label = _media_label(row)
        media_key = (row.media_type or "other", label)
        item = media_groups.setdefault(
            media_key,
            {
                "title": label,
                "media_type": "show" if row.grandparent_title else row.media_type,
                "sessions": 0,
                "watch_ms": 0,
                "users": set(),
                "thumb_url": _thumb_url(row),
                "rating_key": row.rating_key,
                "size_bytes": 0,
                "completed": 0,
                "abandoned": 0,
                "resumed": 0,
                "rewatches": 0,
            },
        )
        item["sessions"] += 1
        item["watch_ms"] += row.watched_ms or 0
        if row.user_name:
            item["users"].add(row.user_name)
        item["size_bytes"] = max(item["size_bytes"], row.media_size_bytes or 0)
        progress = row.progress_percent
        if progress is None and row.duration_ms:
            progress = min(100, (row.progress_ms or row.watched_ms or 0) / row.duration_ms * 100)
        completed = row.watched_status == 1 if row.watched_status is not None else (progress or 0) >= 85
        item["completed"] += int(completed)
        item["abandoned"] += int(not completed and (progress or 0) < 21.25)
        item["resumed"] += int((row.group_count or 1) > 1)

    repeat_counts = Counter((row.user_name, row.rating_key) for row in rows if row.user_name and row.rating_key)
    for row in rows:
        media_key = (row.media_type or "other", _media_label(row))
        if row.user_name and row.rating_key and repeat_counts[(row.user_name, row.rating_key)] > 1:
            media_groups[media_key]["rewatches"] += 1
            repeat_counts[(row.user_name, row.rating_key)] -= 1

    ranked_media = list(media_groups.values())
    for item in ranked_media:
        item["users"] = len(item["users"])
        item["completion_rate"] = _percent(item["completed"], item["sessions"])
        size_gb = item["size_bytes"] / (1024**3)
        item["watch_hours_per_gb"] = round(item["watch_ms"] / 3_600_000 / size_gb, 2) if size_gb else None
    popular = sorted(ranked_media, key=lambda item: item["watch_ms"], reverse=True)[:10]
    popular_by_audience = sorted(
        ranked_media, key=lambda item: (item["users"], item["sessions"], item["watch_ms"]), reverse=True
    )[:10]

    method_counts = Counter(row.playback_method or "unknown" for row in rows)
    codec_counts = Counter((row.video_codec or "Inconnu").upper() for row in rows)
    resolution_counts = Counter(row.quality or "Inconnue" for row in rows)
    device_groups: dict[str, dict] = {}
    for row in rows:
        device = row.player_title or row.product or row.platform or "Inconnu"
        item = device_groups.setdefault(
            device, {"device": device, "sessions": 0, "direct": 0, "direct_streams": 0, "transcodes": 0}
        )
        item["sessions"] += 1
        if row.playback_method == "transcode":
            item["transcodes"] += 1
        elif row.playback_method in {"direct_play", "direct_stream"}:
            item["direct"] += 1
            item["direct_streams"] += int(row.playback_method == "direct_stream")
    devices = sorted(device_groups.values(), key=lambda item: item["sessions"], reverse=True)[:10]
    for item in devices:
        item["compatibility_score"] = round(item["direct"] / item["sessions"] * 100) if item["sessions"] else 0

    bandwidth_values = [row.bandwidth_kbps for row in rows if row.bandwidth_kbps]
    bandwidth_by_user: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        if row.bandwidth_kbps:
            bandwidth_by_user[row.user_name or "Inconnu"].append(row.bandwidth_kbps)

    transcode_reasons = Counter(_transcode_reason(row) for row in rows if row.playback_method == "transcode")
    direct_stream_reasons = Counter(
        _direct_stream_reason(row) for row in rows if row.playback_method == "direct_stream"
    )
    # Conteneur du fichier source, et combien de fois Plex a dû le changer pour le lecteur.
    containers: dict[str, dict] = {}
    for row in rows:
        source, _ = _container_route(row)
        if not source:
            continue
        item = containers.setdefault(source, {"label": source, "count": 0, "converted": 0})
        item["count"] += 1
        item["converted"] += int(_container_converted(row))

    episode_rows = sorted(
        (row for row in rows if row.media_type == "episode" and row.user_name and row.grandparent_title),
        key=lambda row: (row.user_name or "", row.grandparent_title or "", row.started_at or datetime.min),
    )
    binges = []
    chain: list[PlaybackSession] = []
    for row in episode_rows:
        previous = chain[-1] if chain else None
        same_chain = (
            previous
            and previous.user_name == row.user_name
            and previous.grandparent_title == row.grandparent_title
            and row.started_at
            and (previous.ended_at or previous.last_seen_at or previous.started_at)
            and row.started_at - (previous.ended_at or previous.last_seen_at or previous.started_at)
            <= timedelta(hours=2)
        )
        if not same_chain:
            if len(chain) >= 3:
                binges.append(chain)
            chain = [row]
        else:
            chain.append(row)
    if len(chain) >= 3:
        binges.append(chain)
    binge_items = [
        {
            "user_name": chain[0].user_name,
            "title": chain[0].grandparent_title,
            "episodes": len(chain),
            "watch_ms": sum(row.watched_ms or 0 for row in chain),
            "started_at": _utc_iso(chain[0].started_at),
        }
        for chain in sorted(binges, key=lambda value: sum(row.watched_ms or 0 for row in value), reverse=True)[:10]
    ]

    previous_users: dict[str, dict[str, int]] = defaultdict(lambda: {"sessions": 0, "watch_ms": 0})
    for row in previous_rows:
        if row.user_name:
            previous_users[row.user_name]["sessions"] += 1
            previous_users[row.user_name]["watch_ms"] += row.watched_ms or 0
    user_groups: dict[str, dict] = {}
    for row in rows:
        if not row.user_name:
            continue
        item = user_groups.setdefault(
            row.user_name,
            {
                "name": row.user_name,
                "sessions": 0,
                "watch_ms": 0,
                "titles": Counter(),
                "devices": Counter(),
                "last_seen_at": None,
            },
        )
        item["sessions"] += 1
        item["watch_ms"] += row.watched_ms or 0
        item["titles"][_media_label(row)] += 1
        item["devices"][row.player_title or row.product or row.platform or "Inconnu"] += 1
        seen = row.last_seen_at or row.ended_at or row.started_at
        if seen and (item["last_seen_at"] is None or seen > item["last_seen_at"]):
            item["last_seen_at"] = seen
    user_trends = []
    for item in user_groups.values():
        previous_user = previous_users[item["name"]]
        user_trends.append(
            {
                "name": item["name"],
                "sessions": item["sessions"],
                "watch_ms": item["watch_ms"],
                "watch_change": _percent(item["watch_ms"] - previous_user["watch_ms"], previous_user["watch_ms"])
                if previous_user["watch_ms"]
                else (100 if item["watch_ms"] else 0),
                "favorite_title": item["titles"].most_common(1)[0][0] if item["titles"] else None,
                "favorite_device": item["devices"].most_common(1)[0][0] if item["devices"] else None,
                "last_seen_at": _utc_iso(item["last_seen_at"]),
            }
        )
    user_trends.sort(key=lambda item: item["watch_ms"], reverse=True)

    known_storage: dict[str, int] = {}
    for row in rows:
        if row.rating_key and row.media_size_bytes:
            known_storage[row.rating_key] = max(known_storage.get(row.rating_key, 0), row.media_size_bytes)
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
            {"weekday": weekday, "hour": hour, **heatmap[(weekday, hour)]} for weekday in range(7) for hour in range(24)
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
                for name, values in sorted(bandwidth_by_user.items(), key=lambda item: sum(item[1]), reverse=True)[:10]
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


def _int(value, default=None):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _dt_from_epoch(value) -> datetime | None:
    timestamp = _int(value)
    if not timestamp:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).replace(tzinfo=None)


def _masked_ip(value: str | None, anonymize: bool) -> str | None:
    if not value or not anonymize:
        return value
    if ":" in value:
        return ":".join(value.split(":")[:4]) + "::"
    parts = value.split(".")
    return ".".join(parts[:3] + ["0"]) if len(parts) == 4 else None


def _decision(value: str | None) -> str:
    return str(value or "").strip().lower().replace("-", " ").replace("_", " ")


def _playback_method(
    video_decision: str | None,
    audio_decision: str | None,
    transcode_decision: str | None = None,
) -> str:
    aggregate = _decision(transcode_decision)
    if aggregate in {"transcode", "transcoded"}:
        return "transcode"
    if aggregate in {"copy", "direct stream", "directstream"}:
        return "direct_stream"
    if aggregate in {"direct play", "directplay"}:
        return "direct_play"

    decisions = {_decision(video_decision), _decision(audio_decision)}
    if "transcode" in decisions:
        return "transcode"
    if decisions & {"copy", "direct stream", "directstream"}:
        return "direct_stream"
    if decisions & {"direct play", "directplay"}:
        return "direct_play"
    return "unknown"


def _tautulli_values(item: dict) -> dict:
    """Normalise les champs réellement renvoyés par get_history."""
    play_seconds = max(0, _int(item.get("play_duration"), 0))
    percent_complete = max(0.0, min(100.0, float(item.get("percent_complete") or 0)))
    watched_status = max(0.0, min(1.0, float(item.get("watched_status") or 0)))
    video_decision = item.get("video_decision")
    audio_decision = item.get("audio_decision")
    return {
        "video_decision": video_decision,
        "audio_decision": audio_decision,
        "playback_method": _playback_method(
            video_decision,
            audio_decision,
            item.get("transcode_decision"),
        ),
        # get_history expose `duration` comme alias historique de play_duration :
        # ce n'est jamais la durée du média.
        "duration_ms": None,
        "watched_ms": play_seconds * 1000,
        "progress_ms": None,
        "progress_percent": percent_complete,
        "watched_status": watched_status,
        "group_count": max(1, _int(item.get("group_count"), 1)),
        "source_group_ids": str(item.get("group_ids") or "") or None,
    }


def _plex_thumb_path(row: PlaybackSession) -> str | None:
    """Retrouve un chemin Plex exploitable, y compris pour les anciens imports Tautulli."""
    thumb_url = row.thumb_url or ""
    if thumb_url.startswith("/library/metadata/"):
        return thumb_url
    if thumb_url.startswith("/pms_image_proxy"):
        proxied = unquote((parse_qs(urlparse(thumb_url).query).get("img") or [""])[0])
        proxied_path = urlparse(proxied).path
        if proxied_path.startswith("/library/metadata/"):
            return proxied_path
    if row.rating_key:
        return f"/library/metadata/{quote(str(row.rating_key), safe='')}/thumb"
    return None


def _serialize_segment(segment: PlaybackSessionSegment) -> dict:
    return {
        "id": segment.id,
        "state": segment.state,
        "playback_method": segment.playback_method,
        "started_at": _utc_iso(segment.started_at),
        "ended_at": _utc_iso(segment.ended_at),
        "duration_ms": segment.duration_ms,
        "view_offset_start_ms": segment.view_offset_start_ms,
        "view_offset_end_ms": segment.view_offset_end_ms,
    }


def _serialize(row: PlaybackSession) -> dict:
    thumb_url = _thumb_url(row)
    segments = list(row.segments or [])
    return {
        "id": row.id,
        "source": row.source,
        "session_id": row.source_session_id,
        "user_name": row.user_name,
        "media_type": row.media_type,
        "title": row.title,
        "grandparent_title": row.grandparent_title,
        "parent_title": row.parent_title,
        "season_number": row.season_number,
        "episode_number": row.episode_number,
        "year": row.year,
        "rating_key": row.rating_key,
        "library": row.library_section_title,
        "thumb_url": thumb_url,
        "player": row.player_title,
        "platform": row.platform,
        "product": row.product,
        "address": row.player_address,
        "state": row.state,
        "playback_method": row.playback_method,
        "video_decision": row.video_decision,
        "audio_decision": row.audio_decision,
        "quality": row.quality,
        "video_codec": row.video_codec,
        "audio_codec": row.audio_codec,
        "container": row.container,
        "subtitle_decision": row.subtitle_decision,
        "location": row.stream_location,
        "geo_status": row.geo_status,
        "geo_city": row.geo_city,
        "geo_region": row.geo_region,
        "geo_country": row.geo_country,
        "geo_country_code": row.geo_country_code,
        "geo_lat": row.geo_lat,
        "geo_lon": row.geo_lon,
        "geo_isp": row.geo_isp,
        "geo_organization": row.geo_organization,
        "geo_asn": row.geo_asn,
        "bandwidth_kbps": row.bandwidth_kbps,
        "media_size_bytes": row.media_size_bytes,
        "transcode_buffer_ms": row.transcode_buffer_ms,
        "transcode_speed": _float(row.transcode_speed),
        "transcode_throttled": row.transcode_throttled,
        "transcode_hw": row.transcode_hw,
        "transcode_details": _json_or_none(row.transcode_details),
        "stream_details": _json_or_none(row.stream_details),
        "is_download": bool(row.is_download),
        # Bleu, comme la pastille Direct Stream : conteneur changé, rien de réencodé.
        "transcode_remux": _remux_label(_json_or_none(row.transcode_details)),
        # Vert : la decision de Plex, relue dans ses journaux. Orange : notre deduction.
        "transcode_reason": (
            {
                "source": "plex",
                "text": row.plex_decision_text,
                "code": row.plex_decision_code,
                "deduced": _deduced_reason(row),
                **(_plex_decision_details(row) or {}),
            }
            if row.plex_decision_text
            else {"source": "deduced", "text": text}
            if (text := _deduced_reason(row))
            else None
        ),
        "progress_ms": row.progress_ms,
        "initial_progress_ms": row.initial_progress_ms,
        "duration_ms": row.duration_ms,
        "watched_ms": row.watched_ms,
        "paused_ms": sum(s.duration_ms for s in segments if s.state == "paused"),
        "progress": (
            round(row.progress_percent, 1)
            if row.progress_percent is not None
            else round((row.progress_ms or 0) / row.duration_ms * 100, 1)
            if row.duration_ms
            else 0
        ),
        "progress_percent": row.progress_percent,
        "watched_status": row.watched_status,
        "group_count": row.group_count or 1,
        "reference_id": row.reference_id,
        "force_stopped": row.force_stopped,
        "started_at": _utc_iso(row.started_at),
        "last_seen_at": _utc_iso(row.last_seen_at),
        "ended_at": _utc_iso(row.ended_at),
        "media_request_id": row.media_request_id,
        "segments": [_serialize_segment(s) for s in segments],
    }


def _tautulli_row_id(item: dict) -> str:
    """Return the identifier of one history row, not its grouped reference."""
    return str(item.get("row_id") or item.get("id") or item.get("reference_id") or "")


def _tautulli_session_values(item: dict, settings: Settings, location: dict) -> dict:
    values = _tautulli_values(item)
    started = _dt_from_epoch(item.get("started")) or now_utc_naive()
    stopped = _dt_from_epoch(item.get("stopped"))
    return {
        "user_name": item.get("friendly_name") or item.get("user"),
        "media_type": item.get("media_type"),
        "title": item.get("title") or "Lecture Plex",
        "grandparent_title": item.get("grandparent_title"),
        "parent_title": item.get("parent_title"),
        "season_number": _int(item.get("parent_media_index")) if item.get("media_type") == "episode" else None,
        "episode_number": _int(item.get("media_index")) if item.get("media_type") == "episode" else None,
        "year": _int(item.get("year")),
        "rating_key": str(item.get("rating_key") or "") or None,
        "library_section_title": item.get("section_name"),
        "thumb_url": item.get("thumb"),
        "player_title": item.get("player"),
        "platform": item.get("platform"),
        "product": item.get("product"),
        "player_address": _masked_ip(item.get("ip_address"), settings.activity_anonymize_ips),
        "state": "stopped",
        "quality": item.get("quality_profile") or item.get("video_resolution"),
        "video_codec": item.get("video_codec"),
        "audio_codec": item.get("audio_codec"),
        "container": item.get("container"),
        "subtitle_decision": item.get("subtitle_decision"),
        "stream_location": item.get("location"),
        "bandwidth_kbps": _int(item.get("bandwidth")),
        "media_size_bytes": _int(item.get("file_size") or item.get("media_size")),
        "started_at": started,
        "last_seen_at": stopped or started,
        "ended_at": stopped or started + timedelta(milliseconds=values["watched_ms"]),
        **values,
        **location,
    }


def _thumb_url(row: PlaybackSession) -> str | None:
    plex_thumb_path = _plex_thumb_path(row)
    if plex_thumb_path:
        return f"/api/playback/thumb?path={quote(plex_thumb_path, safe='')}"
    return wrap_image_proxy(row.thumb_url)


def _float(value) -> float | None:
    # Plex écrit parfois `speed="nan"` : un NaN stocké rendait ensuite toute réponse JSON
    # qui le contenait impossible à sérialiser (erreur 500 sur les statistiques).
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _transcode_buffer(transcode_attrs: dict, view_offset_ms: int) -> dict:
    """Etat du transcodage en direct : tampon d'avance, vitesse et bridage.

    `maxOffsetAvailable` (secondes) est l'endroit du media jusqu'ou le transcodeur a
    deja produit ; retranche de la tete de lecture, c'est le tampon dont dispose le
    lecteur avant de devoir attendre. Sans transcodage, les trois valeurs restent vides.
    """
    if not transcode_attrs:
        return {"transcode_buffer_ms": None, "transcode_speed": None, "transcode_throttled": None}
    max_offset = _float(transcode_attrs.get("maxOffsetAvailable"))
    buffer_ms = max(0, round(max_offset * 1000) - view_offset_ms) if max_offset is not None else None
    throttled = transcode_attrs.get("throttled")
    return {
        "transcode_buffer_ms": buffer_ms,
        "transcode_speed": _float(transcode_attrs.get("speed")),
        "transcode_throttled": throttled in ("1", "true") if throttled is not None else None,
    }


_CODEC_LABELS = {
    "hevc": "HEVC",
    "h264": "H.264",
    "av1": "AV1",
    "mpeg2video": "MPEG-2",
    "vc1": "VC-1",
    "truehd": "TrueHD",
    "eac3": "E-AC3",
    "ac3": "AC3",
    "dca": "DTS",
    "aac": "AAC",
    "opus": "Opus",
    "mp3": "MP3",
    "flac": "FLAC",
    "pgs": "PGS",
    "ass": "ASS",
    "srt": "SRT",
    "webvtt": "WebVTT",
    "vobsub": "VobSub",
}


def _codec(value: str | None) -> str:
    return _CODEC_LABELS.get(str(value or "").lower(), str(value or "?").upper())


def _deduce_transcode_reason(
    transcode_attrs: dict, video_stream, subtitle_stream, subtitle_source: str | None = None
) -> str | None:
    """Ce qui est converti, lu dans le `TranscodeSession` : une deduction, pas la raison de Plex.

    Plex ne dit pas *pourquoi* il convertit dans /status/sessions, seulement *quoi* :
    codec source -> sortie, resolution de sortie, sous-titres. Assez pour orienter le
    diagnostic (« TrueHD -> AAC » annonce un lecteur sans TrueHD), pas pour trancher.
    """
    if not transcode_attrs:
        return None
    parts: list[str] = []
    video = str(transcode_attrs.get("videoDecision") or "").lower()
    audio = str(transcode_attrs.get("audioDecision") or "").lower()
    subtitles = str(transcode_attrs.get("subtitleDecision") or "").lower()
    if video == "transcode":
        source, target = transcode_attrs.get("sourceVideoCodec"), transcode_attrs.get("videoCodec")
        # En transcodage, le flux de la session décrit déjà la sortie, pas la source.
        height = _int(transcode_attrs.get("height")) or (
            _int(video_stream.get("height")) if video_stream is not None else None
        )
        if source and target and str(source).lower() != str(target).lower():
            parts.append(f"Vidéo {_codec(source)} → {_codec(target)}")
        else:
            parts.append(f"Vidéo réencodée{f' en {height}p' if height else ''} (qualité ou débit)")
    if audio == "transcode":
        source, target = transcode_attrs.get("sourceAudioCodec"), transcode_attrs.get("audioCodec")
        if source and target and str(source).lower() != str(target).lower():
            parts.append(f"Audio {_codec(source)} → {_codec(target)}")
        else:
            parts.append("Audio réencodé")
    if subtitles in {"transcode", "burn"}:
        # Le flux de la session décrit la *sortie* (WebVTT pour un Chromecast) : le format
        # d'origine vient de la fiche du média, quand on a pu la lire.
        target = subtitle_stream.get("codec") if subtitle_stream is not None else None
        source = subtitle_source or target
        if subtitles == "burn":
            parts.append(f"Sous-titres {_codec(source)} incrustés")
        elif source and target and str(source).lower() != str(target).lower():
            parts.append(f"Sous-titres {_codec(source)} → {_codec(target)}")
        else:
            parts.append(f"Sous-titres {_codec(source)} convertis")
        if video != "transcode" and audio != "transcode":
            parts[-1] += " (vidéo et audio copiés)"
    return " · ".join(parts) or None


def _transcode_hw(transcode_attrs: dict) -> str | None:
    if not transcode_attrs:
        return None
    encoding = transcode_attrs.get("transcodeHwEncodingTitle") or transcode_attrs.get("transcodeHwEncoding")
    decoding = transcode_attrs.get("transcodeHwDecodingTitle") or transcode_attrs.get("transcodeHwDecoding")
    if encoding or decoding:
        return encoding or decoding
    if str(transcode_attrs.get("videoDecision") or "").lower() == "transcode":
        return "Processeur"
    return None


def _transcode_details(
    transcode_attrs: dict, media_attrs: dict, video_stream, audio_stream, subtitle_stream, sheet: dict | None
) -> dict | None:
    """Ce que Plex fait de chaque flux, source -> sortie, pour la fiche de la session."""
    if not transcode_attrs:
        return None
    sources = {stream.get("id"): stream for stream in (sheet or {}).get("streams", [])}

    def attr(stream, name):
        return stream.get(name) if stream is not None else None

    subtitle_source = sources.get(attr(subtitle_stream, "id")) or {}
    complete = transcode_attrs.get("complete")
    return {
        # Terminé : tout le fichier est prêt, plus rien ne peut couper la lecture.
        "transcoder": {
            "complete": complete in ("1", "true") if complete is not None else None,
            "progress": _float(transcode_attrs.get("progress")),
        },
        "protocol": transcode_attrs.get("protocol"),
        "container": {
            "from": (sheet or {}).get("container"),
            "to": transcode_attrs.get("container") or media_attrs.get("container"),
        },
        "video": {
            "decision": transcode_attrs.get("videoDecision"),
            "from": transcode_attrs.get("sourceVideoCodec") or attr(video_stream, "codec"),
            "to": transcode_attrs.get("videoCodec") or attr(video_stream, "codec"),
            "height": _int(transcode_attrs.get("height")) or _int(attr(video_stream, "height")),
        },
        "audio": {
            "decision": transcode_attrs.get("audioDecision"),
            "from": transcode_attrs.get("sourceAudioCodec") or attr(audio_stream, "codec"),
            "to": transcode_attrs.get("audioCodec") or attr(audio_stream, "codec"),
            "channels": _int(transcode_attrs.get("audioChannels")) or _int(attr(audio_stream, "channels")),
            "language": attr(audio_stream, "language"),
        },
        "subtitles": (
            {
                "decision": transcode_attrs.get("subtitleDecision") or attr(subtitle_stream, "decision"),
                "from": subtitle_source.get("codec") or attr(subtitle_stream, "codec"),
                "to": attr(subtitle_stream, "codec"),
                "language": attr(subtitle_stream, "language") or subtitle_source.get("language"),
                "forced": attr(subtitle_stream, "forced") == "1",
            }
            if subtitle_stream is not None
            else None
        ),
    }


def _dynamic_range(stream) -> str | None:
    """Plage dynamique d'une piste vidéo : Dolby Vision, HDR10, HLG ou SDR."""
    if stream is None:
        return None
    attrs = stream if isinstance(stream, dict) else stream.attrib
    if attrs.get("DOVIPresent") == "1":
        profile = attrs.get("DOVIProfile")
        return f"Dolby Vision{f' {profile}' if profile else ''}"
    trc = str(attrs.get("colorTrc") or "").lower()
    if trc == "smpte2084":
        return "HDR10"
    if trc in {"arib-std-b67", "hlg"}:
        return "HLG"
    if trc or attrs.get("colorPrimaries"):
        return "SDR"
    return None


def _flag(value) -> bool | None:
    return None if value is None else str(value).lower() in {"1", "true"}


def _stream_details(
    session_attrs: dict,
    player_attrs: dict,
    media_attrs: dict,
    transcode_attrs: dict,
    video_stream,
    audio_stream,
    sheet: dict | None,
) -> dict:
    """Ce qui situe la lecture au-delà de la conversion : réseau, lecteur, HDR, débits.

    Pendant une conversion, les flux de la session décrivent la *sortie* : la plage
    dynamique et le débit d'origine se lisent dans la fiche du média quand on l'a.
    """
    source_video = next((s for s in (sheet or {}).get("streams", []) if s.get("streamType") == "1"), None)
    video_converted = str(transcode_attrs.get("videoDecision") or "").lower() == "transcode"
    source_range = _dynamic_range(source_video) or (None if video_converted else _dynamic_range(video_stream))
    output_range = _dynamic_range(video_stream) if video_converted else source_range
    return {
        # Identifiant attendu par /status/sessions/terminate pour arrêter la lecture.
        "plex_session_id": session_attrs.get("id"),
        "local": _flag(player_attrs.get("local")),
        # Relais Plex : débit bridé (~2 Mb/s), cause fréquente d'une qualité réduite.
        "relayed": _flag(player_attrs.get("relayed")),
        "secure": _flag(player_attrs.get("secure")),
        "player": {
            "product": player_attrs.get("product"),
            "version": player_attrs.get("version"),
            "platform": player_attrs.get("platform"),
            "platform_version": player_attrs.get("platformVersion"),
            "model": player_attrs.get("model"),
            "vendor": player_attrs.get("vendor"),
        },
        "bitrate": {
            "source_kbps": (sheet or {}).get("bitrate")
            or (None if transcode_attrs else _int(media_attrs.get("bitrate"))),
            "stream_kbps": _int(session_attrs.get("bandwidth")),
            "video_kbps": _int(video_stream.get("bitrate")) if video_stream is not None else None,
            "audio_kbps": _int(audio_stream.get("bitrate")) if audio_stream is not None else None,
        },
        "dynamic_range": {
            "source": source_range,
            # Un HDR réencodé en SDR : le tone mapping, la conversion la plus coûteuse.
            "output": output_range
            if output_range
            else ("SDR" if video_converted and source_range not in (None, "SDR") else None),
        },
    }


def _language(attrs: dict) -> str | None:
    return attrs.get("language") or attrs.get("languageTag") or attrs.get("languageCode")


def _tracks(
    transcode_attrs: dict,
    media_attrs: dict,
    part_attrs: dict,
    video_stream,
    audio_stream,
    video_decision: str | None,
    audio_decision: str | None,
    sheet: dict | None,
    subtitle_stream=None,
) -> dict:
    """Vidéo, audio, sous-titres et conteneur de la lecture, source -> sortie, quel que soit le mode.

    Le suivi des conversions ne couvrait que les sessions converties. Ici, chaque lecture
    dit ce qu'elle lit (codec, débit, résolution, canaux, langue), ce qui en est envoyé
    au lecteur, et, pour l'audio, les langues disponibles dans le fichier. La source se
    lit dans la fiche du média quand on l'a : pendant une conversion, la session décrit
    la sortie.
    """
    sheet = sheet or {}
    sources = {stream.get("id"): stream for stream in sheet.get("streams", [])}

    def attrs(stream) -> dict:
        return dict(stream.attrib) if stream is not None else {}

    def converted(decision) -> bool:
        return _decision(decision) == "transcode"

    video = attrs(video_stream)
    audio = attrs(audio_stream)
    source_video = (
        sources.get(video.get("id"))
        or next((item for item in sheet.get("streams", []) if item.get("streamType") == "1"), None)
        or video
    )
    source_audio = sources.get(audio.get("id")) or audio
    video_converted = converted(video_decision)
    audio_converted = converted(audio_decision)

    source_container = sheet.get("container") or (
        None if transcode_attrs else part_attrs.get("container") or media_attrs.get("container")
    )
    output_container = (
        (transcode_attrs.get("container") or media_attrs.get("container")) if transcode_attrs else source_container
    )
    video_from = {
        "codec": transcode_attrs.get("sourceVideoCodec") or source_video.get("codec"),
        "width": _int(source_video.get("width")),
        "height": _int(source_video.get("height")),
        "bitrate_kbps": _int(source_video.get("bitrate")),
        "profile": source_video.get("profile"),
        "bit_depth": _int(source_video.get("bitDepth")),
        "frame_rate": _float(source_video.get("frameRate")),
        "dynamic_range": _dynamic_range(source_video),
    }
    audio_from = {
        "codec": transcode_attrs.get("sourceAudioCodec") or source_audio.get("codec"),
        "channels": _int(source_audio.get("channels")),
        "bitrate_kbps": _int(source_audio.get("bitrate")),
        "language": _language(source_audio) or _language(audio),
        "title": source_audio.get("displayTitle") or audio.get("displayTitle"),
    }
    played_id = audio.get("id")
    languages = [
        {
            "language": _language(item),
            "codec": item.get("codec"),
            "channels": _int(item.get("channels")),
            "bitrate_kbps": _int(item.get("bitrate")),
            "sampling_rate": _int(item.get("samplingRate")),
            "profile": item.get("profile"),
            "title": item.get("displayTitle"),
            "played": bool(played_id) and item.get("id") == played_id,
        }
        for item in sheet.get("streams", [])
        if item.get("streamType") == "2"
    ]
    if languages and not any(item["played"] for item in languages) and audio_from["language"]:
        for item in languages:
            if item["language"] == audio_from["language"] and item["codec"] == audio_from["codec"]:
                item["played"] = True
                break
    return {
        "container": {
            "from": source_container,
            "to": output_container,
            "converted": bool(
                source_container and output_container and str(source_container).lower() != str(output_container).lower()
            ),
            "protocol": transcode_attrs.get("protocol"),
        },
        "video": {
            "decision": video_decision,
            "from": video_from,
            "to": {
                "codec": transcode_attrs.get("videoCodec") or video.get("codec"),
                "height": _int(transcode_attrs.get("height")) or _int(video.get("height")),
                "bitrate_kbps": _int(video.get("bitrate")),
            }
            if video_converted
            else video_from,
        }
        if video or video_from["codec"]
        else None,
        "audio": {
            "decision": audio_decision,
            "from": audio_from,
            "to": {
                "codec": transcode_attrs.get("audioCodec") or audio.get("codec"),
                "channels": _int(transcode_attrs.get("audioChannels")) or _int(audio.get("channels")),
                "bitrate_kbps": _int(audio.get("bitrate")),
            }
            if audio_converted
            else audio_from,
            "languages": languages,
        }
        if audio or audio_from["codec"]
        else None,
        "subtitles": _subtitle_tracks(sheet, attrs(subtitle_stream)),
    }


def _subtitle_tracks(sheet: dict, selected: dict) -> dict | None:
    """Sous-titres du fichier, avec celui affiché et ce que Plex en fait.

    `decision` vaut `copy` (envoyé tel quel), `transcode` (converti dans un autre
    format) ou `burn` (incrusté dans l'image, ce qui force le réencodage vidéo).
    """
    selected_id = selected.get("id")
    decision = selected.get("decision") if selected else None
    items = [
        {
            "language": _language(item),
            "codec": item.get("codec"),
            "title": item.get("displayTitle") or item.get("title"),
            # Nom donné à la piste dans le fichier (« Forcés », « SDH », « Commentaires »...).
            "name": item.get("title") or item.get("extendedDisplayTitle"),
            "forced": item.get("forced") == "1",
            "hearing_impaired": item.get("hearingImpaired") == "1",
            "external": bool(item.get("key")),
            "selected": bool(selected_id) and item.get("id") == selected_id,
        }
        for item in sheet.get("streams", [])
        if item.get("streamType") == "3"
    ]
    if selected and not any(item["selected"] for item in items):
        items.append(
            {
                "language": _language(selected),
                "codec": selected.get("codec"),
                "title": selected.get("displayTitle") or selected.get("title"),
                "name": selected.get("title") or selected.get("extendedDisplayTitle"),
                "forced": selected.get("forced") == "1",
                "hearing_impaired": selected.get("hearingImpaired") == "1",
                "external": bool(selected.get("key")),
                "selected": True,
            }
        )
    if not items:
        return None
    return {
        "decision": decision,
        "to": selected.get("format") or selected.get("codec") if decision == "transcode" else None,
        "languages": items,
    }


def _remux_label(details: dict | None) -> str | None:
    """Le changement de conteneur d'un Direct Stream, sans rien réencoder."""
    if not details:
        return None
    container = details.get("container") or {}
    source, target = container.get("from"), container.get("to")
    protocol = str(details.get("protocol") or "").lower()
    segments = f" (segments {protocol.upper()})" if protocol in {"dash", "hls"} else ""
    if source and target and str(source).lower() != str(target).lower():
        return f"Conteneur {str(source).upper()} → {str(target).upper()}{segments}"
    if segments and target:
        return f"Diffusé en {str(target).upper()}{segments}"
    return None


def parse_plex_sessions(
    xml: str, *, anonymize_ips: bool = True, media_sheets: dict[str, dict] | None = None
) -> list[dict]:
    """Sessions en cours. `media_sheets` : fiche d'origine par ratingKey (conteneur, pistes)."""
    root = ElementTree.fromstring(xml)
    sessions: list[dict] = []
    for media in root:
        if media.tag not in {"Video", "Track", "Photo"}:
            continue
        user = media.find("User")
        player = media.find("Player")
        session = media.find("Session")
        transcode = media.find("TranscodeSession")
        media_info = media.find("Media")
        part = media_info.find("Part") if media_info is not None else None
        user_attrs = user.attrib if user is not None else {}
        player_attrs = player.attrib if player is not None else {}
        session_attrs = session.attrib if session is not None else {}
        transcode_attrs = transcode.attrib if transcode is not None else {}
        media_attrs = media_info.attrib if media_info is not None else {}
        part_attrs = part.attrib if part is not None else {}
        part_streams = part.findall("Stream") if part is not None else []

        def _stream(stream_type: str):
            """Flux retenu pour ce type : celui marqué `selected`, sinon le premier.

            Le test doit rester `is not None` : un Element sans enfant est falsy, et un
            `or` aurait silencieusement ignoré le flux sélectionné au profit du premier.
            """
            candidates = [stream for stream in part_streams if stream.get("streamType") == stream_type]
            selected = next((stream for stream in candidates if stream.get("selected") == "1"), None)
            if selected is not None:
                return selected
            return candidates[0] if candidates else None

        subtitle_stream = next(
            (stream for stream in part_streams if stream.get("streamType") == "3" and stream.get("selected") == "1"),
            None,
        )
        details = _transcode_details(
            transcode_attrs,
            media_attrs,
            _stream("1"),
            _stream("2"),
            subtitle_stream,
            (media_sheets or {}).get(media.get("ratingKey") or ""),
        )
        stream_details = _stream_details(
            session_attrs,
            player_attrs,
            media_attrs,
            transcode_attrs,
            _stream("1"),
            _stream("2"),
            (media_sheets or {}).get(media.get("ratingKey") or ""),
        )
        session_id = session_attrs.get("id") or transcode_attrs.get("key") or player_attrs.get("machineIdentifier")
        if not session_id:
            seed = "|".join([media.get("ratingKey", ""), user_attrs.get("title", ""), player_attrs.get("title", "")])
            session_id = hashlib.sha1(seed.encode()).hexdigest()
        # Plex ne decrit la decision de lecture qu'a l'endroit ou elle a lieu.
        # `TranscodeSession` n'existe QUE lorsqu'il y a conversion : sur une lecture
        # directe il n'y a rien a lire la, et `Media` ne porte pas toujours les attributs
        # `videoDecision` / `audioDecision`. Se limiter a ces deux sources laissait donc
        # toute lecture directe sans decision, enregistree en « inconnu » -- 84 des 107
        # lectures de cette instance, et pas une seule « lecture directe » en base.
        # On descend donc jusqu'ou Plex ecrit vraiment l'information, comme le fait
        # Tautulli : le flux selectionne de la `Part`, puis la `Part` elle-meme.
        part_decision = part_attrs.get("decision")
        video_stream = _stream("1")
        audio_stream = _stream("2")
        video_decision = (
            transcode_attrs.get("videoDecision")
            or media_attrs.get("videoDecision")
            or (video_stream.get("decision") if video_stream is not None else None)
            or part_decision
        )
        audio_decision = (
            transcode_attrs.get("audioDecision")
            or media_attrs.get("audioDecision")
            or (audio_stream.get("decision") if audio_stream is not None else None)
            or part_decision
        )
        sessions.append(
            {
                "source_session_id": session_id,
                # Identifiant entier Plex (distinct du Session/@id ci-dessus), utilisé
                # pour corréler avec les évènements du websocket Plex, qui n'exposent
                # que ce sessionKey -- voir plex_activity_ws.py.
                "session_key": _int(media.get("sessionKey")),
                "user_name": user_attrs.get("title"),
                "plex_user_id": user_attrs.get("id"),
                "media_type": media.get("type"),
                "title": media.get("title") or "Lecture Plex",
                "grandparent_title": media.get("grandparentTitle"),
                "parent_title": media.get("parentTitle"),
                "season_number": _int(media.get("parentIndex")) if media.get("type") == "episode" else None,
                "episode_number": _int(media.get("index")) if media.get("type") == "episode" else None,
                "year": _int(media.get("year")),
                "rating_key": media.get("ratingKey"),
                "library_section_title": media.get("librarySectionTitle"),
                # Un episode n'a pas d'affiche : son `thumb` est une capture 16:9, que le
                # cadre portrait rognait puis agrandissait. On prend l'affiche de la saison,
                # a defaut celle de la serie.
                "thumb_url": (
                    media.get("parentThumb") or media.get("grandparentThumb") or media.get("thumb")
                    if media.get("type") == "episode"
                    else media.get("thumb") or media.get("grandparentThumb")
                ),
                "player_title": player_attrs.get("title"),
                "platform": player_attrs.get("platform"),
                "product": player_attrs.get("product"),
                "player_address": _masked_ip(player_attrs.get("address"), anonymize_ips),
                "state": player_attrs.get("state") or "playing",
                "video_decision": video_decision,
                "audio_decision": audio_decision,
                "playback_method": _playback_method(video_decision, audio_decision),
                "quality": media_attrs.get("videoResolution") or media.get("videoResolution"),
                "video_codec": media_attrs.get("videoCodec") or media.get("videoCodec"),
                "audio_codec": media_attrs.get("audioCodec") or media.get("audioCodec"),
                "container": media_attrs.get("container") or part_attrs.get("container"),
                "subtitle_decision": (subtitle_stream.get("decision") if subtitle_stream is not None else None),
                "stream_location": session_attrs.get("location"),
                "bandwidth_kbps": _int(session_attrs.get("bandwidth") or transcode_attrs.get("bandwidth")),
                "media_size_bytes": _int(part_attrs.get("size")),
                **_transcode_buffer(transcode_attrs, _int(media.get("viewOffset"), 0)),
                # Clé du transcodeur : c'est le `session=` de la requête de décision dans
                # les journaux de Plex, qui départage deux lectures du même média.
                "transcode_session": (transcode_attrs.get("key") or "").rsplit("/", 1)[-1] or None,
                "transcode_reason": _deduce_transcode_reason(
                    transcode_attrs,
                    video_stream,
                    subtitle_stream,
                    (details["subtitles"] or {}).get("from") if details else None,
                ),
                "transcode_details": json.dumps(details, ensure_ascii=False) if details else None,
                "stream_details": json.dumps(
                    {
                        **stream_details,
                        "tracks": _tracks(
                            transcode_attrs,
                            media_attrs,
                            part_attrs,
                            video_stream,
                            audio_stream,
                            video_decision,
                            audio_decision,
                            (media_sheets or {}).get(media.get("ratingKey") or ""),
                            subtitle_stream,
                        ),
                    },
                    ensure_ascii=False,
                ),
                # Transcodeur en contexte « static » : un téléchargement (synchro hors
                # ligne), pas une lecture. Gardé dans l'historique, mais signalé.
                "is_download": str(transcode_attrs.get("context") or "").lower() == "static",
                # Canaux de la piste réellement écoutée : Plex motive parfois un refus par
                # une *autre* piste du fichier (« 6 > 2 » pour une VO 5.1 non sélectionnée).
                "audio_channels": _int(audio_stream.get("channels")) if audio_stream is not None else None,
                "transcode_hw": _transcode_hw(transcode_attrs),
                "progress_ms": _int(media.get("viewOffset"), 0),
                "duration_ms": _int(media.get("duration")),
                "progress_percent": (
                    round(_int(media.get("viewOffset"), 0) / _int(media.get("duration")) * 100, 1)
                    if _int(media.get("duration"))
                    else None
                ),
            }
        )
    return sessions


def _deduplicate_plex_sessions(snapshots: list[dict]) -> list[dict]:
    """Une seule photographie par identifiant Plex, la plus récente gagnant."""
    return list({item["source_session_id"]: item for item in snapshots}.values())


def _sync_session_segment(
    db,
    row: PlaybackSession,
    new_state: str,
    current_offset_ms: int,
    now: datetime,
    *,
    is_stopped: bool = False,
) -> None:
    """Synchronise les segments de lecture de la session selon l'état et l'offset observés."""
    segments = list(row.segments or [])
    state = "stopped" if is_stopped else (new_state or "playing")

    # Recherche du segment actif non clos
    active_segment = next((s for s in reversed(segments) if s.ended_at is None), None)

    if active_segment is None:
        if not is_stopped:
            new_segment = PlaybackSessionSegment(
                session=row,
                state=state,
                playback_method=row.playback_method,
                started_at=row.started_at or now,
                ended_at=None,
                duration_ms=0,
                view_offset_start_ms=current_offset_ms,
                view_offset_end_ms=current_offset_ms,
            )
            db.add(new_segment)
            if row.segments is not None and new_segment not in row.segments:
                row.segments.append(new_segment)
        elif not segments:
            # Session arrêtée immédiatement sans segment existant
            start = row.started_at or now
            dur = max(0, int((now - start).total_seconds() * 1000))
            single_segment = PlaybackSessionSegment(
                session=row,
                state="playing",
                playback_method=row.playback_method,
                started_at=start,
                ended_at=now,
                duration_ms=dur,
                view_offset_start_ms=row.initial_progress_ms or 0,
                view_offset_end_ms=current_offset_ms,
            )
            db.add(single_segment)
            if row.segments is not None:
                row.segments.append(single_segment)
    else:
        elapsed_real_ms = max(0, int((now - active_segment.started_at).total_seconds() * 1000))
        if active_segment.state == "playing":
            expected_offset = active_segment.view_offset_start_ms + elapsed_real_ms
        else:
            expected_offset = active_segment.view_offset_start_ms

        state_changed = active_segment.state != state
        method_changed = bool(
            row.playback_method
            and active_segment.playback_method
            and active_segment.playback_method != row.playback_method
        )
        # Détection d'un saut de timeline (> 10s d'écart entre offset attendu et offset réel en lecture)
        is_seek = bool(
            active_segment.state == "playing"
            and state == "playing"
            and abs(current_offset_ms - expected_offset) > 10000
        )

        if is_stopped or state_changed or method_changed or is_seek:
            # Clôture du segment actif
            active_segment.ended_at = now
            active_segment.duration_ms = elapsed_real_ms
            if active_segment.state == "paused":
                active_segment.view_offset_end_ms = active_segment.view_offset_start_ms
            elif is_seek:
                active_segment.view_offset_end_ms = expected_offset
            else:
                active_segment.view_offset_end_ms = current_offset_ms

            # Si la session continue, on démarre un nouveau segment
            if not is_stopped:
                new_segment = PlaybackSessionSegment(
                    session=row,
                    state=state,
                    playback_method=row.playback_method,
                    started_at=now,
                    ended_at=None,
                    duration_ms=0,
                    view_offset_start_ms=current_offset_ms,
                    view_offset_end_ms=current_offset_ms,
                )
                db.add(new_segment)
                if row.segments is not None and new_segment not in row.segments:
                    row.segments.append(new_segment)
        else:
            # Segment en cours continu : mise à jour
            active_segment.duration_ms = elapsed_real_ms
            active_segment.view_offset_end_ms = current_offset_ms

    # Recalcul de watched_ms basé sur la somme des segments 'playing'
    playing_ms = sum(s.duration_ms for s in (row.segments or []) if s.state == "playing")
    fallback_progress = max(0, int(row.progress_ms or 0) - int(row.initial_progress_ms or 0))
    row.watched_ms = max(row.watched_ms or 0, playing_ms, fallback_progress)


async def _stop_session_atomic(
    db,
    row: PlaybackSession,
    *,
    stopped_at: datetime,
    force_stopped: bool = False,
) -> bool:
    """Cloture une session une seule fois, meme si polling et websocket se croisent."""
    if row.started_at and stopped_at < row.started_at:
        stopped_at = row.started_at
    result = await db.execute(
        update(PlaybackSession)
        .where(
            PlaybackSession.id == row.id,
            PlaybackSession.ended_at.is_(None),
        )
        .values(
            ended_at=stopped_at,
            state="stopped",
            force_stopped=force_stopped,
        )
        .execution_options(synchronize_session="fetch")
    )
    was_updated = bool(result.rowcount)
    if was_updated:
        set_committed_value(row, "ended_at", stopped_at)
        set_committed_value(row, "state", "stopped")
        set_committed_value(row, "force_stopped", force_stopped)
        _sync_session_segment(db, row, "stopped", row.progress_ms or 0, stopped_at, is_stopped=True)
    return was_updated


async def _sweep_stale_sessions(db, now: datetime) -> int:
    """Force l'arret des sessions Plex absentes depuis plus de cinq minutes.

    ``last_seen_at`` est persiste : contrairement au compteur de polls rates, ce filet
    de securite survit aux redemarrages du worker et aux evenements ``stopped`` perdus.
    """
    cutoff = now - _STALE_SESSION_TIMEOUT
    oldest_active = now - _MAX_ACTIVE_SESSION_AGE
    stale_rows = (
        (
            await db.execute(
                select(PlaybackSession)
                .options(selectinload(PlaybackSession.segments))
                .filter(
                    PlaybackSession.source == "plex",
                    PlaybackSession.ended_at.is_(None),
                    or_(
                        PlaybackSession.last_seen_at <= cutoff,
                        and_(
                            PlaybackSession.started_at <= oldest_active,
                            or_(PlaybackSession.media_type.is_(None), PlaybackSession.media_type != "live"),
                        ),
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    affected_days: set[date] = set()
    stopped = 0
    for row in stale_rows:
        stopped_at = row.last_seen_at or row.started_at or now
        if await _stop_session_atomic(
            db,
            row,
            stopped_at=stopped_at,
            force_stopped=True,
        ):
            stopped += 1
            _miss_counts.pop(row.id, None)
            if row.started_at:
                affected_days.add(row.started_at.date())
    if stopped:
        await db.commit()
        await _rebuild_daily_aggregates(db, affected_days)
        logger.info("Sessions Plex abandonnees cloturees automatiquement: %d", stopped)
        await publish(
            "activity.updated",
            {"source": "stale-sweep", "stopped": stopped},
            admin_only=True,
        )
    return stopped


async def _resume_group(db, snapshot: dict, now: datetime) -> tuple[int | None, int, int]:
    """Relie une reprise recente sans fusionner ses dates avec la session precedente."""
    rating_key = str(snapshot.get("rating_key") or "").strip()
    if not rating_key:
        return None, 1, 0
    filters = [
        PlaybackSession.source == "plex",
        PlaybackSession.ended_at.is_not(None),
        PlaybackSession.rating_key == rating_key,
    ]
    plex_user_id = str(snapshot.get("plex_user_id") or "").strip()
    if plex_user_id:
        filters.append(PlaybackSession.plex_user_id == plex_user_id)
    else:
        filters.append(PlaybackSession.user_name == snapshot.get("user_name"))
    previous = (
        (await db.execute(select(PlaybackSession).filter(*filters).order_by(PlaybackSession.ended_at.desc()).limit(1)))
        .scalars()
        .first()
    )
    if previous is None:
        return None, 1, 0
    current_progress = int(snapshot.get("progress_ms") or 0)
    previous_progress = previous.progress_ms or previous.watched_ms or 0
    if current_progress < previous_progress:
        return None, 1, 0
    # Meme hors de la fenetre de regroupement, une lecture qui repart du meme offset
    # commence a compter son temps a partir de cet offset et non depuis zero.
    baseline = current_progress
    legacy_overlong_session = bool(
        previous.force_stopped and previous.started_at and previous.started_at < now - _MAX_ACTIVE_SESSION_AGE
    )
    if previous.watched_status == 1 or previous.ended_at < now - _RESUME_WINDOW or legacy_overlong_session:
        return None, 1, baseline
    return (
        previous.reference_id or previous.id,
        max(2, (previous.group_count or 1) + 1),
        baseline,
    )


async def _collect_plex_activity_unlocked() -> dict:
    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        if not settings or not settings.live_activity_enabled or not settings.plex_url or not settings.plex_token:
            return {"status": "disabled", "active": 0}
        now = now_utc_naive()
        await _sweep_stale_sessions(db, now)
        headers = {"X-Plex-Token": settings.plex_token, "Accept": "application/xml"}
        async with httpx.AsyncClient(timeout=10, verify=settings.plex_verify_ssl) as client:
            response = await client.get(f"{settings.plex_url.rstrip('/')}/status/sessions", headers=headers)
            response.raise_for_status()
        snapshots = parse_plex_sessions(response.text, anonymize_ips=settings.activity_anonymize_ips)
        # Une conversion (même un simple changement de conteneur) ne se lit qu'en sortie dans
        # /status/sessions : la fiche du média donne la source (conteneur, sous-titres,
        # HDR, débit). En cache par média : une lecture Plex par œuvre, pas par collecte.
        converted = {s["rating_key"] for s in snapshots if s.get("rating_key")}
        if converted:
            try:
                sheets = {
                    rating_key: await media_sheet(
                        settings.plex_url, settings.plex_token, settings.plex_verify_ssl, rating_key
                    )
                    for rating_key in converted
                }
                snapshots = parse_plex_sessions(
                    response.text, anonymize_ips=settings.activity_anonymize_ips, media_sheets=sheets
                )
            except Exception as exc:  # la déduction reste valable, seulement moins précise
                logger.debug("Fiche média Plex illisible : %s", exc)
        # Plex peut exposer deux nœuds pour une même lecture (notamment pendant une
        # transition de lecteur/transcodage). Sans déduplication, la boucle ajoutait
        # deux objets ORM portant la même clé unique avant le premier flush.
        snapshots = _deduplicate_plex_sessions(snapshots)
        locations = await lookup_ip_locations(
            {snapshot.get("player_address") for snapshot in snapshots},
            db=db,
            anonymized=settings.activity_anonymize_ips,
        )
        for snapshot in snapshots:
            address = str(snapshot.get("player_address") or "").strip()
            snapshot.update(
                locations.get(address) or await lookup_ip_location(None, anonymized=settings.activity_anonymize_ips)
            )
        rows = (
            (
                await db.execute(
                    select(PlaybackSession)
                    .options(selectinload(PlaybackSession.segments))
                    .filter(
                        PlaybackSession.source == "plex",
                        PlaybackSession.ended_at.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        existing = {row.source_session_id: row for row in rows}
        # Repli de corrélation : le Session/@id ou TranscodeSession/@key qui compose
        # source_session_id peut changer en cours de lecture (relance de transcodage,
        # changement de bitrate). session_key + rating_key identifient la même lecture
        # de façon plus stable et permettent d'"adopter" la ligne existante au lieu de
        # la fragmenter en plusieurs sessions.
        existing_by_key = {
            (row.session_key, row.rating_key): row
            for row in rows
            if row.session_key is not None and row.rating_key is not None
        }
        previously_active = [row for row in rows if row.ended_at is None]
        started_rows: list[PlaybackSession] = []
        for snapshot in snapshots:
            row = existing.get(snapshot["source_session_id"])
            if row is None and snapshot.get("session_key") is not None and snapshot.get("rating_key"):
                row = existing_by_key.get((snapshot["session_key"], snapshot["rating_key"]))
            if row is None:
                reference_id, group_count, initial_progress_ms = await _resume_group(db, snapshot, now)
                row = PlaybackSession(
                    source="plex",
                    started_at=now,
                    last_seen_at=now,
                    title=snapshot["title"],
                    source_session_id=snapshot["source_session_id"],
                    reference_id=reference_id,
                    group_count=group_count,
                    initial_progress_ms=initial_progress_ms,
                )
                db.add(row)
                started_rows.append(row)
                existing[row.source_session_id] = row
            # Le lieu appartient à la session historique : une résolution plus récente
            # de la même IP ne doit jamais réécrire ville/région/pays/coordonnées. Un
            # FAI/organisation/ASN encore manquant peut en revanche être complété.
            _protect_resolved_location(row, snapshot)
            for key, value in snapshot.items():
                # La raison du transcodage appartient à l'historique de la lecture : un
                # passage ultérieur en lecture directe ne doit pas l'effacer.
                if value is None and key in _STICKY_TRANSCODE_FIELDS:
                    continue
                setattr(row, key, value)
            row.last_seen_at = now
            row.ended_at = None
            _sync_session_segment(
                db,
                row,
                snapshot.get("state") or "playing",
                int(snapshot.get("progress_ms") or 0),
                now,
            )
            row.watched_status = 1 if (row.progress_percent or 0) >= 85 else 0
        for row in previously_active:
            if row.last_seen_at == now:
                # Mise à jour ce cycle (correspondance directe ou adoptée via
                # session_key+rating_key) : plus manquante, on oublie ses ratés passés.
                _miss_counts.pop(row.id, None)
                continue
            misses = _miss_counts.get(row.id, 0) + 1
            if misses < _MISS_THRESHOLD:
                _miss_counts[row.id] = misses
                continue
            _miss_counts.pop(row.id, None)
            await _stop_session_atomic(db, row, stopped_at=now)
        if settings.activity_retention_days:
            cutoff = now - timedelta(days=settings.activity_retention_days)
            await db.execute(delete(PlaybackSession).where(PlaybackSession.ended_at < cutoff))
        await db.commit()
        affected_days = {row.started_at.date() for row in [*rows, *started_rows] if row.started_at}
        await _rebuild_daily_aggregates(db, affected_days)
        if settings.activity_retention_days:
            await db.execute(delete(PlaybackDailyAggregate).where(PlaybackDailyAggregate.day < cutoff.date()))
            await db.commit()
        started = [_serialize(row) for row in started_rows]
    await publish(
        "activity.updated",
        {"active": len(snapshots), "started": started},
        admin_only=True,
    )
    return {"status": "complete", "active": len(snapshots)}


async def collect_plex_activity() -> dict:
    """Collecte sérialisée entre le worker ARQ et le rafraîchissement HTTP manuel."""
    async with _plex_collection_lock:
        token = await acquire_distributed_lock(_PLEX_COLLECTION_LOCK_KEY, ttl=30)
        if token is None:
            return {"status": "skipped", "reason": "already_running"}
        try:
            result = await _collect_plex_activity_unlocked()
        finally:
            await release_distributed_lock(_PLEX_COLLECTION_LOCK_KEY, token)
    try:
        await enrich_decisions_from_plex_logs()
    except Exception as exc:  # un journal illisible ne doit jamais casser la collecte
        logger.warning("Lecture des décisions Plex impossible : %s", exc)
    return result


_STREAMS_CACHE: dict[str, dict] = {}
_STREAMS_CACHE_SIZE = 256


async def media_sheet(base_url: str, token: str, verify: bool, rating_key: str) -> dict:
    """Conteneur et pistes audio / sous-titres d'origine d'un média (fiche Plex), en cache.

    Pendant une conversion, /status/sessions décrit la *sortie* (conteneur, codecs) : la
    source se lit ici. Le fichier ne change pas en cours de lecture : une lecture par
    média suffit, alors que la collecte tourne toutes les quelques secondes.
    """
    if rating_key in _STREAMS_CACHE:
        return _STREAMS_CACHE[rating_key]
    async with httpx.AsyncClient(timeout=10, verify=verify) as client:
        response = await client.get(
            f"{base_url.rstrip('/')}/library/metadata/{rating_key}",
            headers={"X-Plex-Token": token, "Accept": "application/xml"},
        )
        response.raise_for_status()
    root = ElementTree.fromstring(response.text)
    media = root.find(".//Media")
    part = media.find("Part") if media is not None else None
    item = next((node for node in root if node.tag in {"Video", "Track", "Photo"}), None)
    meta = item.attrib if item is not None else {}
    sheet = {
        "meta": {
            "summary": meta.get("summary"),
            "art": meta.get("grandparentArt") or meta.get("art"),
            "guid": meta.get("grandparentGuid") or meta.get("guid"),
            "season": _int(meta.get("parentIndex")),
            "episode": _int(meta.get("index")),
            "poster": (meta.get("parentThumb") or meta.get("grandparentThumb"))
            if meta.get("type") == "episode"
            else meta.get("thumb"),
        },
        "container": (part.get("container") if part is not None else None)
        or (media.get("container") if media is not None else None),
        "bitrate": _int(media.get("bitrate")) if media is not None else None,
        "streams": [
            dict(stream.attrib) for stream in root.iter("Stream") if stream.get("streamType") in {"1", "2", "3"}
        ],
    }
    if len(_STREAMS_CACHE) >= _STREAMS_CACHE_SIZE:
        _STREAMS_CACHE.pop(next(iter(_STREAMS_CACHE)))
    _STREAMS_CACHE[rating_key] = sheet
    return sheet


async def media_streams(base_url: str, token: str, verify: bool, rating_key: str) -> list[dict]:
    """Pistes audio et sous-titres d'origine d'un média."""
    return (await media_sheet(base_url, token, verify, rating_key))["streams"]


_CHANNEL_LIMIT = re.compile(r"audio\.channels limitation applies: (\d+) > (\d+)")
_CHANNEL_LABELS = {1: "mono", 2: "stéréo", 6: "5.1", 8: "7.1"}


def _channels(value) -> str:
    count = _int(value)
    return _CHANNEL_LABELS.get(count, f"{count} canaux") if count else "?"


def _decision_note(text: str, listened_channels: int | None, streams: list[dict]) -> str | None:
    """Précise la raison de Plex quand elle porte sur une piste que personne n'écoute.

    Plex n'autorise la lecture directe que si l'appareil lit le fichier *entier* : une VO
    5.1 non sélectionnée suffit à la refuser à un Chromecast stéréo, alors que la piste
    écoutée, elle, est compatible. Sans ce contexte, « 6 > 2 » passe pour une erreur.
    """
    match = _CHANNEL_LIMIT.search(text or "")
    if not match or listened_channels is None:
        return None
    limit = int(match.group(2))
    if listened_channels > limit:
        return None
    culprits = [
        f"{stream.get('language') or stream.get('title') or 'piste'}"
        f" ({_codec(stream.get('codec'))} {_channels(stream.get('channels'))})"
        for stream in streams
        if stream.get("streamType") == "2" and (_int(stream.get("channels")) or 0) > limit
    ]
    if not culprits:
        return None
    return (
        f"Porte sur des pistes non écoutées : {', '.join(culprits)}. "
        f"La piste écoutée est en {_channels(listened_channels)}, compatible : "
        "c'est la présence de ces pistes dans le fichier qui empêche la lecture directe."
    )


# Les journaux de débogage tournent en quelques heures : au-delà, rien à y retrouver.
_DECISION_LOOKBACK = timedelta(hours=12)
# Le zip des journaux pèse plusieurs Mo : une lecture par minute au plus, et une toutes
# les cinq minutes quand le débogage est coupé, le temps que quelqu'un le rallume.
_DECISION_RETRY = timedelta(minutes=1)
_DECISION_RETRY_DISABLED = timedelta(minutes=5)
_decision_next_attempt: datetime | None = None


async def enrich_decisions_from_plex_logs(*, force: bool = False) -> dict:
    """Rattache aux lectures transcodées la décision que Plex a écrite dans ses journaux.

    Vaut pour les lectures en cours comme pour celles terminées depuis peu, tant que
    leurs lignes sont encore dans les journaux. Sans journaux de débogage, rien n'est
    téléchargé : la raison déduite reste la seule affichée.
    """
    global _decision_next_attempt
    now = now_utc_naive()
    if not force and _decision_next_attempt and now < _decision_next_attempt:
        return {"status": "throttled"}
    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        if not settings or not settings.plex_url or not settings.plex_token:
            return {"status": "disabled"}
        candidates = (
            (
                await db.execute(
                    select(PlaybackSession).filter(
                        PlaybackSession.source == "plex",
                        PlaybackSession.started_at >= now - _DECISION_LOOKBACK,
                        PlaybackSession.plex_decision_text.is_(None),
                        # La conversion légère aussi : Plex y consigne sa décision de la
                        # même façon, et c'est elle qui dit pourquoi le fichier n'a pas
                        # pu partir tel quel.
                        or_(
                            PlaybackSession.transcode_reason.is_not(None),
                            PlaybackSession.playback_method.in_(("transcode", "direct_stream")),
                        ),
                    )
                )
            )
            .scalars()
            .all()
        )
        if not candidates:
            return {"status": "nothing_to_match"}
        _decision_next_attempt = now + _DECISION_RETRY
        decisions, oldest = await plex_decision_logs.fetch_decisions(
            settings.plex_url, settings.plex_token, settings.plex_verify_ssl
        )
        if oldest is None:
            _decision_next_attempt = now + _DECISION_RETRY_DISABLED
            return {"status": "debug_logs_disabled"}
        matched = 0
        for row in candidates:
            decision = plex_decision_logs.match_decision(
                decisions,
                rating_key=row.rating_key,
                started_at=row.started_at,
                ended_at=row.ended_at,
                session_ids={row.transcode_session} if row.transcode_session else set(),
            )
            code, text = decision.reason if decision else (None, None)
            if not text:
                continue
            note = None
            if _CHANNEL_LIMIT.search(text) and row.rating_key:
                try:
                    streams = await media_streams(
                        settings.plex_url, settings.plex_token, settings.plex_verify_ssl, row.rating_key
                    )
                    note = _decision_note(text, row.audio_channels, streams)
                except Exception as exc:
                    logger.debug("Fiche média Plex illisible : %s", exc)
            row.plex_decision_code = code
            row.plex_decision_text = text
            row.plex_decision_details = decision.details_json(note=note)
            matched += 1
        if matched:
            await db.commit()
    if matched:
        await publish("activity.updated", {"decisions": matched}, admin_only=True)
    return {"status": "complete", "matched": matched, "decisions": len(decisions)}


async def handle_websocket_state(
    session_key: int,
    rating_key: str | None,
    state: str,
    view_offset_ms: int | None = None,
) -> dict:
    """Traite un évènement d'état poussé par le websocket Plex (plex_activity_ws.py).

    Signal faisant autorité : un "stopped" ferme la session immédiatement, sans
    attendre qu'elle disparaisse du polling. Une session inconnue (jamais vue par le
    polling) est ignorée ici -- c'est à l'appelant de déclencher un `collect_plex_activity`
    pour l'enrichir avec les métadonnées complètes (codec, bande passante...) absentes
    du message websocket.
    """
    now = now_utc_naive()
    async with AsyncSessionLocal() as db:
        await _sweep_stale_sessions(db, now)
        row = (
            (
                await db.execute(
                    select(PlaybackSession)
                    .options(selectinload(PlaybackSession.segments))
                    .filter(
                        PlaybackSession.source == "plex",
                        PlaybackSession.ended_at.is_(None),
                        PlaybackSession.session_key == session_key,
                    )
                )
            )
            .scalars()
            .first()
        )
        if row is None and rating_key:
            row = (
                (
                    await db.execute(
                        select(PlaybackSession)
                        .options(selectinload(PlaybackSession.segments))
                        .filter(
                            PlaybackSession.source == "plex",
                            PlaybackSession.ended_at.is_(None),
                            PlaybackSession.rating_key == rating_key,
                        )
                    )
                )
                .scalars()
                .first()
            )
        if row is None:
            return {"status": "unknown"}
        if state == "stopped":
            if not await _stop_session_atomic(db, row, stopped_at=now):
                return {"status": "already_stopped"}
            _miss_counts.pop(row.id, None)
        else:
            row.last_seen_at = now
            row.state = state
            if view_offset_ms is not None:
                row.progress_ms = view_offset_ms
                if row.duration_ms:
                    row.progress_percent = round(view_offset_ms / row.duration_ms * 100, 1)
            _sync_session_segment(db, row, state, row.progress_ms or 0, now)
        await db.commit()
        if row.started_at:
            await _rebuild_daily_aggregates(db, {row.started_at.date()})
    await publish(
        "activity.updated",
        {"source": "websocket", "state": state, "session_key": session_key},
        admin_only=True,
    )
    return {"status": "handled", "state": state}


async def test_tautulli(url: str, api_key: str) -> tuple[bool, str]:
    if not url or not api_key:
        return False, "URL et clé API Tautulli requises."
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{url.rstrip('/')}/api/v2",
                params={"apikey": api_key, "cmd": "get_server_info"},
            )
            response.raise_for_status()
            payload = response.json().get("response", {})
            if payload.get("result") != "success":
                return False, payload.get("message") or "Réponse Tautulli invalide."
        return True, "Connexion Tautulli réussie."
    except Exception as exc:
        logger.warning("Test Tautulli impossible: %s", exc)
        return False, f"Connexion Tautulli impossible: {exc}"


async def _tautulli_locations(rows: list[dict], *, db, anonymized: bool) -> dict[str, dict]:
    """Resout une seule fois chaque IP distincte d'un lot Tautulli.

    Un historique de 10 000 lectures contient generalement peu d'adresses distinctes.
    La deduplication et la limite de concurrence evitent toutefois de lancer des milliers
    d'appels simultanes lors d'un gros import.
    """
    addresses = {str(item.get("ip_address") or "").strip() for item in rows}
    addresses.discard("")
    return await lookup_ip_locations(addresses, db=db, anonymized=anonymized)


async def import_tautulli_history(*, length: int = 1000) -> dict:
    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        if not settings or not settings.tautulli_url or not settings.tautulli_api_key:
            raise ValueError("Tautulli n'est pas configuré.")
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                f"{settings.tautulli_url.rstrip('/')}/api/v2",
                params={
                    "apikey": settings.tautulli_api_key,
                    "cmd": "get_history",
                    "length": min(max(length, 1), 10000),
                    "order_column": "date",
                    "order_dir": "desc",
                    "grouping": 0,
                },
            )
            response.raise_for_status()
            payload = response.json().get("response", {})
        if payload.get("result") != "success":
            raise ValueError(payload.get("message") or "Import Tautulli refusé.")
        rows = payload.get("data", {}).get("data") or []
        locations = await _tautulli_locations(
            rows,
            db=db,
            anonymized=settings.activity_anonymize_ips,
        )
        imported = 0
        updated = 0
        imported_days: set[date] = set()
        existing_rows = (
            (await db.execute(select(PlaybackSession).filter(PlaybackSession.source == "tautulli"))).scalars().all()
        )
        existing_by_reference = {row.source_session_id: row for row in existing_rows}
        for item in rows:
            reference = _tautulli_row_id(item)
            if not reference:
                continue
            raw_address = str(item.get("ip_address") or "").strip()
            location = locations.get(raw_address) or await lookup_ip_location(
                None,
                anonymized=settings.activity_anonymize_ips,
            )
            session_values = _tautulli_session_values(item, settings, location)
            session = existing_by_reference.get(reference)
            if session is not None:
                _protect_resolved_location(session, session_values)
            if session is None:
                session = PlaybackSession(
                    source="tautulli",
                    source_session_id=reference,
                    **session_values,
                )
                db.add(session)
                seg = PlaybackSessionSegment(
                    session=session,
                    state="playing",
                    playback_method=session_values.get("playback_method"),
                    started_at=session_values["started_at"],
                    ended_at=session_values["ended_at"],
                    duration_ms=session_values.get("watched_ms") or 0,
                    view_offset_start_ms=0,
                    view_offset_end_ms=session_values.get("progress_ms") or session_values.get("watched_ms") or 0,
                )
                db.add(seg)
                existing_by_reference[reference] = session
                imported += 1
                imported_days.add(session_values["started_at"].date())
            elif any(getattr(session, key) != value for key, value in session_values.items()):
                for key, value in session_values.items():
                    setattr(session, key, value)
                updated += 1
                imported_days.add(session_values["started_at"].date())
        await db.commit()
        await _rebuild_daily_aggregates(db, imported_days)
    await publish(
        "activity.updated",
        {"imported": imported, "updated": updated, "source": "tautulli"},
        admin_only=True,
    )
    return {"imported": imported, "updated": updated, "received": len(rows)}


async def normalize_tautulli_history(*, length: int = 10000) -> dict:
    """Récupère à nouveau l'historique Tautulli et répare les lignes déjà importées."""
    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        if not settings or not settings.tautulli_url or not settings.tautulli_api_key:
            raise ValueError("Tautulli n'est pas configuré.")
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(
                f"{settings.tautulli_url.rstrip('/')}/api/v2",
                params={
                    "apikey": settings.tautulli_api_key,
                    "cmd": "get_history",
                    "length": min(max(length, 1), 10000),
                    "order_column": "date",
                    "order_dir": "desc",
                    "grouping": 0,
                },
            )
            response.raise_for_status()
            payload = response.json().get("response", {})
        if payload.get("result") != "success":
            raise ValueError(payload.get("message") or "Normalisation Tautulli refusée.")

        rows = payload.get("data", {}).get("data") or []
        locations = await _tautulli_locations(
            rows,
            db=db,
            anonymized=settings.activity_anonymize_ips,
        )
        references = {_tautulli_row_id(item): item for item in rows}
        references.pop("", None)
        existing = (
            (
                await db.execute(
                    select(PlaybackSession).filter(
                        PlaybackSession.source == "tautulli",
                        PlaybackSession.source_session_id.in_(references),
                    )
                )
            )
            .scalars()
            .all()
            if references
            else []
        )
        changed = 0
        changed_days: set[date] = set()
        for session in existing:
            item = references[session.source_session_id]
            values = _tautulli_values(item)
            updates = {
                **values,
                "quality": item.get("quality_profile") or item.get("video_resolution") or session.quality,
                "video_codec": item.get("video_codec") or session.video_codec,
                "audio_codec": item.get("audio_codec") or session.audio_codec,
                "container": item.get("container") or session.container,
                "subtitle_decision": item.get("subtitle_decision") or session.subtitle_decision,
                "bandwidth_kbps": _int(item.get("bandwidth")) or session.bandwidth_kbps,
            }
            raw_address = str(item.get("ip_address") or "").strip()
            if raw_address:
                updates["player_address"] = _masked_ip(
                    raw_address,
                    settings.activity_anonymize_ips,
                )
                if _has_resolved_location(session):
                    # Ville/région/pays/coordonnées déjà valides : ne compléter que le
                    # FAI/l'organisation/l'ASN s'ils manquent encore.
                    location = locations[raw_address]
                    updates.update(
                        {
                            field: location.get(field)
                            for field in _GEO_NETWORK_FIELDS
                            if getattr(session, field) is None and location.get(field)
                        }
                    )
                else:
                    updates.update(locations[raw_address])
            if any(getattr(session, key) != value for key, value in updates.items()):
                for key, value in updates.items():
                    setattr(session, key, value)
                if session.started_at:
                    changed_days.add(session.started_at.date())
                changed += 1
        await db.commit()
        await _rebuild_daily_aggregates(db, changed_days)
    await publish("activity.updated", {"normalized": changed, "source": "tautulli"}, admin_only=True)
    return {
        "normalized": changed,
        "matched": len(existing),
        "received": len(rows),
        "unmatched": max(0, len(references) - len(existing)),
    }


async def recalculate_playback_locations() -> dict:
    """Complète les localisations manquantes et les informations réseau (FAI,
    organisation, ASN) encore absentes, sans jamais réécrire une ville, une région,
    un pays ou des coordonnées déjà valides. Le résultat par adresse est partagé par
    toutes les sessions qui la partagent (propagation automatique)."""
    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        rows = (
            (await db.execute(select(PlaybackSession).filter(PlaybackSession.player_address.is_not(None))))
            .scalars()
            .all()
        )
        addresses = {str(row.player_address).strip() for row in rows if str(row.player_address or "").strip()}
        seeds: dict[str, dict] = {}
        for row in rows:
            address = str(row.player_address or "").strip()
            if address and row.geo_status in {"resolved", "local"}:
                seeds.setdefault(address, _row_location(row))

        anonymized = bool(settings and settings.activity_anonymize_ips)
        locations = await lookup_ip_locations(
            addresses,
            db=db,
            anonymized=anonymized,
            seed_locations=seeds,
        )
        located = 0
        network_enriched = 0
        preserved = 0
        unresolved = 0
        for row in rows:
            location = locations.get(str(row.player_address or "").strip())
            had_location = _has_resolved_location(row)
            if not location or location.get("geo_status") not in {"resolved", "local", "anonymized"}:
                unresolved += 1
                continue
            if not had_location:
                for field in _GEO_FIELDS:
                    setattr(row, field, location.get(field))
                located += 1
                continue
            gained_network = False
            for field in _GEO_NETWORK_FIELDS:
                if getattr(row, field) is None and location.get(field):
                    setattr(row, field, location.get(field))
                    gained_network = True
            if gained_network:
                network_enriched += 1
            else:
                preserved += 1
        await db.commit()

    await publish(
        "activity.updated",
        {"locations_added": located, "network_enriched": network_enriched, "source": "geoip"},
        admin_only=True,
    )
    return {
        "sessions": len(rows),
        "addresses": len(addresses),
        "locations_added": located,
        "network_enriched": network_enriched,
        "preserved": preserved,
        "unresolved": unresolved,
        "anonymized": anonymized,
        # Compteur cumulé conservé pour compatibilité avec les libellés existants.
        "updated": located + network_enriched,
    }


def _as_date(value) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


async def _rebuild_daily_aggregates(db, days: set[date]) -> None:
    """Reconstruit uniquement les jours affectés par une collecte ou un import."""
    if not days:
        return
    # Toutes les voies d'ecriture PostgreSQL partagent un verrou transactionnel par
    # jour. Deux reconstructions ne peuvent plus entrelacer leur DELETE puis INSERT.
    for day in sorted(days):
        lock_key = f"watchdeck:playback-daily:{day.isoformat()}"
        await db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(lock_key, 0))))
    await db.execute(delete(PlaybackDailyAggregate).where(PlaybackDailyAggregate.day.in_(days)))
    rows = (await db.execute(_daily_aggregate_query(days))).all()
    db.add_all(
        [
            PlaybackDailyAggregate(
                day=_as_date(row[0]),
                user_name=row[1],
                media_type=row[2],
                media_label=row[3],
                playback_method=row[4],
                sessions=int(row[5] or 0),
                watch_ms=int(row[6] or 0),
                transcodes=int(row[7] or 0),
            )
            for row in rows
        ]
    )
    await db.commit()


def _daily_aggregate_query(days: set[date]):
    """Construit l'agrégation avec les mêmes expressions dans SELECT et GROUP BY.

    PostgreSQL compare aussi les paramètres liés des expressions de regroupement. Si
    chaque ``coalesce`` est recréé dans ``group_by()``, SQLAlchemy génère deux séries de
    paramètres (par exemple ``$1`` et ``$9``) et PostgreSQL refuse la requête, même si
    leurs valeurs sont identiques.
    """
    day_expr = func.date(PlaybackSession.started_at)
    user_expr = func.coalesce(PlaybackSession.user_name, "")
    media_type_expr = func.coalesce(PlaybackSession.media_type, "")
    media_label_expr = func.coalesce(PlaybackSession.grandparent_title, PlaybackSession.title, "")
    playback_method_expr = func.coalesce(PlaybackSession.playback_method, "unknown")
    dimensions = (
        day_expr,
        user_expr,
        media_type_expr,
        media_label_expr,
        playback_method_expr,
    )
    return (
        select(
            *dimensions,
            func.count(PlaybackSession.id),
            func.coalesce(func.sum(PlaybackSession.watched_ms), 0),
            func.sum(case((PlaybackSession.playback_method == "transcode", 1), else_=0)),
        )
        .filter(day_expr.in_(days))
        .group_by(*dimensions)
    )


async def _ensure_daily_aggregates(db, start_day: date, end_day: date) -> None:
    """Remet a niveau les jours dont l'agregat ne correspond plus aux sessions.

    La version precedente sortait des qu'un seul agregat existait dans la fenetre. Le
    premier calcul figeait donc la courbe et les totaux : toute lecture arrivee ensuite
    par une voie qui ne reconstruit pas son jour (mise a jour de progression par le
    websocket, import Tautulli, cloture tardive) restait invisible dans les « lectures
    quotidiennes » alors que les analyses, elles, sont calculees en direct sur les
    sessions. Les deux moities de la meme page se contredisaient, et l'ecart se voyait
    surtout une fois la page restreinte a un spectateur.

    On compare donc jour par jour ce que disent les sessions et ce que disent les
    agregats, et on ne reconstruit que ce qui a derive. Sur un historique stable, aucune
    ecriture n'a lieu ; le cache de `activity_statistics` limite par ailleurs cette
    comparaison a une fois par minute et par perimetre.
    """
    window_start = datetime.combine(start_day, datetime_time.min)
    window_end = datetime.combine(end_day + timedelta(days=1), datetime_time.min)
    day_expr = func.date(PlaybackSession.started_at)

    session_rows = (
        await db.execute(
            select(
                day_expr,
                func.count(PlaybackSession.id),
                func.coalesce(func.sum(PlaybackSession.watched_ms), 0),
                func.sum(case((PlaybackSession.playback_method == "transcode", 1), else_=0)),
            )
            .filter(PlaybackSession.started_at >= window_start, PlaybackSession.started_at < window_end)
            .group_by(day_expr)
        )
    ).all()
    aggregate_rows = (
        await db.execute(
            select(
                PlaybackDailyAggregate.day,
                func.coalesce(func.sum(PlaybackDailyAggregate.sessions), 0),
                func.coalesce(func.sum(PlaybackDailyAggregate.watch_ms), 0),
                func.coalesce(func.sum(PlaybackDailyAggregate.transcodes), 0),
            )
            .filter(PlaybackDailyAggregate.day >= start_day, PlaybackDailyAggregate.day <= end_day)
            .group_by(PlaybackDailyAggregate.day)
        )
    ).all()

    def _totals(rows) -> dict[date, tuple[int, int, int]]:
        return {
            _as_date(row[0]): (int(row[1] or 0), int(row[2] or 0), int(row[3] or 0))
            for row in rows
            if row[0] is not None
        }

    from_sessions = _totals(session_rows)
    from_aggregates = _totals(aggregate_rows)
    # Les jours presents d'un cote seulement comptent aussi : un jour purge de ses
    # sessions doit voir son agregat disparaitre, sans quoi le total resterait gonfle.
    stale = {
        day
        for day in set(from_sessions) | set(from_aggregates)
        if from_sessions.get(day, (0, 0, 0)) != from_aggregates.get(day, (0, 0, 0))
    }
    await _rebuild_daily_aggregates(db, stale)


async def _aggregate_overview(db, cutoff: datetime, previous_cutoff: datetime, user: str | None = None) -> dict:
    start_day, cutoff_day = previous_cutoff.date(), cutoff.date()
    end_day = now_utc_naive().date()
    await _ensure_daily_aggregates(db, start_day, end_day)
    # Restreindre a un utilisateur porte sur les memes agregats journaliers : les totaux,
    # la courbe et la periode precedente restent donc exacts, la ou un filtrage cote
    # client n'aurait pu corriger que les listes.
    scope = (PlaybackDailyAggregate.user_name == user,) if user else ()
    current_filter = (
        PlaybackDailyAggregate.day >= cutoff_day,
        PlaybackDailyAggregate.day <= end_day,
        *scope,
    )
    user_count = (
        await db.execute(
            select(func.count(func.distinct(PlaybackDailyAggregate.user_name))).filter(
                *current_filter, PlaybackDailyAggregate.user_name != ""
            )
        )
    ).scalar() or 0
    # Les totaux sessions/watch/transcodes doivent inclure les lectures dont le nom
    # utilisateur est absent ; seul COUNT(DISTINCT user_name) ignore la chaîne vide.
    global_totals = (
        await db.execute(
            select(
                func.coalesce(func.sum(PlaybackDailyAggregate.sessions), 0),
                func.coalesce(func.sum(PlaybackDailyAggregate.watch_ms), 0),
                func.coalesce(func.sum(PlaybackDailyAggregate.transcodes), 0),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                PlaybackDailyAggregate.playback_method == "direct_stream",
                                PlaybackDailyAggregate.sessions,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ),
            ).filter(*current_filter)
        )
    ).one()
    daily_rows = (
        await db.execute(
            select(
                PlaybackDailyAggregate.day,
                func.sum(PlaybackDailyAggregate.sessions),
                func.sum(PlaybackDailyAggregate.watch_ms),
            )
            .filter(*current_filter)
            .group_by(PlaybackDailyAggregate.day)
            .order_by(PlaybackDailyAggregate.day)
        )
    ).all()
    user_rows = (
        await db.execute(
            select(
                PlaybackDailyAggregate.user_name,
                func.sum(PlaybackDailyAggregate.sessions),
                func.sum(PlaybackDailyAggregate.watch_ms),
            )
            .filter(*current_filter, PlaybackDailyAggregate.user_name != "")
            .group_by(PlaybackDailyAggregate.user_name)
            .order_by(func.sum(PlaybackDailyAggregate.watch_ms).desc())
            .limit(10)
        )
    ).all()
    previous = (
        await db.execute(
            select(
                func.coalesce(func.sum(PlaybackDailyAggregate.sessions), 0),
                func.coalesce(func.sum(PlaybackDailyAggregate.watch_ms), 0),
            ).filter(
                PlaybackDailyAggregate.day >= start_day,
                PlaybackDailyAggregate.day < cutoff_day,
                *scope,
            )
        )
    ).one()
    total = int(global_totals[0] or 0)
    watch_ms = int(global_totals[1] or 0)
    transcodes = int(global_totals[2] or 0)
    direct_streams = int(global_totals[3] or 0)
    return {
        "summary": {
            "sessions": total,
            "watch_ms": watch_ms,
            "users": int(user_count),
            "transcodes": transcodes,
            "transcode_rate": round(transcodes / total * 100, 1) if total else 0,
            "direct_streams": direct_streams,
            "direct_stream_rate": round(direct_streams / total * 100, 1) if total else 0,
        },
        "daily": [
            {"date": row[0].isoformat(), "sessions": int(row[1] or 0), "watch_ms": int(row[2] or 0)}
            for row in daily_rows
        ],
        "users": [{"name": row[0], "sessions": int(row[1] or 0), "watch_ms": int(row[2] or 0)} for row in user_rows],
        "comparison": {
            "sessions": int(previous[0] or 0),
            "watch_ms": int(previous[1] or 0),
        },
    }


async def activity_snapshot(days: int = 30, db=None, user: str | None = None) -> dict:
    """Historique, agregats et analyses de la periode.

    `user` restreint tout le calcul a un seul spectateur -- cartes, courbe, medias,
    qualite et comparaison avec la periode precedente comprises. Sans lui, rien ne
    change : c'est la vue de tout le monde.
    """
    days = min(max(days, 1), MAX_PERIOD_DAYS)
    cutoff = datetime.combine((now_utc_naive() - timedelta(days=days)).date(), datetime_time.min)
    previous_cutoff = cutoff - timedelta(days=days)
    if db is None:
        async with AsyncSessionLocal() as owned_db:
            return await activity_snapshot(days, db=owned_db, user=user)
    session_scope = (PlaybackSession.user_name == user,) if user else ()
    active = (
        (
            await db.execute(
                select(PlaybackSession)
                .options(selectinload(PlaybackSession.segments))
                .filter(PlaybackSession.ended_at.is_(None), *session_scope)
                .order_by(PlaybackSession.started_at.desc())
            )
        )
        .scalars()
        .all()
    )
    history = (
        (
            await db.execute(
                select(PlaybackSession)
                .options(selectinload(PlaybackSession.segments))
                .filter(PlaybackSession.started_at >= cutoff, *session_scope)
                .order_by(PlaybackSession.started_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    analytics_rows = (
        (
            await db.execute(
                select(PlaybackSession)
                .options(
                    load_only(
                        PlaybackSession.id,
                        PlaybackSession.source,
                        PlaybackSession.user_name,
                        PlaybackSession.media_type,
                        PlaybackSession.title,
                        PlaybackSession.grandparent_title,
                        PlaybackSession.rating_key,
                        PlaybackSession.thumb_url,
                        PlaybackSession.player_title,
                        PlaybackSession.platform,
                        PlaybackSession.product,
                        PlaybackSession.playback_method,
                        PlaybackSession.video_decision,
                        PlaybackSession.audio_decision,
                        PlaybackSession.quality,
                        PlaybackSession.video_codec,
                        PlaybackSession.container,
                        PlaybackSession.subtitle_decision,
                        PlaybackSession.plex_decision_text,
                        # Conteneur source -> sortie, pour le suivi des conversions légères.
                        PlaybackSession.transcode_details,
                        PlaybackSession.bandwidth_kbps,
                        PlaybackSession.media_size_bytes,
                        PlaybackSession.progress_ms,
                        PlaybackSession.duration_ms,
                        PlaybackSession.progress_percent,
                        PlaybackSession.watched_status,
                        PlaybackSession.group_count,
                        PlaybackSession.watched_ms,
                        PlaybackSession.started_at,
                        PlaybackSession.last_seen_at,
                        PlaybackSession.ended_at,
                    )
                )
                .filter(PlaybackSession.started_at >= cutoff, *session_scope)
                .order_by(PlaybackSession.started_at)
            )
        )
        .scalars()
        .all()
    )
    previous_rows = (
        (
            await db.execute(
                select(PlaybackSession)
                .options(
                    load_only(
                        PlaybackSession.id,
                        PlaybackSession.user_name,
                        PlaybackSession.watched_ms,
                    )
                )
                .filter(
                    PlaybackSession.started_at >= previous_cutoff,
                    PlaybackSession.started_at < cutoff,
                    *session_scope,
                )
            )
        )
        .scalars()
        .all()
    )
    overview = await _aggregate_overview(db, cutoff, previous_cutoff, user)
    analytics = _analytics(list(analytics_rows), list(previous_rows))
    previous = overview.pop("comparison")
    current = overview["summary"]
    analytics["comparison"] = {
        "sessions_change": _percent(current["sessions"] - previous["sessions"], previous["sessions"])
        if previous["sessions"]
        else (100 if current["sessions"] else 0),
        "watch_change": _percent(current["watch_ms"] - previous["watch_ms"], previous["watch_ms"])
        if previous["watch_ms"]
        else (100 if current["watch_ms"] else 0),
    }
    return {
        "active": [_serialize(row) for row in active],
        "history": [_serialize(row) for row in history],
        **overview,
        "analytics": analytics,
    }


def _device_expression():
    """Libellé d'appareil tel que l'interface l'affiche : lecteur, sinon produit, sinon plateforme."""
    return func.coalesce(
        func.nullif(PlaybackSession.player_title, ""),
        func.nullif(PlaybackSession.product, ""),
        func.nullif(PlaybackSession.platform, ""),
    )


#: Tris de l'historique, appliqués en base. Le tri vivait côté navigateur et ne portait
#: donc que sur la page chargée : « Anciennes » réordonnait les cent lectures les plus
#: récentes entre elles — c'est-à-dire ne changeait rien de visible — et « Durée »
#: donnait la plus longue des cent dernières, pas de la période.
#: Chaque colonne de l'historique se trie, dans les deux sens (`<colonne>_<asc|desc>`) ;
#: les anciennes valeurs restent comprises.
HISTORY_SORT_ALIASES = {"recent": "date_desc", "oldest": "date_asc", "longest": "duration_desc"}
HISTORY_SORT_COLUMNS = ("title", "user", "device", "method", "date", "duration")


def _history_order(sort: str, device_expression):
    """Clause ORDER BY d'un tri d'historique ; la date, puis l'identifiant, departagent."""
    sort = HISTORY_SORT_ALIASES.get(sort, sort)
    column, _, direction = sort.rpartition("_")
    if column not in HISTORY_SORT_COLUMNS or direction not in ("asc", "desc"):
        column, direction = "date", "desc"
    keys = {
        # Un episode se range sous sa serie : trier par titre regroupe la serie.
        "title": func.lower(func.coalesce(func.nullif(PlaybackSession.grandparent_title, ""), PlaybackSession.title)),
        "user": func.lower(PlaybackSession.user_name),
        "device": func.lower(device_expression),
        "method": PlaybackSession.playback_method,
        "date": PlaybackSession.started_at,
        "duration": PlaybackSession.watched_ms,
    }
    key = keys[column]
    primary = key.asc().nulls_last() if direction == "asc" else key.desc().nulls_last()
    if column == "date":
        tie = PlaybackSession.id.asc() if direction == "asc" else PlaybackSession.id.desc()
        return (primary, tie)
    return (primary, PlaybackSession.started_at.desc(), PlaybackSession.id.desc())


async def activity_history(
    days: int = 30,
    db=None,
    user: str | None = None,
    method: str | None = None,
    media_type: str | None = None,
    device: str | None = None,
    query: str | None = None,
    offset: int = 0,
    limit: int = 100,
    sort: str = "recent",
) -> dict:
    """Historique filtré, trié et paginé, avec les valeurs disponibles pour chaque filtre.

    Le filtrage vit ici et non dans le navigateur : l'instantané d'activité ne porte que
    les cent dernières lectures toutes personnes confondues, et affiner cette page-là
    donnait « les lectures d'Untel parmi les cent dernières » au lieu de ses cent
    dernières -- un résultat faux que le compteur affiché ne trahissait pas.
    """
    if db is None:
        async with AsyncSessionLocal() as owned_db:
            return await activity_history(
                days,
                db=owned_db,
                user=user,
                method=method,
                media_type=media_type,
                device=device,
                query=query,
                offset=offset,
                limit=limit,
                sort=sort,
            )
    days = min(max(days, 1), MAX_PERIOD_DAYS)
    cutoff = datetime.combine((now_utc_naive() - timedelta(days=days)).date(), datetime_time.min)
    device_expression = _device_expression()

    # Une lecture en cours n'appartient pas encore a l'historique : elle vit dans « En
    # direct », ou elle se met a jour a chaque sondage. Elle apparaissait pourtant en tete
    # de l'historique, et le tiroir ouvert sur cette ligne se reecrivait tout seul avec la
    # lecture du moment -- on croyait consulter une trace, on regardait un direct.
    filters = [PlaybackSession.started_at >= cutoff, PlaybackSession.ended_at.is_not(None)]
    if user:
        filters.append(PlaybackSession.user_name == user)
    if method:
        filters.append(PlaybackSession.playback_method == method)
    if media_type:
        filters.append(PlaybackSession.media_type == media_type)
    if device:
        filters.append(device_expression == device)
    if query and query.strip():
        needle = f"%{query.strip()}%"
        filters.append(
            or_(
                PlaybackSession.title.ilike(needle),
                PlaybackSession.grandparent_title.ilike(needle),
                PlaybackSession.user_name.ilike(needle),
                PlaybackSession.player_title.ilike(needle),
                PlaybackSession.product.ilike(needle),
                PlaybackSession.platform.ilike(needle),
                PlaybackSession.player_address.ilike(needle),
                PlaybackSession.geo_city.ilike(needle),
                PlaybackSession.geo_country.ilike(needle),
            )
        )

    total = (await db.execute(select(func.count(PlaybackSession.id)).filter(*filters))).scalar() or 0
    rows = (
        (
            await db.execute(
                select(PlaybackSession)
                .options(selectinload(PlaybackSession.segments))
                .filter(*filters)
                .order_by(*_history_order(sort, device_expression))
                .offset(max(offset, 0))
                .limit(min(max(limit, 1), 500))
            )
        )
        .scalars()
        .all()
    )

    # Les listes de choix portent sur la période, pas sur la sélection courante : sinon
    # choisir un utilisateur faisait disparaître tous les autres du menu.
    period_filter = (PlaybackSession.started_at >= cutoff, PlaybackSession.ended_at.is_not(None))
    users = (
        (
            await db.execute(
                select(PlaybackSession.user_name)
                .filter(*period_filter, PlaybackSession.user_name.is_not(None), PlaybackSession.user_name != "")
                .distinct()
                .order_by(PlaybackSession.user_name)
            )
        )
        .scalars()
        .all()
    )
    devices = (
        (
            await db.execute(
                select(device_expression)
                .filter(*period_filter, device_expression.is_not(None))
                .distinct()
                .order_by(device_expression)
            )
        )
        .scalars()
        .all()
    )
    return {
        "items": [_serialize(row) for row in rows],
        "total": int(total),
        "offset": max(offset, 0),
        "limit": limit,
        "has_more": max(offset, 0) + len(rows) < int(total),
        "facets": {"users": [value for value in users if value], "devices": [value for value in devices if value]},
    }


async def playback_session_detail(session_id: int, db) -> dict | None:
    """Une session, en cours ou terminee : ce qu'affiche sa fiche, a partir de son adresse."""
    row = (
        (
            await db.execute(
                select(PlaybackSession)
                .options(selectinload(PlaybackSession.segments))
                .filter(PlaybackSession.id == session_id)
            )
        )
        .scalars()
        .first()
    )
    if not row:
        return None
    return {**_serialize(row), "media": await _session_media(row, db)}


async def _session_media(row: PlaybackSession, db) -> dict | None:
    """Bannière, résumé et fiche bibliothèque de l'œuvre lue, depuis la fiche Plex.

    Facultatif : Plex injoignable ou média supprimé, la fiche de la session s'affiche
    sans, plutôt que d'échouer.
    """
    if not row.rating_key:
        return None
    settings = (await db.execute(select(Settings))).scalars().first()
    if not settings or not settings.plex_url or not settings.plex_token:
        return None
    try:
        sheet = await media_sheet(settings.plex_url, settings.plex_token, settings.plex_verify_ssl, row.rating_key)
    except Exception as exc:
        logger.debug("Fiche média Plex illisible : %s", exc)
        return None
    meta = sheet.get("meta") or {}
    library_id = None
    if meta.get("guid"):
        library_id = (
            await db.execute(select(LibraryItem.id).filter(LibraryItem.plex_guid == meta["guid"]).limit(1))
        ).scalar()
    art = meta.get("art")
    poster = meta.get("poster")
    return {
        "poster_url": f"/api/playback/thumb?path={quote(poster, safe='')}" if poster else None,
        "summary": meta.get("summary"),
        "art_url": f"/api/playback/thumb?path={quote(art, safe='')}" if art else None,
        "season": meta.get("season"),
        "episode": meta.get("episode"),
        "library_item_id": library_id,
    }


async def live_activity_snapshot(db=None) -> dict:
    """Retourne uniquement les sessions actives, pour le polling fréquent."""
    if db is None:
        async with AsyncSessionLocal() as owned_db:
            return await live_activity_snapshot(db=owned_db)
    settings = (await db.execute(select(Settings))).scalars().first()
    active = (
        (
            await db.execute(
                select(PlaybackSession)
                .options(selectinload(PlaybackSession.segments))
                .filter(PlaybackSession.ended_at.is_(None))
                .order_by(PlaybackSession.started_at.desc())
            )
        )
        .scalars()
        .all()
    )
    configured = bool(settings and settings.plex_url and settings.plex_token)
    return {
        "active": [_serialize(row) for row in active],
        "enabled": bool(settings and settings.live_activity_enabled and configured),
        "configured": configured,
    }


async def activity_statistics(days: int = 30, db=None, refresh: bool = False, user: str | None = None) -> dict:
    """Retourne l'historique et les agrégats, mis en cache séparément du direct.

    `user` entre dans la clé de cache : une vue restreinte à un spectateur ne doit ni
    lire ni écraser l'entrée globale. Le nombre d'entrées reste borné par le nombre de
    spectateurs actifs multiplié par les quatre périodes de l'interface, et chacune
    expire au bout de dix minutes.
    """
    days = min(max(days, 1), MAX_PERIOD_DAYS)
    user = (user or "").strip() or None
    cache_key = f"watchdeck:playback:statistics:{days}" + (f":user:{user}" if user else "")

    async def _compute(session):
        snapshot = await activity_snapshot(days, db=session, user=user)
        snapshot.pop("active", None)
        return snapshot

    if refresh:
        if db is None:
            async with AsyncSessionLocal() as owned_db:
                snapshot = await _compute(owned_db)
        else:
            snapshot = await _compute(db)
        await cache.set_json(cache_key, {"value": snapshot, "cached_at": time.time()}, ttl_seconds=600)
        return snapshot

    async def _background():
        async with AsyncSessionLocal() as fresh_db:
            return await _compute(fresh_db)

    if db is None:
        async with AsyncSessionLocal() as owned_db:
            return await cache.get_or_refresh(cache_key, 60, 600, lambda: _compute(owned_db), _background)
    return await cache.get_or_refresh(cache_key, 60, 600, lambda: _compute(db), _background)


class PlaybackActionError(Exception):
    """Action impossible sur une lecture : le message est destiné à l'utilisateur."""


async def terminate_playback(session_id: int, reason: str, db) -> None:
    """Arrête une lecture en cours, avec un message affiché sur le lecteur.

    Plex attend l'identifiant de `Session`, pas celui de la ligne en base : il est
    relu dans le détail de flux, à défaut dans l'identifiant de source.
    """
    row = (await db.execute(select(PlaybackSession).filter(PlaybackSession.id == session_id))).scalars().first()
    if row is None:
        raise PlaybackActionError("Lecture introuvable.")
    if row.ended_at is not None:
        raise PlaybackActionError("Cette lecture est déjà terminée.")
    settings = (await db.execute(select(Settings))).scalars().first()
    if not settings or not settings.plex_url or not settings.plex_token:
        raise PlaybackActionError("Plex n'est pas configuré.")
    plex_session_id = (_json_or_none(row.stream_details) or {}).get("plex_session_id") or row.source_session_id
    async with httpx.AsyncClient(timeout=10, verify=settings.plex_verify_ssl) as client:
        response = await client.post(
            f"{settings.plex_url.rstrip('/')}/status/sessions/terminate",
            params={"sessionId": plex_session_id, "reason": reason.strip() or "Lecture arrêtée par l'administrateur."},
            headers={"X-Plex-Token": settings.plex_token},
        )
    if response.status_code in {401, 403}:
        raise PlaybackActionError("Plex refuse l'arrêt : il faut un compte administrateur avec Plex Pass.")
    if response.status_code == 404:
        raise PlaybackActionError("Plex ne connaît plus cette lecture : elle vient sans doute de s'arrêter.")
    response.raise_for_status()


async def plex_server_activities(db) -> list[dict]:
    """Tâches en cours sur le serveur Plex : miniatures, analyse, scan de bibliothèque…"""
    settings = (await db.execute(select(Settings))).scalars().first()
    if not settings or not settings.plex_url or not settings.plex_token:
        return []
    async with httpx.AsyncClient(timeout=10, verify=settings.plex_verify_ssl) as client:
        response = await client.get(
            f"{settings.plex_url.rstrip('/')}/activities",
            headers={"X-Plex-Token": settings.plex_token, "Accept": "application/json"},
        )
        response.raise_for_status()
    activities = []
    for activity in response.json().get("MediaContainer", {}).get("Activity", []) or []:
        progress = _float(activity.get("progress"))
        activities.append(
            {
                "uuid": activity.get("uuid"),
                "type": activity.get("type"),
                "title": activity.get("title"),
                "subtitle": activity.get("subtitle"),
                # -1 : progression indéterminée (Plex ne sait pas combien il reste).
                "progress": progress if progress is not None and progress >= 0 else None,
                "cancellable": bool(activity.get("cancellable")),
            }
        )
    return activities


async def cancel_plex_activity(uuid: str, db) -> None:
    settings = (await db.execute(select(Settings))).scalars().first()
    if not settings or not settings.plex_url or not settings.plex_token:
        raise PlaybackActionError("Plex n'est pas configuré.")
    async with httpx.AsyncClient(timeout=10, verify=settings.plex_verify_ssl) as client:
        response = await client.delete(
            f"{settings.plex_url.rstrip('/')}/activities/{quote(uuid, safe='')}",
            headers={"X-Plex-Token": settings.plex_token},
        )
    if response.status_code == 404:
        raise PlaybackActionError("Cette tâche est déjà terminée.")
    response.raise_for_status()
