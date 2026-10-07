import json
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, Mock

import paramiko
import pytest

from app.routers import storage_connections_api as api
from app.storage import ssh_hash
from app.storage.presentation import file_counts
from app.storage.service import reserve_bytes
from app.storage.worker import update_item


def test_manifest_counts_multi_episode_and_unknown_names():
    assert file_counts(["Season 1/Title S01E01E02.mkv", "Title S02E03.mp4", "poster.jpg"]) == {
        "episodes": 3,
        "seasons": 2,
        "files": 2,
    }
    assert file_counts(["episode.mkv"]) == {"episodes": None, "seasons": None, "files": 1}


def test_percentage_reserve_uses_latest_capacity():
    location = NS(reserve_bytes=100, reserve_percent=5, total_bytes=4000)
    assert reserve_bytes(location) == 200
    assert reserve_bytes(location, 8000) == 400
    location.total_bytes = None
    with pytest.raises(ValueError, match="Capacité totale inconnue"):
        reserve_bytes(location)


@pytest.mark.parametrize(
    "error,fallback",
    [(paramiko.AuthenticationException("no"), True), (OSError("offline"), False), (RuntimeError("host pin"), False)],
)
def test_auth_fallback_only_on_authentication_refusal(monkeypatch, error, fallback):
    first, second = Mock(), Mock()
    first.connect.side_effect = error
    factory = Mock(side_effect=[first, second])
    monkeypatch.setattr(paramiko, "SSHClient", factory)
    monkeypatch.setattr(paramiko.Ed25519Key, "from_private_key", Mock(return_value="key"))
    config = dict(
        ssh_host="nas",
        ssh_user="media",
        ssh_fingerprint="SHA256:pinned",
        ssh_auth="password",
        ssh_auth_fallback=True,
        ssh_private_key="KEY",
        ssh_password="PASSWORD",
    )
    if fallback:
        assert ssh_hash.connecter(config) is second
        assert first.connect.call_args.kwargs["password"] == "PASSWORD"
        assert second.connect.call_args.kwargs["pkey"] == "key"
        assert second.storage_auth_method == "key"
    else:
        with pytest.raises(RuntimeError):
            ssh_hash.connecter(config)
        assert factory.call_count == 1
    first.close.assert_called_once()


@pytest.mark.asyncio
async def test_average_copy_ignores_pause_and_verification():
    item = NS(status="copying", progress={"copied_bytes": 0, "updated_at": 100})
    db = NS(commit=AsyncMock())
    await update_item(db, item, "copying", progress={"copied_bytes": 100, "updated_at": 102})
    await update_item(db, item, "copying", progress={"copied_bytes": 200, "updated_at": 200})
    await update_item(db, item, "verifying", progress={"updated_at": 220})
    assert item.progress["copy_seconds"] == 2
    assert item.progress["measured_copy_bytes"] == 100


@pytest.mark.asyncio
async def test_assignment_preserves_other_methods_and_paths(monkeypatch):
    connection = NS(id=1, name="NAS", method="ssh")
    mapping = {"arr_instance_id": 1, "arr_root": "/arr/SERIES"}
    old = NS(id=2, connection_id=2, method="ssh", roots=[{**mapping, "path": "/old"}], validation={"old": True})
    local = NS(id=3, connection_id=3, method="local", roots=[{**mapping, "path": "/local"}], validation={})
    location = NS(mappings=[mapping])
    db = NS(
        get=AsyncMock(return_value=connection),
        execute=AsyncMock(
            side_effect=[
                NS(scalars=lambda: NS(all=lambda: [location])),
                NS(scalars=lambda: NS(all=lambda: [old, local])),
            ]
        ),
        add=Mock(),
        commit=AsyncMock(),
    )
    monkeypatch.setattr(api, "assert_editable", AsyncMock())
    await api.assign_connection(1, api.AssignmentsBody(roots=[{**mapping, "path": "/mnt/SERIES"}]), db)
    assert old.roots == []
    assert local.roots[0]["path"] == "/local"
    assert db.add.call_args.args[0].roots == [{**mapping, "path": "/mnt/SERIES"}]


@pytest.mark.asyncio
async def test_clear_key_keeps_password_private(monkeypatch):
    conn = NS(
        id=1,
        name="NAS",
        method="ssh",
        connection={"host": "nas", "port": 22, "user": "media"},
        credentials=json.dumps({"private_key": "KEY", "passphrase": "PHRASE", "password": "PASSWORD"}),
        fingerprint="SHA256:pin",
        tested=True,
    )
    db = NS(
        execute=AsyncMock(return_value=NS(scalars=lambda: NS(all=lambda: []))),
        add=Mock(),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )
    result = await api.save_profile(
        api.ProfileBody(name="NAS", connection={"host": "nas", "user": "media"}, clear_private_key=True), db, conn
    )
    assert json.loads(conn.credentials) == {"password": "PASSWORD"}
    assert result["has_password"] and not result["has_private_key"]
    assert "PASSWORD" not in json.dumps(result)


@pytest.mark.asyncio
async def test_arr_start_enforces_saved_percentage_reserve(monkeypatch):
    from app.models import ArrInstance
    from app.storage import arr_transfer, worker

    instance = NS(id=1, enabled=True)
    destination = NS(reserve_percent=5, reserve_bytes=0, total_bytes=1000)
    db = NS(get=AsyncMock(side_effect=lambda model, ident: instance if model is ArrInstance else destination))
    monkeypatch.setattr(arr_transfer, "snapshot_mapping_matches", AsyncMock(return_value=True))
    request = AsyncMock(
        return_value=[
            {"path": "/source", "accessible": True, "freeSpace": 1000},
            {"path": "/dest", "accessible": True, "freeSpace": 100},
        ]
    )
    monkeypatch.setattr(worker, "arr_request", request)
    item = NS(
        arr_instance_id=1,
        size_bytes=60,
        snapshot={
            "source_arr": "/source/Film",
            "destination_arr": "/dest/Film",
            "source_plex": "/plex/Film",
            "destination_plex": "/plex2/Film",
            "plex_section_id": "1",
        },
    )
    job = NS(destination_id=2, params={"transfer_mode": "arr"})
    with pytest.raises(ValueError, match="Espace Arr insuffisant"):
        await worker.validate_transfer_roots(db, job, [item])
    destination.reserve_percent = None
    await worker.validate_transfer_roots(db, job, [item])
