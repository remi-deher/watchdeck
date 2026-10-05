import threading
from pathlib import PurePosixPath
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, Mock

import pytest

from app.storage import access, integrite, remote_agent
from app.storage.peer_fs import PeerFilesystem
from app.storage.remote_fs import RemoteFilesystem


@pytest.mark.asyncio
async def test_preview_pins_both_servers_and_uses_destination_capacity(monkeypatch):
    def endpoint(id, root, path, free):
        return NS(
            id=id,
            method="ssh",
            revision=str(id),
            roots=[dict(arr_instance_id=1, arr_root=root, path=path)],
            validation=dict(revision=str(id), roots=[dict(arr_instance_id=1, arr_root=root, free_bytes=free)]),
        )

    source = endpoint(1, "/data/FILMS", "/media/FILMS", 20)
    destination = endpoint(2, "/usb/FILMS", "/media/FILMS", 100)
    db = NS(get=AsyncMock(side_effect=lambda model, id: {1: source, 2: destination}[id]))
    body = NS(
        access_id=0,
        root_access_ids={"1:/data/FILMS": 1, "1:/usb/FILMS": 2},
        transfer_mode="rsync_ssh",
        arr_instance_id=1,
        source_roots=["/data/FILMS"],
        destination_root="/usb/FILMS",
    )
    monkeypatch.setattr(access, "validate_access", AsyncMock())
    monkeypatch.setattr("app.storage.peer_fs.validate_bridge", Mock())
    monkeypatch.setattr(access, "config_for", AsyncMock(side_effect=lambda db, a: dict(ssh_fingerprint=str(a.id))))
    plan = dict(planned_bytes=50, items=[dict(snapshot=dict(source_arr="/data/FILMS/Film"))])
    preview = AsyncMock(return_value=plan)
    monkeypatch.setattr("app.storage.arr_transfer.preview_arr", preview)
    result = await access.preview_rsync(db, body)
    snap = result["items"][0]["snapshot"]
    assert (snap["source_access_id"], snap["access_id"]) == (1, 2)
    assert (snap["source_access_revision"], snap["access_revision"]) == ("1", "2")
    assert body.access_id == 2
    assert preview.call_args.kwargs["capacity_overrides"] == {"/data/FILMS": 20, "/usb/FILMS": 100}


def test_equal_paths_on_different_servers_are_distinct():
    a = RemoteFilesystem({}, ["/media"], "session")
    b = RemoteFilesystem({}, ["/media"], "session")
    assert a.path("/media/Film") != b.path("/media/Film")


def test_destination_change_blocks_cleanup():
    source = Mock()
    destination = Mock()
    fs = PeerFilesystem(source, destination)
    src, dst = PurePosixPath("/source/Film"), PurePosixPath("/destination/Film")
    fs.inventory = Mock(return_value=["film.mkv"])
    fs.signature = Mock(return_value=["changed"])
    with pytest.raises(ValueError, match="Destination modifiée"):
        fs.remove(src, dst, ["film.mkv"], {"film.mkv": ["expected"]}, {})
    source.call.assert_not_called()


def test_peer_cleanup_checks_source_and_never_removes_root(tmp_path):
    media = tmp_path / "Film"
    media.mkdir()
    file = media / "film.mkv"
    file.write_bytes(b"video")
    body = dict(
        op="remove_peer",
        roots=[str(tmp_path)],
        path=str(media),
        files=["film.mkv"],
        proofs={"film.mkv": {"source": integrite.signature(file)}},
    )
    file.write_bytes(b"changed")
    with pytest.raises(ValueError, match="Source modifiée"):
        remote_agent.dispatch(body, integrite.__dict__, threading.Event())
    assert file.exists()
    body["path"] = str(tmp_path)
    with pytest.raises(ValueError, match="Nettoyage refusé"):
        remote_agent.dispatch(body, integrite.__dict__, threading.Event())


def test_promotion_requires_unchanged_partial(tmp_path):
    partial = tmp_path / "film.mkv.partiel"
    partial.write_bytes(b"copy")
    sig = integrite.signature(partial)
    partial.write_bytes(b"changed")
    body = dict(
        op="promote_peer", roots=[str(tmp_path)], path=str(partial), dst=str(tmp_path / "film.mkv"), signature=sig
    )
    with pytest.raises(ValueError, match="Copie partielle modifiée"):
        remote_agent.dispatch(body, integrite.__dict__, threading.Event())
    assert partial.exists() and not (tmp_path / "film.mkv").exists()
