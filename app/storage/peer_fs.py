"""Two pinned SSH endpoints, bridged without sharing their credentials."""

import base64
import json
import secrets
import select
import shlex
import threading
from pathlib import Path

from .integrite import Interrompu
from .remote_fs import remote_call
from .ssh_hash import connecter


def validate_bridge(config):
    client = connecter(config)
    try:
        transport = client.get_transport()
        port = transport.request_port_forward("127.0.0.1", 0)
        transport.cancel_port_forward("127.0.0.1", port)
    except Exception:
        raise ValueError(
            "Le serveur SSH source doit autoriser les tunnels TCP pour le transfert entre serveurs."
        ) from None
    finally:
        client.close()


def bridge(left, right, stop):
    try:
        while not stop.is_set():
            ready, _, _ = select.select([left, right], [], [], 0.2)
            for current in ready:
                data = current.recv(65536)
                if not data:
                    return
                (right if current is left else left).sendall(data)
    finally:
        left.close()
        right.close()


def copy_peer(source, destination, src, dst, stop, advance, phase):
    """Authenticated loopback daemon reachable only through the two SSH tunnels."""
    receiver = sender = control = None
    finished = threading.Event()
    heartbeat = None
    port = None
    try:
        receiver = connecter(destination.config)
        agent = Path(__file__).with_name("peer_agent.py").read_text(encoding="utf-8")
        command = "python3 -u -c " + shlex.quote(
            "import base64;exec(base64.b64decode(" + repr(base64.b64encode(agent.encode()).decode()) + "))"
        )
        control = receiver.get_transport().open_session(timeout=10)
        control.settimeout(15)
        control.exec_command(command)
        secret = secrets.token_hex(32)
        parent = destination.path(str(dst)).parent
        identity = destination.signature(parent)[4:6]
        control.sendall(
            json.dumps(dict(root=str(parent), roots=destination.roots, identity=identity, secret=secret)).encode()
            + b"\n"
        )
        line = b""
        while b"\n" not in line:
            data = control.recv(4096)
            if not data or len(line) > 4096:
                raise ValueError("Récepteur SSH interrompu ; original conservé.")
            line += data
        response = json.loads(line.split(b"\n", 1)[0])
        if "error" in response:
            raise ValueError(response["error"])

        def keep_alive():
            while not finished.wait(2):
                try:
                    control.sendall(b"alive\n")
                except Exception:
                    finished.set()
                    return

        heartbeat = threading.Thread(target=keep_alive, daemon=True)
        heartbeat.start()
        sender = connecter(source.config)

        def forward(channel, _origin, _server):
            try:
                target = receiver.get_transport().open_channel(
                    "direct-tcpip", ("127.0.0.1", response["port"]), ("127.0.0.1", 0), timeout=10
                )
            except Exception:
                channel.close()
                return
            threading.Thread(target=bridge, args=(channel, target, finished), daemon=True).start()

        port = sender.get_transport().request_port_forward("127.0.0.1", 0, handler=forward)
        if phase:
            phase("copie rsync entre les deux serveurs SSH")
        return remote_call(
            source.config,
            dict(
                op="send_peer",
                roots=source.roots,
                identities=source.identities,
                path=str(src),
                port=port,
                secret=secret,
                filename=Path(str(dst)).name,
            ),
            stop,
            advance,
            phase,
            source.session,
        )
    finally:
        finished.set()
        if sender is not None:
            try:
                if port is not None and sender.get_transport():
                    sender.get_transport().cancel_port_forward("127.0.0.1", port)
            except Exception:
                pass
            finally:
                sender.close()
        if control is not None:
            try:
                control.sendall(b"stop\n")
                control.settimeout(10)
                while not control.exit_status_ready():
                    if not control.recv(4096):
                        break
            except Exception:
                pass
            control.close()
        if receiver is not None:
            receiver.close()
        if heartbeat is not None:
            heartbeat.join(timeout=3)


class PeerFilesystem:
    def __init__(self, source, destination):
        self.source, self.destination = source, destination
        self.session = source.session

    def path(self, path, side="source"):
        return (self.source if side == "source" else self.destination).path(path)

    def inventory(self, path, require_video=True):
        return path.fs.inventory(path, require_video)

    def signature(self, path):
        return path.fs.signature(path)

    def hash(self, path, stop=None):
        return path.fs.hash(path, stop)

    def free(self, path):
        return path.fs.free(path)

    def valid(self, src, dst, proof, mode):
        return bool(
            proof
            and proof.get("session") == self.session
            and (proof.get("sha256") or (mode == "standard" and proof.get("verification") == "rsync"))
            and proof.get("source") == self.signature(src)
            and proof.get("destination") == self.signature(dst)
        )

    def copy(self, src, dst, advance, stop, proof, phase, mode):
        before = self.signature(src)
        if dst.exists() and self.valid(src, dst, proof, mode):
            advance(before[1])
            return proof
        dst.parent.mkdir(parents=True, exist_ok=True)
        temporary = dst.fs.path(str(dst) + ".partiel")
        temporary.exists()  # Reject a symlink before starting the receiver.
        result = copy_peer(src.fs, dst.fs, src, temporary, stop, advance, phase)
        if stop.is_set():
            raise Interrompu()
        if result["source"] != before or self.signature(src) != before or temporary.stat().st_size != before[1]:
            raise ValueError("Copie incomplète ou source modifiée ; original conservé.")
        sha = None
        if mode == "renforce":
            sha = self.hash(src, stop)
            target_before = self.signature(temporary)
            if sha != self.hash(temporary, stop) or target_before != self.signature(temporary):
                raise ValueError("SHA-256 différent ; original conservé.")
        if self.signature(src) != before:
            raise ValueError("Source modifiée ; original conservé.")
        dst.fs.call("promote_peer", path=str(temporary), dst=str(dst), signature=self.signature(temporary))
        advance(max(0, before[1] - result["bytes"]))
        return dict(
            session=self.session,
            source=before,
            destination=self.signature(dst),
            sha256=sha,
            verification="sha256" if sha else "rsync",
        )

    def verify(self, src, dst, stop, proofs, mode):
        files = self.inventory(src, False)
        if not files or set(files) != set(self.inventory(dst, False)):
            raise ValueError("Inventaire différent ; original conservé.")
        for name in files:
            a, b = src / name, dst / name
            if stop.is_set():
                raise Interrompu()
            if not self.valid(a, b, proofs.get(name), mode):
                before, target = self.signature(a), self.signature(b)
                sha = self.hash(a, stop)
                if sha != self.hash(b, stop) or before != self.signature(a) or target != self.signature(b):
                    raise ValueError("Vérification différente ; original conservé.")
                proofs[name] = dict(session=self.session, source=before, destination=target, sha256=sha)
        return files

    def remove(self, src, dst, files, signatures, proofs):
        if set(files) != set(signatures) or set(self.inventory(dst, False)) != set(files):
            raise ValueError("Preuves de nettoyage incomplètes.")
        for name in files:
            if self.signature(dst / name) != signatures[name]:
                raise ValueError("Destination modifiée ; original conservé.")
        return src.fs.call("remove_peer", path=str(src), files=files, proofs=proofs)
