from dataclasses import dataclass
from typing import Any, Callable

from fastapi import Query


@dataclass
class PaginationParams:
    offset: int
    limit: int


def pagination_params(max_limit: int = 100, default_limit: int = 50, strict: bool = True) -> Callable[..., PaginationParams]:
    """Fabrique une dépendance FastAPI pour extraire offset et limit.

    Les endpoints existants n'avaient pas tous le même contrat avant factorisation :
    certains validaient déjà via Query(ge=..., le=...) (429 -> 422 sur valeur hors
    bornes), d'autres acceptaient n'importe quelle valeur et la clampaient
    silencieusement en code (200 OK). `strict` permet de reproduire fidèlement l'un
    ou l'autre selon l'endpoint plutôt que d'imposer un contrat unique partout.

    strict=True  (défaut) : Query(ge=1, le=max_limit) -> 422 FastAPI hors bornes.
    strict=False           : accepte toute valeur, clampe silencieusement (200 OK),
                              pour les endpoints qui avaient ce comportement avant.
    """
    if strict:
        def dependency(
            limit: int = Query(default_limit, ge=1, le=max_limit),
            offset: int = Query(0, ge=0),
        ) -> PaginationParams:
            return PaginationParams(offset=offset, limit=limit)
    else:
        def dependency(
            limit: int = Query(default_limit),
            offset: int = Query(0),
        ) -> PaginationParams:
            eff_limit = min(max(limit, 1), max_limit)
            eff_offset = max(offset, 0)
            return PaginationParams(offset=eff_offset, limit=eff_limit)

    return dependency


def paginated_response(
    items: list[Any],
    total: int,
    offset: int,
    limit: int,
    key: str = "items",
    include_has_more: bool = True,
    **extra: Any,
) -> dict[str, Any]:
    """Construit l'enveloppe de réponse paginée standard."""
    data: dict[str, Any] = {
        key: items,
        "total": total,
        "offset": offset,
        "limit": limit,
    }
    if include_has_more:
        data["has_more"] = offset + len(items) < total
    if extra:
        data.update(extra)
    return data
