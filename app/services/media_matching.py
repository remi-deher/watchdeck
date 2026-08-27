"""Conditions et rapprochements partages entre demandes, Plex et *arr."""

from sqlalchemy import and_, false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import LibraryItem, MediaRequest


def request_identity_filter(
    *,
    arr_id: int | None = None,
    tmdb_id: int | str | None = None,
    tvdb_id: int | str | None = None,
    imdb_id: str | None = None,
    title: str | None = None,
):
    conditions = []
    if arr_id:
        conditions.append(MediaRequest.arr_id == int(arr_id))
    if tmdb_id:
        conditions.append(MediaRequest.tmdb_id == str(tmdb_id))
    if tvdb_id:
        conditions.append(MediaRequest.tvdb_id == str(tvdb_id))
    if imdb_id:
        conditions.append(MediaRequest.imdb_id == str(imdb_id))
    if conditions:
        return or_(*conditions)
    return MediaRequest.title.ilike(f"%{title}%") if title else false()


def library_identity_filter(req: MediaRequest):
    conditions = []
    if req.tmdb_id:
        conditions.append(LibraryItem.tmdb_id == str(req.tmdb_id))
    if req.tvdb_id:
        conditions.append(LibraryItem.tvdb_id == str(req.tvdb_id))
    if req.imdb_id:
        conditions.append(LibraryItem.imdb_id == str(req.imdb_id))
    if not conditions:
        return None
    # Restreindre au bon type pour éviter qu'un film et une série partageant
    # accidentellement un ID externe ne se valident mutuellement.
    plex_type = "movie" if req.media_type == "movie" else "show"
    return and_(or_(*conditions), LibraryItem.media_type == plex_type)


def identities_compatible(req: MediaRequest, item: LibraryItem) -> bool:
    """Refuse a link when type or the majority of known identifiers disagree.

    Plex can expose an erroneous external GUID (observed in production: a movie
    carrying the TVDB id of an unrelated show).  One matching id must therefore not
    be allowed to override both a media-type mismatch and contradictory identifiers.
    An exact native Plex GUID remains authoritative.
    """
    expected_type = "movie" if req.media_type == "movie" else "show"
    if item.media_type != expected_type:
        return False

    if req.plex_guid and item.plex_guid:
        if req.plex_guid == item.plex_guid:
            return True
        if req.plex_guid.startswith("plex://") and item.plex_guid.startswith("plex://"):
            return False

    equal = 0
    conflicting = 0
    for attr in ("tmdb_id", "tvdb_id", "imdb_id"):
        left = getattr(req, attr, None)
        right = getattr(item, attr, None)
        if left and right:
            if str(left) == str(right):
                equal += 1
            else:
                conflicting += 1
    if equal == 0 and conflicting == 0:
        same_title = (req.title or "").strip().casefold() == (item.title or "").strip().casefold()
        same_year = req.year is None or item.year is None or req.year == item.year
        return same_title and same_year
    return equal > conflicting


async def find_library_item_by_ids(
    db: AsyncSession,
    plex_guid: str | None,
    tmdb_id: str | None,
    tvdb_id: str | None,
    imdb_id: str | None,
    title: str,
    year: int | None,
    media_type: str,
) -> "LibraryItem | None":
    """Cherche un LibraryItem par identite : GUID Plex > IDs externes > titre+annee+type.

    L'ordre compte : le GUID Plex est teste seul et en premier, parce qu'il designe
    exactement l'entree de la bibliotheque, la ou un tmdb_id/tvdb_id peut etre partage par
    plusieurs entrees (doublons, re-sorties). Le rapprochement sur titre+annee+type reste
    en dernier recours, quand aucun identifiant n'est exploitable.
    """
    if plex_guid:
        found = (await db.execute(select(LibraryItem).filter(LibraryItem.plex_guid == plex_guid))).scalars().first()
        if found:
            return found

    conditions = []
    if tmdb_id:
        conditions.append(LibraryItem.tmdb_id == tmdb_id)
    if tvdb_id:
        conditions.append(LibraryItem.tvdb_id == tvdb_id)
    if imdb_id:
        conditions.append(LibraryItem.imdb_id == imdb_id)
    if conditions:
        found = (
            (
                await db.execute(
                    select(LibraryItem).filter(
                        LibraryItem.media_type == media_type,
                        or_(*conditions),
                    )
                )
            )
            .scalars()
            .first()
        )
        if found:
            return found

    return (
        (
            await db.execute(
                select(LibraryItem).filter(
                    LibraryItem.title.ilike(title),
                    LibraryItem.year == year,
                    LibraryItem.media_type == media_type,
                )
            )
        )
        .scalars()
        .first()
    )


async def link_request_to_library_item(db: AsyncSession, req: MediaRequest) -> "LibraryItem | None":
    """Lie une demande a son LibraryItem correspondant (source de verite VF unique).

    Si deja liee, renvoie directement le LibraryItem (retente un rapprochement si le lien
    est devenu orphelin). Sinon, tente un rapprochement par identite et persiste le lien
    s'il est trouve (sans commit -- a la charge de l'appelant). Renvoie None si aucun
    LibraryItem ne correspond (le media n'est pas encore synchronise depuis Plex : la
    demande reste scannee independamment jusqu'au prochain rapprochement).
    """
    if req.library_item_id:
        item = (await db.execute(select(LibraryItem).filter(LibraryItem.id == req.library_item_id))).scalars().first()
        if item and identities_compatible(req, item):
            return item
        req.library_item_id = None  # lien orphelin/incompatible, on retente un rapprochement ci-dessous
    item = await find_library_item_by_ids(
        db, req.plex_guid, req.tmdb_id, req.tvdb_id, req.imdb_id, req.title, req.year, req.media_type
    )
    if item and identities_compatible(req, item):
        req.library_item_id = item.id
        return item
    return None
