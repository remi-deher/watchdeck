"""Short-lived loopback rsync receiver. Shipped through a pinned SSH session."""

import hashlib
import json
import os
import select
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path


def provide_auth(path, token, done):
    while not done.is_set():
        try:
            fd = os.open(path, os.O_WRONLY | os.O_NONBLOCK)
        except OSError:
            done.wait(0.1)
            continue
        try:
            os.write(fd, ("watchdeck:" + token + "\n").encode())
        finally:
            os.close(fd)
        return


def serve():
    import fcntl

    body = json.loads(sys.stdin.readline())
    lock_name = hashlib.sha256(json.dumps(sorted(body["roots"])).encode()).hexdigest()
    lock = open(f"/tmp/watchdeck-rsync-{os.getuid()}-{lock_name}.lock", "a")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    root = Path(body["root"])
    if not root.is_absolute() or "\n" in str(root) or "\r" in str(root):
        raise ValueError("Invalid receiver path")
    if any(p.is_symlink() for p in [root, *root.parents]) or not root.is_dir():
        raise ValueError("Invalid receiver root")
    st = root.stat()
    if [st.st_dev, st.st_ino] != body["identity"]:
        raise ValueError("Receiver storage changed")
    # A FIFO carries authentication directly from RAM into rsync. Its contents
    # are never a regular file, and the containing directory is private (0700).
    with tempfile.TemporaryDirectory(prefix="watchdeck-rsync-peer-") as tmp:
        pipe_path = Path(tmp) / "auth.pipe"
        os.mkfifo(pipe_path, 0o600)
        done = threading.Event()
        writer = threading.Thread(target=provide_auth, args=(pipe_path, body["secret"], done), daemon=True)
        writer.start()
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        config = Path(tmp) / "rsync.conf"
        config.write_text(
            "\n".join(
                [
                    "address = 127.0.0.1",
                    f"port = {port}",
                    "use chroot = no",
                    # Unprivileged daemons must retain the SSH user's groups.
                    # An explicit gid asks rsync to call setgroups(), which fails.
                    *(["uid = 0", "gid = 0"] if os.getuid() == 0 else []),
                    f"pid file = {tmp}/pid",
                    f"lock file = {tmp}/connections.lock",
                    "max connections = 1",
                    "[media]",
                    f"path = {root}",
                    "read only = no",
                    "list = no",
                    "auth users = watchdeck",
                    f"secrets file = {pipe_path}",
                    "hosts allow = 127.0.0.1",
                    "hosts deny = *",
                ]
            )
            + "\n"
        )
        proc = subprocess.Popen(
            ["rsync", "--daemon", "--no-detach", "--config=" + str(config)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

        def terminate(*_):
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)

        signal.signal(signal.SIGTERM, terminate)
        try:
            deadline = time.monotonic() + 10
            while True:
                if proc.poll() is not None or time.monotonic() > deadline:
                    raise ValueError("Receiver unavailable")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                        break
                except OSError:
                    time.sleep(0.1)
            print(json.dumps({"port": port}), flush=True)
            last = time.monotonic()
            while proc.poll() is None and time.monotonic() - last < 15:
                if select.select([sys.stdin], [], [], 1)[0]:
                    line = sys.stdin.readline()
                    if not line or line.strip() == "stop":
                        break
                    last = time.monotonic()
        finally:
            terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
            done.set()
            writer.join(timeout=2)
            print(json.dumps({"stopped": True}), flush=True)


if __name__ == "__main__":
    try:
        serve()
    except Exception:
        print(json.dumps({"error": "Récepteur rsync indisponible ; original conservé."}), flush=True)
