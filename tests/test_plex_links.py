from unittest.mock import AsyncMock, patch

import pytest

from app.models import LibraryItem, MediaRequest, Settings
from app.services.plex_links import format_plex_web_url, resolve_plex_web_url


def _request(**kwargs) -> MediaRequest:
    values = {
        "plex_user_id": "alice",
        "title": "Inception",
        "year": 2010,
        "media_type": "movie",
    }
    values.update(kwargs)
    return MediaRequest(**values)


def test_format_plex_web_url_uses_the_global_discover_route():
    assert format_plex_web_url("plex://movie/abc-123") == (
        "https://app.plex.tv/desktop/#!/provider/tv.plex.provider.discover/details?key=%2Flibrary%2Fmetadata%2Fabc-123"
    )


@pytest.mark.parametrize("guid", ["local://42", "mbid://artist/42", None, ""])
def test_format_plex_web_url_rejects_non_global_guids(guid):
    assert format_plex_web_url(guid) is None


@pytest.mark.asyncio
async def test_resolve_prefers_the_linked_library_item_guid():
    request = _request(library_item_id=7, plex_guid="plex://movie/request-guid")
    library_item = LibraryItem(
        id=7,
        title="Inception",
        year=2010,
        media_type="movie",
        plex_guid="plex://movie/library-guid",
    )
    db = AsyncMock()
    db.get.return_value = library_item

    link = await resolve_plex_web_url(Settings(), request, db=db)

    assert link.endswith("%2Flibrary%2Fmetadata%2Flibrary-guid")
    db.get.assert_awaited_once_with(LibraryItem, 7)


@pytest.mark.asyncio
async def test_resolve_uses_request_guid_without_plex_connection():
    link = await resolve_plex_web_url(
        Settings(),
        _request(plex_guid="plex://movie/request-guid"),
    )

    assert link.endswith("%2Flibrary%2Fmetadata%2Frequest-guid")


@pytest.mark.asyncio
async def test_resolve_searches_plex_only_as_a_fallback():
    settings = Settings(plex_url="http://plex.local", plex_token="token")
    with patch(
        "app.services.plex_links._find_plex_guid_sync",
        return_value="plex://movie/fallback-guid",
    ) as finder:
        link = await resolve_plex_web_url(settings, _request())

    assert link.endswith("%2Flibrary%2Fmetadata%2Ffallback-guid")
    finder.assert_called_once()
