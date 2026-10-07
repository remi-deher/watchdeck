"""Pinned SSH identities and read-only directory browsing."""

import base64
import hashlib
import json
import socket
import stat
import time
from pathlib import PurePosixPath

from .planning import absolute_path
from .ssh_hash import connecter


def fingerprint(key):
    return "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")


def probe(host, port):
    import paramiko

    with socket.create_connection((host, port), timeout=10) as sock:
        transport = paramiko.Transport(sock)
        try:
            transport.start_client(timeout=10)
            key = transport.get_remote_server_key()
            return dict(fingerprint=fingerprint(key), algorithm=key.get_name())
        finally:
            transport.close()


def connection_json(connection):
    credentials = json.loads(connection.credentials or "{}")
    return dict(
        id=connection.id,
        name=connection.name,
        method=connection.method,
        connection=connection.connection,
        revision=connection.revision,
        fingerprint=connection.fingerprint,
        tested=connection.tested,
        trusted=bool(connection.fingerprint) or connection.method == "local",
        has_credentials=bool(connection.credentials),
        has_private_key=bool(credentials.get("private_key")),
        has_password=bool(credentials.get("password")),
    )


def config(connection):
    props = connection.connection
    credentials = json.loads(connection.credentials or "{}")
    return dict(
        ssh_host=props.get("host"),
        ssh_port=props.get("port", 22),
        ssh_user=props.get("user"),
        ssh_auth=props.get("auth", "key"),
        ssh_auth_fallback=props.get("auth_fallback", False),
        ssh_fingerprint=connection.fingerprint,
        ssh_private_key=credentials.get("private_key", ""),
        ssh_password=credentials.get("password", ""),
        ssh_passphrase=credentials.get("passphrase", ""),
    )


def test_connection(connection):
    if connection.method == "local":
        return
    client = connecter(config(connection))
    try:
        auth_method = getattr(client, "storage_auth_method", None)
        _, output, _ = client.exec_command(
            'python3 -c \'import shutil,subprocess; p=shutil.which("rsync"); assert p; assert "xxh128" in subprocess.check_output([p,"--version"],text=True)\'',
            timeout=15,
        )
        deadline = time.monotonic() + 20
        while not output.channel.exit_status_ready():
            if time.monotonic() > deadline:
                raise TimeoutError("Test SSH trop long.")
            time.sleep(0.1)
        if output.channel.recv_exit_status() != 0:
            raise ValueError("Python 3 ou rsync compatible indisponible.")
        return auth_method
    finally:
        client.close()


def browse(connection, path):
    # Browsing the server root is read-only; selecting it for a transfer remains forbidden.
    path = "/" if path == "/" else absolute_path(path)
    client = connecter(config(connection))
    sftp = None
    try:
        sftp = client.open_sftp()
        sftp.get_channel().settimeout(10)
        current = PurePosixPath(path)
        for part in [*reversed(current.parents), current]:
            if not stat.S_ISDIR(sftp.lstat(str(part)).st_mode):
                raise ValueError("Dossier absent, inaccessible ou lien symbolique.")
        folders = []
        for entry in sftp.listdir_iter(path):
            if stat.S_ISDIR(entry.st_mode) and entry.filename not in (".", ".."):
                folders.append(dict(name=entry.filename, path=str(current / entry.filename)))
            if len(folders) > 500:
                raise ValueError("Trop de dossiers : renseignez un chemin plus précis.")
        return dict(
            path=path,
            parent=str(current.parent) if path != "/" else None,
            directories=sorted(folders, key=lambda f: f["name"].casefold()),
        )
    finally:
        if sftp:
            sftp.close()
        client.close()
