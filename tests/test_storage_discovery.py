from unittest.mock import AsyncMock

import pytest

from app.storage.discovery import compatible, request_engine, sample_matches, storage_identity


def test_sample_requires_present_files_and_sizes_and_never_traverses(tmp_path):
    video = tmp_path / "Film.mkv"
    video.write_bytes(b"video")
    assert sample_matches(tmp_path, [dict(path="Film.mkv", size=5)])
    assert not sample_matches(tmp_path, [dict(path="Film.mkv", size=6)])
    assert not sample_matches(tmp_path, [dict(path="Missing.mkv", size=5)])
    assert not sample_matches(tmp_path, [])
    for path in ("../Film.mkv", "/Film.mkv", "folder/../../Film.mkv"):
        with pytest.raises(ValueError):
            sample_matches(tmp_path, [dict(path=path, size=5)])


@pytest.mark.parametrize(
    "left,right,expected",
    [
        ("/usb/FILMS", "/usb/MEDIA/FILMS", True),
        ("/data/FILMS", "/usb/MEDIA/FILMS", False),
        ("/usb2/FILMS", "/usb/MEDIA/FILMS", False),
        ("/usb/FILMS", "/usb/MEDIA/FILMS_OLD", False),
        ("/data/FILMS", "/storage/data1/FILMS", True),
        ("/data2/FILMS", "/storage/data1/FILMS", False),
    ],
)
def test_suggestions_preserve_storage_and_full_folder_segments(left, right, expected):
    assert compatible(left, right) is expected


def test_unknown_storage_is_not_guessed():
    assert storage_identity("/archive/FILMS") == "archive"
    assert not compatible("/archive/FILMS", "/storage/usb/FILMS")
    with pytest.raises(ValueError):
        compatible("/usb/../data/FILMS", "/usb/FILMS")


@pytest.mark.asyncio
async def test_engine_response_uses_unique_key_and_closes_connection(monkeypatch):
    client = AsyncMock()
    client.get.return_value = '{"candidates":[],"automatic":null}'
    monkeypatch.setattr("app.storage.discovery.redis_client", lambda: client)
    result = await request_engine({"arr_root": "/usb/FILMS"})
    assert result["automatic"] is None
    assert client.rpush.call_args.args[0] == "storage:discovery:queue"
    client.delete.assert_awaited_once()
    client.aclose.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("status,automatic", [("sample_matched", True), ("empty", False), ("mismatch", False)])
async def test_api_never_auto_confirms_without_arr_plex_identity(monkeypatch, status, automatic):
    from types import SimpleNamespace

    from app.routers import storage_api

    body = storage_api.MappingBody(
        arr_instance_id=1, arr_root="/usb/FILMS", plex_root="/usb/MEDIA/FILMS", plex_section_id="1"
    )
    db = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(arr_type="radarr")))
    monkeypatch.setattr(storage_api.service, "check_mapping", AsyncMock(return_value={"status": status}))
    monkeypatch.setattr(
        storage_api.service,
        "arr_request",
        AsyncMock(
            side_effect=[
                [dict(id=1, path="/usb/FILMS/Film", hasFile=True)],
                [dict(relativePath="Film.mkv", size=5)],
            ]
        ),
    )
    engine = AsyncMock(
        return_value=dict(candidates=[], automatic=dict(mount_path="/storage/usb", subdirectory="FILMS"))
    )
    monkeypatch.setattr("app.storage.discovery.request_engine", engine)
    result = await storage_api.resolve_root(body, db)
    assert bool(result["automatic"]) is automatic
    assert engine.call_args.args[0]["files"] == [dict(path="Film/Film.mkv", size=5)]
