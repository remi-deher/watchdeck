from types import SimpleNamespace

from app.services.media_ref import media_ref


def test_media_ref_sends_every_image():
    row = SimpleNamespace(id=1, title="Dune", year=2021, media_type="movie", poster_url="p", art_url="a")
    assert media_ref(row) == {
        "id": 1,
        "title": "Dune",
        "year": 2021,
        "media_type": "movie",
        "poster_url": "p",
        "backdrop_url": "a",
    }


def test_media_ref_none():
    assert media_ref(None) is None


def test_library_serializers_keep_every_image():
    from app.models import LibraryItem
    from app.serializers import serialize_library_item, serialize_media_summary

    row = LibraryItem(id=1, title="Dune", year=2021, media_type="movie", poster_url="p", art_url="a")
    assert serialize_library_item(row)["backdrop_url"] == "a"
    assert serialize_media_summary(row)["backdrop_url"] == "a"
    assert serialize_media_summary(row)["id"] == 1
