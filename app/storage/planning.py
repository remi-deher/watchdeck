"""Pure path validation and explicit, explainable space planning."""

from pathlib import PurePosixPath


def absolute_path(value: str) -> str:
    if not value.startswith("/") or "\\" in value or ".." in value.split("/") or "\x00" in value:
        raise ValueError("Chemin absolu Linux attendu, sans remontée de dossier.")
    result = str(PurePosixPath(value))
    if result == "/":
        raise ValueError("La racine du système est interdite.")
    return result


def relative_path(path: str, root: str) -> str | None:
    path, root = absolute_path(path), absolute_path(root)
    if not path.startswith(root + "/"):
        return None
    return path[len(root) + 1 :]


def choose_candidates(
    candidates: list[dict],
    mode: str,
    goal: int,
    source_free: int | None,
    available: int,
    max_titles: int,
    selected: set[str] | None = None,
) -> dict:
    if goal < 0 or available < 0 or not 1 <= max_titles <= 250:
        raise ValueError("Objectif, espace disponible ou limite de titres invalide.")
    if mode not in ("selection", "release_space", "minimum_free"):
        raise ValueError("Mode de transfert inconnu.")
    if mode == "minimum_free" and source_free is None:
        raise ValueError("Espace source inconnu : attendre le contrôle du moteur.")
    required = max(0, goal - (source_free or 0)) if mode == "minimum_free" else goal
    ordered = sorted(candidates, key=lambda x: (-x["size_bytes"], x["key"]))
    chosen: list[dict] = []
    excluded: list[dict] = []
    total = 0
    for item in ordered:
        reason = None
        if selected is not None and item["key"] not in selected:
            reason = "Non sélectionné"
        elif mode != "selection" and total >= required:
            reason = "Objectif déjà couvert"
        elif len(chosen) >= max_titles:
            reason = "Limite de titres atteinte"
        elif item["size_bytes"] <= 0:
            reason = "Volume inconnu ou aucun fichier"
        elif total + item["size_bytes"] > available:
            reason = "Réserve de destination insuffisante"
        if reason:
            excluded.append(dict(item, explanation=reason))
        else:
            chosen.append(
                dict(
                    item,
                    explanation="Sélection explicite"
                    if mode == "selection"
                    else "Priorité aux titres volumineux pour libérer de la place",
                )
            )
            total += item["size_bytes"]
    return dict(
        items=chosen,
        excluded=excluded,
        planned_bytes=total,
        requested_bytes=required,
        goal_covered=mode == "selection" or total >= required,
        remaining_capacity_bytes=available - total,
    )
