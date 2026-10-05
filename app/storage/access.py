"""Validated execution endpoints, independent from Arr/Plex associations."""

import asyncio
import json
from pathlib import PurePosixPath
from types import SimpleNamespace

from sqlalchemy import select

from ..models import ArrInstance, StorageAccess
from ..utils import now_utc_naive
from .planning import absolute_path, relative_path


def access_json(access):
    return dict(
        id=access.id,
        name=access.name,
        method=access.method,
        revision=access.revision,
        connection=access.connection,
        roots=access.roots,
        validation=access.validation,
        has_credentials=bool(access.credentials),
        connection_id=getattr(access, "connection_id", None),
    )


def ssh_config(access):
    connection = access.connection
    credentials = json.loads(access.credentials or "{}")
    return dict(
        ssh_host=connection.get("host"),
        ssh_port=connection.get("port", 22),
        ssh_user=connection.get("user"),
        ssh_fingerprint=connection.get("fingerprint"),
        ssh_auth=connection.get("auth", "key"),
        ssh_private_key=credentials.get("private_key", ""),
        ssh_password=credentials.get("password", ""),
        ssh_passphrase=credentials.get("passphrase", ""),
    )


async def config_for(db, access):
    from ..models import StorageConnection
    from .connections import config

    if not getattr(access, "connection_id", None):
        return ssh_config(access)
    connection = await db.get(StorageConnection, access.connection_id)
    if not connection or connection.method != access.method or not connection.tested:
        raise ValueError("Connexion non testée ou indisponible.")
    if access.validation and access.validation.get("connection_revision") not in (None, connection.revision):
        raise ValueError("Connexion modifiée : validez à nouveau les chemins.")
    return config(connection)


async def samples_for(db, instance_id, root):
    from .service import arr_request

    instance = await db.get(ArrInstance, instance_id)
    if not instance or not instance.enabled or instance.arr_type not in ("radarr", "sonarr"):
        raise ValueError("Instance Arr inconnue ou désactivée.")
    resource = "movie" if instance.arr_type == "radarr" else "series"
    samples = []
    for media in await arr_request(instance, "GET", resource):
        relative = relative_path(media["path"], root)
        if not relative or "/" in relative:
            continue
        files = await arr_request(
            instance,
            "GET",
            f"moviefile?movieId={media['id']}" if resource == "movie" else f"episodefile?seriesId={media['id']}",
        )
        for file in files:
            if file.get("relativePath") and file.get("size") is not None:
                samples.append(dict(path=relative + "/" + file["relativePath"], size=file["size"]))
        if len(samples) >= 5:
            break
    return samples[:20]


async def validate_access(db, access, selected_roots=None):
    from .arr_transfer import route
    from .discovery import request_engine
    from .remote_fs import remote_call
    from .service import discover_instance_roots

    config = await config_for(db, access)
    results = []
    for root in access.roots:
        if selected_roots is not None and (root["arr_instance_id"], root["arr_root"]) not in selected_roots:
            continue
        instance = await db.get(ArrInstance, root["arr_instance_id"])
        if not instance or not instance.enabled:
            raise ValueError("Instance Arr indisponible.")
        discovered = await discover_instance_roots(db, instance)
        await route(db, instance, root["arr_root"], discovered)
        samples = await samples_for(db, instance.id, root["arr_root"])
        request = dict(op="validate", roots=[root["path"]], path=root["path"], samples=samples)
        if access.method == "ssh":
            result = await asyncio.to_thread(remote_call, config, request)
        else:
            result = await request_engine(dict(operation="validate_access", **request))
        results.append(
            dict(
                **root,
                **result,
                warning="Aucun média Arr trouvé : accès validé, contenu non confirmé." if not samples else "",
            )
        )
    if selected_roots is not None:
        results.extend(
            r for r in access.validation.get("roots", []) if (r["arr_instance_id"], r["arr_root"]) not in selected_roots
        )
    access.validation = dict(revision=access.revision, checked_at=now_utc_naive().isoformat(), roots=results)
    if getattr(access, "connection_id", None):
        from ..models import StorageConnection

        conn = await db.get(StorageConnection, access.connection_id)
        access.validation = {**access.validation, "connection_revision": conn.revision}
    await db.flush()
    return access_json(access)


def matching_root(access, instance_id, root):
    matches = [r for r in access.roots if r["arr_instance_id"] == instance_id and r["arr_root"] == root]
    if len(matches) != 1:
        raise ValueError("Configurez l’accès à chacune des racines sélectionnées.")
    return matches[0]["path"]


async def preview_rsync(db, body):
    from .arr_transfer import preview_arr

    if not hasattr(body, "destination_root") or not hasattr(body, "arr_instance_id"):
        raise ValueError("Racines source et destination requises.")
    sources = body.source_roots or [body.source_root]
    selected = {}
    method = "ssh" if body.transfer_mode == "rsync_ssh" else "local"
    for root in [*sources, body.destination_root]:
        access_id = (
            getattr(body, "root_access_ids", {}).get(f"{body.arr_instance_id}:{root}", body.access_id)
            if method == "ssh"
            else body.access_id
        )
        access = await db.get(StorageAccess, access_id)
        if not access or access.method != method or access.validation.get("revision") != access.revision:
            raise ValueError("Choisissez un accès validé pour chaque racine.")
        matching_root(access, body.arr_instance_id, root)
        selected[root] = access
    for access in {a.id: a for a in selected.values()}.values():
        await validate_access(
            db,
            access,
            {(body.arr_instance_id, root) for root, endpoint in selected.items() if endpoint.id == access.id},
        )
    capacities = {
        root: next(
            r["free_bytes"]
            for r in a.validation["roots"]
            if r["arr_instance_id"] == body.arr_instance_id and r["arr_root"] == root
        )
        for root, a in selected.items()
    }
    access = selected[body.destination_root]
    target = matching_root(access, body.arr_instance_id, body.destination_root)
    destination = next(
        r
        for r in access.validation["roots"]
        if r["arr_instance_id"] == body.arr_instance_id and r["arr_root"] == body.destination_root
    )
    body.access_id = access.id
    destination_config = await config_for(db, access) if method == "ssh" else None
    for source in sources:
        source_access = selected[source]
        same_host = source_access.id == access.id
        if method == "ssh" and not same_host:
            config = await config_for(db, source_access)
            same_host = config.get("ssh_fingerprint") == destination_config.get("ssh_fingerprint")
        if same_host:
            source_path = PurePosixPath(matching_root(source_access, body.arr_instance_id, source))
            destination_path = PurePosixPath(target)
            if (
                source_path == destination_path
                or source_path in destination_path.parents
                or destination_path in source_path.parents
            ):
                raise ValueError("Chemins physiques source et destination identiques ou imbriqués.")
            proof = next(
                r
                for r in source_access.validation["roots"]
                if r["arr_instance_id"] == body.arr_instance_id and r["arr_root"] == source
            )
            if proof.get("identity") and proof["identity"] == destination.get("identity"):
                raise ValueError("Source et destination désignent le même dossier physique.")
    result = await preview_arr(db, body, capacity_overrides=capacities)
    if result["planned_bytes"] > destination["free_bytes"]:
        raise ValueError("Espace destination insuffisant selon le serveur rsync.")
    for item in result["items"]:
        snap = item["snapshot"]
        root = str(PurePosixPath(snap["source_arr"]).parent)
        snap.update(
            source_mount=matching_root(selected[root], body.arr_instance_id, root),
            destination_mount=target,
            relative=PurePosixPath(snap["source_arr"]).name,
            access_id=access.id,
            access_revision=access.revision,
        )
        if selected[root].id != access.id:
            snap.update(source_access_id=selected[root].id, source_access_revision=selected[root].revision)
    result["note"] = (
        "Rsync copie et vérifie avant la bascule Arr/Plex. L’original est conservé jusqu’à confirmation Plex. Pause interrompt la copie ; aucun repli automatique."
    )
    return result


async def filesystem_for(db, job, snapshot):
    from .remote_fs import RemoteFilesystem

    access = await db.get(StorageAccess, snapshot["access_id"])
    if not access or access.revision != snapshot["access_revision"]:
        raise ValueError("Accès rsync modifié depuis la préparation : refaites l’aperçu.")
    expected = "ssh" if job.params["transfer_mode"] == "rsync_ssh" else "local"
    if access.method != expected or access.validation.get("revision") != access.revision:
        raise ValueError("Accès rsync non validé.")
    source_access = await db.get(StorageAccess, snapshot.get("source_access_id", access.id))
    if not source_access or source_access.revision != snapshot.get("source_access_revision", access.revision):
        raise ValueError("Accès source modifié depuis la préparation.")
    if source_access.method != expected or source_access.validation.get("revision") != source_access.revision:
        raise ValueError("Accès source non validé.")
    for side, endpoint in (("source", source_access), ("destination", access)):
        root = str(PurePosixPath(snapshot[side + "_arr"]).parent)
        if matching_root(endpoint, job.params["arr_instance_id"], root) != snapshot[side + "_mount"]:
            raise ValueError("Correspondance moteur modifiée.")
    if access.method == "ssh":
        from .integrite import SESSION_VERIFICATION
        from .peer_fs import PeerFilesystem

        async def remote(endpoint):
            return RemoteFilesystem(
                await config_for(db, endpoint),
                sorted({r["path"] for r in endpoint.roots}),
                SESSION_VERIFICATION,
                {r["path"]: r["identity"] for r in endpoint.validation["roots"]},
            )

        destination = await remote(access)
        return (
            destination if source_access.id == access.id else PeerFilesystem(await remote(source_access), destination)
        )
    return None


async def preview_priority(db, body):
    """Choose before copying; job creation and every resume pin the chosen method."""
    from .arr_transfer import preview_arr

    methods = body.transfer_methods
    if len(set(methods)) != len(methods):
        raise ValueError("Chaque méthode ne peut apparaître qu’une fois.")
    import httpx
    import paramiko

    failures = []
    for mode in methods:
        candidate = body.model_copy(deep=True)
        candidate.transfer_methods = []
        candidate.transfer_mode = mode
        candidate.access_id = 0 if mode == "arr" else candidate.access_ids.get(mode, candidate.access_id)
        try:
            result = await (preview_arr(db, candidate) if mode == "arr" else preview_rsync(db, candidate))
        except (ValueError, OSError, RuntimeError, httpx.HTTPError, paramiko.SSHException):
            failures.append(mode)
            continue
        result["transfer_mode"] = mode
        result["access_id"] = candidate.access_id
        result["skipped_methods"] = failures
        result["preferred_methods"] = methods
        body.preferred_methods = methods
        body.transfer_mode, body.access_id = mode, candidate.access_id
        body.transfer_methods = []
        return result
    raise ValueError("Aucune méthode choisie n’a passé les contrôles. Vérifiez les accès et les associations.")
