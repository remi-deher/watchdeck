"""Completion and cancellation must survive closing the agent input channel."""

import threading
from unittest.mock import Mock

import pytest

from app.storage import remote_fs
from app.storage.integrite import Interrompu


@pytest.fixture
def protocol(monkeypatch):
    channel = Mock()
    channel.recv_stderr_ready.return_value = False
    channel.exit_status_ready.return_value = True
    client = Mock()
    client.get_transport().open_session.return_value = channel
    monkeypatch.setattr(remote_fs, "connecter", Mock(return_value=client))
    ticks = iter(range(0, 1000, 3))
    monkeypatch.setattr(remote_fs.time, "monotonic", lambda: next(ticks))
    monkeypatch.setattr(remote_fs.time, "sleep", lambda duration: None)

    def send(data):
        if data in (b"alive\n", b"stop\n"):
            raise OSError("Socket is closed")

    channel.sendall.side_effect = send
    return channel, client


def test_closed_input_does_not_discard_buffered_copy_result(protocol):
    channel, client = protocol
    channel.recv_ready.return_value = True
    channel.recv.return_value = b'{"result": {"source": [1, 100]}}\n'
    assert remote_fs.remote_call({}, {"op": "send_peer"}) == {"source": [1, 100]}
    assert channel.sendall.call_count == 1  # Initial request only; no late heartbeat.
    channel.close.assert_called_once()
    client.close.assert_called_once()


def test_close_racing_with_heartbeat_still_reads_final_result(protocol, monkeypatch):
    channel, client = protocol
    channel.recv_ready.return_value = False
    channel.exit_status_ready.return_value = False
    channel.recv.return_value = b'{"result": true}\n'

    def arrive(duration):
        channel.recv_ready.return_value = True
        channel.exit_status_ready.return_value = True

    monkeypatch.setattr(remote_fs.time, "sleep", arrive)
    assert remote_fs.remote_call({}, {"op": "send_peer"}) is True
    assert channel.sendall.call_args_list[-1].args == (b"alive\n",)
    client.close.assert_called_once()


def test_closed_channel_without_result_remains_a_failure(protocol):
    channel, client = protocol
    channel.recv_ready.return_value = False
    with pytest.raises(ValueError, match="Session SSH interrompue"):
        remote_fs.remote_call({}, {"op": "send_peer"})
    client.close.assert_called_once()


def test_cancel_remains_cancel_even_when_stop_cannot_be_sent(protocol):
    channel, client = protocol
    stop = threading.Event()
    stop.set()
    with pytest.raises(Interrompu):
        remote_fs.remote_call({}, {"op": "send_peer"}, stop=stop)
    assert channel.sendall.call_args_list[-1].args == (b"stop\n",)
    client.close.assert_called_once()


def test_fragmented_final_result_is_drained_before_heartbeat(protocol):
    channel, client = protocol
    chunks = [b'{"result":', b" true}\n"]
    channel.recv_ready.side_effect = lambda: bool(chunks)
    channel.recv.side_effect = lambda size: chunks.pop(0)
    assert remote_fs.remote_call({}, {"op": "send_peer"}) is True
    assert channel.sendall.call_count == 1


def test_remote_error_is_not_replaced_by_socket_closed(protocol):
    channel, client = protocol
    channel.recv_ready.return_value = True
    channel.recv.return_value = b'{"error": "verification refused"}\n'
    with pytest.raises(ValueError, match="verification refused"):
        remote_fs.remote_call({}, {"op": "send_peer"})
