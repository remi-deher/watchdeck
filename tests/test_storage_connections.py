import json
import stat
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from app.routers import storage_connections_api as api
from app.storage import access, connections


def profile(**changes):
    return NS(
        **(
            dict(
                id=1,
                name="NAS",
                method="ssh",
                revision="rev",
                connection=dict(host="nas", port=22, user="media", auth="key"),
                credentials=json.dumps(dict(private_key="SECRET")),
                fingerprint="SHA256:pinned",
                tested=True,
            )
            | changes
        )
    )


def test_connection_json_keeps_credentials_private():
    assert "SECRET" not in json.dumps(connections.connection_json(profile()))
    assert connections.config(profile())["ssh_private_key"] == "SECRET"


@pytest.mark.asyncio
async def test_host_change_resets_trust_and_invalidates_paths():
    conn = profile()
    endpoint = NS(id=2, name="old", method="ssh", revision="old", validation={"revision": "old"})
    db = NS(
        execute=AsyncMock(side_effect=[None, NS(scalars=lambda: NS(all=lambda: [endpoint])), NS(first=lambda: None)]),
        add=Mock(),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )
    result = await api.save_profile(api.ProfileBody(name="New", connection=dict(host="new", user="media")), db, conn)
    assert not result["trusted"] and not result["tested"]
    assert endpoint.validation == {} and endpoint.revision != "old" and endpoint.name == "New"
    assert connections.config(conn)["ssh_private_key"] == "SECRET"


@pytest.mark.asyncio
async def test_identity_changed_during_confirmation_is_rejected(monkeypatch):
    conn = profile()
    db = NS(
        get=AsyncMock(return_value=conn),
        execute=AsyncMock(side_effect=[None, NS(scalars=lambda: NS(all=lambda: []))]),
        commit=AsyncMock(),
    )
    monkeypatch.setattr(connections, "probe", lambda *_: dict(fingerprint="SHA256:different"))
    with pytest.raises(HTTPException) as exc:
        await api.trust_connection(1, api.TrustBody(fingerprint="SHA256:" + "a" * 43), db)
    assert exc.value.status_code == 422
    assert conn.fingerprint == "SHA256:pinned"
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_unvalidated_connection_cannot_browse():
    db = NS(get=AsyncMock(return_value=profile(tested=False)))
    with pytest.raises(HTTPException):
        await api.browse_connection(1, api.BrowseBody(path="/tmp"), db)


@pytest.mark.asyncio
async def test_worker_rejects_changed_or_untested_connection():
    conn = profile()
    endpoint = NS(connection_id=1, method="ssh", validation={"connection_revision": "old"})
    db = NS(get=AsyncMock(return_value=conn))
    with pytest.raises(ValueError, match="modifiée"):
        await access.config_for(db, endpoint)
    conn.tested = False
    with pytest.raises(ValueError, match="non testée"):
        await access.config_for(db, endpoint)


def test_browser_lists_only_folders_and_closes_client(monkeypatch):
    sftp = Mock()
    sftp.lstat.return_value = NS(st_mode=stat.S_IFDIR)
    sftp.listdir_iter.return_value = [
        NS(filename="Film", st_mode=stat.S_IFDIR),
        NS(filename="file.mkv", st_mode=stat.S_IFREG),
        NS(filename="link", st_mode=stat.S_IFLNK),
    ]
    client = Mock()
    client.open_sftp.return_value = sftp
    monkeypatch.setattr(connections, "connecter", lambda _: client)
    result = connections.browse(profile(), "/tmp")
    assert result == dict(path="/tmp", parent="/", directories=[dict(name="Film", path="/tmp/Film")])
    sftp.close.assert_called_once()
    client.close.assert_called_once()


def test_browser_rejects_symlink_ancestors(monkeypatch):
    sftp = Mock()
    sftp.lstat.side_effect = [NS(st_mode=stat.S_IFDIR), NS(st_mode=stat.S_IFLNK)]
    client = Mock()
    client.open_sftp.return_value = sftp
    monkeypatch.setattr(connections, "connecter", lambda _: client)
    with pytest.raises(ValueError, match="lien symbolique"):
        connections.browse(profile(), "/link/child")
    sftp.listdir_iter.assert_not_called()
    client.close.assert_called_once()


@pytest.mark.asyncio
async def test_binding_updates_one_root_and_reuses_connection():
    conn = profile()
    endpoint = NS(
        id=3,
        connection_id=1,
        roots=[
            dict(arr_instance_id=2, arr_root="/data/FILMS", path="/mnt/old"),
            dict(arr_instance_id=2, arr_root="/usb/FILMS", path="/mnt/usb"),
        ],
        revision="old",
        validation={"revision": "old"},
    )
    db = NS(
        get=AsyncMock(return_value=conn),
        execute=AsyncMock(
            side_effect=[
                None,
                NS(scalars=lambda: NS(all=lambda: [endpoint])),
                NS(first=lambda: None),
                NS(first=lambda: None),
            ]
        ),
        add=Mock(),
        commit=AsyncMock(),
    )
    await api.save_binding(
        api.BindingBody(arr_instance_id=2, arr_root="/data/FILMS", connection_id=1, path="/mnt/new"), db
    )
    assert endpoint.roots == [
        dict(arr_instance_id=2, arr_root="/usb/FILMS", path="/mnt/usb"),
        dict(arr_instance_id=2, arr_root="/data/FILMS", path="/mnt/new"),
    ]
    assert endpoint.validation == {} and endpoint.revision != "old"
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_binding_to_api_only_removes_no_files():
    endpoint = NS(
        id=3,
        connection_id=1,
        roots=[dict(arr_instance_id=2, arr_root="/data/FILMS", path="/mnt/old")],
        revision="old",
        validation={"revision": "old"},
    )
    db = NS(
        execute=AsyncMock(side_effect=[None, NS(scalars=lambda: NS(all=lambda: [endpoint])), NS(first=lambda: None)]),
        commit=AsyncMock(),
    )
    await api.save_binding(api.BindingBody(arr_instance_id=2, arr_root="/data/FILMS"), db)
    assert endpoint.roots == [] and endpoint.validation == {}


@pytest.mark.asyncio
async def test_active_task_prevents_binding_change():
    conn = profile()
    endpoint = NS(id=3, connection_id=1, roots=[dict(arr_instance_id=2, arr_root="/data/FILMS", path="/mnt/old")])
    db = NS(
        get=AsyncMock(return_value=conn),
        execute=AsyncMock(side_effect=[None, NS(scalars=lambda: NS(all=lambda: [endpoint])), NS(first=lambda: (9,))]),
        commit=AsyncMock(),
    )
    with pytest.raises(HTTPException) as exc:
        await api.save_binding(
            api.BindingBody(arr_instance_id=2, arr_root="/data/FILMS", connection_id=1, path="/mnt/new"), db
        )
    assert exc.value.status_code == 409
    assert endpoint.roots[0]["path"] == "/mnt/old"
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_priority_falls_back_before_copy_and_pins_result(monkeypatch):
    from app.routers.storage_api import PreviewBody
    from app.storage import arr_transfer

    rsync = AsyncMock(side_effect=ValueError("SSH unavailable"))
    arr = AsyncMock(return_value={"items": []})
    monkeypatch.setattr(access, "preview_rsync", rsync)
    monkeypatch.setattr(arr_transfer, "preview_arr", arr)
    body = PreviewBody(transfer_methods=["rsync_ssh", "arr"], access_ids={"rsync_ssh": 3})
    result = await access.preview_priority(NS(), body)
    assert result["transfer_mode"] == "arr" and result["skipped_methods"] == ["rsync_ssh"]
    assert body.transfer_methods == [] and body.transfer_mode == "arr"
    assert body.preferred_methods == ["rsync_ssh", "arr"]
    assert rsync.call_args.args[1].access_id == 3
    arr.assert_awaited_once()


@pytest.mark.asyncio
async def test_successful_first_priority_never_tries_fallback(monkeypatch):
    from app.routers.storage_api import PreviewBody
    from app.storage import arr_transfer

    rsync = AsyncMock(return_value={"items": []})
    arr = AsyncMock()
    monkeypatch.setattr(access, "preview_rsync", rsync)
    monkeypatch.setattr(arr_transfer, "preview_arr", arr)
    body = PreviewBody(transfer_methods=["rsync_local", "arr"], access_ids={"rsync_local": 4})
    result = await access.preview_priority(NS(), body)
    assert result["transfer_mode"] == "rsync_local" and body.access_id == 4
    arr.assert_not_awaited()


@pytest.mark.asyncio
async def test_all_failed_priorities_refuse_job(monkeypatch):
    from app.routers.storage_api import PreviewBody
    from app.storage import arr_transfer

    monkeypatch.setattr(access, "preview_rsync", AsyncMock(side_effect=ValueError("no access")))
    monkeypatch.setattr(arr_transfer, "preview_arr", AsyncMock(side_effect=ValueError("no mapping")))
    body = PreviewBody(transfer_methods=["rsync_ssh", "arr"])
    with pytest.raises(ValueError, match="Aucune méthode"):
        await access.preview_priority(NS(), body)
    assert body.transfer_methods == ["rsync_ssh", "arr"]


@pytest.mark.asyncio
async def test_multiple_bindings_are_atomic_on_invalid_second_path():
    conn = profile()
    local = profile(id=2, method="local")
    db = NS(execute=AsyncMock(), get=AsyncMock(side_effect=[conn, local]), commit=AsyncMock())
    body = api.MultipleBindingsBody(
        arr_instance_id=1,
        arr_root="/data/FILMS",
        bindings=[{"connection_id": 1, "path": "/mnt/films"}, {"connection_id": 2, "path": "/etc"}],
    )
    with pytest.raises(HTTPException):
        await api.save_multiple_bindings(body, db)
    db.commit.assert_not_called()
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_ssh_and_local_paths_coexist():
    conn = profile()
    local = profile(id=2, method="local")
    endpoints = [NS(id=3, connection_id=1, roots=[], validation={}), NS(id=4, connection_id=2, roots=[], validation={})]
    db = NS(
        execute=AsyncMock(
            side_effect=[
                None,
                NS(scalars=lambda: NS(all=lambda: endpoints)),
                NS(first=lambda: None),
                NS(first=lambda: None),
            ]
        ),
        get=AsyncMock(side_effect=[conn, local]),
        commit=AsyncMock(),
    )
    body = api.MultipleBindingsBody(
        arr_instance_id=1,
        arr_root="/data/FILMS",
        bindings=[{"connection_id": 1, "path": "/mnt/films"}, {"connection_id": 2, "path": "/storage/data1/FILMS"}],
    )
    await api.save_multiple_bindings(body, db)
    assert endpoints[0].roots[0]["path"] == "/mnt/films"
    assert endpoints[1].roots[0]["path"] == "/storage/data1/FILMS"
    db.commit.assert_awaited_once()


def test_browser_can_start_at_server_root_without_allowing_it_for_transfers(monkeypatch):
    sftp = Mock()
    sftp.lstat.return_value = NS(st_mode=stat.S_IFDIR)
    sftp.listdir_iter.return_value = [NS(filename="mnt", st_mode=stat.S_IFDIR)]
    client = Mock()
    client.open_sftp.return_value = sftp
    monkeypatch.setattr(connections, "connecter", lambda _: client)
    assert connections.browse(profile(), "/") == dict(
        path="/", parent=None, directories=[dict(name="mnt", path="/mnt")]
    )
    from app.storage.planning import absolute_path

    with pytest.raises(ValueError):
        absolute_path("/")


@pytest.mark.asyncio
@pytest.mark.parametrize("base", ["/usb1", "/media2", "/"])
async def test_local_connection_preserves_custom_browse_root(base):
    conn = profile(method="local", connection={})
    db = NS(
        execute=AsyncMock(side_effect=[None, NS(scalars=lambda: NS(all=lambda: []))]),
        add=Mock(),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )
    result = await api.save_profile(
        api.ProfileBody(name="Local", method="local", connection={"browse_root": base}), db, conn
    )
    assert result["connection"] == {"browse_root": base}
    assert result["has_credentials"] is False
