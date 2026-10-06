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
async def test_route_reuses_recent_proof_for_explicit_mapping_and_prefers_it_to_heuristic(monkeypatch):
    saved = NS(
        virtual_key=None,
        mappings=[
            dict(
                arr_instance_id=1,
                arr_root="/data/FILMS",
                plex_root="/usb/MEDIA/FILMS",
                plex_section_id="2",
            )
        ],
    )
    result = NS(scalars=lambda: NS(all=lambda: [saved]))
    db = NS(execute=AsyncMock(return_value=result))
    instance = NS(id=1)
    discovered = {
        "plex_url": "http://plex",
        "plex_server_id": 9,
        "plex_roots": [
            dict(path="/media/FILMS", section_id="1"),
            dict(path="/usb/MEDIA/FILMS", section_id="2"),
        ],
    }
    monkeypatch.setattr(
        arr, "arr_request", AsyncMock(return_value=[dict(path="/data/FILMS", accessible=True, freeSpace=100)])
    )
    monkeypatch.setattr(arr, "check_mapping", AsyncMock())
    from app.storage import mapping_proofs

    monkeypatch.setattr(mapping_proofs, "get", AsyncMock(return_value={"status": "sample_matched"}))
    _, mapping, comparison = await arr.route(db, instance, "/data/FILMS", discovered)
    assert mapping["plex_root"] == "/usb/MEDIA/FILMS"
    assert comparison["status"] == "sample_matched"
    arr.check_mapping.assert_not_awaited()


@pytest.mark.asyncio
async def test_route_does_not_treat_temporary_preview_mapping_as_saved_configuration(monkeypatch):
    temporary = NS(
        virtual_key="2:/data2/FILMS",
        mappings=[dict(arr_instance_id=2, arr_root="/data2/FILMS", plex_root="/media2/FILMS", plex_section_id="3")],
    )
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: [temporary]))))
    monkeypatch.setattr(
        arr,
        "arr_request",
        AsyncMock(return_value=[dict(path="/data2/FILMS", accessible=True, freeSpace=100)]),
    )
    with pytest.raises(ValueError, match="enregistrez-la dans Stockages"):
        await arr.route(db, NS(id=2), "/data2/FILMS", {"plex_roots": [dict(path="/media2/FILMS", section_id="3")]})


@pytest.mark.asyncio
async def test_route_accepts_saved_data2_association(monkeypatch):
    saved = NS(
        virtual_key=None,
        mappings=[dict(arr_instance_id=2, arr_root="/data2/FILMS", plex_root="/media2/FILMS", plex_section_id="3")],
    )
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: [saved]))))
    instance = NS(id=2)
    discovered = {
        "plex_url": "http://plex",
        "plex_server_id": 9,
        "plex_roots": [dict(path="/media2/FILMS", section_id="3")],
    }
    monkeypatch.setattr(
        arr,
        "arr_request",
        AsyncMock(return_value=[dict(path="/data2/FILMS", accessible=True, freeSpace=100)]),
    )
    from app.storage import mapping_proofs

    monkeypatch.setattr(mapping_proofs, "get", AsyncMock(return_value={"status": "sample_matched"}))
    monkeypatch.setattr(arr, "check_mapping", AsyncMock())
    _, mapping, _ = await arr.route(db, instance, "/data2/FILMS", discovered)
    assert mapping["plex_root"] == "/media2/FILMS"
    arr.check_mapping.assert_not_awaited()


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
        arr_instance_id=1,
        arr_id=2,
        title="Film",
        media_type="movie",
        snapshot=snap,
        size_bytes=5,
        status="pending",
        progress={},
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

    discovery = AsyncMock(side_effect=AssertionError("un scan Plex complet ne doit pas être relancé par titre"))
    monkeypatch.setattr(arr, "discover_instance_roots", discovery)
    monkeypatch.setattr(arr, "connection_for", AsyncMock(return_value=NS()))
    for name in ("confirm_media_identity", "no_arr_download", "plex_get"):
        monkeypatch.setattr(worker, name, AsyncMock())
    monkeypatch.setattr(worker, "is_playing", AsyncMock(return_value=False))
    monkeypatch.setattr(worker, "plex_files", AsyncMock(return_value={"Film.mkv": ["42"]}))
    update = AsyncMock()
    monkeypatch.setattr(worker, "update_item", update)
    await arr.process_arr(db, NS(), item, threading.Event())
    discovery.assert_not_awaited()
    posts = [call for call in request.call_args_list if call.args[1] == "POST"]
    assert len(posts) == 1
    assert posts[0].args[3] == dict(
        name="BulkMoveMovie",
        destinationRootFolder="/usb/FILMS",
        movies=[dict(movieId=2, sourcePath="/data/FILMS/Film")],
    )
    assert any(call.kwargs.get("snapshot", {}).get("arr_command_id") == 123 for call in update.call_args_list)
    assert update.call_args.args[2] == "plex_pending"
    assert all(call.args[2] != "rootfolder" for call in request.await_args_list)


@pytest.mark.asyncio
async def test_lot_preflight_refuses_mapping_changed_after_preview(monkeypatch):
    db = NS(
        get=AsyncMock(return_value=NS(id=1, enabled=True, plex_server_id=1)),
        execute=AsyncMock(
            return_value=NS(
                scalars=lambda: NS(
                    all=lambda: [
                        NS(
                            virtual_key=None,
                            mappings=[
                                dict(
                                    arr_instance_id=1,
                                    arr_root="/data/FILMS",
                                    plex_root="/media/FILMS",
                                    plex_section_id="1",
                                ),
                                dict(
                                    arr_instance_id=1,
                                    arr_root="/usb/FILMS",
                                    plex_root="/usb/CHANGED",
                                    plex_section_id="1",
                                ),
                            ],
                        )
                    ]
                )
            )
        ),
    )
    snap = dict(
        source_arr="/data/FILMS/Film",
        destination_arr="/usb/FILMS/Film",
        destination_root="/usb/FILMS",
        source_plex="/media/FILMS/Film",
        destination_plex="/usb/MEDIA/FILMS/Film",
        plex_section_id="1",
    )
    item = NS(arr_instance_id=1, arr_id=2, media_type="movie", snapshot=snap, size_bytes=5)

    request = AsyncMock()
    monkeypatch.setattr(arr, "arr_request", request)
    with pytest.raises(ValueError, match="correspondance Arr/Plex du lot"):
        await worker.validate_transfer_roots(db, NS(params={"transfer_mode": "rsync_ssh"}), [item])
    request.assert_not_awaited()


@pytest.mark.asyncio
async def test_lot_preflight_reads_arr_roots_once_per_instance_for_multiple_titles(monkeypatch):
    instance = NS(id=1, enabled=True, plex_server_id=1)
    mappings = [
        dict(arr_instance_id=1, arr_root="/data/FILMS", plex_root="/media/FILMS", plex_section_id="1"),
        dict(arr_instance_id=1, arr_root="/usb/FILMS", plex_root="/usb/MEDIA/FILMS", plex_section_id="1"),
    ]
    location = NS(virtual_key=None, mappings=mappings)
    db = NS(
        get=AsyncMock(return_value=instance),
        execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: [location]))),
    )
    snapshot = dict(
        source_arr="/data/FILMS/Film",
        destination_arr="/usb/FILMS/Film",
        source_plex="/media/FILMS/Film",
        destination_plex="/usb/MEDIA/FILMS/Film",
        plex_section_id="1",
    )
    items = [NS(arr_instance_id=1, snapshot=snapshot, size_bytes=5) for _ in range(2)]
    request = AsyncMock(
        return_value=[
            dict(path="/data/FILMS", accessible=True, freeSpace=100),
            dict(path="/usb/FILMS", accessible=True, freeSpace=100),
        ]
    )
    monkeypatch.setattr(worker, "arr_request", request)

    await worker.validate_transfer_roots(db, NS(params={"transfer_mode": "rsync_ssh"}), items)

    request.assert_awaited_once_with(instance, "GET", "rootfolder")


@pytest.mark.asyncio
async def test_item_preflight_checks_saved_mapping_without_discovering_or_resampling(monkeypatch):
    mappings = [
        dict(arr_instance_id=1, arr_root="/data/FILMS", plex_root="/media/FILMS", plex_section_id="1"),
        dict(arr_instance_id=1, arr_root="/usb/FILMS", plex_root="/usb/MEDIA/FILMS", plex_section_id="1"),
    ]
    location = NS(virtual_key=None, mappings=mappings)
    db = NS(execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: [location]))))
    assert await arr.snapshot_mapping_matches(db, NS(id=1), "/data/FILMS", "/media/FILMS", "1")
    assert not await arr.snapshot_mapping_matches(db, NS(id=1), "/data/FILMS", "/media2/FILMS", "1")


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

    async def configured(_db, _instance, root):
        if root == "/usb/FILMS":
            return destination, {**mapping, "plex_root": "/usb/MEDIA/FILMS"}, NS(id=2)
        return source, mapping, NS(id=1)

    monkeypatch.setattr(arr, "configured_route", configured)
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
async def test_arr_preview_uses_saved_roots_without_live_root_discovery(monkeypatch):
    from app.routers.storage_api import PreviewBody

    db = NS(
        get=AsyncMock(return_value=NS(id=1, enabled=True, arr_type="radarr")),
        execute=AsyncMock(
            side_effect=[NS(all=lambda: []), NS(scalar=lambda: 0), NS(scalars=lambda: NS(all=lambda: []))]
        ),
    )
    mapping = dict(plex_section_id="1", plex_root="/media/FILMS")

    async def configured(_db, _instance, root):
        return (
            dict(freeSpace=None),
            {**mapping, "plex_root": mapping["plex_root"] if root == "/data/FILMS" else "/usb/FILMS"},
            NS(id=1 if root == "/data/FILMS" else 2),
        )

    monkeypatch.setattr(arr, "configured_route", configured)
    monkeypatch.setattr(arr, "location_json", lambda location: dict(id=location.id))
    inventory = AsyncMock(return_value=[])
    monkeypatch.setattr(arr, "arr_request", inventory)
    result = await arr.preview_arr(
        db, PreviewBody(arr_instance_id=1, source_root="/data/FILMS", destination_root="/usb/FILMS")
    )
    assert result["items"] == []
    assert inventory.await_args.args[2] == "movie"
    assert all(call.args[2] != "rootfolder" for call in inventory.await_args_list)


def test_new_transfer_schema_rejects_rsync():
    from pydantic import ValidationError

    from app.routers.storage_api import PreviewBody

    with pytest.raises(ValidationError):
        PreviewBody(transfer_mode="rsync", source_id=1, destination_id=2)
    assert PreviewBody().transfer_mode == "arr"


@pytest.mark.asyncio
async def test_arr_preparation_reuses_saved_association_instead_of_duplicate_capacity_card(monkeypatch):
    location = NS(id=7, mappings=[dict(arr_instance_id=1, arr_root="/data/FILMS")])
    db = NS(get=AsyncMock(return_value=location))

    class Registry:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def scalar(self, _statement):
            return location.id

        async def commit(self):
            return None

    monkeypatch.setattr(arr, "AsyncSessionLocal", Registry)
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

    async def configured(db, instance, root):
        location_id = {"/data/FILMS": 1, "/data2/FILMS": 2, "/usb/FILMS": 3}[root]
        return (
            {"freeSpace": 10_000_000_000 if root.startswith("/usb") else 0},
            {"plex_section_id": "1", "plex_root": root},
            NS(id=location_id),
        )

    monkeypatch.setattr(arr, "configured_route", configured)
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
