"""Read-only engine discovery; shared path segments are suggestions, never proof."""

import asyncio
import json
import os
import time
import uuid
from pathlib import Path, PurePosixPath

from redis.asyncio import Redis
from redis.exceptions import RedisError

from .local_mounts import media_mounts
from .planning import absolute_path


def storage_identity(path):
    parts = PurePosixPath(absolute_path(path)).parts[1:]
    if parts[0] == "storage":
        parts = parts[1:]
    if not parts:
        return None
    # Conventional DATA1 aliases. Unknown roots must be selected explicitly.
    return {"data": "data1", "media": "data1"}.get(parts[0], parts[0])


def compatible(left, right):
    return storage_identity(left) == storage_identity(right) and PurePosixPath(left).name == PurePosixPath(right).name


def sample_matches(folder, files):
    if not files:
        return False
    for sample in files:
        relative = sample["path"]
        absolute_path("/" + relative)
        if relative.startswith("/"):
            raise ValueError("Chemin relatif attendu.")
        file = folder / relative
        if file.resolve() != file or not file.is_file() or file.stat().st_size != sample["size"]:
            return False
        with file.open("rb") as stream:
            stream.read(1)
    return True


def inspect_request(body):
    if body.get("operation") == "browse":
        from .worker import mounted_root

        value = body["path"]
        mounts = media_mounts()
        if value == "/":
            visible = sorted({"/storage", *(mount for mount in mounts if not mount.startswith("/storage/"))})
            return dict(
                path=value,
                parent=None,
                directories=[dict(name=mount, path=mount) for mount in visible],
                selectable=False,
            )
        if value == "/storage" and value not in mounts:
            return dict(
                path=value,
                parent="/",
                directories=[
                    dict(name=mount.removeprefix("/storage/"), path=mount)
                    for mount in mounts
                    if mount.startswith("/storage/")
                ],
                selectable=False,
            )
        path = mounted_root(value)
        directories = []
        for entry in path.iterdir():
            if entry.is_dir() and not entry.is_symlink():
                directories.append(dict(name=entry.name, path=str(entry)))
            if len(directories) > 500:
                raise ValueError("Trop de dossiers : indiquez un chemin plus précis.")
        parent = str(path.parent)
        if not any(parent == mount or parent.startswith(mount + "/") for mount in mounts):
            parent = "/"
        return dict(
            path=str(path),
            parent=parent,
            directories=sorted(directories, key=lambda f: f["name"].casefold()),
            selectable=True,
        )
    if body.get("operation") == "validate_access":
        from .remote_agent import validate_root
        from .worker import mounted_root

        mounted_root(body["path"])
        return validate_root(body["path"], body.get("samples", []))
    from .worker import mounted_root

    mounts = media_mounts()
    candidates = []
    for mount in sorted(set(mounts)):
        try:
            base = mounted_root(mount)
            folders = [base]
            # Bounded discovery of media roots, never recurse into title folders.
            for parent in [base, base / "MEDIA"]:
                if parent.is_dir() and not parent.is_symlink():
                    folders.extend(p for p in parent.iterdir() if p.is_dir() and not p.is_symlink())
            for folder in sorted(set(folders)):
                if folder.resolve() != folder or folder.name != PurePosixPath(body["arr_root"]).name:
                    continue
                suggested = compatible(body["arr_root"], str(folder)) and compatible(body["plex_root"], str(folder))
                files = body.get("files", [])
                matched = sample_matches(folder, files)
                candidates.append(
                    dict(
                        mount_path=mount,
                        subdirectory=str(folder.relative_to(base)) if folder != base else "",
                        label=f"{base.name.upper()} → {folder.name}",
                        path=str(folder),
                        suggested=suggested,
                        matched=matched,
                    )
                )
        except (OSError, ValueError):
            continue
    confirmed = [c for c in candidates if c["suggested"] and c["matched"]]
    return dict(candidates=candidates, automatic=confirmed[0] if len(confirmed) == 1 else None)


def redis_client():
    return Redis.from_url(
        os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )


async def request_engine(body):
    client = redis_client()
    key = "storage:discovery:" + uuid.uuid4().hex
    try:
        await client.rpush("storage:discovery:queue", json.dumps(dict(key=key, expires=time.time() + 20, body=body)))
        await client.expire("storage:discovery:queue", 60)
        await client.ltrim("storage:discovery:queue", -50, -1)
        for _ in range(80):
            result = await client.get(key)
            if result:
                await client.delete(key)
                return json.loads(result)
            await asyncio.sleep(0.25)
        raise ValueError("Moteur de transfert indisponible : vérifiez qu’il est démarré avec ses stockages montés.")
    finally:
        await client.aclose()


async def serve_discovery():
    client = redis_client()
    try:
        while True:
            try:
                raw = await client.lpop("storage:discovery:queue")
                if raw:
                    request = json.loads(raw)
                    if request["expires"] > time.time():
                        result = await asyncio.to_thread(inspect_request, request["body"])
                        await client.set(request["key"], json.dumps(result), ex=30)
                else:
                    await asyncio.sleep(0.25)
            except (OSError, ValueError, RedisError, KeyError):
                await asyncio.sleep(1)
    finally:
        await client.aclose()
