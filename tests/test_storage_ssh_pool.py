import asyncio
from unittest.mock import Mock

import pytest

from app.storage.ssh_pool import ConnectionPool, acquire, release, scoped_connections


def client():
    value = Mock()
    value.get_transport().is_active.return_value = True
    value.get_transport().is_authenticated.return_value = True
    return value


def test_pool_reuses_transport_and_isolates_host_pin_and_credentials():
    pool = ConnectionPool()
    connect = Mock(side_effect=lambda config: client())
    config = {"ssh_host": "nas", "ssh_fingerprint": "pin", "ssh_password": "first"}
    first = pool.acquire(config, connect)
    assert pool.acquire(dict(config), connect) is first
    assert pool.acquire({**config, "ssh_fingerprint": "other"}, connect) is not first
    assert pool.acquire({**config, "ssh_password": "other"}, connect) is not first
    assert connect.call_count == 3
    first.get_transport().is_active.return_value = False
    assert pool.acquire(config, connect) is not first
    first.close.assert_called_once()
    pool.close()
    assert not pool.clients


@pytest.mark.asyncio
async def test_thread_calls_share_pool_and_exception_closes_all_connections():
    connect = Mock(return_value=client())

    @scoped_connections
    async def operation():
        first = acquire({"host": "nas"}, connect)
        second = await asyncio.to_thread(acquire, {"host": "nas"}, connect)
        assert second is first
        await asyncio.to_thread(release, first)
        first.close.assert_not_called()
        raise ValueError("interrupted")

    with pytest.raises(ValueError, match="interrupted"):
        await operation()
    connect.assert_called_once()
    connect.return_value.close.assert_called_once()
    # Outside the item scope, callers retain the original close semantics.
    release(connect.return_value)
    assert connect.return_value.close.call_count == 2


@pytest.mark.asyncio
async def test_remote_calls_open_new_channels_on_one_authenticated_transport(monkeypatch):
    from app.storage import remote_fs

    connection = client()
    channels = []

    def channel(**kwargs):
        value = Mock()
        value.recv_ready.return_value = True
        value.recv.return_value = b'{"result": true}\n'
        channels.append(value)
        return value

    connection.get_transport().open_session.side_effect = channel
    connect = Mock(return_value=connection)
    monkeypatch.setattr(remote_fs, "connecter", connect)

    @scoped_connections
    async def operation():
        for _ in range(13):
            assert await asyncio.to_thread(remote_fs.remote_call, {"ssh_host": "nas"}, {"op": "exists"}) is True

    await operation()
    connect.assert_called_once()
    assert len(channels) == 13
    for value in channels:
        value.close.assert_called_once()
    connection.close.assert_called_once()
