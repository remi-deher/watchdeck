"""Dernier passage de chaque action de maintenance, retenu au-dela du processus.

`maintenance._last_runs` vivait en memoire dans le processus de l'API : un redemarrage
l'effacait, et avec ARQ (le worker execute l'action, pas l'API) il restait toujours vide.
Le cache partage (Redis quand il est la, memoire sinon) sert ici de support commun a l'API
et au worker.
"""

from collections.abc import Iterable

from ..cache import cache

#: Un passage reste visible un mois : au-dela, « jamais lance » est aussi juste.
LAST_RUN_TTL = 30 * 24 * 3600


def _key(action: str) -> str:
    return f"watchdeck:maintenance:last:{action}"


async def record_last_run(action: str, status: str, finished_at: str, log_count: int = 0) -> None:
    """Retient l'issue d'une action ; une panne du cache ne doit jamais faire echouer l'action."""
    try:
        await cache.set_json(
            _key(action),
            {"status": status, "finished_at": finished_at, "log_count": log_count},
            ttl_seconds=LAST_RUN_TTL,
        )
    except Exception:
        return


async def last_run(action: str) -> dict | None:
    """`{status, finished_at, log_count}` du dernier passage, ou `None` s'il n'y en a pas."""
    try:
        return await cache.get_json(_key(action))
    except Exception:
        return None


async def last_runs(actions: Iterable[str]) -> dict[str, dict]:
    """Derniers passages connus, sans les actions jamais lancees."""
    found = {}
    for action in actions:
        run = await last_run(action)
        if run:
            found[action] = run
    return found
