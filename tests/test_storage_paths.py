"""Fail-closed discovery and identity checks for storage transfers."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.routers.storage_api import LocationBody, save_location
from app.storage import service, worker
from app.storage.planning import absolute_path, relative_path


def test_path_component_boundary():
    assert relative_path("/data/FILMS/Film", "/data/FILMS") == "Film"
    assert relative_path("/data/FILMS-old/Film", "/data/FILMS") is None
    with pytest.raises(ValueError):
        absolute_path("/data/FILMS/../SERIES")


@pytest.mark.asyncio
async def test_undeclared_arr_root_is_saved_but_rejected_when_checked(monkeypatch):
    db = SimpleNamespace(
        get=AsyncMock(return_value=SimpleNamespace(id=1, enabled=True, arr_type="radarr")),
        add=Mock(),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )
    monkeypatch.setattr(
        service,
        "discover_instance_roots",
        AsyncMock(
            return_value={"arr_roots": ["/data/films"], "plex_roots": [{"path": "/media/films", "section_id": "1"}]}
        ),
    )
    body = LocationBody(
        name="DATA1",
        mount_path="/storage/data1",
        mappings=[dict(arr_instance_id=1, arr_root="/data/other", plex_root="/media/films", plex_section_id="1")],
    )
    saved = await save_location(db, body)
    service.discover_instance_roots.assert_not_awaited()
    with pytest.raises(ValueError, match="racine"):
        await service.check_mapping(db, SimpleNamespace(mappings=saved["mappings"]), 0)


@pytest.mark.asyncio
async def test_wrong_plex_library_is_saved_but_rejected_when_checked(monkeypatch):
    db = SimpleNamespace(
        get=AsyncMock(return_value=SimpleNamespace(id=1, enabled=True, arr_type="radarr")),
        add=Mock(),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )
    monkeypatch.setattr(
        service,
        "discover_instance_roots",
        AsyncMock(
            return_value={"arr_roots": ["/data/films"], "plex_roots": [{"path": "/media/films", "section_id": "1"}]}
        ),
    )
    body = LocationBody(
        name="DATA1",
        mount_path="/storage/data1",
        mappings=[dict(arr_instance_id=1, arr_root="/data/films", plex_root="/media/films", plex_section_id="2")],
    )
    saved = await save_location(db, body)
    service.discover_instance_roots.assert_not_awaited()
    with pytest.raises(ValueError, match="racine"):
        await service.check_mapping(db, SimpleNamespace(mappings=saved["mappings"]), 0)


@pytest.mark.asyncio
async def test_same_title_with_wrong_tmdb_is_rejected(monkeypatch):
    monkeypatch.setattr(
        worker,
        "plex_get",
        AsyncMock(return_value={"Metadata": [{"ratingKey": "123", "title": "300", "Guid": [{"id": "tmdb://999"}]}]}),
    )
    with pytest.raises(ValueError, match="TMDB"):
        await worker.confirm_media_identity(None, {"300.mkv": ["123"]}, {"tmdb_id": 1271}, "movie")


@pytest.mark.asyncio
async def test_series_episodes_from_two_shows_are_rejected(monkeypatch):
    monkeypatch.setattr(
        worker,
        "plex_get",
        AsyncMock(return_value={"Metadata": [{"grandparentRatingKey": "10"}, {"grandparentRatingKey": "11"}]}),
    )
    with pytest.raises(ValueError, match="une seule"):
        await worker.confirm_media_identity(
            None, {"s01e01.mkv": ["1"], "s01e02.mkv": ["2"]}, {"tvdb_id": 100}, "series"
        )


@pytest.mark.asyncio
async def test_offline_configuration_is_saved_but_checks_still_fail(monkeypatch):
    db = SimpleNamespace(
        get=AsyncMock(return_value=SimpleNamespace(id=1, enabled=True, arr_type="radarr")),
        add=Mock(),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )
    monkeypatch.setattr(service, "discover_instance_roots", AsyncMock(side_effect=RuntimeError("offline")))
    body = LocationBody(
        name="DATA1",
        mount_path="/storage/data1",
        mappings=[dict(arr_instance_id=1, arr_root="/data/films", plex_root="/media/films", plex_section_id="1")],
    )
    saved = await save_location(db, body)
    service.discover_instance_roots.assert_not_awaited()
    with pytest.raises(RuntimeError, match="offline"):
        await service.check_mapping(db, SimpleNamespace(mappings=saved["mappings"]), 0)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "plex_names,expected_status",
    [({"Film.mkv": ["1"]}, "sample_matched"), ({"Other.mkv": ["1"]}, "mismatch")],
)
async def test_readonly_mapping_comparison(monkeypatch, plex_names, expected_status):
    instance = SimpleNamespace(id=1, enabled=True, arr_type="radarr", plex_server_id=1)
    db = SimpleNamespace(get=AsyncMock(return_value=instance))
    mapping = dict(arr_instance_id=1, arr_root="/data/films", plex_root="/media/films", plex_section_id="1")
    location = SimpleNamespace(mappings=[mapping])
    monkeypatch.setattr(
        service,
        "discover_instance_roots",
        AsyncMock(
            return_value={"arr_roots": ["/data/films"], "plex_roots": [{"path": "/media/films", "section_id": "1"}]}
        ),
    )
    monkeypatch.setattr(service, "connection_for", AsyncMock(return_value=object()))
    request = AsyncMock(
        side_effect=[
            [dict(id=1, path="/data/films/Film", title="Film", tmdbId=100, hasFile=True)],
            [dict(relativePath="Film.mkv")],
        ]
    )
    monkeypatch.setattr(service, "arr_request", request)
    monkeypatch.setattr(worker, "plex_files", AsyncMock(return_value=plex_names))
    identity = AsyncMock()
    monkeypatch.setattr(worker, "confirm_media_identity", identity)
    result = await service.check_mapping(db, location, 0)
    assert result["status"] == expected_status
    assert result["total_titles"] == result["checked_titles"] == 1
    assert all(call.args[1] == "GET" for call in request.call_args_list)
    assert identity.await_count == (1 if expected_status == "sample_matched" else 0)


@pytest.mark.asyncio
async def test_changed_root_blocks_comparison_before_catalog_read(monkeypatch):
    db = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(enabled=True)))
    location = SimpleNamespace(
        mappings=[dict(arr_instance_id=1, arr_root="/old", plex_root="/plex", plex_section_id="1")]
    )
    monkeypatch.setattr(
        service, "discover_instance_roots", AsyncMock(return_value={"arr_roots": ["/new"], "plex_roots": []})
    )
    request = AsyncMock()
    monkeypatch.setattr(service, "arr_request", request)
    with pytest.raises(ValueError, match="racine"):
        await service.check_mapping(db, location, 0)
    request.assert_not_awaited()


@pytest.mark.asyncio
async def test_future_titles_do_not_create_false_mismatches(monkeypatch):
    instance = SimpleNamespace(id=1, enabled=True, arr_type="radarr", plex_server_id=1)
    db = SimpleNamespace(get=AsyncMock(return_value=instance))
    mapping = dict(arr_instance_id=1, arr_root="/data/films", plex_root="/media/films", plex_section_id="1")
    monkeypatch.setattr(
        service,
        "discover_instance_roots",
        AsyncMock(
            return_value={"arr_roots": ["/data/films"], "plex_roots": [{"path": "/media/films", "section_id": "1"}]}
        ),
    )
    monkeypatch.setattr(service, "connection_for", AsyncMock(return_value=object()))
    request = AsyncMock(return_value=[dict(id=1, path="/data/films/Future", title="Future", hasFile=False)])
    monkeypatch.setattr(service, "arr_request", request)
    files = AsyncMock()
    monkeypatch.setattr(worker, "plex_files", files)
    result = await service.check_mapping(db, SimpleNamespace(mappings=[mapping]), 0)
    assert result["status"] == "empty"
    assert result["pending_titles"] == 1
    assert result["checked_titles"] == 0
    files.assert_not_awaited()
    assert request.await_count == 1
