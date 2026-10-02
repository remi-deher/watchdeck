"""Suivi d'une demande pour la page Demandes : pourquoi elle attend, ou elle en est.

Toutes les demandes « en cours » se ressemblaient : une demande envoyee il y a trois jours
et une autre bloquee depuis cinq mois portaient le meme badge. Ce module range chacune
dans un motif lisible par le demandeur, a partir de ce que l'application sait deja :
l'etat d'execution (`fulfillment_status`), la prochaine sortie connue de Sonarr/Radarr
(`next_release_at`) et la file de telechargement en direct.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from ..serializers import format_datetime

# Motifs, du plus actionnable au plus rassurant. Le libelle est celui de la carte.
LABELS = {
    "approval": "En attente d'approbation",
    "failed": "Échec du traitement",
    "rejected": "Refusée",
    "not_found": "Sortie, mais aucune version trouvée",
    "missing_episodes": "Épisodes diffusés introuvables",
    "downloading": "Téléchargement en cours",
    "queued": "En file de téléchargement",
    "importing": "Téléchargé, en attente d'import dans Plex",
    "unreleased": "Pas encore sorti",
}

_IMPORT_STATES = {"importing", "awaiting_plex"}
_SEARCH_STATES = {"not_submitted", "awaiting_submission", "submitted"}


def _value(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    return raw.value if hasattr(raw, "value") else str(raw)


def tracking_state(row: Any, now: datetime, queue_entry: Optional[dict] = None) -> Optional[dict]:
    """Motif de suivi d'une demande, ou `None` si elle est terminee (disponible)."""
    status = _value(getattr(row, "status", None))
    fulfillment = _value(getattr(row, "fulfillment_status", None)) or "not_submitted"
    next_release = getattr(row, "next_release_at", None)
    upcoming = next_release is not None and next_release > now

    kind: Optional[str]
    if status == "available":
        return None
    if status == "pending_approval":
        kind = "approval"
    elif status == "rejected":
        kind = "rejected"
    elif status == "failed" or fulfillment == "failed":
        kind = "failed"
    elif queue_entry is not None:
        kind = "downloading" if (queue_entry.get("status") or "").lower() == "downloading" else "queued"
    elif fulfillment in ("queued", "downloading"):
        kind = fulfillment
    elif fulfillment in _IMPORT_STATES or (
        getattr(row, "torrent_completed_at", None) and status != "partially_available"
    ):
        kind = "importing"
    elif upcoming:
        kind = "unreleased"
    elif status == "partially_available":
        kind = "missing_episodes"
    elif fulfillment in _SEARCH_STATES or status in ("pending", "sent_to_arr"):
        kind = "not_found"
    else:
        kind = "not_found"

    label = LABELS[kind]
    if kind == "unreleased" and getattr(row, "next_release_label", None):
        label = f"Pas encore sorti · {row.next_release_label}"

    since = getattr(row, "fulfillment_updated_at", None) or getattr(row, "requested_at", None)
    download = None
    if queue_entry is not None:
        download = {
            "progress": queue_entry.get("progress"),
            "timeleft": queue_entry.get("timeleft"),
        }
    return {
        "kind": kind,
        "label": label,
        "since": format_datetime(since),
        "next_release_at": format_datetime(next_release),
        "download": download,
    }


def lifecycle(row: Any) -> list[dict]:
    """Quatre etapes, de la demande a la disponibilite : ce que la carte affiche en fil."""
    status = _value(getattr(row, "status", None))
    fulfillment = _value(getattr(row, "fulfillment_status", None)) or "not_submitted"
    available = status == "available"
    downloaded = (
        available
        or fulfillment in _IMPORT_STATES | {"partially_available", "completed"}
        or bool(getattr(row, "torrent_completed_at", None))
    )
    sent = (
        downloaded
        or fulfillment not in ("not_submitted", "awaiting_submission")
        or bool(getattr(row, "arr_processed_at", None))
    )
    if status in ("rejected", "pending_approval"):
        sent = downloaded = False
    return [
        {
            "key": "requested",
            "label": "Demandée",
            "done": True,
            "at": format_datetime(getattr(row, "requested_at", None)),
        },
        {
            "key": "sent",
            "label": "Envoyée",
            "done": sent,
            "at": format_datetime(getattr(row, "arr_processed_at", None)),
        },
        {
            "key": "downloaded",
            "label": "Téléchargée",
            "done": downloaded,
            "at": format_datetime(getattr(row, "torrent_completed_at", None)),
        },
        {
            "key": "available",
            "label": "Disponible",
            "done": available,
            "at": format_datetime(getattr(row, "available_at", None)),
        },
    ]


def vf_missing(row: Any) -> bool:
    """Disponible, mais sans VF alors qu'on la suit : l'onglet « VF manquante »."""
    return (
        _value(getattr(row, "status", None)) in ("available", "partially_available")
        and getattr(row, "has_vf", None) is False
        and not getattr(row, "vf_tracking_disabled", False)
        and getattr(row, "media_type", None) in ("movie", "show")
    )


def queue_by_request(queue: list[dict]) -> dict[int, dict]:
    """File de telechargement indexee par demande liee (la plus avancee en cas de doublon)."""
    index: dict[int, dict] = {}
    for entry in queue or []:
        request_id = entry.get("linked_request_id")
        if request_id is None:
            continue
        current = index.get(request_id)
        if current is None or (entry.get("progress") or 0) > (current.get("progress") or 0):
            index[request_id] = entry
    return index
