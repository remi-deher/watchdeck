"""Reservations des dossiers touches par les mutations du moteur de transfert."""

import asyncio
import posixpath
from contextlib import asynccontextmanager


def item_paths(item):
    snap = item.snapshot
    paths = []
    for side in ("source", "destination"):
        if snap.get(side + "_mount") and snap.get("relative"):
            paths.append(posixpath.join(snap[side + "_mount"], snap["relative"]))
        else:
            paths.append(snap.get(side + "_path") or snap[side + "_arr"])
    return paths


class MutationLocks:
    def __init__(self):
        self.condition = asyncio.Condition()
        self.active = {}

    def overlaps(self, paths):
        return any(
            a == b or a.startswith(b.rstrip("/") + "/") or b.startswith(a.rstrip("/") + "/")
            for held in self.active.values()
            for a in held
            for b in paths
        )

    @asynccontextmanager
    async def hold(self, paths, *, wait=True):
        paths = tuple(sorted({posixpath.normpath(str(path)) for path in paths}))
        token = object()
        # Reservation atomique du lot trie : aucun verrou partiel ni interblocage.
        async with self.condition:
            if wait:
                await self.condition.wait_for(lambda: not self.overlaps(paths))
            acquired = not self.overlaps(paths)
            if acquired:
                self.active[token] = paths
        try:
            # Deux dossiers distincts sur le meme disque peuvent travailler ensemble ;
            # la suppression de l'un ajoute seulement une charge disque a la copie.
            yield acquired
        finally:
            if acquired:
                async with self.condition:
                    del self.active[token]
                    self.condition.notify_all()


mutation_lock = MutationLocks().hold
