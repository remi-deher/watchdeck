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
    target_titles: int | None = None,
    preference: str = "closest",
    group_limits: dict[str, int] | None = None,
) -> dict:
    """Bounded subset search: cover space with minimal excess, optionally exact count.

    The frontier is bounded for large libraries; this is a proposal, not a claim
    of mathematically optimal packing. Explicit selections are never goal-truncated.
    """
    if goal < 0 or available < 0 or not 1 <= max_titles <= 250:
        raise ValueError("Objectif, espace disponible ou limite de titres invalide.")
    if target_titles is not None and not 1 <= target_titles <= 250:
        raise ValueError("Le nombre de titres doit être compris entre 1 et 250.")
    if mode not in ("selection", "release_space", "minimum_free"):
        raise ValueError("Mode de transfert inconnu.")
    if mode == "minimum_free" and source_free is None:
        raise ValueError("Espace source inconnu : attendre le contrôle du moteur.")
    required = max(0, goal - (source_free or 0)) if mode == "minimum_free" else goal
    if mode == "minimum_free" and required == 0:
        target_titles = None
    ordered = sorted(candidates, key=lambda i: (i.get("preference_rank", ""), i["size_bytes"], i["key"]))
    eligible = [i for i in ordered if i["size_bytes"] > 0 and not i.get("protected")]
    alternatives: list[dict] = []
    chosen: list[dict] = []
    if selected is not None or mode == "selection":
        chosen = []
        total = 0
        for item in eligible:
            if selected is not None and item["key"] not in selected:
                continue
            if len(chosen) < max_titles and total + item["size_bytes"] <= available:
                chosen.append(item)
                total += item["size_bytes"]
    elif required == 0:
        chosen = []
    else:
        # Keep both under- and over-target frontiers for each count. Never round bytes.
        states: dict[int, dict[int, tuple[int, ...]]] = {0: {0: ()}}
        limit = min(max_titles, (target_titles + 1) if target_titles else max_titles, len(eligible))
        smallest_total = 0
        useful_count = 0
        for size in sorted(i["size_bytes"] for i in eligible):
            smallest_total += size
            useful_count += 1
            if smallest_total >= required:
                break
        if target_titles is None:
            limit = min(limit, useful_count)
        for index, item in enumerate(eligible):
            for count in range(min(index + 1, limit), 0, -1):
                bucket = states.setdefault(count, {})
                for size, indices in list(states.get(count - 1, {}).items()):
                    new = size + item["size_bytes"]
                    if new > available:
                        continue
                    if group_limits and len(group_limits) == 1:
                        if new > next(iter(group_limits.values())):
                            continue
                    elif group_limits:
                        same_group = item.get("capacity_group")
                        group_size = (
                            sum(
                                eligible[i]["size_bytes"]
                                for i in indices
                                if eligible[i].get("capacity_group") == same_group
                            )
                            + item["size_bytes"]
                        )
                        if group_size > group_limits[same_group]:
                            continue
                    if new <= available:
                        bucket.setdefault(new, indices + (index,))
                if len(bucket) > 128:
                    under = sorted((v for v in bucket if v < required), reverse=True)[:64]
                    over = sorted(v for v in bucket if v >= required)[:64]
                    states[count] = {v: bucket[v] for v in under + over}

        def score(entry):
            count, size, indices = entry
            rank = sum(indices) if preference != "closest" else 0
            return (size < required, rank, abs(size - required), count, indices)

        entries = [(c, size, indices) for c, bucket in states.items() if c for size, indices in bucket.items()]
        exact = [e for e in entries if target_titles is None or e[0] == target_titles]
        best = min(exact or entries, key=score) if entries else None
        chosen = [eligible[i] for i in best[2]] if best else []
        for count in sorted({e[0] for e in entries}, key=lambda c: abs(c - (target_titles or len(chosen)))):
            group = [e for e in entries if e[0] == count]
            alternative = min(group, key=score)
            if count != len(chosen) and len(alternatives) < 3:
                alternatives.append(
                    dict(
                        title_count=count,
                        planned_bytes=alternative[1],
                        keys=[eligible[i]["key"] for i in alternative[2]],
                        goal_covered=alternative[1] >= required,
                    )
                )
    keys = {i["key"] for i in chosen}
    total = sum(i["size_bytes"] for i in chosen)
    excluded = []
    for item in ordered:
        if item["key"] in keys:
            continue
        reason = (
            "Titre protégé"
            if item.get("protected")
            else "Volume inconnu ou aucun fichier"
            if item["size_bytes"] <= 0
            else "Réserve de destination insuffisante"
            if item["size_bytes"] > available
            else "Non retenu dans cette proposition"
        )
        excluded.append(dict(item, explanation=reason))
    return dict(
        items=[
            dict(
                i,
                explanation="Sélection explicite"
                if selected is not None or mode == "selection"
                else "Sélection proche de l’objectif, dépassement limité",
            )
            for i in chosen
        ],
        excluded=excluded,
        planned_bytes=total,
        requested_bytes=required,
        goal_covered=mode == "selection" or total >= required,
        requested_titles=target_titles,
        count_covered=target_titles is None or len(chosen) == target_titles,
        excess_bytes=max(0, total - required) if mode != "selection" else 0,
        remaining_capacity_bytes=available - total,
        alternatives=alternatives,
    )
