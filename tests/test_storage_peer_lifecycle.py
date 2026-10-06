import io
import json
import shutil
import socket
import threading
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import Mock

import pytest

from app.storage import integrite, peer_fs, remote_agent
from app.storage.remote_fs import RemotePath


class Endpoint:
    session = "test-session"

    def __init__(self, root):
        self.root = root
        self.root.mkdir()

    def path(self, path):
        return RemotePath(path, self)

    def local(self, path):
        return self.root / str(path).lstrip("/")

    def signature(self, path):
        return integrite.signature(self.local(path))

    def hash(self, path, stop=None):
        return integrite.empreinte(self.local(path), stop)

    def inventory(self, path, require_video=True):
        return remote_agent.inventory(self.local(path), require_video)

    def free(self, path):
        return shutil.disk_usage(self.root).free

    def call(self, op, **args):
        if op == "exists":
            return self.local(args["path"]).exists()
        if op == "size":
            return self.local(args["path"]).stat().st_size
        if op == "mkdir":
            return self.local(args["path"]).mkdir(parents=args["parents"], exist_ok=args["exist_ok"])
        args["path"] = str(self.local(args["path"]))
        if "dst" in args:
            args["dst"] = str(self.local(args["dst"]))
        return remote_agent.dispatch(dict(op=op, roots=[str(self.root)], **args), integrite.__dict__, threading.Event())


@pytest.mark.parametrize("mode", ["standard", "renforce"])
def test_peer_copy_proofs_resume_restart_and_cleanup(tmp_path, monkeypatch, mode):
    source, target = Endpoint(tmp_path / "a"), Endpoint(tmp_path / "b")
    fs = peer_fs.PeerFilesystem(source, target)
    a, b = fs.path("/Film/film.mkv"), fs.path("/Film/film.mkv", "destination")
    source.local(a).parent.mkdir()
    source.local(a).write_bytes(b"video")

    def copy(sa, sb, src, dst, stop, advance, phase):
        shutil.copyfile(sa.local(src), sb.local(dst))
        advance(5)
        return dict(source=sa.signature(src), bytes=5)

    monkeypatch.setattr(peer_fs, "copy_peer", copy)
    advance = Mock()
    proof = fs.copy(a, b, advance, threading.Event(), None, None, mode)
    assert fs.free(a) > 0 and fs.hash(a) == fs.hash(b)
    assert fs.copy(a, b, advance, threading.Event(), proof, None, mode) == proof
    proofs = {"film.mkv": proof}
    assert fs.verify(a.parent, b.parent, threading.Event(), proofs, mode) == ["film.mkv"]
    proofs["film.mkv"]["session"] = "previous-process"
    fs.verify(a.parent, b.parent, threading.Event(), proofs, mode)
    assert proofs["film.mkv"]["sha256"] == fs.hash(a)
    fs.remove(a.parent, b.parent, ["film.mkv"], {"film.mkv": fs.signature(b)}, proofs)
    assert not a.exists() and b.exists()


def test_peer_pause_and_bad_copy_preserve_original(tmp_path, monkeypatch):
    source, target = Endpoint(tmp_path / "a"), Endpoint(tmp_path / "b")
    fs = peer_fs.PeerFilesystem(source, target)
    a, b = source.path("/Film/film.mkv"), target.path("/Film/film.mkv")
    source.local(a).parent.mkdir()
    source.local(a).write_bytes(b"video")

    def copy(*args):
        args[4].set()
        return {}

    monkeypatch.setattr(peer_fs, "copy_peer", copy)
    with pytest.raises(integrite.Interrompu):
        fs.copy(a, b, Mock(), threading.Event(), None, None, "standard")
    assert a.exists() and not b.exists()
    monkeypatch.setattr(peer_fs, "copy_peer", lambda *args: dict(source=["changed"]))
    with pytest.raises(ValueError, match="source modifiée"):
        fs.copy(a, b, Mock(), threading.Event(), None, None, "standard")
    assert a.exists()


def test_tcp_bridge_is_bidirectional_and_closes_on_disconnect():
    left, client = socket.socketpair()
    right, server = socket.socketpair()
    stop = threading.Event()
    thread = threading.Thread(target=peer_fs.bridge, args=(left, right, stop))
    thread.start()
    try:
        client.settimeout(3)
        server.settimeout(3)
        client.sendall(b"forward")
        assert server.recv(7) == b"forward"
        server.sendall(b"reply")
        assert client.recv(5) == b"reply"
        client.close()
        thread.join(3)
        assert not thread.is_alive()
    finally:
        stop.set()
        client.close()
        server.close()
        thread.join(3)


@pytest.mark.parametrize("reply", [b'{"port":1234}\n', b'{"error":"receiver refused"}\n', b""])
def test_peer_tunnel_lifecycle_and_receiver_errors(monkeypatch, reply):
    receiver, sender = Mock(), Mock()
    control = receiver.get_transport.return_value.open_session.return_value
    receiver.get_transport.return_value.open_session.side_effect = [control, Mock()]
    control.recv.return_value = reply
    control.exit_status_ready.return_value = True
    source = NS(config={}, roots=["/source"], identities={}, session="test")
    destination = NS(config={}, roots=["/destination"], path=lambda p: Path(p), signature=lambda p: [None] * 4 + [1, 2])
    monkeypatch.setattr(peer_fs, "connecter", Mock(side_effect=[receiver, sender]))
    relay = Mock()
    monkeypatch.setattr(peer_fs, "bridge", relay)

    proxy = sender.get_transport.return_value.open_session.return_value
    proxy.recv.return_value = b'{"port":3210}\n'
    remote = Mock(return_value={"copied": True})
    monkeypatch.setattr(peer_fs, "remote_call", remote)
    if b"port" in reply:
        assert peer_fs.copy_peer(
            source, destination, "/source/file", "/destination/file", threading.Event(), Mock(), Mock()
        ) == {"copied": True}
        assert remote.call_args.args[1]["port"] == 3210
        sender.close.assert_called_once()
    else:
        with pytest.raises(ValueError):
            peer_fs.copy_peer(
                source, destination, "/source/file", "/destination/file", threading.Event(), Mock(), Mock()
            )
    receiver.close.assert_called_once()
    control.close.assert_called_once()


def test_sender_uses_rsync_checksum_and_reports_progress(tmp_path, monkeypatch):
    source = tmp_path / "film.mkv"
    source.write_bytes(b"copy")
    output = tmp_path / "stdout"
    output.write_bytes(b"\r              4 100%   1MB/s\n")
    stream = output.open("rb")
    process = Mock(stdout=stream, returncode=0)
    process.poll.return_value = 0
    popen = Mock(return_value=process)
    monkeypatch.setattr(remote_agent.subprocess, "Popen", popen)
    emitted = Mock()
    monkeypatch.setattr(remote_agent, "emit", emitted)
    integrity = {**integrite.__dict__, "_arreter_rsync": Mock()}
    result = remote_agent.dispatch(
        dict(
            op="send_peer",
            roots=[str(tmp_path)],
            path=str(source),
            port=3210,
            secret="ephemeral",
            filename="film.mkv.partiel",
        ),
        integrity,
        threading.Event(),
    )
    assert result["source"] == integrite.signature(source)
    assert "--checksum-choice=xxh128" in popen.call_args.args[0]
    assert popen.call_args.kwargs["env"]["RSYNC_PASSWORD"] == "ephemeral"
    assert result["bytes"] == 4
    integrity["_arreter_rsync"].assert_called_once()


@pytest.mark.parametrize("invalid", [False, True])
def test_receiver_loopback_authentication_cleanup_and_identity(tmp_path, monkeypatch, capsys, invalid):
    import builtins
    import sys

    from app.storage import peer_agent

    st = tmp_path.stat()
    body = dict(
        root=str(tmp_path),
        roots=[str(tmp_path)],
        identity=[st.st_dev, st.st_ino + (1 if invalid else 0)],
        secret="ephemeral",
    )
    monkeypatch.setitem(sys.modules, "fcntl", NS(LOCK_EX=1, LOCK_NB=2, flock=Mock()))
    if not hasattr(peer_agent.os, "mkfifo"):
        monkeypatch.setattr(peer_agent.os, "mkfifo", lambda path, mode: Path(path).touch(), raising=False)
    monkeypatch.setattr(peer_agent.threading, "Thread", Mock())
    real_open = builtins.open
    monkeypatch.setattr(peer_agent, "open", lambda path, *args: real_open(tmp_path / "lock", *args), raising=False)
    monkeypatch.setattr(peer_agent.os, "getuid", lambda: 100, raising=False)
    monkeypatch.setattr(peer_agent.os, "getgid", lambda: 100, raising=False)
    monkeypatch.setattr(peer_agent.sys, "stdin", io.StringIO(json.dumps(body) + "\nstop\n"))
    if invalid:
        with pytest.raises(ValueError, match="storage changed"):
            peer_agent.serve()
        return
    proc = Mock(pid=123)
    proc.poll.return_value = None
    captured = {}

    def popen(command, **kwargs):
        config = Path(command[-1].split("=", 1)[1])
        captured["config"] = config.read_text()
        captured["temp"] = config.parent
        assert "auth.pipe" in captured["config"]
        assert f"lock file = {config.parent}/connections.lock" in captured["config"]
        assert "uid =" not in captured["config"]
        assert "gid =" not in captured["config"]
        assert not (config.parent / "secret").exists()
        return proc

    monkeypatch.setattr(peer_agent.subprocess, "Popen", popen)
    killed = Mock()
    monkeypatch.setattr(peer_agent.os, "killpg", killed, raising=False)
    monkeypatch.setattr(peer_agent.signal, "signal", Mock())
    monkeypatch.setattr(peer_agent.socket, "create_connection", lambda *a, **kw: io.BytesIO())
    monkeypatch.setattr(peer_agent.select, "select", lambda *a: ([peer_agent.sys.stdin], [], []))
    peer_agent.serve()
    assert "address = 127.0.0.1" in captured["config"]
    assert "auth users = watchdeck" in captured["config"]
    assert not captured["temp"].exists()
    killed.assert_called_once()
    proc.wait.assert_called_once()
    messages = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert messages[0]["port"] > 0 and messages[-1]["stopped"] is True


@pytest.mark.parametrize("listen", [False, True])
def test_binary_exec_relay_does_not_require_tcp_forwarding(monkeypatch, listen):
    import io

    from app.storage import relay_agent

    stdin = NS(
        buffer=io.BufferedReader(io.BytesIO(json.dumps(dict(listen=listen, port=1234)).encode() + b"\n")),
        fileno=lambda: 0,
    )
    raw = io.BytesIO()
    stdout = io.TextIOWrapper(raw, encoding="utf-8")
    stream = Mock()
    stream.recv.return_value = b"protocol"
    listener = Mock()
    listener.getsockname.return_value = ("127.0.0.1", 3210)
    listener.accept.return_value = (stream, ("127.0.0.1", 123))
    monkeypatch.setattr(relay_agent.sys, "stdin", stdin)
    monkeypatch.setattr(relay_agent.sys, "stdout", stdout)
    monkeypatch.setattr(relay_agent.socket, "socket", Mock(return_value=listener))
    monkeypatch.setattr(relay_agent.socket, "create_connection", Mock(return_value=stream))
    monkeypatch.setattr(
        relay_agent.select,
        "select",
        Mock(side_effect=[([stdin.buffer], [], []), ([stream], [], []), ([stdin.buffer], [], [])]),
    )
    monkeypatch.setattr(relay_agent.os, "read", Mock(side_effect=[b"incoming", b""]))
    relay_agent.relay()
    stream.sendall.assert_called_once_with(b"incoming")
    stream.close.assert_called_once()
    stdout.flush()
    assert raw.getvalue().endswith(b"protocol")
    if listen:
        listener.close.assert_called_once()
        assert json.loads(raw.getvalue().split(b"\n")[0])["port"] == 3210


def test_fifo_authentication_stream_closes_descriptor(monkeypatch):
    from app.storage import peer_agent

    opened = Mock(return_value=123)
    written = Mock()
    closed = Mock()
    monkeypatch.setattr(peer_agent.os, "O_NONBLOCK", 2048, raising=False)
    monkeypatch.setattr(peer_agent.os, "open", opened)
    monkeypatch.setattr(peer_agent.os, "write", written)
    monkeypatch.setattr(peer_agent.os, "close", closed)
    peer_agent.provide_auth("pipe", "one-time", threading.Event())
    written.assert_called_once_with(123, b"watchdeck:one-time\n")
    closed.assert_called_once_with(123)
