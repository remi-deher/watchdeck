"""Tests pour BaseArrClient et MediaIdentifiers."""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.arr_client_base import BaseArrClient
from app.services.media_identifiers import MediaIdentifiers, parse_guid_uri
from app.utils import identity_keys


def test_parse_guid_uri():
    assert parse_guid_uri("imdb://tt123456") == ("imdb", "tt123456")
    assert parse_guid_uri("tmdb://998877") == ("tmdb", "998877")
    assert parse_guid_uri("plex://movie/abcdef") == ("plex", "movie/abcdef")
    assert parse_guid_uri("invalid_guid") is None
    assert parse_guid_uri(None) is None


def test_media_identifiers_from_dict():
    data = {
        "plex_guid": "plex://movie/123",
        "tmdb_id": "550",
        "tvdb_id": "1234",
        "imdb_id": "tt0137523",
        "arr_id": 42,
        "title": "Fight Club",
        "year": 1999,
        "media_type": "movie",
    }
    ident = MediaIdentifiers.from_record(data)
    assert ident.plex_guid == "plex://movie/123"
    assert ident.tmdb_id == "550"
    assert ident.tvdb_id == "1234"
    assert ident.imdb_id == "tt0137523"
    assert ident.arr_id == 42
    assert ident.title == "Fight Club"
    assert ident.year == 1999
    assert ident.media_type == "movie"


def test_media_identifiers_matches():
    m1 = MediaIdentifiers(tmdb_id="550", title="Fight Club", year=1999, media_type="movie")
    m2 = MediaIdentifiers(tmdb_id="550", title="Autre Titre", year=1999, media_type="movie")
    assert m1.matches(m2)

    m3 = MediaIdentifiers(title="Fight Club", year=1999, media_type="movie")
    m4 = MediaIdentifiers(title="fight club", year=1999, media_type="movie")
    assert m3.matches(m4)

    m5 = MediaIdentifiers(title="Fight Club", year=2020, media_type="movie")
    assert not m3.matches(m5)


def test_identity_keys_compatibility():
    data = {
        "plex_guid": "plex://123",
        "tmdb_id": 550,
        "tvdb_id": 1234,
        "imdb_id": "tt0137523",
        "title": "Inception",
        "year": 2010,
        "media_type": "movie",
    }
    keys = identity_keys(data)
    assert ("guid", "plex://123") in keys
    assert ("tmdb", "550") in keys
    assert ("tvdb", "1234") in keys
    assert ("imdb", "tt0137523") in keys
    assert ("title", "inception", 2010, "movie") in keys


def test_base_arr_client_init():
    client = BaseArrClient("http://localhost:8989/", "fake-api-key", product="Sonarr")
    assert client.url == "http://localhost:8989"
    assert client.api_key == "fake-api-key"
    assert client.product == "Sonarr"
    http_cli = client.http_client()
    assert http_cli.base == "http://localhost:8989"
    assert http_cli.headers["X-Api-Key"] == "fake-api-key"


@pytest.mark.asyncio
async def test_base_arr_client_delegates_with_matching_signatures():
    """Regression : chaque methode de delegation doit appeler sa fonction
    arr_common correspondante avec des arguments qu'elle accepte vraiment
    (le seul test precedent ne couvrait que le constructeur, ce qui avait
    laisse passer plusieurs TypeError silencieux : timeout/unmonitored/
    remove_from_client n'existent pas cote arr_common)."""
    client = BaseArrClient("http://localhost:8989/", "fake-api-key", product="Sonarr")

    with patch(
        "app.services.arr_client_base.arr_common.check_connection", new=AsyncMock(return_value=(True, "ok"))
    ) as m:
        assert await client.check_connection() == (True, "ok")
        m.assert_awaited_once_with("http://localhost:8989", "fake-api-key", product="Sonarr")

    with patch("app.services.arr_client_base.arr_common.get_calendar", new=AsyncMock(return_value=[])) as m:
        await client.get_calendar("2026-01-01", "2026-01-31")
        m.assert_awaited_once_with(
            "http://localhost:8989", "fake-api-key", "2026-01-01", "2026-01-31", product="Sonarr"
        )

    with patch(
        "app.services.arr_client_base.arr_common.delete_queue_item", new=AsyncMock(return_value=(True, "ok"))
    ) as m:
        result = await client.delete_queue_item(42, blocklist=True)
        assert result == (True, "ok")
        m.assert_awaited_once_with(
            "http://localhost:8989", "fake-api-key", 42, blocklist=True, search=True, product="Sonarr"
        )
