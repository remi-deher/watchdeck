import json as _json
from datetime import datetime, timezone
from typing import Any, Optional

from .models import LibraryItem, MediaRequest, PlexUser


def format_datetime(dt: Optional[datetime]) -> Optional[str]:
    """Force timezone info to UTC for serialization, resolving timezone offset issues in client-side JS."""
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc).isoformat()
    return dt.isoformat()


def request_status_value(status: Any) -> str:
    return status.value if hasattr(status, "value") else str(status)


def serialize_media_request(req: MediaRequest, users: dict[str, str]) -> dict:
    from .services.operational_projection import request_operational_projection

    # Deduplique par plex_user_id : quelques lignes historiques ont le demandeur
    # principal redondant dans extra_requesters (donnee corrompue anterieure a la
    # garde de _add_co_requester), ce qui produisait des requester_ids en double —
    # cassant le :key du v-for cote frontend (MediaDetailDrawer.vue) et empechant le
    # rendu de la fiche detail pour ces demandes.
    seen_ids: set[str] = {req.plex_user_id}
    requester_ids = [req.plex_user_id]
    extras = []
    try:
        for extra in _json.loads(req.extra_requesters or "[]"):
            uid = extra.get("plex_user_id")
            if uid and uid not in seen_ids:
                seen_ids.add(uid)
                extra["display_name"] = users.get(uid, extra.get("display_name") or uid)
                extras.append(extra)
                requester_ids.append(uid)
    except Exception:
        extras = []
    requesters = [users.get(uid, uid) for uid in requester_ids]
    return {
        "id": req.id,
        "title": req.title,
        "year": req.year,
        "media_type": req.media_type,
        "status": request_status_value(req.status),
        "fulfillment_status": request_status_value(req.fulfillment_status),
        "fulfillment_updated_at": format_datetime(req.fulfillment_updated_at),
        "fulfillment_error": req.fulfillment_error,
        "source": req.source,
        "plex_user_id": req.plex_user_id,
        "plex_user": users.get(req.plex_user_id, req.plex_user or req.plex_user_id),
        "requester_ids": requester_ids,
        "requesters": requesters,
        "requested_by": ", ".join(requesters),
        "extra_requesters": _json.dumps(extras),
        "tmdb_id": req.tmdb_id,
        "request_id": req.id,
        "library_id": req.library_item_id,
        "in_library": req.library_item_id is not None,
        "available": req.library_item_id is not None
        or request_status_value(req.status) in ("available", "partially_available"),
        "requested": True,
        "request_status": request_status_value(req.status),
        "poster_url": (
            f"/api/image-proxy/request/{req.id}?width=500&quality=82&format=webp" if req.poster_url else None
        ),
        "arr_processed_at": format_datetime(req.arr_processed_at),
        "available_at": format_datetime(req.available_at),
        "request_mail_sent": req.request_mail_sent,
        "available_mail_sent": req.available_mail_sent,
        "overview": req.overview,
        "has_vf": req.has_vf,
        "vf_tracking_disabled": req.vf_tracking_disabled,
        "arr_id": req.arr_id,
        "arr_slug": req.arr_slug,
        "arr_instance_id": req.arr_instance_id,
        "library_item_id": req.library_item_id,
        "is_downloading": bool(req.is_downloading),
        "episodes_available_count": req.episodes_available_count,
        "episodes_aired_count": req.episodes_aired_count,
        "episodes_total_count": req.episodes_total_count,
        "torrent_name": req.torrent_name,
        "torrent_content_path": req.torrent_content_path,
        "torrent_completed_at": format_datetime(req.torrent_completed_at),
        "torrent_import_verified_at": format_datetime(req.torrent_import_verified_at),
        **request_operational_projection(req),
    }


def serialize_library_item(item: LibraryItem) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "year": item.year,
        "media_type": item.media_type,
        "has_vf": item.has_vf,
        "arr_id": item.arr_id,
        "arr_instance_id": item.arr_instance_id,
        "arr_slug": item.arr_slug,
    }


def serialize_plex_user(user: PlexUser, stats: dict) -> dict:
    data = {c.name: getattr(user, c.name) for c in user.__table__.columns}
    data.pop("password_hash", None)
    data.pop("totp_secret", None)
    data["has_local_password"] = bool(user.password_hash)
    data["last_requested_at"] = format_datetime(stats.pop("last_requested_at", None))
    data["stats"] = stats
    return data


def serialize_media_summary(
    item: LibraryItem | MediaRequest | dict,
    *,
    library_id: Optional[int] = None,
    request_id: Optional[int] = None,
    in_library: Optional[bool] = None,
    available: Optional[bool] = None,
    requested: Optional[bool] = None,
    request_status: Optional[str] = None,
    is_downloading: Optional[bool] = None,
    requester_count: Optional[int] = None,
    poster_width: int = 500,
    poster_quality: int = 82,
) -> dict:
    """Sérialise un résumé média standardisé pour les sections de découverte et listes compactes."""
    if isinstance(item, LibraryItem):
        return {
            "tmdb_id": item.tmdb_id,
            "media_type": item.media_type,
            "title": item.title,
            "year": item.year,
            "overview": item.overview or "",
            "poster_url": (
                f"/api/image-proxy/library/{item.id}?width={poster_width}&quality={poster_quality}&format=webp"
                if item.poster_url
                else None
            ),
            "library_id": item.id if library_id is None else library_id,
            "in_library": True if in_library is None else in_library,
            "available": True if available is None else available,
            "requested": False if requested is None else requested,
            "request_id": request_id,
        }
    if isinstance(item, MediaRequest):
        status = request_status_value(item.status) if request_status is None else request_status
        req_in_lib = (item.library_item_id is not None) if in_library is None else in_library
        req_avail = (
            (item.library_item_id is not None or status in ("available", "partially_available"))
            if available is None
            else available
        )
        summary = {
            "tmdb_id": item.tmdb_id,
            "media_type": item.media_type,
            "title": item.title,
            "year": item.year,
            "overview": item.overview or "",
            "poster_url": (
                f"/api/image-proxy/request/{item.id}?width={poster_width}&quality={poster_quality}&format=webp"
                if item.poster_url
                else None
            ),
            "library_id": item.library_item_id if library_id is None else library_id,
            "request_id": item.id if request_id is None else request_id,
            "in_library": req_in_lib,
            "available": req_avail,
            "requested": True if requested is None else requested,
            "request_status": status,
            "is_downloading": bool(item.is_downloading) if is_downloading is None else is_downloading,
        }
        if requester_count is not None:
            summary["requester_count"] = requester_count
        return summary
    if isinstance(item, dict):
        summary = {
            "tmdb_id": item.get("tmdb_id"),
            "media_type": item.get("media_type"),
            "title": item.get("title"),
            "year": item.get("year"),
            "overview": item.get("overview") or "",
            "poster_url": item.get("poster_url"),
            "library_id": item.get("library_id") if library_id is None else library_id,
            "request_id": item.get("request_id") if request_id is None else request_id,
            "in_library": item.get("in_library", False) if in_library is None else in_library,
            "available": item.get("available", False) if available is None else available,
            "requested": item.get("requested", False) if requested is None else requested,
        }
        if "request_status" in item or request_status is not None:
            summary["request_status"] = request_status if request_status is not None else item.get("request_status")
        if "is_downloading" in item or is_downloading is not None:
            summary["is_downloading"] = (
                is_downloading if is_downloading is not None else item.get("is_downloading", False)
            )
        if requester_count is not None or "requester_count" in item:
            summary["requester_count"] = requester_count if requester_count is not None else item.get("requester_count")
        return summary
    raise TypeError(f"Type non supporté pour serialize_media_summary: {type(item)}")
