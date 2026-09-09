"""Réparation des affiches dont la source a expiré.

Les affiches issues des métadonnées Plex (`metadata-static.plex.tv`) sont des objets S3
dont l'URL finit par répondre 403 AccessDenied : la carte affiche alors un cadre vide,
sans que rien ne le signale. TMDB, lui, construit ses URL à partir d'un chemin stable —
on peut donc les reconstruire à tout moment, à condition de connaître le `tmdb_id`.

Ce module ne devine rien : il ne remplace une affiche que si TMDB en propose une.
"""

import logging
from urllib.parse import urlparse

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import LibraryItem, MediaRequest
from .tmdb import poster_url_for

logger = logging.getLogger(__name__)

#: Hôtes dont les URL d'affiches expirent. Les affiches TMDB et TheTVDB, elles, tiennent.
EXPIRING_POSTER_HOSTS = {"metadata-static.plex.tv"}


def poster_is_fragile(poster_url: str | None) -> bool:
    """Vrai si l'affiche vient d'une source qui expire, ou s'il n'y en a aucune."""
    if not poster_url:
        return True
    try:
        host = (urlparse(poster_url).hostname or "").lower()
    except ValueError:
        return False
    return host in EXPIRING_POSTER_HOSTS


async def repair_posters(db: AsyncSession, *, limit: int = 500, dry_run: bool = False) -> dict:
    """Remplace par leur équivalent TMDB les affiches fragiles des demandes et médias.

    Ne touche qu'aux lignes qui portent un `tmdb_id` : sans lui, il n'y a rien à
    reconstruire. Les lignes déjà servies par TMDB ou TheTVDB sont laissées telles
    quelles — leurs URL ne périment pas.
    """
    repaired = 0
    scanned = 0
    unresolved = 0

    for model in (MediaRequest, LibraryItem):
        rows = (
            (
                await db.execute(
                    select(model)
                    .filter(model.tmdb_id.is_not(None), model.tmdb_id != "")
                    .filter(
                        or_(
                            model.poster_url.is_(None),
                            model.poster_url == "",
                            model.poster_url.ilike("%metadata-static.plex.tv%"),
                        )
                    )
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        for row in rows:
            if not poster_is_fragile(row.poster_url):
                continue
            scanned += 1
            poster = await poster_url_for(db, row.media_type or "movie", row.tmdb_id)
            if not poster:
                unresolved += 1
                continue
            logger.info("Affiche reconstruite depuis TMDB pour '%s' (tmdb %s)", row.title, row.tmdb_id)
            if not dry_run:
                row.poster_url = poster
            repaired += 1

    if not dry_run:
        await db.commit()
    return {"scanned": scanned, "repaired": repaired, "unresolved": unresolved}
