"""Integration smoke test using two disposable local SSH containers."""

import base64
import hashlib
import json
import secrets
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))
from app.storage.peer_fs import PeerFilesystem
from app.storage.remote_fs import RemoteFilesystem, remote_call
from app.storage.ssh_hash import connecter

run_id = secrets.token_hex(6)
names = [f"watchdeck-peer-smoke-{run_id}-a", f"watchdeck-peer-smoke-{run_id}-b"]
ports = []
created = []
password = secrets.token_hex(20)
try:
    for name in names:
        command = "apk add --no-cache openssh-server >/dev/null && ssh-keygen -A >/dev/null 2>&1 && printf 'root:%s\\n' \"$SMOKE_PASSWORD\" | chpasswd && mkdir -p /media && exec /usr/sbin/sshd -D -e -o PermitRootLogin=yes -o PasswordAuthentication=yes -o AllowTcpForwarding=no"
        subprocess.run(
            [
                "docker",
                "run",
                "-d",
                "--name",
                name,
                "-p",
                "127.0.0.1::22",
                "-e",
                "SMOKE_PASSWORD=" + password,
                "--entrypoint",
                "sh",
                "watchdeck:local",
                "-c",
                command,
            ],
            check=True,
            capture_output=True,
        )
        created.append(name)
        binding = subprocess.check_output(["docker", "port", name, "22/tcp"], text=True).strip()
        ports.append(int(binding.rsplit(":", 1)[1]))
    import logging

    import paramiko

    logging.getLogger("paramiko.transport").setLevel(logging.CRITICAL)

    configs = []
    for port in ports:
        for attempt in range(60):
            try:
                t = paramiko.Transport(("127.0.0.1", port))
                t.start_client(timeout=3)
                key = t.get_remote_server_key()
                t.close()
                break
            except Exception:
                time.sleep(1)
        else:
            raise RuntimeError("SSH smoke server did not start")
        configs.append(
            dict(
                ssh_host="127.0.0.1",
                ssh_port=port,
                ssh_user="root",
                ssh_auth="password",
                ssh_password=password,
                ssh_fingerprint="SHA256:"
                + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("="),
            )
        )
    for config in configs:
        c = connecter(config)
        _, out, err = c.exec_command("python3 -c \"import os;os.makedirs('/media/Film',exist_ok=True)\"")
        out.read()
        err.read()
        c.close()
    source = RemoteFilesystem(configs[0], ["/media"], "smoke")
    destination = RemoteFilesystem(configs[1], ["/media"], "smoke")
    fs = PeerFilesystem(source, destination)
    c = connecter(configs[0])
    _, out, err = c.exec_command(
        "python3 -c \"from pathlib import Path;Path('/media/Film/test.mkv').write_bytes(bytes(range(256))*32768)\""
    )
    out.read()
    err.read()
    c.close()
    a = source.path("/media/Film/test.mkv")
    b = destination.path("/media/Film/test.mkv")
    progress = []
    stop = threading.Event()

    def cancel(delta):
        stop.set()

    try:
        fs.copy(a, b, cancel, stop, None, lambda x: None, "standard")
        raise AssertionError("Cancellation was ignored")
    except Exception as exc:
        from app.storage.integrite import Interrompu

        assert isinstance(exc, Interrompu), type(exc)
    assert a.exists() and not b.exists()
    print("Arrêt pendant la copie : original conservé, aucune bascule : OK")
    p = fs.copy(a, b, progress.append, threading.Event(), None, lambda x: None, "standard")
    assert sum(progress) == a.stat().st_size, (sum(progress), a.stat().st_size)
    assert fs.hash(a) == fs.hash(b)
    assert fs.verify(
        source.path("/media/Film"), destination.path("/media/Film"), threading.Event(), {"test.mkv": p}, "standard"
    ) == ["test.mkv"]
    assert a.exists()
    print("Copie inter-serveurs, checksum, vérification, original conservé : OK")
    c = connecter(configs[1])
    _, out, err = c.exec_command(
        "python3 -c \"from pathlib import Path;Path('/media/Film/test.mkv.partiel').write_bytes(b'corrupted partial')\""
    )
    out.read()
    err.read()
    c.close()
    p = fs.copy(a, b, lambda x: None, threading.Event(), None, lambda x: None, "renforce")
    assert p["sha256"] == fs.hash(a) == fs.hash(b)
    print("Reprise partielle corrompue et SHA-256 local sur chaque serveur : OK")
    fs.remove(
        source.path("/media/Film"),
        destination.path("/media/Film"),
        ["test.mkv"],
        {"test.mkv": fs.signature(b)},
        {"test.mkv": p},
    )
    assert not source.path("/media/Film").exists() and b.exists()
    print("Nettoyage original après preuves : OK")
finally:
    for name in created:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)
