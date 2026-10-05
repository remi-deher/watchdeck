"""Executed over SSH, uses only Python's standard library and installed rsync."""

import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

VIDEO = (".mkv", ".mp4", ".avi", ".m4v", ".mov", ".ts", ".m2ts", ".wmv")


def checked(path, roots):
    p = Path(path)
    if not p.is_absolute() or ".." in p.parts or str(p) == "/":
        raise ValueError("Chemin absolu non ambigu requis.")
    if not any(p == Path(root) or Path(root) in p.parents for root in roots):
        raise ValueError("Chemin hors des racines validées.")
    if any(parent.is_symlink() for parent in [p, *p.parents]):
        raise ValueError("Lien symbolique interdit.")
    return p


def inventory(path, require_video=True):
    files = []
    for parent, dirs, names in os.walk(path, followlinks=False):
        if any((Path(parent) / name).is_symlink() for name in dirs + names):
            raise ValueError("Lien symbolique interdit.")
        files.extend(str((Path(parent) / name).relative_to(path)) for name in names)
    if require_video and not any(f.lower().endswith(VIDEO) for f in files):
        raise ValueError("Aucun fichier vidéo source.")
    return sorted(files)


def validate_root(root, samples):
    p = checked(root, [root])
    if not p.is_dir() or not os.access(p, os.R_OK | os.X_OK):
        raise ValueError("Dossier absent ou illisible.")
    executable = shutil.which("rsync")
    if not executable:
        raise ValueError("rsync absent du serveur.")
    version = subprocess.check_output([executable, "--version"], text=True, timeout=10)
    if "xxh128" not in version:
        raise ValueError("Version rsync incompatible : prise en charge xxh128 requise.")
    for sample in samples:
        if Path(sample["path"]).is_absolute():
            raise ValueError("Échantillon relatif requis.")
        file = checked(str(p / sample["path"]), [root])
        if not file.is_file() or file.stat().st_size != sample["size"]:
            raise ValueError("Fichiers Arr différents du chemin d’accès : association refusée.")
        with file.open("rb") as stream:
            stream.read(1)
    # A real write/flush, then unlink, also tests ACLs and read-only mounts.
    with tempfile.NamedTemporaryFile(prefix=".watchdeck-check-", dir=p) as probe:
        probe.write(b"watchdeck")
        probe.flush()
        os.fsync(probe.fileno())
    usage = shutil.disk_usage(p)
    st = p.stat()
    return dict(
        free_bytes=usage.free, total_bytes=usage.total, identity=[st.st_dev, st.st_ino], sampled_files=len(samples)
    )


def dispatch(body, integrity, stop):
    roots = body["roots"]
    for root in roots:
        if str(root) == "/" or not checked(root, roots).is_dir():
            raise ValueError("Racine absente ou invalide.")
    for root, identity in body.get("identities", {}).items():
        st = checked(root, roots).stat()
        if [st.st_dev, st.st_ino] != identity:
            raise ValueError("Stockage remplacé depuis la validation.")
    op = body["op"]
    if op == "validate":
        return validate_root(body["path"], body.get("samples", []))
    path = checked(body.get("path", body.get("src", roots[0])), roots)
    if op == "exists":
        return path.exists()
    if op == "is_dir":
        return path.is_dir()
    if op == "size":
        return path.stat().st_size
    if op == "signature":
        return integrity["signature"](str(path))
    if op == "hash":
        return integrity["empreinte"](str(path), stop)
    if op == "free":
        return shutil.disk_usage(path).free
    if op == "inventory":
        return inventory(path, body.get("require_video", True))
    if op == "mkdir":
        path.mkdir(parents=body["parents"], exist_ok=body["exist_ok"])
        return True
    src, dst = path, checked(body["dst"], roots)
    if (
        src == dst
        or src in dst.parents
        or dst in src.parents
        or (src.exists() and dst.exists() and os.path.samefile(src, dst))
    ):
        raise ValueError("Source et destination identiques ou imbriquées.")
    if op == "copy":
        return integrity["copier_rsync"](
            str(src),
            str(dst),
            lambda delta: emit(dict(delta=delta)),
            stop,
            body.get("proof"),
            lambda phase: emit(dict(phase=phase)),
            body["mode"],
        )
    if op == "verify":
        return integrity["verifier_dossier"](str(src), str(dst), stop, body["proofs"], body["mode"])
    if op == "remove":
        if not body["files"] or set(body["signatures"]) != set(body["files"]):
            raise ValueError("Preuves de nettoyage incomplètes.")
        if src in [Path(root) for root in roots]:
            raise ValueError("Suppression d’une racine interdite.")
        if set(inventory(dst, False)) != set(body["files"]) or not set(inventory(src, False)).issubset(body["files"]):
            raise ValueError("Inventaire modifié : nettoyage refusé.")
        for name, signature in body["signatures"].items():
            target = checked(str(dst / name), roots)
            if integrity["signature"](str(target)) != signature:
                raise ValueError("Destination modifiée : original conservé.")
        for name in inventory(src, False):
            original = checked(str(src / name), roots)
            if integrity["signature"](str(original)) != body.get("proofs", {}).get(name, {}).get("source"):
                raise ValueError("Source modifiée : nettoyage refusé.")
        if stop.is_set():
            raise ValueError("Session interrompue : original conservé.")
        shutil.rmtree(src)
        return True
    raise ValueError("Opération inconnue.")


def emit(value):
    print(json.dumps(value), flush=True)


def main(integrity_source, session):
    import fcntl

    body = json.loads(sys.stdin.readline())
    integrity = {}
    exec(integrity_source, integrity)
    integrity["SESSION_VERIFICATION"] = session
    stop = threading.Event()
    heartbeat = [time.monotonic()]

    def reader():
        for line in sys.stdin:
            if line.strip() == "stop":
                stop.set()
                break
            heartbeat[0] = time.monotonic()
        stop.set()

    def watchdog():
        while not stop.wait(1):
            if time.monotonic() - heartbeat[0] > 15:
                stop.set()

    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    threading.Thread(target=reader, daemon=True).start()
    threading.Thread(target=watchdog, daemon=True).start()
    # Serialize remote operations even after an SSH disconnect leaves rsync stopping.
    lock_name = hashlib.sha256(json.dumps(sorted(body["roots"])).encode()).hexdigest()
    with open(f"/tmp/watchdeck-rsync-{os.getuid()}-{lock_name}.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = dispatch(body, integrity, stop)
            emit(dict(result=result))
        except Exception:
            # Never return exception contents that could contain secrets or commands.
            emit(
                dict(
                    error="Opération rsync/SSH refusée ou interrompue ; original conservé. Vérifiez les chemins, permissions et l’espace disponible."
                )
            )


if __name__ == "__main__":
    main(globals()["INTEGRITY"], globals()["SESSION"])  # supplied by the authenticated SSH caller
