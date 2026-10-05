import threading
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest

from app.storage import arr_transfer as arr
from app.storage import worker


@pytest.mark.asyncio
async def test_route_refuses_inaccessible_roots_even_when_declared(monkeypatch):
    monkeypatch.setattr(
        arr, "arr_request", AsyncMock(return_value=[dict(path="/usb/FILMS", accessible=False, freeSpace=100)])
    )
    with pytest.raises(ValueError, match="accessible"):
        await arr.route(NS(), NS(id=1), "/usb/FILMS", dict(plex_roots=[]))


@pytest.mark.asyncio
async def test_route_accepts_empty_destination_only_after_access_and_plex_mapping_checks(monkeypatch):
    monkeypatch.setattr(
        arr, "arr_request", AsyncMock(return_value=[dict(path="/usb/FILMS", accessible=True, freeSpace=100)])
    )
    monkeypatch.setattr(arr, "check_mapping", AsyncMock(return_value=dict(status="empty")))
    _, mapping, _ = await arr.route(
        NS(), NS(id=1), "/usb/FILMS", dict(plex_roots=[dict(path="/usb/MEDIA/FILMS", section_id="1")])
    )
    assert mapping["plex_root"] == "/usb/MEDIA/FILMS"


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["movie", "series"])
async def test_resume_tracks_existing_arr_command_without_submitting_again(monkeypatch, kind):
    db = NS(get=AsyncMock(return_value=NS(enabled=True, plex_server_id=1)))
    snap = dict(
        arr_command_id=123,
        destination_arr="/usb/FILMS/Film",
        destination_plex="/usb/MEDIA/FILMS/Film",
        plex_section_id="1",
        original_plex={"Film.mkv": ["42"]},
    )
    item = NS(arr_instance_id=1, arr_id=2, media_type=kind, snapshot=snap)
    request = AsyncMock(side_effect=[dict(status="completed"), dict(path=snap["destination_arr"])])
    monkeypatch.setattr(arr, "arr_request", request)
    monkeypatch.setattr(arr, "connection_for", AsyncMock(return_value=NS()))
    monkeypatch.setattr(worker, "plex_get", AsyncMock())
    monkeypatch.setattr(worker, "plex_files", AsyncMock(return_value=snap["original_plex"]))
    monkeypatch.setattr(worker, "confirm_media_identity", AsyncMock())
    update = AsyncMock()
    monkeypatch.setattr(worker, "update_item", update)
    await arr.process_arr(db, NS(), item, threading.Event())
    assert all(call.args[1] == "GET" for call in request.call_args_list)
    assert request.call_args_list[0].args[2] == "command/123"
    assert update.call_args.args[2] == "plex_pending"
    worker.plex_get.assert_not_awaited()


@pytest.mark.asyncio
async def test_uncertain_submission_never_reissues_a_move(monkeypatch):
    db = NS(get=AsyncMock(return_value=NS(enabled=True, plex_server_id=1)))
    item = NS(arr_instance_id=1, media_type="movie", snapshot=dict(arr_submission_intent=True))
    request = AsyncMock()
    monkeypatch.setattr(arr, "arr_request", request)
    monkeypatch.setattr(arr, "connection_for", AsyncMock(return_value=NS()))
    with pytest.raises(ValueError, match="incertain"):
        await arr.process_arr(db, NS(), item, threading.Event())
    request.assert_not_awaited()


@pytest.mark.asyncio
async def test_fresh_move_submits_one_bulk_command_and_persists_its_id(monkeypatch):
    db = NS(get=AsyncMock(return_value=NS(id=1, enabled=True, plex_server_id=1)))
    snap = dict(
        source_arr="/data/FILMS/Film",
        destination_arr="/usb/FILMS/Film",
        destination_root="/usb/FILMS",
        source_plex="/media/FILMS/Film",
        destination_plex="/usb/MEDIA/FILMS/Film",
        plex_section_id="1",
    )
    item = NS(
        arr_instance_id=1, arr_id=2, media_type="movie", snapshot=snap, size_bytes=5, status="pending", progress={}
    )
    request = AsyncMock(
        side_effect=[
            dict(path=snap["source_arr"]),
            dict(id=123),
            dict(status="completed"),
            dict(path=snap["destination_arr"]),
        ]
    )
    monkeypatch.setattr(arr, "arr_request", request)
    monkeypatch.setattr(arr, "route", AsyncMock(return_value=({"freeSpace": 100}, {}, {})))
    monkeypatch.setattr(arr, "discover_instance_roots", AsyncMock(return_value={}))
    monkeypatch.setattr(arr, "connection_for", AsyncMock(return_value=NS()))
    for name in ("confirm_media_identity", "no_arr_download", "plex_get"):
        monkeypatch.setattr(worker, name, AsyncMock())
    monkeypatch.setattr(worker, "is_playing", AsyncMock(return_value=False))
    monkeypatch.setattr(worker, "plex_files", AsyncMock(return_value={"Film.mkv": ["42"]}))
    update = AsyncMock()
    monkeypatch.setattr(worker, "update_item", update)
    await arr.process_arr(db, NS(), item, threading.Event())
    posts = [call for call in request.call_args_list if call.args[1] == "POST"]
    assert len(posts) == 1
    assert posts[0].args[3] == dict(
        name="BulkMoveMovie",
        destinationRootFolder="/usb/FILMS",
        movies=[dict(movieId=2, sourcePath="/data/FILMS/Film")],
    )
    assert any(call.kwargs.get("snapshot", {}).get("arr_command_id") == 123 for call in update.call_args_list)
    assert update.call_args.args[2] == "plex_pending"


@pytest.mark.asyncio
async def test_arr_preview_filters_occupied_titles_and_reserves_destination_space(monkeypatch):
    from app.routers.storage_api import PreviewBody

    instance = NS(id=1, enabled=True, arr_type="radarr")
    db = NS(
        get=AsyncMock(return_value=instance),
        execute=AsyncMock(
            side_effect=[
                NS(all=lambda: [(1, 2)]),
                NS(scalar=lambda: 2_000_000_000),
                NS(scalars=lambda: NS(all=lambda: [])),
            ]
        ),
    )
    source = dict(freeSpace=1_000_000_000)
    destination = dict(freeSpace=5_000_000_000)
    mapping = dict(plex_section_id="1", plex_root="/media/FILMS")
    monkeypatch.setattr(arr, "discover_instance_roots", AsyncMock(return_value={}))
    monkeypatch.setattr(
        arr,
        "route",
        AsyncMock(
            side_effect=[
                (destination, {**mapping, "plex_root": "/usb/MEDIA/FILMS"}, dict(status="empty")),
                (source, mapping, dict(status="sample_matched")),
            ]
        ),
    )
    monkeypatch.setattr(arr, "virtual_location", AsyncMock(side_effect=[NS(id=1), NS(id=2)]))
    monkeypatch.setattr(arr, "location_json", lambda location: dict(id=location.id))
    monkeypatch.setattr(
        arr,
        "arr_request",
        AsyncMock(
            return_value=[
                dict(id=1, path="/data/FILMS/Film", title="Film", sizeOnDisk=3_000_000_000),
                dict(id=2, path="/data/FILMS/Occupied", title="Occupied", sizeOnDisk=1_000_000_000),
                dict(id=3, path="/data2/FILMS/Other", title="Other", sizeOnDisk=1_000_000_000),
            ]
        ),
    )
    body = PreviewBody(arr_instance_id=1, source_root="/data/FILMS", destination_root="/usb/FILMS", goal_gb=1)
    result = await arr.preview_arr(db, body)
    assert [item["title"] for item in result["items"]] == ["Film"]
    assert result["planned_bytes"] == 3_000_000_000
    assert "source_mount" not in result["items"][0]["snapshot"]


@pytest.mark.asyncio
async def test_arr_preview_refuses_empty_source_before_planning(monkeypatch):
    from app.routers.storage_api import PreviewBody

    db = NS(get=AsyncMock(return_value=NS(id=1, enabled=True, arr_type="radarr")))
    mapping = dict(plex_section_id="1")
    monkeypatch.setattr(arr, "discover_instance_roots", AsyncMock(return_value={}))
    monkeypatch.setattr(arr, "route", AsyncMock(return_value=({}, mapping, dict(status="empty"))))
    with pytest.raises(ValueError, match="Aucun fichier source"):
        await arr.preview_arr(
            db, PreviewBody(arr_instance_id=1, source_root="/data/FILMS", destination_root="/usb/FILMS")
        )


def test_new_transfer_schema_rejects_rsync():
    from pydantic import ValidationError

    from app.routers.storage_api import PreviewBody

    with pytest.raises(ValidationError):
        PreviewBody(transfer_mode="rsync", source_id=1, destination_id=2)
    assert PreviewBody().transfer_mode == "arr"


@pytest.mark.asyncio
async def test_arr_preparation_reuses_saved_association_instead_of_duplicate_capacity_card():
    location = NS(id=7, mappings=[dict(arr_instance_id=1, arr_root="/data/FILMS")])
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: [location]))))
    result = await arr.virtual_location(
        db,
        NS(id=1),
        "/data/FILMS",
        dict(freeSpace=100),
        dict(arr_instance_id=1, arr_root="/data/FILMS", plex_root="/media/FILMS"),
    )
    assert result is location
    assert result.health == "arr_verified"
    assert result.free_bytes == 100


@pytest.mark.asyncio
@pytest.mark.parametrize("mode,expected", [("release_space", 1), ("minimum_free", 2), ("custom", 2)])
async def test_multiple_sources_share_title_and_capacity_limits(monkeypatch, mode, expected):
    from app.routers.storage_api import PreviewBody

    instance = NS(id=1, enabled=True, arr_type="radarr")
    db = NS(
        get=AsyncMock(return_value=instance),
        execute=AsyncMock(
            side_effect=[NS(all=lambda: []), NS(scalar=lambda: 0), NS(scalars=lambda: NS(all=lambda: []))]
        ),
    )
    monkeypatch.setattr(arr, "discover_instance_roots", AsyncMock(return_value={}))

    async def route(db, instance, root, discovered):
        return (
            {"freeSpace": 10_000_000_000 if root.startswith("/usb") else 0},
            {"plex_section_id": "1", "plex_root": root},
            {"status": "sample_matched"},
        )

    monkeypatch.setattr(arr, "route", route)
    monkeypatch.setattr(arr, "virtual_location", AsyncMock(side_effect=[NS(id=1), NS(id=2), NS(id=3)]))
    monkeypatch.setattr(arr, "location_json", lambda location: dict(id=location.id))
    monkeypatch.setattr(
        arr,
        "arr_request",
        AsyncMock(
            return_value=[
                dict(id=1, path="/data/FILMS/A", title="A", sizeOnDisk=2_000_000_000),
                dict(id=2, path="/data2/FILMS/B", title="B", sizeOnDisk=2_000_000_000),
            ]
        ),
    )
    result = await arr.preview_arr(
        db,
        PreviewBody(
            arr_instance_id=1,
            source_roots=["/data/FILMS", "/data2/FILMS"],
            destination_root="/usb/FILMS",
            goal_gb=1,
            max_titles=2,
            mode="release_space" if mode == "custom" else mode,
            root_goals={"/data/FILMS": 1, "/data2/FILMS": 1} if mode == "custom" else {},
        ),
    )
    assert len(result["items"]) == expected
    assert len(result["sources"]) == 2
    assert len({item["key"] for item in result["items"]}) == expected
    assert result["remaining_capacity_bytes"] == 10_000_000_000 - expected * 2_000_000_000
