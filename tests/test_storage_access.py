import json
import threading
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, Mock

import pytest

from app.models import StorageAccess
from app.routers.storage_access_api import AccessBody, save_access
from app.storage import access, remote_agent, remote_fs


def profile(**changes):
    values = dict(
        id=1,
        name="NAS",
        method="ssh",
        revision="rev",
        connection=dict(host="nas", user="media", fingerprint="SHA256:pinned", auth="key"),
        credentials=json.dumps(dict(private_key="secret")),
        roots=[
            dict(arr_instance_id=1, arr_root="/data/FILMS", path="/mnt/data/FILMS"),
            dict(arr_instance_id=1, arr_root="/usb/FILMS", path="/mnt/usb/FILMS"),
        ],
        validation=dict(
            revision="rev",
            roots=[dict(path="/mnt/data/FILMS", identity=[1, 2]), dict(path="/mnt/usb/FILMS", identity=[3, 4])],
        ),
    )
    return NS(**(values | changes))


def test_credentials_never_exposed_in_json():
    result = access.access_json(profile())
    assert result["has_credentials"]
    assert "secret" not in json.dumps(result)
    assert access.ssh_config(profile())["ssh_private_key"] == "secret"


@pytest.mark.asyncio
async def test_save_preserves_credentials_and_invalidates_proof():
    existing = profile()
    db = NS(execute=AsyncMock(return_value=NS(first=lambda: None)), add=Mock(), commit=AsyncMock(), refresh=AsyncMock())
    body = AccessBody(
        name="NAS",
        method="ssh",
        connection=dict(host="nas", user="media", fingerprint="SHA256:pinned"),
        roots=existing.roots,
    )
    result = await save_access(body, db, existing)
    assert result["validation"] == {}
    assert existing.revision != "rev"
    assert json.loads(existing.credentials)["private_key"] == "secret"


@pytest.mark.asyncio
async def test_active_task_prevents_endpoint_change():
    from fastapi import HTTPException

    db = NS(execute=AsyncMock(return_value=NS(first=lambda: (7,))))
    body = AccessBody(
        name="NAS", method="local", roots=[dict(arr_instance_id=1, arr_root="/data/FILMS", path="/storage/data1/FILMS")]
    )
    with pytest.raises(HTTPException) as exc:
        await save_access(body, db, profile())
    assert exc.value.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/", "/etc", "/storage/../etc"])
async def test_local_paths_cannot_escape_mounts(path):
    from fastapi import HTTPException

    db = NS(execute=AsyncMock())
    body = AccessBody(name="Local", method="local", roots=[dict(arr_instance_id=1, arr_root="/data/FILMS", path=path)])
    with pytest.raises(HTTPException):
        await save_access(body, db)


@pytest.mark.asyncio
async def test_worker_rejects_stale_configuration_and_preserves_execution_method():
    endpoint = profile()
    endpoint.roots.append(dict(arr_instance_id=2, arr_root="/data/SERIES", path="/offline/SERIES"))
    db = NS(get=AsyncMock(return_value=endpoint))
    job = NS(params=dict(transfer_mode="rsync_ssh", arr_instance_id=1))
    snap = dict(access_id=1, access_revision="old")
    with pytest.raises(ValueError, match="modifié"):
        await access.filesystem_for(db, job, snap)
    snap.update(
        access_revision="rev",
        source_arr="/data/FILMS/Film",
        destination_arr="/usb/FILMS/Film",
        source_mount="/mnt/data/FILMS",
        destination_mount="/mnt/usb/FILMS",
    )
    fs = await access.filesystem_for(db, job, snap)
    assert isinstance(fs, remote_fs.RemoteFilesystem)
    assert fs.identities["/mnt/usb/FILMS"] == [3, 4]
    assert fs.roots == ["/mnt/data/FILMS", "/mnt/usb/FILMS"]
    source_proof = endpoint.validation["roots"].pop(0)
    with pytest.raises(ValueError, match="Racine .* non validée"):
        await access.filesystem_for(db, job, snap)
    endpoint.validation["roots"].insert(0, source_proof)
    endpoint.method = "local"
    with pytest.raises(ValueError, match="non validé"):
        await access.filesystem_for(db, job, snap)


@pytest.mark.asyncio
async def test_preview_requires_validated_endpoint_before_any_media_operation():
    body = NS(access_id=1, transfer_mode="rsync_ssh")
    for endpoint in (None, profile(method="local"), profile(validation={})):
        db = NS(get=AsyncMock(return_value=endpoint))
        with pytest.raises(ValueError):
            await access.preview_rsync(db, body)


def test_remote_paths_refuse_traversal_and_symlinks(tmp_path):
    root = tmp_path / "media"
    root.mkdir()
    assert remote_agent.checked(str(root / "Film"), [str(root)]) == root / "Film"
    for path in (str(tmp_path / "elsewhere"), str(root / ".." / "escape"), "/"):
        with pytest.raises(ValueError):
            remote_agent.checked(path, [str(root)])


def test_remote_validation_checks_sample_and_real_write(tmp_path, monkeypatch):
    monkeypatch.setattr(remote_agent.shutil, "which", lambda _: "/usr/bin/rsync")
    monkeypatch.setattr(remote_agent.subprocess, "check_output", lambda *a, **kw: "rsync 3.2 xxh128")
    video = tmp_path / "Film.mkv"
    video.write_bytes(b"video")
    result = remote_agent.validate_root(str(tmp_path), [dict(path="Film.mkv", size=5)])
    assert result["sampled_files"] == 1
    assert result["free_bytes"] > 0
    assert not list(tmp_path.glob(".watchdeck-check-*"))
    with pytest.raises(ValueError, match="différents"):
        remote_agent.validate_root(str(tmp_path), [dict(path="Film.mkv", size=7)])
    monkeypatch.setattr(remote_agent.shutil, "which", lambda _: None)
    with pytest.raises(ValueError, match="rsync absent"):
        remote_agent.validate_root(str(tmp_path), [])


def test_remote_cleanup_refuses_replaced_destination_and_root_deletion(tmp_path):
    from app.storage.integrite import signature

    src, dst = tmp_path / "source", tmp_path / "destination"
    src.mkdir()
    dst.mkdir()
    (src / "Film.mkv").write_bytes(b"original")
    (dst / "Film.mkv").write_bytes(b"original")
    proof = signature(str(dst / "Film.mkv"))
    body = dict(
        op="remove",
        roots=[str(src), str(dst)],
        src=str(src),
        dst=str(dst),
        files=["Film.mkv"],
        signatures={"Film.mkv": proof},
    )
    with pytest.raises(ValueError, match="racine"):
        remote_agent.dispatch(body, {"signature": signature}, threading.Event())
    source = src / "Film"
    destination = dst / "Film"
    source.mkdir()
    destination.mkdir()
    (source / "Film.mkv").write_bytes(b"original")
    (destination / "Film.mkv").write_bytes(b"original")
    body.update(
        src=str(source), dst=str(destination), signatures={"Film.mkv": signature(str(destination / "Film.mkv"))}
    )
    (destination / "Film.mkv").write_bytes(b"changed")
    with pytest.raises(ValueError, match="modifiée"):
        remote_agent.dispatch(body, {"signature": signature}, threading.Event())
    assert (source / "Film.mkv").read_bytes() == b"original"
    body["signatures"] = {"Film.mkv": signature(str(destination / "Film.mkv"))}
    body["proofs"] = {"Film.mkv": {"source": signature(str(source / "Film.mkv"))}}
    (source / "Film.mkv").write_bytes(b"new original")
    with pytest.raises(ValueError, match="Source modifiée"):
        remote_agent.dispatch(body, {"signature": signature}, threading.Event())
    assert source.exists()
    body["proofs"] = {"Film.mkv": {"source": signature(str(source / "Film.mkv"))}}
    assert remote_agent.dispatch(body, {"signature": signature}, threading.Event())
    assert not source.exists()
    assert destination.exists()


def test_remote_execution_streams_progress_and_never_falls_back(monkeypatch):
    channel = Mock()
    channel.recv_ready.side_effect = [True]
    channel.recv.return_value = b'{"delta":12}\n{"phase":"verification"}\n{"result":{"ok":true}}\n'
    client = Mock()
    client.get_transport.return_value.open_session.return_value = channel
    monkeypatch.setattr(remote_fs, "connecter", lambda _: client)
    advance, phase = Mock(), Mock()
    assert remote_fs.remote_call({}, dict(op="copy", roots=[]), advance=advance, phase=phase) == {"ok": True}
    advance.assert_called_once_with(12)
    phase.assert_called_once_with("verification")
    channel.close.assert_called_once()
    client.close.assert_called_once()


def test_ssh_pause_closes_session_and_signals_remote_stop(monkeypatch):
    from app.storage.integrite import Interrompu

    client, channel = Mock(), Mock()
    client.get_transport.return_value.open_session.return_value = channel
    monkeypatch.setattr(remote_fs, "connecter", lambda _: client)
    stop = threading.Event()
    stop.set()
    with pytest.raises(Interrompu):
        remote_fs.remote_call({}, dict(op="copy", roots=[]), stop=stop)
    assert channel.sendall.call_args.args == (b"stop\n",)
    client.close.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["ssh", "local"])
async def test_validation_checks_arr_plex_and_physical_paths_without_committing_plan_lock(monkeypatch, method):
    endpoint = profile(method=method)
    db = NS(get=AsyncMock(return_value=NS(id=1, enabled=True)), flush=AsyncMock(), commit=AsyncMock())
    monkeypatch.setattr("app.storage.service.discover_instance_roots", AsyncMock(return_value={}))
    route = AsyncMock()
    monkeypatch.setattr("app.storage.arr_transfer.route", route)
    monkeypatch.setattr(access, "samples_for", AsyncMock(side_effect=[[dict(path="Film.mkv", size=5)], []]))
    result = dict(identity=[1, 2], free_bytes=1000, total_bytes=2000, sampled_files=1)
    ssh = Mock(return_value=result)
    engine = AsyncMock(return_value=result)
    monkeypatch.setattr(remote_fs, "remote_call", ssh)
    monkeypatch.setattr("app.storage.discovery.request_engine", engine)
    output = await access.validate_access(db, endpoint)
    assert output["validation"]["revision"] == "rev"
    assert output["validation"]["roots"][0]["warning"] == ""
    assert "Aucun média" in output["validation"]["roots"][1]["warning"]
    assert route.await_count == 2
    assert (ssh.call_count if method == "ssh" else engine.await_count) == 2
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_rsync_preview_keeps_planning_and_annotates_only_validated_paths(monkeypatch):
    from app.utils import now_utc_naive

    endpoint = profile(
        validation=dict(
            revision="rev",
            checked_at=now_utc_naive().isoformat(),
            roots=[
                dict(arr_instance_id=1, arr_root="/usb/FILMS", free_bytes=100),
                dict(arr_instance_id=1, arr_root="/data/FILMS", free_bytes=20),
            ],
        )
    )
    db = NS(get=AsyncMock(return_value=endpoint))
    body = NS(
        access_id=1,
        transfer_mode="rsync_ssh",
        arr_instance_id=1,
        source_roots=["/data/FILMS"],
        destination_root="/usb/FILMS",
    )
    plan = dict(planned_bytes=50, items=[dict(snapshot=dict(source_arr="/data/FILMS/Film"))])
    recheck = AsyncMock()
    monkeypatch.setattr(access, "validate_access", recheck)
    monkeypatch.setattr("app.storage.arr_transfer.preview_arr", AsyncMock(return_value=plan))
    output = await access.preview_rsync(db, body)
    assert output["items"][0]["snapshot"] == dict(
        source_arr="/data/FILMS/Film",
        source_mount="/mnt/data/FILMS",
        destination_mount="/mnt/usb/FILMS",
        relative="Film",
        access_id=1,
        access_revision="rev",
    )
    assert "secret" not in json.dumps(output)
    recheck.assert_not_awaited()
    plan["planned_bytes"] = 101
    with pytest.raises(ValueError, match="insuffisant"):
        await access.preview_rsync(db, body)
    body.source_roots = ["/unknown/FILMS"]
    with pytest.raises(ValueError, match="chacune"):
        await access.preview_rsync(db, body)


@pytest.mark.asyncio
async def test_recent_file_access_validation_is_reused_but_stale_proof_expires():
    from datetime import timedelta

    from app.utils import now_utc_naive

    endpoint = profile(
        validation=dict(
            revision="rev",
            checked_at=now_utc_naive().isoformat(),
            roots=[
                dict(arr_instance_id=1, arr_root="/data/FILMS", free_bytes=20),
                dict(arr_instance_id=1, arr_root="/usb/FILMS", free_bytes=100),
            ],
        )
    )
    db = NS(get=AsyncMock())
    roots = {(1, "/data/FILMS"), (1, "/usb/FILMS")}
    assert await access.validation_is_fresh(db, endpoint, roots)
    endpoint.validation["checked_at"] = (now_utc_naive() - timedelta(minutes=16)).isoformat()
    assert not await access.validation_is_fresh(db, endpoint, roots)
    endpoint.validation["checked_at"] = now_utc_naive().isoformat()
    endpoint.validation["revision"] = "old"
    assert not await access.validation_is_fresh(db, endpoint, roots)


@pytest.mark.asyncio
async def test_preview_validates_unchecked_access_only_for_selected_instance_and_roots(monkeypatch):
    endpoint = profile(validation={})
    endpoint.roots.append(dict(arr_instance_id=2, arr_root="/data/SERIES", path="/unavailable/SERIES"))
    db = NS(get=AsyncMock(return_value=endpoint))
    body = NS(
        access_id=1,
        transfer_mode="rsync_ssh",
        arr_instance_id=1,
        source_roots=["/data/FILMS"],
        destination_root="/usb/FILMS",
    )

    async def validate(db, endpoint, selected_roots):
        assert selected_roots == {(1, "/data/FILMS"), (1, "/usb/FILMS")}
        endpoint.validation = {
            "revision": endpoint.revision,
            "roots": [
                {"arr_instance_id": instance, "arr_root": root, "free_bytes": 100} for instance, root in selected_roots
            ],
        }

    check = AsyncMock(side_effect=validate)
    monkeypatch.setattr(access, "validate_access", check)
    monkeypatch.setattr(
        "app.storage.arr_transfer.preview_arr", AsyncMock(return_value={"planned_bytes": 5, "items": []})
    )
    await access.preview_rsync(db, body)
    check.assert_awaited_once()


@pytest.mark.asyncio
async def test_checking_one_root_does_not_refresh_an_old_unselected_proof():
    from datetime import timedelta

    from app.utils import now_utc_naive

    endpoint = profile(
        validation={
            "revision": "rev",
            "checked_at": now_utc_naive().isoformat(),
            "roots": [
                {
                    "arr_instance_id": 1,
                    "arr_root": "/data/FILMS",
                    "free_bytes": 100,
                    "checked_at": (now_utc_naive() - timedelta(hours=1)).isoformat(),
                },
                {
                    "arr_instance_id": 1,
                    "arr_root": "/usb/FILMS",
                    "free_bytes": 100,
                    "checked_at": now_utc_naive().isoformat(),
                },
            ],
        }
    )
    db = NS(get=AsyncMock())
    assert not await access.validation_is_fresh(db, endpoint, {(1, "/data/FILMS")})
    assert await access.validation_is_fresh(db, endpoint, {(1, "/usb/FILMS")})


@pytest.mark.asyncio
async def test_preview_tests_connection_without_manual_validation(monkeypatch):
    from app.models import StorageConnection
    from app.storage import arr_transfer, connections

    endpoint = profile(connection_id=9, validation={})
    conn = NS(
        id=9, method="ssh", tested=False, fingerprint="SHA256:pinned", revision="conn", connection={}, credentials="{}"
    )
    instance = NS(id=1, enabled=True)
    db = NS(
        get=AsyncMock(side_effect=lambda model, id: conn if model is StorageConnection else instance), flush=AsyncMock()
    )
    check = Mock()
    monkeypatch.setattr(connections, "test_connection", check)
    monkeypatch.setattr("app.storage.service.discover_instance_roots", AsyncMock(return_value={}))
    monkeypatch.setattr(arr_transfer, "route", AsyncMock())
    samples = AsyncMock(return_value=[])
    monkeypatch.setattr(access, "samples_for", samples)
    remote = Mock(return_value={"identity": [1, 2], "free_bytes": 100})
    monkeypatch.setattr(remote_fs, "remote_call", remote)
    await access.validate_access(db, endpoint, {(1, "/data/FILMS")})
    assert conn.tested
    check.assert_called_once_with(conn)
    samples.assert_awaited_once_with(db, 1, "/data/FILMS")
    assert remote.call_args.args[1]["roots"] == ["/mnt/data/FILMS"]
    assert len(endpoint.validation["roots"]) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["radarr", "sonarr"])
async def test_samples_use_arr_file_paths_and_sizes(monkeypatch, kind):
    db = NS(get=AsyncMock(return_value=NS(id=1, enabled=True, arr_type=kind)))
    request = AsyncMock(
        side_effect=[
            [
                dict(id=1, path="/other/Film"),
                dict(id=2, path="/data/FILMS/nested/Film"),
                dict(id=3, path="/data/FILMS/Film"),
            ],
            [dict(relativePath="Film.mkv", size=5), dict(relativePath="", size=1)],
        ]
    )
    monkeypatch.setattr("app.storage.service.arr_request", request)
    assert await access.samples_for(db, 1, "/data/FILMS") == [dict(path="Film/Film.mkv", size=5)]
    assert request.await_count == 2


def test_remote_metadata_and_copy_commands_share_safe_boundaries(tmp_path, monkeypatch):
    from app.storage import integrite

    root = str(tmp_path)
    file = tmp_path / "Film.mkv"
    file.write_bytes(b"video")
    stop = threading.Event()

    def run(op, **args):
        return remote_agent.dispatch(dict(op=op, roots=[root], path=str(file), **args), integrite.__dict__, stop)

    assert run("exists") is True
    assert run("is_dir") is False
    assert run("size") == 5
    assert run("hash") == integrite.empreinte(str(file))
    assert run("signature") == integrite.signature(str(file))
    assert run("free") > 0
    assert run("inventory", require_video=False) == []
    st = tmp_path.stat()
    with pytest.raises(ValueError, match="remplacé"):
        run("exists", identities={root: [st.st_dev, st.st_ino + 1]})
    child = tmp_path / "Film"
    remote_agent.dispatch(
        dict(op="mkdir", roots=[root], path=str(child), parents=False, exist_ok=True), integrite.__dict__, stop
    )
    assert child.is_dir()
    monkeypatch.setattr(integrite, "copier_rsync", Mock(return_value={"verification": "rsync"}))
    target = tmp_path / "Other.mkv"
    assert remote_agent.dispatch(
        dict(op="copy", roots=[root], src=str(file), dst=str(target), mode="standard"), integrite.__dict__, stop
    ) == {"verification": "rsync"}
    with pytest.raises(ValueError, match="identiques"):
        remote_agent.dispatch(
            dict(op="copy", roots=[root], src=str(file), dst=str(file), mode="standard"), integrite.__dict__, stop
        )
