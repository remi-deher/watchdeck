"""Alternance de la file FileFlows entre bibliothèques (= disques).

FileFlows traite sa file dans l'ordre et, sans licence, ne limite pas les runners par
bibliothèque. Ses scans ajoutent les fichiers groupés par bibliothèque : avec plusieurs
runners, ils tomberaient tous sur le même disque. Quand l'option est activée (désactivée
par défaut), la tâche `fileflows-monitor` réordonne la file en alternant les bibliothèques
choisies : A, B, C, A, B, C… Le verrou par disque du flow règle les collisions restantes.

Ordre produit :
1. les fichiers relancés (déjà traités puis remis en file, à la main ou depuis Watchdeck),
   dans leur ordre : une relance garde sa priorité ;
2. les bibliothèques choisies, en alternance (ordre interne de chacune conservé) ;
3. le reste, dans son ordre actuel.

La file n'est réécrite que si elle n'est pas déjà dans cet ordre.
"""

import itertools
import json
import logging
from typing import Any

from ..utils import now_utc
from . import fileflows

logger = logging.getLogger(__name__)


def relaunched(row: dict[str, Any]) -> bool:
    """Un fichier jamais traité n'a pas encore de flow ; un fichier relancé garde celui de
    son dernier passage (`fu`)."""
    return bool(row.get("fu"))


def desired_order(
    rows: list[dict[str, Any]],
    included: set[str],
    paused: frozenset[str] | set[str] = frozenset(),
    relaunched_pass: bool = True,
    busy: frozenset[str] | set[str] = frozenset(),
) -> tuple[list[str], dict[str, int], int]:
    """Ordre voulu : relancés, bibliothèques incluses en alternance, reste, puis les
    bibliothèques en pause (lecture Plex) à la fin pour que les runners passent ailleurs.

    `relaunched_pass=False` : un fichier relancé d'une bibliothèque en pause attend avec elle.
    `busy` : bibliothèques dont le disque traite déjà un fichier ; leurs fichiers passent après
    ceux des disques libres, pour qu'un runner libre ne vienne pas attendre ce disque (un
    disque lent immobiliserait sinon un runner après l'autre)."""

    def protected_row(row: dict[str, Any]) -> bool:
        return relaunched(row) and (relaunched_pass or row.get("lu") not in paused)

    protected = [row["u"] for row in rows if protected_row(row)]
    rest = [row for row in rows if not protected_row(row)]
    active = [row for row in rest if row.get("lu") not in paused]
    groups: dict[str, list[str]] = {}
    for row in active:
        if row.get("lu") in included:
            groups.setdefault(row["lu"], []).append(row["u"])
    alternated = [u for batch in itertools.zip_longest(*groups.values()) for u in batch if u]
    others = [row["u"] for row in active if row.get("lu") not in included]
    held = [row["u"] for row in rest if row.get("lu") in paused]
    library_of = {row["u"]: row.get("lu") for row in rows}
    ordered = alternated + others
    free = [u for u in ordered if library_of[u] not in busy]
    waiting = [u for u in ordered if library_of[u] in busy]
    # Un fichier relancé dont le disque est occupé immobiliserait lui aussi un runner : il passe
    # après les disques libres, mais reste devant les autres fichiers de son disque.
    protected_free = [u for u in protected if library_of[u] not in busy]
    protected_busy = [u for u in protected if library_of[u] in busy]
    return (
        protected_free + free + protected_busy + waiting + held,
        {k: len(v) for k, v in groups.items()},
        len(protected),
    )


def parse_libraries(value: str | None) -> list[str]:
    try:
        parsed = json.loads(value or "[]")
    except ValueError:
        return []
    return [str(x) for x in parsed if isinstance(x, str)] if isinstance(parsed, list) else []


async def _libraries(url: str, api_key: str | None) -> list[dict[str, Any]]:
    rows = await fileflows._call(url, api_key, "GET", "library")
    return [lib for lib in rows or [] if isinstance(lib, dict) and lib.get("Enabled") and lib.get("Uid")]


async def _queue(url: str, api_key: str | None) -> list[dict[str, Any]]:
    rows = await fileflows._call(
        url, api_key, "GET", "library-file/list-all", params={"status": fileflows.STATUS_QUEUED, "page": 0}, timeout=60
    )
    return [row for row in rows or [] if isinstance(row, dict) and row.get("u")]


async def reorder(url: str, api_key: str | None, library_uids: list[str]) -> dict[str, Any]:
    """Réordonne la file ; renvoie ce qui a été fait (et le garde pour l'affichage)."""
    active = {lib["Uid"] for lib in await _libraries(url, api_key)}
    included = [uid for uid in library_uids if uid in active]
    rows = await _queue(url, api_key)
    result: dict[str, Any] = {"at": now_utc().isoformat(), "queue": len(rows), "changed": False}
    if len(included) < 2:
        result["message"] = f"Rien à alterner : {len(included)} bibliothèque choisie et activée."
    else:
        order, counts, protected = desired_order(rows, set(included))
        result.update({"alternated": sum(counts.values()), "protected": protected})
        if order == [row["u"] for row in rows]:
            result["message"] = f"File déjà alternée ({len(rows)} fichiers, {protected} relancé(s) en tête)."
        else:
            await fileflows._call(url, api_key, "POST", "library-file/move-to-top", json={"Uids": order}, timeout=120)
            result["changed"] = True
            result["message"] = (
                f"File réordonnée : {len(order)} fichiers, {protected} relancé(s) gardé(s) en tête, "
                f"{sum(counts.values())} en alternance."
            )
    return result
