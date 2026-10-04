import base64
import hashlib
import threading
from types import SimpleNamespace as NS
from unittest.mock import MagicMock

import paramiko
import pytest

from app.storage import ssh_hash as ssh
from app.storage.integrite import Interrompu


@pytest.fixture(autouse=True)
def restore_config():
    original = dict(ssh.CONFIG)
    yield
    ssh.configurer(original)


@pytest.mark.parametrize("auth", ["password", "key", "badkey", "offline", "pin_mismatch"])
def test_ssh_authentication_and_host_pin(monkeypatch, auth):
    fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(b"server key").digest()).decode().rstrip("=")
    ssh.configurer(
        dict(
            ssh_host="host",
            ssh_user="user",
            ssh_fingerprint=fingerprint,
            ssh_auth="key" if auth in ("key", "badkey") else "password",
        )
    )
    client = MagicMock()
    monkeypatch.setattr(paramiko, "SSHClient", lambda: client)
    if auth in ("key", "badkey"):
        for key in [paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey]:
            monkeypatch.setattr(key, "from_private_key", MagicMock(side_effect=paramiko.SSHException("bad key")))
        if auth == "key":
            monkeypatch.setattr(paramiko.RSAKey, "from_private_key", MagicMock(return_value="parsed key"))
    if auth == "offline":
        client.connect.side_effect = OSError("offline")
    if auth in ("badkey", "offline"):
        with pytest.raises(RuntimeError):
            ssh.connecter()
    else:
        assert ssh.connecter() is client
        policy = client.set_missing_host_key_policy.call_args.args[0]
        if auth == "pin_mismatch":
            with pytest.raises(RuntimeError):
                policy.missing_host_key(client, "host", NS(asbytes=lambda: b"other"))
        else:
            policy.missing_host_key(client, "host", NS(asbytes=lambda: b"server key"))
        assert client.connect.call_args.kwargs["look_for_keys"] is False


@pytest.mark.parametrize("issue", ["success", "exit", "stop", "timeout", "oversize"])
def test_remote_hash_protocol_closes_channel(monkeypatch, issue):
    client = MagicMock()
    channel = MagicMock()
    client.get_transport.return_value.open_session.return_value = channel
    channel.recv_ready.side_effect = [True, False]
    channel.recv.return_value = b'{"sha256":"abc"}' if issue != "oversize" else b"x" * 17000
    channel.recv_stderr_ready.return_value = True
    channel.exit_status_ready.return_value = True
    channel.recv_exit_status.return_value = 1 if issue == "exit" else 0
    monkeypatch.setattr(ssh, "connecter", lambda: client)
    ssh.configurer({"ssh_timeout": -1 if issue == "timeout" else 60})
    stop = threading.Event()
    if issue == "stop":
        stop.set()
    if issue == "success":
        assert ssh.executer('print("value")', stop) == {"sha256": "abc"}
    else:
        with pytest.raises((RuntimeError, Interrompu)):
            ssh.executer("script", stop)
    channel.close.assert_called_once()
    client.close.assert_called_once()


@pytest.mark.parametrize("mode", ["nfs", "hybride", "ssh", "invalid"])
def test_hash_modes_and_rejection(tmp_path, monkeypatch, mode):
    path = tmp_path / "video"
    path.write_bytes(b"abc")
    ssh.configurer({"hash_destination": mode, "ssh_map": {str(tmp_path): "/remote"}})
    monkeypatch.setattr(ssh, "executer", lambda *a: {"sha256": "invalid", "size": 3})
    phases = []
    if mode in ("ssh", "invalid"):
        with pytest.raises(RuntimeError):
            ssh.empreinte_destination(str(path), phase=phases.append)
    else:
        assert ssh.empreinte_destination(str(path), phase=phases.append) == hashlib.sha256(b"abc").hexdigest()
    if mode == "hybride":
        assert any("repli" in p for p in phases)
    assert ssh.chemin_distant(str(tmp_path)) == "/remote"
    if mode != "invalid":
        assert ssh.tester() == {"sha256": "invalid", "size": 3}
    ssh.configurer({})
    with pytest.raises(RuntimeError):
        ssh.connecter()
    with pytest.raises(RuntimeError):
        ssh.tester()
