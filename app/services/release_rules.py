"""Règles de sélection des releases : ce que la recherche automatique retient ou écarte.

Une seule source pour le filtre de la recherche Prowlarr et pour l'outil « Tester sur une
release » de l'administration : ce que l'écran annonce est exactement ce que fait le
filtre. Les séries peuvent avoir leurs propres règles (`torrent_split_by_type`), leur
taille se comptant alors par épisode ; sans cela, films et séries partagent les mêmes.
"""

from dataclasses import dataclass
from typing import Any

GIB = 1024 * 1024 * 1024


@dataclass(frozen=True)
class ReleaseRules:
    required: tuple[str, ...]
    forbidden: tuple[str, ...]
    min_gb: float | None
    max_gb: float | None


def split_words(raw: str | None) -> tuple[str, ...]:
    return tuple(word.strip().lower() for word in (raw or "").split(",") if word.strip())


def rules_for(settings: Any, media_type: str | None = None) -> ReleaseRules:
    """Les règles qui s'appliquent à un type de média (`movie` ou `show`)."""
    if media_type == "show" and getattr(settings, "torrent_split_by_type", False):
        return ReleaseRules(
            required=split_words(getattr(settings, "torrent_show_required_keywords", None)),
            forbidden=split_words(getattr(settings, "torrent_show_forbidden_keywords", None)),
            min_gb=getattr(settings, "torrent_show_min_size_gb", None),
            max_gb=getattr(settings, "torrent_show_max_size_gb", None),
        )
    return ReleaseRules(
        required=split_words(getattr(settings, "torrent_required_keywords", None)),
        forbidden=split_words(getattr(settings, "torrent_forbidden_keywords", None)),
        min_gb=getattr(settings, "torrent_min_size_gb", None),
        max_gb=getattr(settings, "torrent_max_size_gb", None),
    )


def release_checks(title: str, size_gb: float | None, rules: ReleaseRules) -> list[dict[str, Any]]:
    """Chaque règle, son résultat et sa raison, dans l'ordre où l'écran les montre.

    `size_gb` inconnu (outil de test sans taille) : la règle de taille n'est pas jugée.
    """
    lowered = (title or "").lower()
    checks: list[dict[str, Any]] = []

    if rules.required:
        found = [word for word in rules.required if word in lowered]
        checks.append(
            {
                "rule": "required",
                "ok": bool(found),
                "message": f"Contient « {', '.join(found)} »"
                if found
                else f"Aucun mot requis ({', '.join(rules.required)})",
            }
        )
    else:
        checks.append({"rule": "required", "ok": True, "message": "Pas de mot requis"})

    banned = [word for word in rules.forbidden if word in lowered]
    checks.append(
        {
            "rule": "forbidden",
            "ok": not banned,
            "message": f"Contient le mot interdit « {', '.join(banned)} »" if banned else "Aucun mot interdit",
        }
    )

    if size_gb is None:
        checks.append({"rule": "size", "ok": True, "message": "Taille non jugée (inconnue)"})
    else:
        too_small = rules.min_gb is not None and size_gb < rules.min_gb
        too_big = rules.max_gb is not None and size_gb > rules.max_gb
        bounds = f"{_fmt(rules.min_gb) if rules.min_gb is not None else '0'}–{_fmt(rules.max_gb) if rules.max_gb is not None else '∞'} Go"
        if too_small:
            message = f"{_fmt(size_gb)} Go, sous le minimum ({bounds})"
        elif too_big:
            message = f"{_fmt(size_gb)} Go, au-dessus du maximum ({bounds})"
        else:
            message = f"{_fmt(size_gb)} Go, dans les limites ({bounds})"
        checks.append({"rule": "size", "ok": not (too_small or too_big), "message": message})
    return checks


def release_accepted(title: str, size_bytes: int | float | None, rules: ReleaseRules) -> bool:
    size_gb = (size_bytes or 0) / GIB
    return all(check["ok"] for check in release_checks(title, size_gb, rules))


def _fmt(value: float) -> str:
    return f"{value:g}" if value == int(value) else f"{value:.1f}".replace(".", ",")
