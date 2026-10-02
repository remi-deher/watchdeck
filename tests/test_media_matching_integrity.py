from app.models import LibraryItem, MediaRequest
from app.services.media_matching import identities_compatible


def _request(**overrides):
    values = {
        "plex_user_id": "user",
        "title": "Movie",
        "media_type": "movie",
        "tmdb_id": "1314481",
        "tvdb_id": "358180",
        "imdb_id": "tt33612209",
    }
    values.update(overrides)
    return MediaRequest(**values)


def _item(**overrides):
    values = {
        "title": "Ultramarine Magmell",
        "media_type": "show",
        "tmdb_id": "85841",
        "tvdb_id": "358180",
        "imdb_id": "tt9826314",
        "plex_guid": "plex://show/5d9c0918705e7a001e6ea4b7",
    }
    values.update(overrides)
    return LibraryItem(**values)


def test_external_id_collision_cannot_cross_media_types():
    assert identities_compatible(_request(), _item()) is False


def test_single_equal_id_does_not_outvote_a_conflicting_id():
    request = _request(media_type="show", tmdb_id="85841", imdb_id=None)
    corrupted = _item(tmdb_id="1314481")
    assert identities_compatible(request, corrupted) is False


def test_exact_plex_guid_outvotes_stale_secondary_tvdb_id():
    request = _request(
        media_type="show",
        tmdb_id="62104",
        tvdb_id="284131",
        imdb_id="tt3909224",
        plex_guid="plex://show/seven-deadly-sins",
    )
    item = _item(
        tmdb_id="62104",
        tvdb_id="429267",
        imdb_id="tt3909224",
        plex_guid="plex://show/seven-deadly-sins",
    )
    assert identities_compatible(request, item) is True
