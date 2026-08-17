import asyncio
import hashlib
import ipaddress
import logging
import os
import re
import socket
import uuid
from typing import Optional
from urllib.parse import urlparse

import httpx

from ..utils import safe_error_message

logger = logging.getLogger(__name__)


def _sanitized_watch_folder_path(path: str) -> str | None:
    """Chemin de dossier surveillé canonicalisé, ou None si suspect.

    `path` vient d'un champ admin (Settings/DownloadClient) mais reste une valeur
    utilisateur du point de vue d'une analyse statique (CodeQL py/path-injection) :
    on exige un chemin absolu, sans segment ".." après normalisation, plutôt que de
    passer la chaîne brute telle quelle à os.path.isdir/open/os.remove.
    """
    if not path or not os.path.isabs(path):
        return None
    normalized = os.path.normpath(path)
    if ".." in normalized.split(os.sep):
        return None
    return normalized


async def _resolves_to_forbidden_target(hostname: str) -> bool:
    """True si `hostname` resout (DNS ou IP litterale) vers du loopback ou du
    lien-local (metadata cloud type 169.254.169.254, ou 127.0.0.1 du conteneur
    lui-meme). Ces cibles n'ont jamais de raison legitime d'etre une URL de
    torrent, contrairement au reste du reseau prive Docker ou vit Prowlarr/le
    client de telechargement (voir commentaire d'appel) : on ne bloque donc
    pas les plages RFC1918 en general, seulement ce sous-ensemble sans usage
    valide, pour ne pas casser le fonctionnement normal de la fonctionnalite.

    Limite connue : la resolution est faite ici puis httpx resout de nouveau
    au moment de la requete, donc un DNS rebinding entre les deux passerait
    ce filtre. Hors de portee pour une route deja reservee aux administrateurs.

    Une resolution DNS qui echoue n'est PAS traitee comme suspecte : un nom de
    service Docker interne (ex. "prowlarr") peut ne pas se resoudre depuis la
    ou tourne ce controle (tests, timing du reseau Docker au demarrage) sans
    que ce soit un signal d'attaque. On laisse alors httpx echouer lui-meme
    naturellement plutot que de bloquer un usage legitime.
    """
    try:
        infos = await asyncio.get_event_loop().getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_loopback or ip.is_link_local:
            return True
    return False


_QB_STATE_MAP: dict[str, str] = {
    "downloading": "downloading",
    "checkingdl": "downloading",
    "stalleddl": "downloading",
    "metadl": "downloading",
    "forceddl": "downloading",
    "uploading": "seeding",
    "stalledup": "seeding",
    "forcedup": "seeding",
    "checkingup": "seeding",
    "pauseddl": "paused",
    "pausedup": "paused",
}

_WATCH_FOLDER_STATUS = {
    "name": "Watch Folder",
    "progress": 100.0,
    "status": "completed",
    "ratio": 0.0,
    "seeding_time": 0,
    "download_speed": 0,
    "upload_speed": 0,
    "eta": 0,
    "content_path": None,
}


def extract_hash_from_magnet(magnet: str) -> Optional[str]:
    """Extrait le hash info d'un lien magnet (format hexadecimal 40 caractères)."""
    m = re.search(r"urn:btih:([a-zA-Z0-9]+)", magnet)
    if m:
        h = m.group(1).lower()
        # Si c'est encodé en base32 (32 caractères), on le garde, mais qBittorrent et Transmission supportent l'hex.
        # En général c'est du sha1 hex (40 char).
        return h
    return None


async def qbittorrent_login(
    client: httpx.AsyncClient, url: str, username: Optional[str], password: Optional[str]
) -> str | None:
    """Se connecte à qBittorrent et retourne le cookie SID."""
    login_url = f"{url.rstrip('/')}/api/v2/auth/login"
    data = {"username": username or "", "password": password or ""}
    try:
        r = await client.post(login_url, data=data, timeout=10)
        r.raise_for_status()
        if "Ok" in r.text and "SID" in r.cookies:
            return r.cookies["SID"]
        logger.warning(f"qBittorrent login failed: {r.text}")
        return None
    except Exception as e:
        logger.error(f"qBittorrent login error: {e}")
        return None


async def qbittorrent_auth_cookies(
    client: httpx.AsyncClient, url: str, username: Optional[str], password: Optional[str]
) -> dict[str, str] | None:
    """Crée une session, ou n'envoie aucun cookie si l'accès réseau est autorisé."""
    if not (username or "").strip() and not (password or "").strip():
        return {}
    sid = await qbittorrent_login(client, url, username, password)
    return {"SID": sid} if sid else None


async def check_qbittorrent(url: str, username: Optional[str], password: Optional[str]) -> tuple[bool, str]:
    """Vérifie la connexion avec qBittorrent."""
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return False, "Échec d'authentification ou connexion impossible"

        # Test de l'API
        version_url = f"{url.rstrip('/')}/api/v2/app/version"
        try:
            r = await client.get(version_url, cookies=cookies, timeout=10)
            r.raise_for_status()
            return True, f"Connecté à qBittorrent v{r.text}"
        except Exception as e:
            return False, f"Erreur API: {str(e)}"


async def add_qbittorrent_torrent(
    url: str,
    username: Optional[str],
    password: Optional[str],
    torrent_url_or_magnet: str,
    category: Optional[str] = None,
    tags: Optional[str] = None,
) -> tuple[bool, str, str | None]:
    """Ajoute un torrent à qBittorrent et retourne (success, message, hash)."""
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return False, "Échec de connexion/authentification", None

        add_url = f"{url.rstrip('/')}/api/v2/torrents/add"
        data = {
            "urls": torrent_url_or_magnet,
        }
        if category:
            data["category"] = category
        if tags:
            data["tags"] = tags

        try:
            r = await client.post(add_url, data=data, cookies=cookies, timeout=15)
            r.raise_for_status()
            if "Ok" in r.text or r.status_code == 200:
                # Récupérer le hash du torrent
                info_hash = extract_hash_from_magnet(torrent_url_or_magnet)
                if not info_hash:
                    # Si c'était un lien HTTP, interroger les torrents récents pour trouver le hash
                    try:
                        info_url = f"{url.rstrip('/')}/api/v2/torrents/info"
                        r_info = await client.get(
                            info_url,
                            params={"sort": "added_on", "reverse": "true", "limit": 1},
                            cookies=cookies,
                            timeout=5,
                        )
                        if r_info.status_code == 200:
                            torrents = r_info.json()
                            if torrents:
                                info_hash = torrents[0].get("hash")
                    except Exception as e:
                        logger.warning(f"Impossible de récupérer le hash du torrent récemment ajouté : {e}")
                return True, "Torrent ajouté avec succès à qBittorrent", info_hash
            return False, f"Réponse qBittorrent: {r.text}", None
        except Exception as e:
            return False, f"Erreur d'ajout qBittorrent: {str(e)}", None


async def get_qbittorrent_status(
    url: str, username: Optional[str], password: Optional[str], torrent_hash: str
) -> dict | None:
    """Récupère l'avancement d'un torrent spécifique dans qBittorrent."""
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return None
        info_url = f"{url.rstrip('/')}/api/v2/torrents/info"
        try:
            r = await client.get(info_url, params={"hashes": torrent_hash}, cookies=cookies, timeout=10)
            r.raise_for_status()
            torrents = r.json()
            if not torrents:
                return None
            t = torrents[0]
            state = t.get("state", "").lower()
            if "error" in state or "missing" in state:
                status = "error"
            else:
                status = _QB_STATE_MAP.get(state, "completed")

            return {
                "name": t.get("name", ""),
                "content_path": t.get("content_path") or (
                    os.path.join(t.get("save_path"), t.get("name", "")) if t.get("save_path") else None
                ),
                "progress": t.get("progress", 0.0) * 100.0,
                "status": status,
                "ratio": t.get("ratio", 0.0),
                "seeding_time": t.get("seeding_time", 0),
                "download_speed": t.get("dlspeed", 0),
                "upload_speed": t.get("upspeed", 0),
                "eta": t.get("eta", 0),
            }
        except Exception as e:
            logger.error(f"Error getting qBittorrent status: {e}")
            return None


async def delete_qbittorrent_torrent(
    url: str, username: Optional[str], password: Optional[str], torrent_hash: str, delete_files: bool
) -> bool:  # noqa: FBT001
    """Supprime un torrent dans qBittorrent."""
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return False
        try:
            response = await client.post(
                f"{url.rstrip('/')}/api/v2/torrents/delete",
                data={"hashes": torrent_hash, "deleteFiles": "true" if delete_files else "false"},
                cookies=cookies,
                timeout=15,
            )
            response.raise_for_status()
            return True
        except Exception as exc:
            logger.error(f"Error deleting qBittorrent torrent: {exc}")
            return False


async def list_qbittorrent_torrents(
    url: str, username: Optional[str], password: Optional[str]
) -> list[dict]:
    """Retourne la file qBittorrent complète pour le centre de contrôle."""
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            raise RuntimeError("Connexion qBittorrent impossible")
        response = await client.get(
            f"{url.rstrip('/')}/api/v2/torrents/info",
            params={"sort": "added_on", "reverse": "true"},
            cookies=cookies,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()


async def get_qbittorrent_metadata(
    url: str, username: Optional[str], password: Optional[str]
) -> dict:
    """Retourne les catégories et tags déclarés dans qBittorrent."""
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            raise RuntimeError("Connexion qBittorrent impossible")
        categories_response, tags_response = await asyncio.gather(
            client.get(f"{url.rstrip('/')}/api/v2/torrents/categories", cookies=cookies, timeout=15),
            client.get(f"{url.rstrip('/')}/api/v2/torrents/tags", cookies=cookies, timeout=15),
        )
        categories_response.raise_for_status()
        tags_response.raise_for_status()
        categories = categories_response.json() or {}
        return {
            "categories": [
                {"name": name, "save_path": value.get("savePath", "")}
                for name, value in sorted(categories.items(), key=lambda item: item[0].casefold())
            ],
            "tags": sorted(tags_response.json() or [], key=str.casefold),
            "mutable": True,
        }


async def mutate_qbittorrent_metadata(
    url: str,
    username: Optional[str],
    password: Optional[str],
    *,
    kind: str,
    action: str,
    name: str,
    new_name: Optional[str] = None,
) -> None:
    """Crée, renomme ou supprime une catégorie/un tag qBittorrent."""
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            raise RuntimeError("Connexion qBittorrent impossible")
        base = f"{url.rstrip('/')}/api/v2/torrents"
        target = (new_name or "").strip()
        if action == "create":
            endpoint = "createCategory" if kind == "category" else "createTags"
            data = {"category": name, "savePath": ""} if kind == "category" else {"tags": name}
        elif action == "delete":
            endpoint = "removeCategories" if kind == "category" else "deleteTags"
            data = {"categories": name} if kind == "category" else {"tags": name}
        elif action == "rename" and target:
            metadata = await get_qbittorrent_metadata(url, username, password)
            if kind == "category":
                current = next((item for item in metadata["categories"] if item["name"].casefold() == name.casefold()), None)
                create = await client.post(f"{base}/createCategory", data={"category": target, "savePath": (current or {}).get("save_path", "")}, cookies=cookies, timeout=15)
                create.raise_for_status()
                info = await client.get(f"{base}/info", params={"category": name}, cookies=cookies, timeout=15)
                info.raise_for_status()
                hashes = "|".join(row.get("hash", "") for row in info.json() if row.get("hash"))
                if hashes:
                    move = await client.post(f"{base}/setCategory", data={"hashes": hashes, "category": target}, cookies=cookies, timeout=15)
                    move.raise_for_status()
                endpoint, data = "removeCategories", {"categories": name}
            else:
                create = await client.post(f"{base}/createTags", data={"tags": target}, cookies=cookies, timeout=15)
                create.raise_for_status()
                info = await client.get(f"{base}/info", cookies=cookies, timeout=15)
                info.raise_for_status()
                hashes = "|".join(
                    row.get("hash", "") for row in info.json()
                    if row.get("hash") and name.casefold() in {tag.strip().casefold() for tag in str(row.get("tags") or "").split(",")}
                )
                if hashes:
                    add = await client.post(f"{base}/addTags", data={"hashes": hashes, "tags": target}, cookies=cookies, timeout=15)
                    add.raise_for_status()
                    remove = await client.post(f"{base}/removeTags", data={"hashes": hashes, "tags": name}, cookies=cookies, timeout=15)
                    remove.raise_for_status()
                endpoint, data = "deleteTags", {"tags": name}
        else:
            raise ValueError("Opération de métadonnées invalide")
        response = await client.post(f"{base}/{endpoint}", data=data, cookies=cookies, timeout=15)
        response.raise_for_status()


async def control_qbittorrent_torrent(
    url: str,
    username: Optional[str],
    password: Optional[str],
    torrent_hash: str,
    action: str,
    *,
    delete_files: bool = False,
    category: Optional[str] = None,
    tags: Optional[str] = None,
) -> bool:
    """Pause, reprend, revérifie, réannonce, change la catégorie, gère les tags ou supprime un torrent qBittorrent."""
    endpoints = {
        "pause": "stop",
        "resume": "start",
        "recheck": "recheck",
        "reannounce": "reannounce",
        "set_category": "setCategory",
        "set_tags": "setTags",
        "delete": "delete",
    }
    endpoint = endpoints.get(action)
    if not endpoint:
        return False
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return False
        data = {"hashes": torrent_hash}
        if action == "delete":
            data["deleteFiles"] = "true" if delete_files else "false"
        elif action == "set_category":
            data["category"] = category or ""
        elif action == "set_tags":
            data["tags"] = tags or ""
        response = await client.post(
            f"{url.rstrip('/')}/api/v2/torrents/{endpoint}",
            data=data,
            cookies=cookies,
            timeout=15,
        )
        # qBittorrent < 5 utilise pause/resume au lieu de stop/start.
        if response.status_code == 404 and action in {"pause", "resume"}:
            legacy = "pause" if action == "pause" else "resume"
            response = await client.post(
                f"{url.rstrip('/')}/api/v2/torrents/{legacy}",
                data=data,
                cookies=cookies,
                timeout=15,
            )
        response.raise_for_status()
        return True


async def transmission_rpc(
    client: httpx.AsyncClient,
    url: str,
    username: Optional[str],
    password: Optional[str],
    method: str,
    arguments: Optional[dict] = None,
) -> dict:
    """Effectue un appel RPC vers Transmission en gérant le token X-Transmission-Session-Id."""
    rpc_url = f"{url.rstrip('/')}/transmission/rpc"
    headers: dict[str, str] = {}
    auth = None
    if username and password:
        auth = (username, password)

    # Premier essai
    try:
        r = await client.post(
            rpc_url, json={"method": method, "arguments": arguments or {}}, auth=auth, headers=headers, timeout=10
        )
        if r.status_code == 409:
            # Récupération du session ID et deuxième essai
            session_id = r.headers.get("X-Transmission-Session-Id")
            if session_id:
                headers["X-Transmission-Session-Id"] = session_id
                r = await client.post(
                    rpc_url,
                    json={"method": method, "arguments": arguments or {}},
                    auth=auth,
                    headers=headers,
                    timeout=10,
                )

        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.error(f"Transmission RPC error: {e}")
        raise e


async def check_transmission(url: str, username: Optional[str], password: Optional[str]) -> tuple[bool, str]:
    """Vérifie la connexion avec Transmission."""
    async with httpx.AsyncClient() as client:
        try:
            res = await transmission_rpc(client, url, username, password, "session-get")
            if res.get("result") == "success":
                version = res.get("arguments", {}).get("version", "?")
                return True, f"Connecté à Transmission v{version}"
            return False, f"Erreur de réponse RPC: {res.get('result')}"
        except Exception as e:
            return False, f"Erreur de connexion RPC: {str(e)}"


async def add_transmission_torrent(
    url: str,
    username: Optional[str],
    password: Optional[str],
    torrent_url_or_magnet: str,
    tags: Optional[str] = None,
) -> tuple[bool, str, str | None]:
    """Ajoute un torrent à Transmission."""
    async with httpx.AsyncClient() as client:
        try:
            args: dict[str, object] = {"filename": torrent_url_or_magnet}
            if tags:
                args["labels"] = [t.strip() for t in tags.split(",") if t.strip()]

            res = await transmission_rpc(client, url, username, password, "torrent-add", args)
            if res.get("result") == "success":
                torrent_info = res.get("arguments", {}).get("torrent-added") or res.get("arguments", {}).get(
                    "torrent-duplicate"
                )
                info_hash = torrent_info.get("hashString") if torrent_info else None
                if not info_hash:
                    info_hash = extract_hash_from_magnet(torrent_url_or_magnet)
                return True, "Torrent ajouté avec succès à Transmission", info_hash
            return False, f"Erreur de réponse RPC: {res.get('result')}", None
        except Exception as e:
            return False, f"Erreur d'ajout RPC: {str(e)}", None


async def get_transmission_status(
    url: str, username: Optional[str], password: Optional[str], torrent_hash: str
) -> dict | None:
    """Récupère l'avancement d'un torrent spécifique dans Transmission."""
    async with httpx.AsyncClient() as client:
        try:
            args = {
                "ids": [torrent_hash],
                "fields": [
                    "id",
                    "name",
                    "percentDone",
                    "status",
                    "uploadRatio",
                    "secondsSeeding",
                    "rateDownload",
                    "rateUpload",
                    "eta",
                    "downloadDir",
                ],
            }
            res = await transmission_rpc(client, url, username, password, "torrent-get", args)
            if res.get("result") != "success":
                return None
            torrents = res.get("arguments", {}).get("torrents", [])
            if not torrents:
                return None
            t = torrents[0]
            raw_status = t.get("status", 0)
            if raw_status == 4:
                status = "downloading"
            elif raw_status == 6:
                status = "seeding"
            elif raw_status == 0:
                status = "paused"
            else:
                status = "downloading" if t.get("percentDone", 0.0) < 1.0 else "seeding"

            return {
                "name": t.get("name", ""),
                "content_path": (
                    os.path.join(t.get("downloadDir"), t.get("name", "")) if t.get("downloadDir") else None
                ),
                "progress": t.get("percentDone", 0.0) * 100.0,
                "status": status,
                "ratio": t.get("uploadRatio", 0.0),
                "seeding_time": t.get("secondsSeeding", 0),
                "download_speed": t.get("rateDownload", 0),
                "upload_speed": t.get("rateUpload", 0),
                "eta": t.get("eta", 0),
            }
        except Exception as e:
            logger.error(f"Error getting Transmission status: {e}")
            return None


async def delete_transmission_torrent(
    url: str, username: Optional[str], password: Optional[str], torrent_hash: str, delete_files: bool
) -> bool:
    """Supprime un torrent dans Transmission."""
    async with httpx.AsyncClient() as client:
        try:
            args = {"ids": [torrent_hash], "delete-local-data": delete_files}
            res = await transmission_rpc(client, url, username, password, "torrent-remove", args)
            return res.get("result") == "success"
        except Exception as e:
            logger.error(f"Error deleting Transmission torrent: {e}")
            return False


async def list_transmission_torrents(
    url: str, username: Optional[str], password: Optional[str]
) -> list[dict]:
    """Retourne la file Transmission complète dans le format commun du centre de contrôle."""
    fields = [
        "hashString", "name", "status", "percentDone", "totalSize", "rateDownload",
        "rateUpload", "uploadRatio", "eta", "labels", "downloadDir",
        "comment", "addedDate", "doneDate", "trackers",
    ]
    async with httpx.AsyncClient() as client:
        result = await transmission_rpc(client, url, username, password, "torrent-get", {"fields": fields})
    if result.get("result") != "success":
        raise RuntimeError(f"Erreur Transmission : {result.get('result')}")
    status_names = {0: "paused", 1: "check-waiting", 2: "checking", 3: "download-waiting", 4: "downloading", 5: "seed-waiting", 6: "seeding"}
    torrents_list = []
    for torrent in result.get("arguments", {}).get("torrents", []):
        trackers_raw = torrent.get("trackers") or []
        trackers_str = ", ".join([t.get("announce") for t in trackers_raw if isinstance(t, dict) and t.get("announce")])
        torrents_list.append({
            "hash": torrent.get("hashString") or "",
            "name": torrent.get("name") or "Torrent sans nom",
            "state": status_names.get(torrent.get("status"), "unknown"),
            "progress": torrent.get("percentDone") or 0,
            "size": torrent.get("totalSize") or 0,
            "dlspeed": torrent.get("rateDownload") or 0,
            "upspeed": torrent.get("rateUpload") or 0,
            "ratio": torrent.get("uploadRatio") or 0,
            "eta": torrent.get("eta") or 0,
            "category": "",
            "tags": ", ".join(torrent.get("labels") or []),
            "save_path": torrent.get("downloadDir") or "",
            "comment": torrent.get("comment") or "",
            "added_on": torrent.get("addedDate"),
            "completed_on": torrent.get("doneDate") if (torrent.get("doneDate") or 0) > 0 else None,
            "trackers": trackers_str,
        })
    return torrents_list


async def control_transmission_torrent(
    url: str,
    username: Optional[str],
    password: Optional[str],
    torrent_hash: str,
    action: str,
    delete_files: bool = False,
    category: Optional[str] = None,
    tags: Optional[str] = None,
) -> bool:
    """Pilote un torrent Transmission depuis le centre de contrôle."""
    methods = {
        "pause": "torrent-stop",
        "resume": "torrent-start",
        "recheck": "torrent-verify",
        "reannounce": "torrent-reannounce",
        "set_category": "torrent-set",
        "set_tags": "torrent-set",
        "delete": "torrent-remove",
    }
    method = methods.get(action)
    if not method:
        return False
    arguments: dict[str, object] = {"ids": [torrent_hash]}
    if action == "delete":
        arguments["delete-local-data"] = delete_files
    elif action in {"set_category", "set_tags"}:
        tag_str = tags if action == "set_tags" else category
        arguments["labels"] = [t.strip() for t in (tag_str or "").split(",") if t.strip()]
    async with httpx.AsyncClient() as client:
        result = await transmission_rpc(client, url, username, password, method, arguments)
    return result.get("result") == "success"


async def list_client_torrents(
    client_type: str, url: str, username: Optional[str], password: Optional[str]
) -> list[dict]:
    """Liste les torrents d'un client compatible avec le centre de contrôle."""
    if client_type == "qbittorrent":
        return await list_qbittorrent_torrents(url, username, password)
    if client_type == "transmission":
        return await list_transmission_torrents(url, username, password)
    raise RuntimeError(f"Le client {client_type} ne permet pas encore la gestion de sa file")


async def control_client_torrent(
    client_type: str,
    url: str,
    username: Optional[str],
    password: Optional[str],
    torrent_hash: str,
    action: str,
    delete_files: bool = False,
    category: Optional[str] = None,
    tags: Optional[str] = None,
) -> bool:
    """Pilote un torrent via l'API native du client configuré."""
    if client_type == "qbittorrent":
        return await control_qbittorrent_torrent(
            url, username, password, torrent_hash, action, delete_files=delete_files, category=category, tags=tags
        )
    if client_type == "transmission":
        return await control_transmission_torrent(
            url, username, password, torrent_hash, action, delete_files=delete_files, category=category, tags=tags
        )
    return False


async def check_watch_folder(path: str) -> tuple[bool, str]:
    """Vérifie l'accessibilité du Watch Folder."""
    safe_path = _sanitized_watch_folder_path(path)
    if safe_path is None:
        return False, "Chemin de dossier surveillé invalide (doit être un chemin absolu, sans « .. »)"
    if not os.path.isdir(safe_path):  # lgtm[py/path-injection]
        return False, f"Le dossier n'existe pas ou n'est pas un répertoire : {safe_path}"
    try:
        # Test de création/suppression de fichier temporaire
        test_file = os.path.join(safe_path, f".test_{uuid.uuid4().hex}")
        with open(test_file, "w") as f:  # lgtm[py/path-injection]
            f.write("test")
        os.remove(test_file)  # lgtm[py/path-injection]
        return True, "Dossier surveillé accessible en écriture"
    except Exception as e:
        logger.warning(f"check_watch_folder échec ({safe_path}): {e}")
        return False, f"Erreur d'accès en écriture : {safe_error_message(e)}"


async def add_watch_folder_torrent(path: str, torrent_url_or_magnet: str) -> tuple[bool, str, str | None]:
    """Télécharge le fichier torrent depuis Prowlarr et l'écrit dans le dossier surveillé."""
    if torrent_url_or_magnet.startswith("magnet:"):
        return False, "Le mode dossier surveillé ne supporte pas les liens magnet", None

    safe_path = _sanitized_watch_folder_path(path)
    if safe_path is None:
        return False, "Chemin de dossier surveillé invalide (doit être un chemin absolu, sans « .. »)", None
    if not os.path.isdir(safe_path):
        return False, f"Le dossier surveillé n'existe pas : {safe_path}", None

    # Le déploiement type de cette fonctionnalité place Prowlarr/le client de
    # téléchargement sur le même réseau privé/docker que l'app (voir docker-compose.yml)
    # : une cible interne est donc le cas normal, pas un signal d'attaque, et cette route
    # est de toute façon réservée aux administrateurs (dependencies=[Depends(require_admin)]
    # sur tout le routeur Prowlarr). On se limite donc à rejeter les schémas non-HTTP.
    parsed = urlparse(torrent_url_or_magnet)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False, "URL de torrent invalide", None
    if await _resolves_to_forbidden_target(parsed.hostname):
        return False, "URL de torrent invalide", None

    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(torrent_url_or_magnet, follow_redirects=False, timeout=30)  # lgtm[py/full-ssrf]
            r.raise_for_status()

            filename = f"torrent_{uuid.uuid4().hex}.torrent"
            cd = r.headers.get("content-disposition", "")
            if "filename=" in cd:
                for part in cd.split(";"):
                    if "filename=" in part:
                        fn = os.path.basename(part.split("=")[1].strip("\"'"))
                        if fn.endswith(".torrent") and fn not in ("", ".", ".."):
                            filename = fn
                            break

            filepath = os.path.join(safe_path, filename)
            with open(filepath, "wb") as f:
                f.write(r.content)

            # Info hash généré par SHA1 déterministe de l'URL pour identification unique
            info_hash = hashlib.sha1(torrent_url_or_magnet.encode("utf-8")).hexdigest()
            return True, f"Fichier torrent écrit avec succès : {filename}", info_hash
    except Exception as e:
        logger.warning(f"add_watch_folder_torrent échec ({safe_path}): {e}")
        return False, f"Erreur lors de l'écriture dans le dossier surveillé : {safe_error_message(e)}", None


async def check_client_connection(
    client_type: str, url: str, username: Optional[str], password: Optional[str]
) -> tuple[bool, str]:
    """Point d'entrée générique pour tester la connexion."""
    if client_type == "qbittorrent":
        return await check_qbittorrent(url, username, password)
    elif client_type == "transmission":
        return await check_transmission(url, username, password)
    elif client_type == "watch_folder":
        return await check_watch_folder(url)
    return False, f"Type de client inconnu: {client_type}"


async def add_torrent_to_client(
    client_type: str,
    url: str,
    username: Optional[str],
    password: Optional[str],
    torrent_url_or_magnet: str,
    category: Optional[str] = None,
    tags: Optional[str] = None,
) -> tuple[bool, str, str | None]:
    """Point d'entrée générique pour ajouter un torrent. Retourne (success, message, hash)."""
    if client_type == "qbittorrent":
        return await add_qbittorrent_torrent(url, username, password, torrent_url_or_magnet, category, tags)
    elif client_type == "transmission":
        return await add_transmission_torrent(url, username, password, torrent_url_or_magnet, tags)
    elif client_type == "watch_folder":
        return await add_watch_folder_torrent(url, torrent_url_or_magnet)
    return False, f"Type de client inconnu: {client_type}", None


async def add_torrent_file_to_client(
    client_type: str,
    url: str,
    username: Optional[str],
    password: Optional[str],
    torrent_bytes: bytes,
    filename: str = "upload.torrent",
    category: Optional[str] = None,
    tags: Optional[str] = None,
) -> tuple[bool, str, str | None]:
    """Envoie un fichier .torrent (bytes) directement à un client. Retourne (success, message, hash)."""
    import base64

    def _parse_info_hash(data: bytes) -> str | None:
        """Extrait le SHA1 info-hash d'un fichier .torrent via bencode minimal."""
        try:
            import hashlib

            pos = data.find(b"4:info")
            if pos == -1:
                return None
            pos += 6
            # find end of dict
            depth = 1
            i = pos
            while i < len(data) and depth > 0:
                if data[i : i + 1] == b"d":
                    depth += 1
                    i += 1
                elif data[i : i + 1] == b"e":
                    depth -= 1
                    i += 1
                elif data[i : i + 1] == b"l":
                    depth += 1
                    i += 1
                elif data[i : i + 1] in (b"i",):
                    end = data.index(b"e", i + 1)
                    i = end + 1
                elif data[i : i + 1].isdigit():
                    colon = data.index(b":", i)
                    length = int(data[i:colon])
                    i = colon + 1 + length
                else:
                    i += 1
            info_dict = data[pos:i]
            return hashlib.sha1(info_dict).hexdigest()
        except Exception:
            return None

    if client_type == "qbittorrent":
        async with httpx.AsyncClient() as client_http:
            cookies = await qbittorrent_auth_cookies(client_http, url, username, password)
            if cookies is None:
                return False, "Échec de connexion qBittorrent", None
            add_url = f"{url.rstrip('/')}/api/v2/torrents/add"
            form_data = {}
            if category:
                form_data["category"] = category
            if tags:
                form_data["tags"] = tags
            try:
                r = await client_http.post(
                    add_url,
                    data=form_data,
                    files={"torrents": (filename, torrent_bytes, "application/x-bittorrent")},
                    cookies=cookies,
                    timeout=20,
                )
                r.raise_for_status()
                info_hash = _parse_info_hash(torrent_bytes)
                return True, "Fichier .torrent ajouté à qBittorrent", info_hash
            except Exception as e:
                return False, f"Erreur qBittorrent : {e}", None

    elif client_type == "transmission":
        async with httpx.AsyncClient() as client_http:
            try:
                metainfo = base64.b64encode(torrent_bytes).decode()
                args: dict = {"metainfo": metainfo}
                if tags:
                    args["labels"] = [t.strip() for t in tags.split(",") if t.strip()]
                res = await transmission_rpc(client_http, url, username, password, "torrent-add", args)
                if res.get("result") == "success":
                    torrent_info = res.get("arguments", {}).get("torrent-added") or res.get("arguments", {}).get(
                        "torrent-duplicate"
                    )
                    info_hash = torrent_info.get("hashString") if torrent_info else _parse_info_hash(torrent_bytes)
                    return True, "Fichier .torrent ajouté à Transmission", info_hash
                return False, f"Erreur RPC: {res.get('result')}", None
            except Exception as e:
                return False, f"Erreur Transmission : {e}", None

    elif client_type == "watch_folder":
        try:
            dest = os.path.join(url, filename)
            with open(dest, "wb") as f:
                f.write(torrent_bytes)
            return True, f"Fichier copié dans {dest}", None
        except Exception as e:
            return False, f"Erreur watch folder : {e}", None

    return False, f"Type de client inconnu : {client_type}", None


async def get_torrent_status(
    client_type: str, url: str, username: Optional[str], password: Optional[str], torrent_hash: str
) -> dict | None:
    """Point d'entrée générique pour obtenir l'avancement d'un torrent."""
    if client_type == "qbittorrent":
        return await get_qbittorrent_status(url, username, password, torrent_hash)
    elif client_type == "transmission":
        return await get_transmission_status(url, username, password, torrent_hash)
    elif client_type == "watch_folder":
        return _WATCH_FOLDER_STATUS
    return None


async def delete_torrent(
    client_type: str,
    url: str,
    username: Optional[str],
    password: Optional[str],
    torrent_hash: str,
    delete_files: bool = False,
) -> bool:
    """Point d'entrée générique pour supprimer un torrent."""
    if client_type == "qbittorrent":
        return await delete_qbittorrent_torrent(url, username, password, torrent_hash, delete_files)
    elif client_type == "transmission":
        return await delete_transmission_torrent(url, username, password, torrent_hash, delete_files)
    elif client_type == "watch_folder":
        return True
    return False


# -----------------------------------------------------------------------------
# Fonctions d'inspection avancée (Fichiers, Trackers, Peers, Vitesse globale)
# -----------------------------------------------------------------------------

async def get_qbittorrent_files(url: str, username: Optional[str], password: Optional[str], torrent_hash: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return []
        try:
            r = await client.get(f"{url.rstrip('/')}/api/v2/torrents/files", params={"hash": torrent_hash}, cookies=cookies, timeout=10)
            r.raise_for_status()
            raw_files = r.json()
            return [
                {
                    "id": idx,
                    "name": f.get("name") or f"Fichier #{idx}",
                    "size": f.get("size", 0),
                    "progress": round(float(f.get("progress", 0)) * 100, 1),
                    "priority": f.get("priority", 1),
                }
                for idx, f in enumerate(raw_files)
            ]
        except Exception as e:
            logger.error(f"Error fetching qBittorrent files for {torrent_hash}: {e}")
            return []


async def set_qbittorrent_file_priority(
    url: str, username: Optional[str], password: Optional[str], torrent_hash: str, file_ids: list[int], priority: int
) -> bool:
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return False
        try:
            id_str = "|".join(str(i) for i in file_ids)
            r = await client.post(
                f"{url.rstrip('/')}/api/v2/torrents/filePrio",
                data={"hash": torrent_hash, "id": id_str, "priority": str(priority)},
                cookies=cookies,
                timeout=10,
            )
            r.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Error setting qBittorrent file priority: {e}")
            return False


async def get_qbittorrent_trackers(url: str, username: Optional[str], password: Optional[str], torrent_hash: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return []
        try:
            r = await client.get(f"{url.rstrip('/')}/api/v2/torrents/trackers", params={"hash": torrent_hash}, cookies=cookies, timeout=10)
            r.raise_for_status()
            return [
                {
                    "url": t.get("url", ""),
                    "status": t.get("status", 0),
                    "tier": t.get("tier", 0),
                    "num_peers": t.get("num_peers", 0),
                    "num_seeds": t.get("num_seeds", 0),
                    "msg": t.get("msg", ""),
                }
                for t in r.json()
            ]
        except Exception as e:
            logger.error(f"Error fetching qBittorrent trackers for {torrent_hash}: {e}")
            return []


async def get_qbittorrent_peers(url: str, username: Optional[str], password: Optional[str], torrent_hash: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return []
        try:
            r = await client.get(f"{url.rstrip('/')}/api/v2/sync/torrentPeers", params={"hash": torrent_hash}, cookies=cookies, timeout=10)
            r.raise_for_status()
            peers_dict = r.json().get("peers", {})
            return [
                {
                    "ip": peer_data.get("ip") or key.split(":")[0],
                    "client": peer_data.get("client", "Inconnu"),
                    "progress": round(float(peer_data.get("progress", 0)) * 100, 1),
                    "download_speed": peer_data.get("dl_speed", 0),
                    "upload_speed": peer_data.get("up_speed", 0),
                    "country": peer_data.get("country", ""),
                }
                for key, peer_data in peers_dict.items()
            ]
        except Exception as e:
            logger.error(f"Error fetching qBittorrent peers for {torrent_hash}: {e}")
            return []


async def get_qbittorrent_global_stats(url: str, username: Optional[str], password: Optional[str]) -> dict:
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return {"connected": False, "download_speed": 0, "upload_speed": 0, "alt_speed_enabled": False}
        try:
            r = await client.get(f"{url.rstrip('/')}/api/v2/transfer/info", cookies=cookies, timeout=10)
            r.raise_for_status()
            data = r.json()
            version = ""
            try:
                version_response = await client.get(f"{url.rstrip('/')}/api/v2/app/version", cookies=cookies, timeout=5)
                version_response.raise_for_status()
                version = version_response.text.strip()
            except Exception:
                pass
            downloaded = float(data.get("alltime_dl") or 0)
            uploaded = float(data.get("alltime_ul") or 0)
            return {
                "connected": True,
                "download_speed": data.get("dl_info_speed", 0),
                "upload_speed": data.get("up_info_speed", 0),
                "alt_speed_enabled": bool(data.get("use_alt_speed_limits") or data.get("dl_rate_limit")),
                "free_space": data.get("free_space_on_disk", 0),
                "ratio": uploaded / downloaded if downloaded > 0 else 0,
                "version": version,
            }
        except Exception as e:
            logger.error(f"Error fetching qBittorrent transfer info: {e}")
            return {"connected": False, "download_speed": 0, "upload_speed": 0, "alt_speed_enabled": False}


async def toggle_qbittorrent_alt_speed(url: str, username: Optional[str], password: Optional[str], enabled: Optional[bool] = None) -> bool:
    async with httpx.AsyncClient() as client:
        cookies = await qbittorrent_auth_cookies(client, url, username, password)
        if cookies is None:
            return False
        try:
            r = await client.post(f"{url.rstrip('/')}/api/v2/transfer/toggleSpeedLimitsMode", cookies=cookies, timeout=10)
            r.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Error toggling qBittorrent speed mode: {e}")
            return False


# --- Generic dispatch wrappers ---

async def list_torrent_files(client_type: str, url: str, username: Optional[str], password: Optional[str], torrent_hash: str) -> list[dict]:
    if client_type == "qbittorrent":
        return await get_qbittorrent_files(url, username, password, torrent_hash)
    return []


async def set_torrent_file_priority(
    client_type: str, url: str, username: Optional[str], password: Optional[str], torrent_hash: str, file_ids: list[int], priority: int
) -> bool:
    if client_type == "qbittorrent":
        return await set_qbittorrent_file_priority(url, username, password, torrent_hash, file_ids, priority)
    return False


async def list_torrent_trackers(client_type: str, url: str, username: Optional[str], password: Optional[str], torrent_hash: str) -> list[dict]:
    if client_type == "qbittorrent":
        return await get_qbittorrent_trackers(url, username, password, torrent_hash)
    return []


async def list_torrent_peers(client_type: str, url: str, username: Optional[str], password: Optional[str], torrent_hash: str) -> list[dict]:
    if client_type == "qbittorrent":
        return await get_qbittorrent_peers(url, username, password, torrent_hash)
    return []


async def get_client_global_stats(client_type: str, url: str, username: Optional[str], password: Optional[str]) -> dict:
    if client_type == "qbittorrent":
        return await get_qbittorrent_global_stats(url, username, password)
    return {"connected": True, "download_speed": 0, "upload_speed": 0, "alt_speed_enabled": False}


async def toggle_client_alt_speed(client_type: str, url: str, username: Optional[str], password: Optional[str], enabled: Optional[bool] = None) -> bool:
    if client_type == "qbittorrent":
        return await toggle_qbittorrent_alt_speed(url, username, password, enabled)
    return False

