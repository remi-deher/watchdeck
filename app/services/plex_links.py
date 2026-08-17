"""Construction centralisee des liens publics vers un media Plex."""

import asyncio
import logging
from urllib.parse import quote

from sqlalchemy.ext.asyncio import AsyncSession

from ..database import AsyncSessionLocal
from ..models import LibraryItem, MediaRequest, Settings
from . import plex_finder

logger = logging.getLogger(__name__)

PLEX_WEB_DETAILS_URL = "https://app.plex.tv/desktop/#!/provider/tv.plex.provider.discover/details?key="


def plex_metadata_key(guid: str | None) -> str | None:
    """Normalise un GUID Plex vers la cle attendue par Plex Web."""
    if not guid or not isinstance(guid, str):
        return None
    if guid.startswith("http://") or guid.startswith("https://"):
        return None
    if guid.startswith("plex://"):
        identifier = guid.rstrip("/").rsplit("/", 1)[-1]
        return f"/library/metadata/{identifier}" if identifier else None
    if "://" in guid:
        # Les GUID locaux/MBID ne sont pas resolvables par le provider Discover.
        return None
    if guid.startswith("/"):
        return guid
    return f"/library/metadata/{guid}"


def format_plex_web_url(guid: str | None) -> str | None:
    """Produit le lien HTTPS universel utilise dans les emails et Plex Web."""
    if isinstance(guid, str) and guid.startswith(("http://", "https://")):
        return guid
    metadata_key = plex_metadata_key(guid)
    if not metadata_key:
        return None
    return f"{PLEX_WEB_DETAILS_URL}{quote(metadata_key, safe='')}"


async def _linked_library_guid(
    media: MediaRequest | LibraryItem,
    db: AsyncSession | None,
) -> str | None:
    if isinstance(media, LibraryItem):
        return media.plex_guid
    if not media.library_item_id:
        return None
    if db is not None:
        item = await db.get(LibraryItem, media.library_item_id)
        return item.plex_guid if item else None
    async with AsyncSessionLocal() as own_db:
        item = await own_db.get(LibraryItem, media.library_item_id)
        return item.plex_guid if item else None


def _find_plex_guid_sync(
    settings: Settings,
    media: MediaRequest | LibraryItem,
) -> str | None:
    plex = plex_finder.connect(settings.plex_url, settings.plex_token)
    section_type = "show" if media.media_type == "show" else "movie"
    library_names = [section.title for section in plex.library.sections() if section.type == section_type]
    item = plex_finder.find_item_in_libraries(
        plex,
        library_names,
        media.title,
        media.year,
        tmdb_id=media.tmdb_id,
        tvdb_id=media.tvdb_id,
        imdb_id=media.imdb_id,
        plex_guid=media.plex_guid,
    )
    return getattr(item, "guid", None) if item is not None else None


async def resolve_plex_web_url(
    settings: Settings,
    media: MediaRequest | LibraryItem,
    *,
    db: AsyncSession | None = None,
    timeout: float = 6.0,
) -> str | None:
    """Resout une URL Plex sans jamais faire echouer une notification.

    L'element de bibliotheque synchronise est la source de verite. Le GUID porte
    directement par une demande vient ensuite, puis une recherche Plex bornee sert
    uniquement de repli pour un media tout juste indexe.
    """
    try:
        linked_url = format_plex_web_url(await _linked_library_guid(media, db))
        if linked_url:
            return linked_url

        direct_url = format_plex_web_url(media.plex_guid)
        if direct_url:
            return direct_url

        if not settings or not settings.plex_url or not settings.plex_token:
            return None
        guid = await asyncio.wait_for(
            asyncio.to_thread(_find_plex_guid_sync, settings, media),
            timeout=timeout,
        )
        return format_plex_web_url(guid)
    except Exception as exc:
        logger.debug("Lien Plex indisponible pour %r: %s", media.title, exc)
        return None
