"""Tests unitaires pour app/services/radarr.py."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.radarr import (
    _accepts_title_match,
    add_movie,
    check_connection,
    get_calendar,
    get_movie_by_id,
    is_movie_available,
)

URL = "http://radarr.local:7878"
KEY = "testradarrkey"
ITEM = {"title": "Inception", "media_type": "movie", "tmdb_id": "27205"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resp(status_code: int, json_data) -> MagicMock:
    r = MagicMock()
    r.status_code = status_code
    r.json.return_value = json_data
    r.raise_for_status = MagicMock()
    return r


def _mock_client(get_side_effect=None, get_return=None, post_return=None) -> AsyncMock:
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    if get_side_effect:
        client.get = AsyncMock(side_effect=get_side_effect)
    elif get_return is not None:
        client.get = AsyncMock(return_value=get_return)
    if post_return is not None:
        client.post = AsyncMock(return_value=post_return)
    return client


# ---------------------------------------------------------------------------
# add_movie
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_add_movie_new():
    """Film inexistant → ajouté, already_existed=False."""
    existing_resp = _resp(200, [])  # liste vide
    add_resp = _resp(201, {"id": 10, "titleSlug": "inception-2010"})

    client = _mock_client(
        get_side_effect=[existing_resp],
        post_return=add_resp,
    )

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        arr_id, already_existed, slug = await add_movie(URL, KEY, 1, "/movies", ITEM)

    assert arr_id == 10
    assert already_existed is False
    assert slug == "inception-2010"


@pytest.mark.asyncio
async def test_get_movie_by_id_returns_root_folder_path():
    resp = _resp(200, {"id": 10, "rootFolderPath": "/movies"})
    client = _mock_client(get_return=resp)

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        movie = await get_movie_by_id(URL, KEY, 10)

    assert movie == {"id": 10, "rootFolderPath": "/movies"}


@pytest.mark.asyncio
async def test_get_movie_by_id_returns_none_on_404():
    resp = _resp(404, None)
    client = _mock_client(get_return=resp)

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        movie = await get_movie_by_id(URL, KEY, 999)

    assert movie is None


@pytest.mark.asyncio
async def test_add_movie_already_exists():
    """Film déjà dans Radarr → retourne l'ID existant, already_existed=True."""
    existing_list = [{"id": 5, "tmdbId": 27205, "titleSlug": "inception-2010"}]
    existing_resp = _resp(200, existing_list)

    client = _mock_client(get_return=existing_resp)

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        arr_id, already_existed, slug = await add_movie(URL, KEY, 1, "/movies", ITEM)

    assert arr_id == 5
    assert already_existed is True
    client.post.assert_not_called()


@pytest.mark.asyncio
async def test_add_movie_minimum_availability_passed():
    """minimumAvailability est transmis dans le payload POST."""
    existing_resp = _resp(200, [])
    add_resp = _resp(201, {"id": 11, "titleSlug": "inception-2010"})

    client = _mock_client(get_side_effect=[existing_resp], post_return=add_resp)

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        await add_movie(URL, KEY, 1, "/movies", ITEM, minimum_availability="inCinemas")

    call_kwargs = client.post.call_args
    payload = call_kwargs.kwargs.get("json") or call_kwargs.args[1]
    assert payload["minimumAvailability"] == "inCinemas"


@pytest.mark.asyncio
async def test_add_movie_no_tmdb_id_lookup_success():
    """Pas de TMDB ID dans l'item → lookup Radarr par titre → film ajouté."""
    item = {"title": "Inception", "media_type": "movie", "year": 2010}

    lookup_resp = _resp(200, [{"tmdbId": 27205, "title": "Inception", "year": 2010}])
    existing_resp = _resp(200, [])
    add_resp = _resp(201, {"id": 12, "titleSlug": "inception-2010"})

    client = _mock_client(
        get_side_effect=[lookup_resp, existing_resp],
        post_return=add_resp,
    )

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        arr_id, already_existed, slug = await add_movie(URL, KEY, 1, "/movies", item)

    assert arr_id == 12
    assert already_existed is False


@pytest.mark.asyncio
async def test_add_movie_no_tmdb_id_lookup_rejects_homonym_first_result():
    """Le premier résultat du lookup Radarr est un homonyme (année différente) : il doit
    être ignoré au profit du résultat suivant qui correspond réellement titre+année."""
    item = {"title": "The Thing", "media_type": "movie", "year": 2011}

    lookup_resp = _resp(
        200,
        [
            {"tmdbId": 99999, "title": "The Thing", "year": 1982},
            {"tmdbId": 27205, "title": "The Thing", "year": 2011},
        ],
    )
    existing_resp = _resp(200, [])
    add_resp = _resp(201, {"id": 13, "titleSlug": "the-thing-2011"})

    client = _mock_client(
        get_side_effect=[lookup_resp, existing_resp],
        post_return=add_resp,
    )

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        arr_id, already_existed, slug = await add_movie(URL, KEY, 1, "/movies", item)

    call_kwargs = client.post.call_args
    payload = call_kwargs.kwargs.get("json") or call_kwargs.args[1]
    assert payload["tmdbId"] == 27205


@pytest.mark.asyncio
async def test_add_movie_no_tmdb_id_lookup_no_match_returns_none():
    """Aucun résultat du lookup ne correspond au titre/année demandés : ne pas ajouter
    le mauvais film, refuser plutôt que de deviner."""
    item = {"title": "Totally Different Movie", "media_type": "movie", "year": 2020}

    lookup_resp = _resp(200, [{"tmdbId": 1, "title": "Some Other Film", "year": 1999}])
    client = _mock_client(get_side_effect=[lookup_resp, lookup_resp])

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        arr_id, already_existed, slug = await add_movie(URL, KEY, 1, "/movies", item)

    assert arr_id is None
    assert already_existed is False


@pytest.mark.asyncio
async def test_add_movie_no_tmdb_id_lookup_fails():
    """Pas de TMDB ID et lookup échoue → retourne (None, False, None)."""
    item = {"title": "Film Introuvable", "media_type": "movie"}

    client = _mock_client(get_side_effect=Exception("timeout"))

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        arr_id, already_existed, slug = await add_movie(URL, KEY, 1, "/movies", item)

    assert arr_id is None
    assert already_existed is False
    assert slug is None


# ---------------------------------------------------------------------------
# is_movie_available
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_is_movie_available_true():
    """hasFile=True → disponible."""
    movie = {"id": 5, "titleSlug": "inception-2010", "hasFile": True}
    resp = _resp(200, movie)
    client = _mock_client(get_return=resp)

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        available, arr_id, slug = await is_movie_available(URL, KEY, arr_id=5)

    assert available is True
    assert arr_id == 5
    assert slug == "inception-2010"


@pytest.mark.asyncio
async def test_is_movie_available_false():
    """hasFile=False → non disponible."""
    movie = {"id": 5, "titleSlug": "inception-2010", "hasFile": False}
    resp = _resp(200, movie)
    client = _mock_client(get_return=resp)

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        available, arr_id, slug = await is_movie_available(URL, KEY, arr_id=5)

    assert available is False


@pytest.mark.asyncio
async def test_is_movie_available_not_found():
    """Film introuvable → (False, None, None)."""
    resp = _resp(404, {})
    resp.raise_for_status.side_effect = Exception("404")
    client = _mock_client(get_return=resp)

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        available, arr_id, slug = await is_movie_available(URL, KEY, arr_id=999)

    assert available is False
    assert arr_id is None


@pytest.mark.asyncio
async def test_is_movie_available_by_tmdb_id():
    """Recherche par tmdb_id quand arr_id absent."""
    movie_list = [
        {"id": 3, "tmdbId": 27205, "titleSlug": "inception-2010", "hasFile": True},
        {"id": 4, "tmdbId": 99999, "titleSlug": "other", "hasFile": False},
    ]
    resp = _resp(200, movie_list)
    client = _mock_client(get_return=resp)

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        available, arr_id, slug = await is_movie_available(URL, KEY, tmdb_id="27205")

    assert available is True
    assert arr_id == 3


@pytest.mark.asyncio
async def test_is_movie_available_by_imdb_id():
    """Recherche par imdb_id en dernier recours."""
    movie_list = [
        {"id": 6, "tmdbId": 27205, "imdbId": "tt1375666", "titleSlug": "inception-2010", "hasFile": True},
    ]
    resp = _resp(200, movie_list)
    client = _mock_client(get_return=resp)

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        available, arr_id, slug = await is_movie_available(URL, KEY, imdb_id="tt1375666")

    assert available is True
    assert arr_id == 6


# ---------------------------------------------------------------------------
# test_connection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_connection_success():
    resp = _resp(200, {"version": "4.0.1"})
    client = _mock_client(get_return=resp)

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        success, msg = await check_connection(URL, KEY)

    assert success is True
    assert "4.0.1" in msg


@pytest.mark.asyncio
async def test_connection_failure():
    client = _mock_client(get_side_effect=Exception("Connection refused"))

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        success, msg = await check_connection(URL, KEY)

    assert success is False
    assert msg == "Exception"


# ---------------------------------------------------------------------------
# get_calendar
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_calendar_success():
    movies = [{"title": "Inception", "tmdbId": 27205, "hasFile": False, "inCinemas": "2026-07-15T00:00:00Z"}]
    client = _mock_client(get_return=_resp(200, movies))

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        result = await get_calendar(URL, KEY, "2026-07-01T00:00:00", "2026-07-31T00:00:00")

    assert len(result) == 1
    assert result[0]["title"] == "Inception"


@pytest.mark.asyncio
async def test_get_calendar_failure_returns_empty_list():
    client = _mock_client(get_side_effect=Exception("timeout"))

    with patch("app.services.arr_http_client.httpx.AsyncClient", return_value=client):
        result = await get_calendar(URL, KEY, "2026-07-01", "2026-07-31")

    assert result == []


def _lookup_result(title, year=None, tmdb=1, alternates=()):
    return {
        "title": title,
        "year": year,
        "tmdbId": tmdb,
        "alternateTitles": [{"title": value} for value in alternates],
    }


def test_a_title_lookup_rescues_a_film_whose_imdb_id_tmdb_ignores():
    """Le catalogue Plex est plus large que celui de TMDB.

    « Christmas in South Park » arrive de la watchlist avec un IMDB (tt0263206) que ni
    Radarr ni TMDB ne connaissent : la demande partait en échec « métadonnées
    introuvables », alors que le même film existe chez eux sous « Christmas Time in
    South Park ». Un seul résultat et une année qui concorde suffisent à trancher.
    """
    match = _accepts_title_match(
        "Christmas in South Park", 2007, [_lookup_result("Christmas Time in South Park", 2007, tmdb=148039)]
    )

    assert match["tmdbId"] == 148039


def test_an_ambiguous_search_resolves_to_nothing():
    """Se tromper ici enverrait le mauvais film au téléchargement, sans bruit.

    Une recherche générique ramène des dizaines de films ; aucun ne mérite qu'on lui
    fasse confiance sur la seule foi de sa position dans la liste.
    """
    results = [
        _lookup_result("South Park: Post COVID", 2021, tmdb=1),
        _lookup_result("South Park: Joining", 2023, tmdb=2),
    ]

    assert _accepts_title_match("South Park", None, results) is None


def test_an_exact_title_wins_even_among_many():
    """Un titre identique est un signal fort : il tranche quel que soit le nombre."""
    results = [
        _lookup_result("Un film sans rapport", 1999, tmdb=9),
        _lookup_result("Le voyage de Chihiro", 2001, tmdb=129),
    ]

    assert _accepts_title_match("Le Voyage de Chihiro", None, results)["tmdbId"] == 129


def test_a_lone_result_is_not_enough_without_a_year():
    """Sans année, un résultat unique ne prouve rien — Radarr propose toujours quelque chose."""
    assert _accepts_title_match("Un titre vague", None, [_lookup_result("Un film sans rapport", 1990)]) is None


def test_a_year_that_contradicts_rejects_the_match():
    results = [_lookup_result("Christmas Time in South Park", 1998, tmdb=148039)]

    assert _accepts_title_match("Christmas in South Park", 2007, results) is None


def test_an_alternate_title_counts_as_the_title():
    """Radarr expose les titres alternatifs : le titre français d'un film étranger y vit."""
    results = [_lookup_result("Spirited Away", 2001, tmdb=129, alternates=("Le Voyage de Chihiro",))]

    assert _accepts_title_match("Le voyage de Chihiro", None, results)["tmdbId"] == 129


def test_one_year_of_drift_is_tolerated():
    """Année de production et année de sortie divergent d'un catalogue à l'autre."""
    results = [_lookup_result("Christmas Time in South Park", 2008, tmdb=148039)]

    assert _accepts_title_match("Christmas in South Park", 2007, results)["tmdbId"] == 148039
