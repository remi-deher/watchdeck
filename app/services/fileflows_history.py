"""Historique des traitements FileFlows : enregistrement et statistiques.

Chaque fichier nouvellement traité ou en échec (repéré par la tâche `fileflows-monitor`)
donne une ligne `FileflowsProcessing` : durées par étape, type de traitement, tailles, et
résumés avant/après. L'« après » vient de la ligne `WATCHDECK_RESULT` que le flow V3 écrit
dans son journal ; à défaut, seul l'« avant » est connu (métadonnées d'origine de FileFlows).
"""

import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models import FileflowsProcessing
from ..utils import now_utc_naive
from . import fileflows

logger = logging.getLogger(__name__)

RESULT_MARKER = "WATCHDECK_RESULT "


def parse_result(log_text: str) -> Optional[dict[str, Any]]:
    """Dernière ligne `WATCHDECK_RESULT {...}` du journal, ou None."""
    position = log_text.rfind(RESULT_MARKER)
    if position < 0:
        return None
    payload = log_text[position + len(RESULT_MARKER) :].split("\n", 1)[0].strip()
    try:
        data = json.loads(payload)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def summary_from_metadata(meta: Optional[dict[str, Any]], size: Optional[int]) -> Optional[dict[str, Any]]:
    """Résumé « avant » à partir des métadonnées d'origine que garde FileFlows
    (`Audio 2 Codec`, `Subtitle 3 Title`…)."""
    if not isinstance(meta, dict) or not meta:
        return None

    def numbered(prefix: str) -> list[dict[str, Any]]:
        items = []
        for n in range(1, 64):
            key = prefix if n == 1 else f"{prefix} {n}"
            if f"{key} Codec" not in meta:
                break
            items.append(
                {
                    field.lower(): meta.get(f"{key} {field}")
                    for field in ("Codec", "Channels", "Language", "Title", "Bitrate", "Forced", "Default")
                    if f"{key} {field}" in meta
                }
            )
        return items

    resolution = str(meta.get("Video Resolution") or "")
    width, _, height = resolution.partition("x")
    return {
        "duration": fileflows._seconds(meta.get("Duration")) or None,
        "size": size,
        "video": {
            "codec": meta.get("Video Codec"),
            "width": int(width) if width.isdigit() else None,
            "height": int(height) if height.isdigit() else None,
            "pix_fmt": meta.get("Video PixelFormat"),
        }
        if meta.get("Video Codec")
        else None,
        "audio": numbered("Audio"),
        "subtitles": numbered("Subtitle"),
        "attachments": None,
    }


def _datetime(value: Any) -> Optional[datetime]:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.year < 2000:
        return None
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


async def record(
    db: AsyncSession,
    url: str,
    api_key: Optional[str],
    uid: str,
    index: dict[str, dict[str, Any]],
    *,
    with_log: bool = True,
) -> Optional[FileflowsProcessing]:
    """Enregistre le dernier passage d'un fichier (sans doublon) ; None si rien à faire."""
    detail = await fileflows.file_detail(url, api_key, uid)
    status = detail.get("Status")
    if status not in (fileflows.STATUS_PROCESSED, fileflows.STATUS_FAILED):
        return None
    ended = _datetime(detail.get("ProcessingEnded"))
    if ended is None:
        return None
    exists = (
        await db.execute(
            select(FileflowsProcessing.id).filter(
                FileflowsProcessing.file_uid == uid, FileflowsProcessing.ended_at == ended
            )
        )
    ).first()
    if exists:
        return None
    timing = fileflows.timing_from_detail(detail)
    result = None
    if with_log:
        try:
            result = parse_result(await fileflows.file_log(url, api_key, uid))
        except (fileflows.FileFlowsError, ValueError):
            result = None
    original_size = int(detail.get("OriginalSize") or 0) or None
    relative = detail.get("RelativePath") or detail.get("Name") or ""
    media = fileflows.match_media(index, relative)
    row = FileflowsProcessing(
        file_uid=uid,
        status="processed" if status == fileflows.STATUS_PROCESSED else "failed",
        kind=(result or {}).get("kind") or timing.get("kind"),
        path=relative,
        library=detail.get("LibraryName") or None,
        disk=(detail.get("Name") or "").strip("/").split("/", 1)[0] or None,
        flow=detail.get("FlowName") or None,
        library_item_id=media["id"] if media else None,
        started_at=_datetime(detail.get("ProcessingStarted")),
        ended_at=ended,
        total_seconds=timing["total_seconds"],
        wait_seconds=timing["wait_seconds"],
        processing_seconds=timing["processing_seconds"],
        original_size=original_size,
        final_size=int(detail.get("FinalSize") or 0) or None,
        failure_reason=fileflows.scrub(detail.get("FailureReason") or "") or None,
        before=(result or {}).get("before") or summary_from_metadata(detail.get("OriginalMetadata"), original_size),
        after=(result or {}).get("after"),
        steps=timing["steps"],
        created_at=now_utc_naive(),
    )
    db.add(row)
    await db.commit()
    return row


async def record_many(url: str, api_key: Optional[str], uids: list[str], *, with_log: bool = True) -> int:
    """Enregistre plusieurs passages, chacun dans sa session ; un échec n'arrête pas les autres."""
    from ..database import AsyncSessionLocal

    saved = 0
    async with AsyncSessionLocal() as db:
        index = await fileflows.folder_index(db)
    for uid in uids:
        async with AsyncSessionLocal() as db:
            try:
                if await record(db, url, api_key, uid, index, with_log=with_log):
                    saved += 1
            except Exception as exc:  # noqa: BLE001 -- l'historique ne doit jamais bloquer le suivi
                await db.rollback()
                logger.info("Historique FileFlows : passage %s non enregistré (%s)", uid, exc)
    return saved


# --------------------------------------------------------------------------- statistiques


async def statistics(db: AsyncSession, days: int = 30, offset: int = 0) -> dict[str, Any]:
    """Bilan des `days` jours qui se terminent `offset` jours avant maintenant : `offset`
    egal a `days` donne la periode precedente, pour la comparaison."""
    until = now_utc_naive() - timedelta(days=offset)
    since = until - timedelta(days=days)
    rows = (
        (
            await db.execute(
                select(FileflowsProcessing).filter(
                    FileflowsProcessing.ended_at >= since, FileflowsProcessing.ended_at < until
                )
            )
        )
        .scalars()
        .all()
    )
    per_day: dict[str, dict[str, int]] = defaultdict(lambda: {"processed": 0, "failed": 0})
    kinds: dict[str, int] = defaultdict(int)
    disks: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "seconds": 0.0, "wait": 0.0})
    steps: dict[str, dict[str, float]] = defaultdict(lambda: {"count": 0, "seconds": 0.0})
    saved_bytes = 0
    for row in rows:
        per_day[row.ended_at.date().isoformat()][row.status] += 1
        if row.status != "processed":
            continue
        kinds[row.kind or "unknown"] += 1
        disk = disks[row.disk or "?"]
        disk["count"] += 1
        disk["seconds"] += row.processing_seconds or 0
        disk["wait"] += row.wait_seconds or 0
        if row.original_size and row.final_size and row.kind in ("rewrite", "encode", "in_place"):
            saved_bytes += row.original_size - row.final_size
        for step in row.steps or []:
            name = step.get("name") or ""
            if name.startswith(("Startup", "Fichier", "0. Verrou")):
                continue
            steps[name]["count"] += 1
            steps[name]["seconds"] += float(step.get("seconds") or 0)
    processed = [r for r in rows if r.status == "processed"]
    return {
        "days": days,
        "processed": len(processed),
        "failed": sum(1 for r in rows if r.status == "failed"),
        "saved_bytes": saved_bytes,
        "average_seconds": round(sum(r.processing_seconds or 0 for r in processed) / len(processed), 1)
        if processed
        else None,
        "per_day": [{"day": day, **counts} for day, counts in sorted(per_day.items())],
        "kinds": dict(kinds),
        "disks": [
            {
                "disk": name,
                "count": d["count"],
                "average_seconds": round(d["seconds"] / d["count"], 1),
                "average_wait_seconds": round(d["wait"] / d["count"], 1),
            }
            for name, d in sorted(disks.items())
        ],
        "steps": sorted(
            (
                {"name": name, "count": int(s["count"]), "average_seconds": round(s["seconds"] / s["count"], 1)}
                for name, s in steps.items()
                if s["count"]
            ),
            key=lambda s: -s["average_seconds"],
        ),
    }


async def recent(db: AsyncSession, limit: int = 50) -> list[dict[str, Any]]:
    rows = (
        (await db.execute(select(FileflowsProcessing).order_by(FileflowsProcessing.ended_at.desc()).limit(limit)))
        .scalars()
        .all()
    )
    return [
        {
            "id": r.id,
            "file_uid": r.file_uid,
            "status": r.status,
            "kind": r.kind,
            "path": r.path,
            "library": r.library,
            "disk": r.disk,
            "flow": r.flow,
            "library_item_id": r.library_item_id,
            "ended_at": r.ended_at.replace(tzinfo=timezone.utc).isoformat(),
            "processing_seconds": r.processing_seconds,
            "wait_seconds": r.wait_seconds,
            "original_size": r.original_size,
            "final_size": r.final_size,
            "failure_reason": r.failure_reason,
            "before": r.before,
            "after": r.after,
        }
        for r in rows
    ]
