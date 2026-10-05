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


@pytest.mark.asyncio
async def test_discovery_worker_ignores_expired_requests_and_recovers_from_bad_payload(monkeypatch):
    import asyncio
    import json

    from app.storage import discovery

    client = AsyncMock()
    client.lpop.side_effect = [
        json.dumps(dict(key="expired", expires=0, body={})),
        "invalid json",
        json.dumps(dict(key="valid", expires=10**12, body={"arr_root": "/usb/FILMS"})),
        None,
    ]
    result = {"candidates": [], "automatic": None}
    inspector = __import__("unittest.mock", fromlist=["Mock"]).Mock(return_value=result)
    monkeypatch.setattr(discovery, "redis_client", lambda: client)
    monkeypatch.setattr(discovery, "inspect_request", inspector)

    async def stop_when_idle(delay):
        if delay == 0.25:
            raise asyncio.CancelledError

    monkeypatch.setattr(discovery.asyncio, "sleep", stop_when_idle)
    with pytest.raises(asyncio.CancelledError):
        await discovery.serve_discovery()
    inspector.assert_called_once_with({"arr_root": "/usb/FILMS"})
    client.set.assert_awaited_once_with("valid", json.dumps(result), ex=30)
    client.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_engine_timeout_closes_connection_without_accepting_missing_proof(monkeypatch):
    from app.storage import discovery

    client = AsyncMock()
    client.get.return_value = None
    monkeypatch.setattr(discovery, "redis_client", lambda: client)
    monkeypatch.setattr(discovery.asyncio, "sleep", AsyncMock())
    with pytest.raises(ValueError, match="indisponible"):
        await discovery.request_engine({"arr_root": "/usb/FILMS"})
    assert client.get.await_count == 80
    client.delete.assert_not_awaited()
    client.aclose.assert_awaited_once()


@pytest.mark.parametrize("matches,expected", [(True, True), (False, False)])
def test_mount_discovery_requires_file_proof_before_automatic_selection(tmp_path, monkeypatch, matches, expected):
    from pathlib import Path

    from app.storage import discovery

    base = tmp_path / "usb"
    folder = base / "MEDIA" / "FILMS"
    folder.mkdir(parents=True)
    original_read = Path.read_text

    def read_mountinfo(path, *args, **kwargs):
        if str(path) == str(Path("/proc/self/mountinfo")):
            return "1 2 0:1 / /storage/usb rw\n2 2 0:1 / /unrelated rw"
        return original_read(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", read_mountinfo)
    monkeypatch.setattr("app.storage.worker.mounted_root", lambda mount: base)
    monkeypatch.setattr(discovery, "compatible", lambda left, right: True)
    monkeypatch.setattr(discovery, "sample_matches", lambda path, files: matches)
    result = discovery.inspect_request({"arr_root": "/usb/FILMS", "plex_root": "/usb/MEDIA/FILMS"})
    assert len(result["candidates"]) == 1
    candidate = result["candidates"][0]
    assert candidate["mount_path"] == "/storage/usb"
    assert Path(candidate["subdirectory"]).parts == ("MEDIA", "FILMS")
    assert candidate["matched"] is matches
    assert bool(result["automatic"]) is expected
