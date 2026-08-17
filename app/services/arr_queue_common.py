"""Utilitaires et classifications communes pour la surveillance des files d'attente Sonarr et Radarr.

Standardise l'identification des téléchargements en cours, en attente d'import, ou bloqués.
"""

from dataclasses import dataclass

BLOCKED_CONFIRMATION_CHECKS = 2
FULL_PROGRESS = 99.9


@dataclass(frozen=True)
class QueueClassification:
    state: str
    blocked_candidate: bool = False


def classify_queue_record(record: dict) -> QueueClassification:
    """Classe un élément sans confondre import lent et blocage confirmé."""
    progress = float(record.get("progress") or 0)
    size = float(record.get("size") or 0)
    sizeleft = float(record.get("sizeleft") or 0)
    complete = progress >= FULL_PROGRESS or (size > 0 and sizeleft <= 0)
    status = str(record.get("status") or "").strip().lower()
    tracked_state = str(record.get("tracked_state") or "").strip().lower()
    tracked_status = str(record.get("tracked_status") or "").strip().lower()
    has_diagnostic = bool(
        record.get("error")
        or record.get("status_messages")
        or tracked_status in {"warning", "error", "failed"}
    )

    if not complete:
        return QueueClassification("downloading" if status == "downloading" else "queued")
    if tracked_state == "importing":
        return QueueClassification("importing")
    if tracked_state in {"imported", "completed"}:
        return QueueClassification("completed")
    if tracked_state == "importpending" or has_diagnostic:
        return QueueClassification("awaiting_import", blocked_candidate=True)
    return QueueClassification("awaiting_import")
