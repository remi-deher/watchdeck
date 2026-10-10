"""Problèmes à traiter : faits observés, conséquence et décisions possibles."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class ProblemAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    label: str
    tone: Literal["primary", "danger", "default"] = "default"
    disabled: bool = False
    title: str | None = None


class HandlingProblem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    source: Literal["report", "request", "vf_audit"]
    kind: str
    label: str
    state: Literal["open", "investigating", "closed"]
    urgency: Literal["high", "medium", "low"]
    consequence: str
    proposal: str | None
    fixable: bool
    actions: list[ProblemAction]


class ProblemMedia(BaseModel):
    id: int
    title: str
    year: int | None
    media_type: str
    poster_url: str | None
    backdrop_url: str | None


class IssueResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: int
    title: str | None
    media_type: str | None
    issue_type: str
    status: str
    message: str | None
    created_at: str | None
    updated_at: str | None
    reporter_name: str | None
    admin_note: str | None
    library_item_id: int | None
    request_id: int | None
    poster_url: str | None
    problem: HandlingProblem
    media: ProblemMedia | None


class IssuesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[IssueResponse]
    types: list[str]
    type_labels: dict[str, str]


REPORT_TYPES = {
    "other": "Autre",
    "audio": "Problème audio",
    "video": "Problème vidéo",
    "subtitle": "Sous-titres",
    "missing": "Média absent",
    "wrong": "Mauvais média",
}


def report_problem(issue, *, can_retry: bool = False) -> dict:
    """Un signalement est une observation utilisateur, pas un diagnostic confirmé."""
    state = issue.status
    actions = []
    if state == "closed":
        actions.append(ProblemAction(key="open", label="Rouvrir"))
    else:
        if state == "open":
            actions.append(ProblemAction(key="investigating", label="Prendre en charge", tone="primary"))
        actions.append(
            ProblemAction(
                key="retry",
                label="Relancer la recherche",
                disabled=not can_retry,
                title=None if can_retry else "Média non associé à une instance Sonarr/Radarr",
            )
        )
        actions.append(ProblemAction(key="closed", label="Clore"))
    return HandlingProblem(
        key=f"report:{issue.id}",
        source="report",
        kind=issue.issue_type,
        label=REPORT_TYPES.get(issue.issue_type, issue.issue_type),
        state=state,
        # Le type du signalement ne prouve pas que la lecture est impossible.
        urgency="low" if state == "closed" else "medium",
        consequence="Signalement clos."
        if state == "closed"
        else "Un utilisateur signale un problème ; sa cause reste à vérifier.",
        proposal=None if state == "closed" else "Vérifier le média et consigner le résultat avant de clore.",
        fixable=False,
        actions=actions,
    ).model_dump()


def request_problems(req, journey: dict) -> list[dict]:
    """L'attente normale (release, import, Plex) ne devient jamais un problème."""
    state = journey["status"]
    raw_status = getattr(req, "status", None)
    raw_status = raw_status.value if hasattr(raw_status, "value") else raw_status
    if state not in {"failed", "removed"}:
        # Le parcours emploie « not_submitted » pour la validation initiale.
        if state != "not_submitted" or raw_status != "pending_approval":
            return []
    return [
        HandlingProblem(
            key=f"request:{req.id}:{state}",
            source="request",
            kind=state,
            label=journey["label"],
            state="open",
            urgency="high" if state == "failed" else "medium",
            consequence=(journey.get("blocker") or {}).get("label")
            or "La demande attend une intervention avant de pouvoir avancer.",
            proposal=(journey.get("next_step") or {}).get("label"),
            fixable=False,
            # La fiche connaît les permissions et les mutations propres à la demande.
            actions=[],
        ).model_dump()
    ]


AUDIT_PROBLEMS = {
    "audio_secondary": ("VF non sélectionnée", "La lecture peut démarrer avec une autre langue.", True),
    "sub_fr_not_default": (
        "Sous-titres FR non sélectionnés",
        "Les sous-titres français ne sont pas sélectionnés par défaut.",
        True,
    ),
    "forced_sub_not_default": (
        "Sous-titres forcés FR non sélectionnés",
        "Les passages en langue étrangère peuvent manquer de sous-titres.",
        True,
    ),
    "partial_vf": ("VF partielle", "Certains épisodes n'ont pas de piste française.", False),
}


def audit_problems(item, codes: list[str]) -> list[dict]:
    problems = []
    for code in codes:
        label, consequence, fixable = AUDIT_PROBLEMS[code]
        problems.append(
            HandlingProblem(
                key=f"vf_audit:{item.id}:{code}",
                source="vf_audit",
                kind=code,
                label=label,
                state="open",
                urgency="medium",
                consequence=consequence,
                proposal="Prévisualiser l'alignement des pistes Plex."
                if fixable
                else "Chercher une version avec VF pour les épisodes concernés.",
                fixable=fixable,
                actions=[
                    ProblemAction(
                        key="align" if fixable else "search_vf",
                        label="Aligner sur Plex" if fixable else "Chercher VF",
                        tone="primary",
                    )
                ],
            ).model_dump()
        )
    return problems


async def issue_media_refs(db, issues: list) -> dict[int, tuple]:
    """Médias et association *ARR, résolus en deux requêtes sans N+1."""
    from sqlalchemy import select

    from ..models import LibraryItem, MediaRequest

    library_ids = {issue.library_item_id for issue in issues if issue.library_item_id}
    request_ids = {issue.request_id for issue in issues if issue.request_id}
    libraries = {}
    requests = {}
    if library_ids:
        rows = (await db.execute(select(LibraryItem).filter(LibraryItem.id.in_(library_ids)))).scalars().all()
        libraries = {row.id: row for row in rows}
    if request_ids:
        rows = (await db.execute(select(MediaRequest).filter(MediaRequest.id.in_(request_ids)))).scalars().all()
        requests = {row.id: row for row in rows}
    result = {}
    for issue in issues:
        lib = libraries.get(issue.library_item_id)
        req = requests.get(issue.request_id)
        result[issue.id] = (lib or req, lib if lib and lib.arr_id else req, req if lib else None)
    return result
