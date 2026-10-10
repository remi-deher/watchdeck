"""Projection observée des travaux : une étape achevée n'est pas un travail terminé."""

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WorkProgress(BaseModel):
    model_config = ConfigDict(extra="forbid")
    percent: float | None = Field(ge=0, le=100)
    scope: Literal["step", "download", "copy"]
    label: str


class WorkRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    source: Literal["encoding", "download", "transfer"]
    state: Literal["running", "waiting", "paused", "blocked", "completed", "cancelled", "unknown"]
    label: str
    stage: str | None
    progress: WorkProgress
    reason: str | None
    stale: bool


class WorkRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    work: WorkRef


class DownloadClientErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: int
    client_name: str
    client_error: str


class EncodingStatusResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    configured: bool
    runners: list[WorkRecord] = []
    recent_failed: list[WorkRecord] = []
    recent_processed: list[WorkRecord] = []


class EncodingFilesResponse(BaseModel):
    files: list[WorkRecord]
    page: int
    has_more: bool


class EncodingDiskResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    disk: str
    running: list[WorkRecord]


class EncodingOverviewResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    disks: list[EncodingDiskResponse]


def percent(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return max(0, min(100, number)) if math.isfinite(number) else None


def _ref(key, source, state, stage, value, scope, reason=None, stale=False):
    labels = {
        "running": "En cours",
        "waiting": "En attente",
        "paused": "En pause",
        "blocked": "À traiter",
        "completed": "Terminé",
        "cancelled": "Annulé",
        "unknown": "État inconnu",
    }
    progress_labels = {"step": "Progression de l’étape", "download": "Téléchargement", "copy": "Copie uniquement"}
    return WorkRef(
        key=key,
        source=source,
        state=state,
        label=labels[state],
        stage=stage or None,
        progress=WorkProgress(percent=percent(value), scope=scope, label=progress_labels[scope]),
        reason=reason or None,
        stale=stale,
    ).model_dump()


def encoding_work(row, *, instance_id, runner=False, paused=False):
    from .fileflows import WAIT_STEP_PREFIX

    stage = row.get("step") if runner else row.get("flow")
    reason = row.get("failure_reason")
    if runner:
        state = "waiting" if (stage or "").startswith(WAIT_STEP_PREFIX) else "running"
        if state == "waiting":
            reason = stage
    else:
        state = {
            0: "waiting",
            1: "completed",
            2: "running",
            4: "blocked",
            7: "paused",
            -1: "waiting",
            -2: "blocked",
            -3: "blocked",
            3: "blocked",
            6: "blocked",
        }.get(row.get("status"), "unknown")
        if state == "blocked":
            reason = reason or row.get("status_label")
        if paused and state == "waiting":
            state = "paused"
    # Runners expose a path, not the library-file UID. Never invent a shared identifier.
    identity = f"runner:{row.get('path', '')}" if runner else f"file:{row.get('uid', '')}"
    return _ref(
        f"encoding:{instance_id}:{identity}",
        "encoding",
        state,
        stage,
        row.get("percent") if runner else None,
        "step",
        reason,
    )


def download_work(row):
    status = str(row.get("status") or "").lower()
    tracked = str(row.get("tracked_state") or "").lower()
    stale = bool(row.get("is_stale"))
    value = percent(row.get("progress"))
    reason = row.get("error") or row.get("client_error")
    if not isinstance(reason, str):
        reason = None
    messages = [
        str(message).strip()
        for group in row.get("status_messages") or []
        for message in group.get("messages") or []
        if str(message).strip()
    ]
    reason = reason or " · ".join(dict.fromkeys(messages)) or None
    diagnostic = bool(reason or str(row.get("tracked_status") or "").lower() in {"error", "warning", "failed"})
    arr = row.get("arr_type") in {"radarr", "sonarr"}
    stage = "Téléchargement"
    if stale:
        stage = "Dernière observation · connexion perdue"
    if stale:
        state = "unknown"
    elif diagnostic or status in {"error", "failed", "warning", "missingfiles"}:
        state = "blocked"
    elif "pause" in status or status.startswith("stopped"):
        state = "paused"
    elif tracked == "importing":
        state, stage = "running", "Import"
    elif tracked in {"imported", "completed"}:
        state, stage = "completed", "Import terminé"
    elif arr and (tracked == "importpending" or value == 100 or status == "completed"):
        state, stage = "waiting", "En attente d’import"
    elif "queue" in status or status in {
        "stalleddl",
        "metadl",
        "checkingdl",
        "checkingresumedata",
        "check-waiting",
        "checking",
        "download-waiting",
        "seed-waiting",
    }:
        state = "waiting"
    elif "up" in status or status in {"seeding", "completed"}:
        state, stage = "completed", "Téléchargement terminé"
    elif status in {"downloading", "downloadingdl", "forceddl", "allocating", "moving"}:
        state = "running"
    else:
        state, stage = "unknown", None
    identity = row.get("queue_id") if arr else row.get("hash") or row.get("download_id") or row.get("request_id")
    owner = row.get("instance_id") if arr else row.get("client_id") or row.get("download_client_id")
    return _ref(
        f"download:{'arr' if arr else 'client'}:{owner}:{identity}",
        "download",
        state,
        stage,
        None if stale else value,
        "download",
        reason,
        stale,
    )


def transfer_work(row):
    status = row.get("status")
    state = {
        "queued": "waiting",
        "draft": "waiting",
        "running": "running",
        "finalizing": "running",
        "cancelling": "running",
        "paused": "paused",
        "stopped": "blocked",
        "blocked": "blocked",
        "failed": "blocked",
        "cancel_blocked": "blocked",
        "completed": "completed",
        "cancelled": "cancelled",
    }.get(status, "unknown")
    items = row.get("items") or []
    stages = {
        "prepared": "Préparation",
        "copying": "Copie",
        "verifying": "Vérification",
        "switching": "Bascule Arr",
        "plex_pending": "Finalisation Plex",
        "cleaning": "Nettoyage",
        "arr_pending": "Déplacement confié à Arr",
    }
    active = next((item for item in items if item.get("status") in stages), None)
    stage = stages.get(active.get("status")) if active else None
    if status == "finalizing":
        stage = "Finalisation Plex"
    if status == "cancelling":
        stage = "Annulation en cours"
    # Copie à 100 % : il reste encore la bascule, Plex et le nettoyage.
    total = sum(max(0, item.get("size_bytes") or 0) for item in items)
    copied = sum(
        (item.get("size_bytes") or 0)
        if item.get("status") in {"switching", "plex_pending", "cleaning", "completed"}
        else min(item.get("size_bytes") or 0, max(0, (item.get("progress") or {}).get("copied_bytes") or 0))
        for item in items
    )
    reason = row.get("error") or next(
        (
            item.get("reason")
            for item in items
            if item.get("status") in {"blocked", "failed", "deferred"} and item.get("reason")
        ),
        None,
    )
    value = copied / total * 100 if total else None
    mode = row.get("transfer_mode") or (row.get("params") or {}).get("transfer_mode")
    if mode == "arr" and state != "completed":
        value = None
    return _ref(f"transfer:{row['id']}", "transfer", state, stage, value, "copy", reason)
