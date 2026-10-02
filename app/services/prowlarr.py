"""
Client pour l'API Prowlarr (indexeurs).

Fonctions principales :
- check_connection    : vérifie la connectivité
- search              : recherche un média via Prowlarr
- get_indexers        : récupère les indexeurs configurés
- get_download_clients: récupère les clients de téléchargement configurés dans Prowlarr
- grab                : envoie une release au client de téléchargement configuré dans Prowlarr
- get_indexer_health  : état, échecs et temps de réponse de chaque indexeur
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import httpx

from .arr_http_client import ArrClient

logger = logging.getLogger(__name__)


async def check_connection(url: str, api_key: str) -> bool:
    """Vérifie la connectivité avec Prowlarr."""
    try:
        client = ArrClient(url, api_key, timeout=10)
        resp = await client.get(
            "/api/v1/system/status",
        )
        return resp.status_code == 200
    except Exception as e:
        logger.warning(f"Prowlarr connection check failed: {e}")
        return False


async def search(
    url: str,
    api_key: str,
    query: str,
    media_type: str,
    indexer_ids: Optional[List[int]] = None,
) -> list[dict]:
    """Recherche sur Prowlarr via POST /api/v1/search."""
    categories = [5000] if media_type == "movie" else [5070]
    payload = {
        "query": query,
        "categories": categories,
    }
    if indexer_ids is not None:
        payload["indexerIds"] = indexer_ids

    try:
        client = ArrClient(url, api_key, timeout=30)
        resp = await client.post(
            "/api/v1/search",
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Prowlarr search failed for '{query}': {e}")
        return []


async def get_indexers(url: str, api_key: str) -> list[dict]:
    """Récupère la liste des indexeurs configurés dans Prowlarr."""
    try:
        client = ArrClient(url, api_key, timeout=15)
        resp = await client.get(
            "/api/v1/indexer",
        )
        resp.raise_for_status()
        # On retourne la liste des indexeurs configurés (seulement ceux activés/configurés)
        return resp.json()
    except Exception as e:
        logger.error(f"Prowlarr get_indexers failed: {e}")
        return []


async def get_overview_stats(url: str, api_key: str) -> dict:
    """Retourne les indicateurs utiles à une carte Prowlarr."""
    client = ArrClient(url, api_key, timeout=15)
    try:
        indexers_response, health_response, status_response = await asyncio.gather(
            client.get("/api/v1/indexer"),
            client.get("/api/v1/health"),
            client.get("/api/v1/system/status"),
        )
        indexers_response.raise_for_status()
        indexers = indexers_response.json()
        health = health_response.json() if health_response.status_code == 200 else []
        status = status_response.json() if status_response.status_code == 200 else {}
        enabled = [item for item in indexers if item.get("enable", True)]
        protocols = sorted({str(item.get("protocol", "")).lower() for item in enabled if item.get("protocol")})
        issues = [item for item in health if str(item.get("type", "")).lower() in {"warning", "error"}]
        return {
            "connected": True,
            "total": len(indexers),
            "enabled": len(enabled),
            "issues": len(issues),
            "protocols": protocols,
            "version": status.get("version", ""),
        }
    except Exception as exc:
        logger.error(f"Prowlarr overview failed: {exc}")
        return {"connected": False, "total": 0, "enabled": 0, "issues": 0, "protocols": [], "version": ""}


def _parse_iso(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


async def get_indexer_health(url: str, api_key: str, days: int = 7) -> dict:
    """Etat de chaque indexeur, a la maniere de l'onglet Statistiques de Prowlarr.

    - `indexerstatus` : indexeurs mis en pause par Prowlarr apres des echecs repetes
      (`disabledTill` dans le futur) ;
    - `indexerstats` : requetes, echecs et temps de reponse moyen sur `days` jours.
    """
    client = ArrClient(url, api_key, timeout=20)
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        indexers_response, status_response, stats_response = await asyncio.gather(
            client.get("/api/v1/indexer"),
            client.get("/api/v1/indexerstatus"),
            client.get("/api/v1/indexerstats", params={"startDate": start}),
        )
        indexers_response.raise_for_status()
    except Exception as exc:
        logger.error(f"Prowlarr indexer health failed: {exc}")
        return {"connected": False, "indexers": [], "days": days}

    statuses = {
        row.get("indexerId"): row for row in (status_response.json() if status_response.status_code == 200 else [])
    }
    stats_payload = stats_response.json() if stats_response.status_code == 200 else {}
    stats = {row.get("indexerId"): row for row in (stats_payload or {}).get("indexers", [])}

    rows = []
    for indexer in indexers_response.json():
        indexer_id = indexer.get("id")
        status = statuses.get(indexer_id) or {}
        stat = stats.get(indexer_id) or {}
        disabled_till = _parse_iso(status.get("disabledTill"))
        queries = int(stat.get("numberOfQueries") or 0)
        failed = int(stat.get("numberOfFailedQueries") or 0)
        failure_rate = round(failed / queries * 100, 1) if queries else None
        if not indexer.get("enable", True):
            state = "disabled"
        elif disabled_till and disabled_till > now:
            state = "failing"
        elif failure_rate is not None and failure_rate >= 20:
            state = "degraded"
        else:
            state = "ok"
        rows.append(
            {
                "id": indexer_id,
                "name": indexer.get("name"),
                "protocol": indexer.get("protocol"),
                "privacy": indexer.get("privacy"),
                "enabled": bool(indexer.get("enable", True)),
                "state": state,
                "disabled_till": disabled_till.isoformat() if disabled_till else None,
                "last_failure": status.get("mostRecentFailure"),
                "queries": queries,
                "failed_queries": failed,
                "failure_rate": failure_rate,
                "grabs": int(stat.get("numberOfGrabs") or 0),
                "failed_grabs": int(stat.get("numberOfFailedGrabs") or 0),
                "average_response_ms": stat.get("averageResponseTime"),
            }
        )
    order = {"failing": 0, "degraded": 1, "ok": 2, "disabled": 3}
    rows.sort(key=lambda row: (order.get(row["state"], 9), (row["name"] or "").lower()))
    return {"connected": True, "indexers": rows, "days": days}


async def get_download_clients(url: str, api_key: str) -> list[dict]:
    """Récupère les clients de téléchargement configurés dans Prowlarr (GET /api/v1/downloadClient).

    Si Prowlarr a lui-même un client actif, on peut lui déléguer le grab (voir `grab`)
    plutôt que d'exiger un client de téléchargement configuré séparément dans l'app.
    """
    try:
        client = ArrClient(url, api_key, timeout=15)
        resp = await client.get(
            "/api/v1/downloadClient",
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Prowlarr get_download_clients failed: {e}")
        return []


async def grab(url: str, api_key: str, guid: str, indexer_id: int) -> tuple[bool, str]:
    """Envoie une release au client de téléchargement configuré dans Prowlarr.

    Réutilise l'endpoint POST /api/v1/search : un payload {guid, indexerId} (sans
    `query`) déclenche un grab au lieu d'une recherche — Prowlarr route la release
    vers le client de téléchargement actif correspondant au protocole (torrent/usenet).
    """
    try:
        client = ArrClient(url, api_key, timeout=30)
        resp = await client.post(
            "/api/v1/search",
            json={"guid": guid, "indexerId": indexer_id},
        )
        resp.raise_for_status()
        return True, "Envoyé au client de téléchargement configuré dans Prowlarr"
    except Exception as e:
        logger.error(f"Prowlarr grab failed (guid={guid}, indexerId={indexer_id}): {e}")
        return False, str(e)
