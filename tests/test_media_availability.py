"""La disponibilité ne confond jamais Plex et les fichiers *ARR."""

from app.models import LibraryItem, MediaRequest, RequestStatus
from app.services.media_availability import media_availability, MediaAvailability
from app.serializers import serialize_media_request, serialize_library_item


def test_movie_absent_from_plex_even_when_import_completed():
    req = MediaRequest(title="Film", media_type="movie", status=RequestStatus.available)
    payload = serialize_media_request(req, {})
    assert payload["available"] is True  # compatibilité historique
    assert payload["availability"]["plex"] == "unknown"
    assert media_availability(req, plex_present=False)["plex"] == "absent"


def test_present_movie_without_french_audio():
    film = LibraryItem(id=7, title="Film", media_type="movie", has_vf=False)
    state = serialize_library_item(film)["availability"]
    assert state["plex"] == "present"
    assert state["library_id"] == 7
    assert state["languages"]["has_vf"] is False


def test_partial_show_counts_are_arr_not_plex():
    state = media_availability(
        {"episodes_available_count": 3, "episodes_aired_count": 8, "episodes_total_count": 12}, plex_present=False
    )
    assert state["plex"] == "absent"
    assert state["episodes"] == {
        "source": "arr",
        "state": "partial",
        "available": 3,
        "aired": 8,
        "total": 12,
        "seasons_available": None,
        "seasons_total": None,
    }


def test_future_episodes_do_not_make_show_partial():
    state = media_availability({"episodes_available_count": 8, "episodes_aired_count": 8, "episodes_total_count": 12})
    assert state["episodes"]["state"] == "up_to_date"
    assert state["plex"] == "unknown"


def test_missing_data_stays_unknown_and_library_languages_win():
    state = media_availability({"has_vf": True}, library=LibraryItem(id=7, has_vf=None))
    assert state["episodes"]["state"] == "unknown"
    assert state["languages"]["has_vf"] is None
    assert MediaAvailability.model_validate(state).model_dump() == state


def test_generated_contract_matches_openapi():
    from scripts.generate_availability_types import TARGET, generate

    assert TARGET.read_text(encoding="utf-8") == generate()


def test_library_endpoint_exposes_validated_availability(async_db):
    from tests.test_library_filters import _client, _cleanup

    film = LibraryItem(title="Sans VF", media_type="movie", has_vf=False)
    async_db.add(film)
    async_db.commit()
    try:
        response = _client(async_db).get("/api/library")
        assert response.status_code == 200
        state = response.json()[0]["availability"]
        assert state["plex"] == "present"
        assert state["languages"]["has_vf"] is False
        assert state["quality"] == {"source": "unknown", "resolution": None}
    finally:
        _cleanup()


def test_season_coverage_is_scoped_and_computed_on_server():
    state = media_availability(
        {},
        season_rows=[
            {"season_number": 1, "status": "available"},
            {"season_number": 2, "status": "partially_available"},
        ],
    )
    assert state["episodes"]["seasons_available"] == 1
    assert state["episodes"]["seasons_total"] == 2
    assert state["plex"] == "unknown"


def test_detail_does_not_mix_selected_request_with_another_request_seasons():
    from app.services.media_detail import _media_payload

    library = LibraryItem(id=7, title="Série", media_type="show")
    selected = MediaRequest(id=2, title="Série", media_type="show", episodes_available_count=3, episodes_aired_count=8)
    payload = _media_payload(
        library,
        library,
        selected,
        {"seasons": [{"status": "available"}, {"status": "available"}]},
        arr_url=None,
        season_rows=[{"status": "partially_available"}],
    )
    episodes = payload["availability"]["episodes"]
    assert episodes["available"] == 3
    assert episodes["aired"] == 8
    assert episodes["seasons_available"] == 0
    assert episodes["seasons_total"] == 1


def test_in_plex_filter_excludes_completed_imports_without_library_confirmation(async_db):
    from tests.test_library_filters import _client, _cleanup

    library = LibraryItem(title="Série partielle", media_type="show", has_vf=False)
    async_db.add(library)
    async_db.commit()
    async_db.add_all(
        [
            MediaRequest(
                title="Série partielle",
                media_type="show",
                plex_user_id="alice",
                status=RequestStatus.partially_available,
                has_vf=True,
                library_item_id=library.id,
            ),
            MediaRequest(
                title="Import terminé", media_type="movie", plex_user_id="alice", status=RequestStatus.available
            ),
        ]
    )
    async_db.commit()
    try:
        response = _client(async_db).get("/api/requests-list?statuses=available,partially_available&in_plex=true")
        assert response.status_code == 200
        assert [item["title"] for item in response.json()["items"]] == ["Série partielle"]
        assert response.json()["items"][0]["availability"]["plex"] == "present"
        assert response.json()["items"][0]["availability"]["languages"]["has_vf"] is False
    finally:
        _cleanup()
