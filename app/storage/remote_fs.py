"""Small remote filesystem protocol. No shell interpolation of user paths."""

import base64
import json
import shlex
import threading
import time
from pathlib import Path, PurePosixPath
from types import SimpleNamespace

from .integrite import Interrompu
from .ssh_hash import connecter
from .ssh_pool import acquire, release


def remote_call(config, payload, stop=None, advance=None, phase=None, session=""):
    # Ship the same copy/verification implementation used by the mounted worker.
    integrity = Path(__file__).with_name("integrite.py").read_text(encoding="utf-8")
    integrity = integrity.replace(
        "from .ssh_hash import empreinte_destination",
        "empreinte_destination = lambda p, stop=None, phase=None: empreinte(p, stop)",
    )
    agent = Path(__file__).with_name("remote_agent.py").read_text(encoding="utf-8")
    script = "INTEGRITY=" + repr(integrity) + "\nSESSION=" + repr(session) + "\n" + agent
    command = "python3 -u -c " + shlex.quote(
        "import base64;exec(base64.b64decode(" + repr(base64.b64encode(script.encode()).decode()) + "))"
    )
    deadline = time.monotonic() + (28800 if payload["op"] in ("copy", "send_peer", "verify", "hash") else 60)
    client = acquire(config, connecter)
    channel = None
    try:
        channel = client.get_transport().open_session(timeout=10)
        channel.settimeout(10)
        channel.exec_command(command)
        channel.sendall(json.dumps(payload).encode() + b"\n")
        buffer = b""
        last = time.monotonic()
        heartbeat_failed = False
        while True:
            if time.monotonic() > deadline:
                raise ValueError("Délai SSH dépassé ; original conservé.")
            if stop is not None and stop.is_set():
                try:
                    channel.sendall(b"stop\n")
                except OSError:
                    pass
                raise Interrompu()
            if channel.recv_ready():
                buffer += channel.recv(65536)
                if len(buffer) > 8_000_000:
                    raise ValueError("Réponse SSH trop volumineuse.")
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    message = json.loads(line)
                    if "delta" in message and advance:
                        advance(message["delta"])
                    if "phase" in message and phase:
                        phase(message["phase"])
                    if "error" in message:
                        raise ValueError(message["error"])
                    if "result" in message:
                        return message["result"]
            if channel.recv_stderr_ready():
                channel.recv_stderr(65536)
            if channel.exit_status_ready() and not channel.recv_ready():
                raise ValueError("Session SSH interrompue ; original conservé. Réessayer par SSH.")
            # Drain output first: a successful agent may already have closed stdin
            # while its final result is still buffered in the SSH channel.
            if not heartbeat_failed and time.monotonic() - last > 2 and not channel.recv_ready():
                try:
                    channel.sendall(b"alive\n")
                except OSError:
                    # A close can race with this send. Keep reading the result;
                    # never rerun an operation whose outcome is still unknown.
                    heartbeat_failed = True
                last = time.monotonic()
            time.sleep(0.05)
    finally:
        if channel is not None:
            channel.close()
        release(client)


class RemoteFilesystem:
    def __init__(self, config, roots, session, identities=None):
        self.config, self.roots, self.session = config, roots, session
        self.identities = identities or {}

    def call(self, operation, **args):
        return remote_call(
            self.config, dict(op=operation, roots=self.roots, identities=self.identities, **args), session=self.session
        )

    def path(self, path):
        return RemotePath(path, self)

    def inventory(self, path, require_video=True):
        return self.call("inventory", path=str(path), require_video=require_video)

    def signature(self, path):
        return self.call("signature", path=str(path))

    def hash(self, path, stop=None):
        return remote_call(
            self.config,
            dict(op="hash", roots=self.roots, identities=self.identities, path=str(path)),
            stop,
            session=self.session,
        )

    def copy(self, src, dst, advance, stop, proof, phase, mode):
        return remote_call(
            self.config,
            dict(
                op="copy",
                roots=self.roots,
                identities=self.identities,
                src=str(src),
                dst=str(dst),
                proof=proof,
                mode=mode,
            ),
            stop,
            advance,
            phase,
            self.session,
        )

    def verify(self, src, dst, stop, proofs, mode):
        return remote_call(
            self.config,
            dict(
                op="verify",
                roots=self.roots,
                identities=self.identities,
                src=str(src),
                dst=str(dst),
                proofs=proofs,
                mode=mode,
            ),
            stop,
            session=self.session,
        )

    def free(self, path):
        return self.call("free", path=str(path))

    def remove(self, src, dst, files, signatures, proofs):
        return self.call("remove", src=str(src), dst=str(dst), files=files, signatures=signatures, proofs=proofs)


class RemotePath:
    def __init__(self, path, fs):
        self.value, self.fs = str(PurePosixPath(path)), fs

    def __str__(self):
        return self.value

    def __eq__(self, other):
        return str(self) == str(other) and (not isinstance(other, RemotePath) or self.fs is other.fs)

    def __truediv__(self, relative):
        return RemotePath(str(PurePosixPath(self.value) / relative), self.fs)

    @property
    def parent(self):
        return RemotePath(str(PurePosixPath(self.value).parent), self.fs)

    def exists(self):
        return self.fs.call("exists", path=self.value)

    def is_dir(self):
        return self.fs.call("is_dir", path=self.value)

    def stat(self):
        return SimpleNamespace(st_size=self.fs.call("size", path=self.value))

    def mkdir(self, parents=False, exist_ok=False):
        return self.fs.call("mkdir", path=self.value, parents=parents, exist_ok=exist_ok)
