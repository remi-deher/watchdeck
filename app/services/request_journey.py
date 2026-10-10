"""Contrat du parcours observé d'une demande, partagé par listes et fiches."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from .media_availability import MediaAvailability, media_availability


class JourneyOrigin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["request", "arr", "plex"]
    label: str


class JourneyStep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    label: str
    state: Literal["completed", "current", "upcoming", "error"]
    occurred_at: str | None


class JourneyExpectation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str
    label: str


class JourneyDownload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    progress: float | None
    timeleft: str | None


class JourneyTracking(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str
    label: str
    since: str | None
    next_release_at: str | None
    download: JourneyDownload | None


class RequestJourney(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: int | None
    origin: JourneyOrigin
    status: Literal[
        "not_submitted",
        "awaiting_submission",
        "submitted",
        "queued",
        "downloading",
        "importing",
        "awaiting_plex",
        "partially_available",
        "completed",
        "failed",
        "removed",
        "rejected",
    ]
    label: str
    steps: list[JourneyStep]
    blocker: JourneyExpectation | None
    next_step: JourneyExpectation | None
    tracking: JourneyTracking | None
    availability: MediaAvailability


EXPECTATIONS = {
    "not_submitted": ("approval", "Approuver la demande"),
    "awaiting_submission": ("submission", "Confirmer l'envoi vers *ARR"),
    "submitted": ("release", "Trouver une release dans *ARR"),
    "queued": ("download", "Démarrer le téléchargement"),
    "downloading": ("download", "Terminer le téléchargement"),
    "importing": ("import", "Confirmer l'import dans *ARR"),
    "awaiting_plex": ("plex", "Confirmer l'indexation dans Plex"),
    "partially_available": ("episodes", "Compléter les épisodes déjà diffusés"),
    "failed": ("retry", "Corriger l'erreur puis relancer"),
    "removed": ("submission", "Décider de reprendre le suivi dans *ARR"),
}


def request_journey(
    req: Any, projection: dict, *, availability: dict | None = None, queue_entry: dict | None = None
) -> dict:
    from ..utils import now_utc_naive
    from .request_tracking import tracking_state

    availability = availability if availability is not None else media_availability(req)
    status = projection["operational_status"]
    raw_status = getattr(req, "status", None)
    raw_status = raw_status.value if hasattr(raw_status, "value") else raw_status
    label = projection["operational_status_label"]
    if status not in {"failed", "removed"}:
        if raw_status in {"available", "partially_available"} and status in {
            "not_submitted",
            "completed",
            "partially_available",
        }:
            status = "completed" if raw_status == "available" else "partially_available"
        if queue_entry is not None and raw_status not in {"rejected", "pending_approval", "failed"}:
            status = "downloading" if (queue_entry.get("status") or "").lower() == "downloading" else "queued"
    if status in {"completed", "partially_available"} and availability["plex"] != "present":
        status = "awaiting_plex"
        label = "Présence dans Plex à confirmer"
    elif status == "completed":
        label = "Disponible dans Plex"
    elif status == "partially_available":
        label = "Présent dans Plex · suivi des épisodes"
    elif status in {"queued", "downloading"}:
        label = "Téléchargement en cours" if status == "downloading" else "En file de téléchargement"
    if raw_status == "rejected":
        status, label = "rejected", "Demande refusée"
    elif raw_status == "pending_approval":
        status, label = "not_submitted", "En attente d'approbation"
    elif raw_status == "failed":
        status, label = "failed", "Traitement en erreur"
    if (
        projection["origin_kind"] == "arr"
        and status in {"not_submitted", "awaiting_submission"}
        and raw_status != "pending_approval"
    ):
        status, label = "submitted", "Suivi par *ARR"
    if (
        projection["origin_kind"] == "plex"
        and status in {"not_submitted", "completed", "partially_available", "awaiting_plex"}
        and raw_status != "pending_approval"
    ):
        status = "completed" if availability["plex"] == "present" else "awaiting_plex"
        label = "Disponible dans Plex" if status == "completed" else "Présence dans Plex à confirmer"

    from .operational_projection import request_workflow_timeline

    steps = request_workflow_timeline(req, fulfillment=status)
    if status == "rejected":
        steps = [step for step in steps if step["key"] == "requested"]
        steps.append(dict(key="rejected", label=label, state="error", occurred_at=None))
    elif status in {"failed", "removed"} and not any(step["state"] == "error" for step in steps):
        steps.append(dict(key=status, label=label, state="error", occurred_at=None))
    elif raw_status == "pending_approval":
        steps = [step for step in steps if step["key"] == "requested"] + [
            dict(key="approval", label=label, state="current", occurred_at=None)
        ]
    if availability["plex"] != "present":
        # Une date historique de disponibilité ne prouve pas la présence actuelle.
        for step in steps:
            if step["key"] in {"completed", "partially_available"}:
                step.update(state="upcoming", occurred_at=None)
        if status == "awaiting_plex" and not any(step["state"] == "current" for step in steps):
            steps.insert(0, dict(key="awaiting_plex", label=label, state="current", occurred_at=None))
    if status == "completed":
        for step in steps:
            if step["key"] == "completed":
                step["state"] = "completed"
    tracking = tracking_state(req, now_utc_naive(), queue_entry)
    if status in {"queued", "downloading"}:
        tracking = {
            "kind": status,
            "label": label,
            "since": (tracking or {}).get("since"),
            "next_release_at": None,
            "download": {"progress": queue_entry.get("progress"), "timeleft": queue_entry.get("timeleft")}
            if queue_entry is not None
            else None,
        }
    if status in {"not_submitted", "awaiting_submission"}:
        tracking = {
            "kind": "approval" if status == "not_submitted" else "submission",
            "label": label,
            "since": (tracking or {}).get("since"),
            "next_release_at": None,
            "download": None,
        }
    if status == "partially_available" and availability["episodes"]["state"] in {"absent", "partial"}:
        label = "Présent dans Plex · fichiers *ARR incomplets"
        if tracking and tracking["kind"] == "missing_episodes":
            tracking["label"] = "Fichiers manquants pour des épisodes déjà diffusés"
    if status in {"failed", "removed", "rejected"}:
        tracking = {
            "kind": "rejected" if status == "rejected" else "failed",
            "label": label,
            "since": (tracking or {}).get("since"),
            "next_release_at": None,
            "download": None,
        }
    if status == "completed":
        tracking = None
    if status == "partially_available" and availability["episodes"]["state"] == "up_to_date":
        label = "Présent dans Plex · fichiers *ARR à jour"
        if tracking and tracking["kind"] == "missing_episodes":
            tracking = None
    if status == "partially_available" and availability["episodes"]["state"] == "unknown":
        label = "Présent dans Plex · couverture des épisodes à confirmer"
        if tracking and tracking["kind"] == "missing_episodes":
            tracking = None
    # Un ancien statut disponible ne clôt pas le parcours sans confirmation Plex.
    if status in {"importing", "awaiting_plex"}:
        tracking = {
            "kind": "importing",
            "label": label,
            "since": None,
            "next_release_at": None,
            "download": None,
        }
    blocker = None
    if status in {"failed", "removed", "rejected"}:
        blocker = JourneyExpectation(kind=status, label=getattr(req, "fulfillment_error", None) or label)
    elif tracking and tracking["kind"] in {"not_found", "missing_episodes", "approval"}:
        blocker = JourneyExpectation(kind=tracking["kind"], label=tracking["label"])
    expectation = EXPECTATIONS.get(status)
    next_step = JourneyExpectation(kind=expectation[0], label=expectation[1]) if expectation else None
    if status == "partially_available" and availability["episodes"]["state"] == "up_to_date":
        next_step = JourneyExpectation(kind="episodes", label="Attendre les prochains épisodes")
    if status == "partially_available" and availability["episodes"]["state"] == "unknown":
        next_step = JourneyExpectation(kind="episodes", label="Vérifier la couverture des épisodes")
    if tracking and tracking["kind"] == "unreleased":
        next_step = JourneyExpectation(kind="release_date", label=tracking["label"])
    if getattr(req, "media_type", None) != "show" and status != "partially_available":
        steps = [step for step in steps if step["key"] != "partially_available"]
    for step in steps:
        if step["key"] == "partially_available":
            step["label"] = label if step["state"] == "current" else "Suivi des épisodes"
    return RequestJourney(
        request_id=getattr(req, "id", None),
        origin=JourneyOrigin(kind=projection["origin_kind"], label=projection["origin_label"]),
        status=status,
        label=label,
        steps=steps,
        blocker=blocker,
        next_step=next_step,
        tracking=tracking,
        availability=availability,
    ).model_dump()
