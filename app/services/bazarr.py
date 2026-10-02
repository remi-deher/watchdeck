"""Client pour l'API Bazarr (sous-titres).

Bazarr suit les memes films et series que Radarr/Sonarr, compare les sous-titres
presents a un profil de langues et cherche ceux qui manquent aupres de ses fournisseurs.
Watchdeck s'en sert de deux facons :
- lui demander de chercher les sous-titres manquants d'un media precis ;
- lire le nombre de films et d'episodes ou il lui manque encore des sous-titres.

Les identifiants attendus sont ceux de Radarr (radarrid) et de Sonarr (seriesid) :
Bazarr reprend tels quels les identifiants de l'instance a laquelle il est relie.
"""

import logging

from .arr_http_client import ArrClient

logger = logging.getLogger(__name__)


def _client(url: str, api_key: str, timeout: int = 15) -> ArrClient:
    client = ArrClient(url, api_key, timeout=timeout)
    # Bazarr lit `X-API-KEY` ; les en-tetes HTTP sont insensibles a la casse, mais autant
    # employer la forme de sa documentation.
    client.headers = {"X-API-KEY": api_key}
    return client


async def check_connection(url: str, api_key: str) -> tuple[bool, str]:
    try:
        response = await _client(url, api_key, timeout=10).get("/api/system/status")
    except Exception as exc:
        logger.warning("Bazarr connection check failed: %s", exc)
        return False, f"Bazarr injoignable : {exc}"
    if response.status_code == 401:
        return False, "Clé API Bazarr refusée"
    if response.status_code != 200:
        return False, f"Bazarr a répondu {response.status_code}"
    try:
        version = (response.json().get("data") or {}).get("bazarr_version") or ""
    except Exception:
        version = ""
    return True, f"Bazarr connecté{f' (v{version})' if version else ''}"


async def search_missing(url: str, api_key: str, media_type: str, arr_id: int) -> tuple[bool, str]:
    """Demande a Bazarr de chercher les sous-titres manquants d'un film ou d'une serie.

    Bazarr repond sans attendre la fin de la recherche : le resultat se lit ensuite dans
    son historique, ou dans Plex au prochain scan."""
    if media_type == "movie":
        path, params = "/api/movies", {"radarrid": arr_id, "action": "search-missing"}
    else:
        path, params = "/api/series", {"seriesid": arr_id, "action": "search-missing"}
    try:
        response = await _client(url, api_key, timeout=30)._request("PATCH", path, params=params)
    except Exception as exc:
        return False, f"Bazarr injoignable : {exc}"
    if response.status_code in (200, 204):
        return True, "Recherche lancée dans Bazarr"
    if response.status_code == 404:
        return False, "Bazarr ne connaît pas ce média (instance Radarr/Sonarr différente ?)"
    return False, f"Bazarr a répondu {response.status_code}"


async def wanted_counts(url: str, api_key: str) -> dict:
    """Nombre de films et d'episodes auxquels il manque des sous-titres selon Bazarr."""
    client = _client(url, api_key)
    out: dict = {"connected": False, "movies": None, "episodes": None}
    try:
        movies = await client.get("/api/movies/wanted", params={"start": 0, "length": 1})
        episodes = await client.get("/api/episodes/wanted", params={"start": 0, "length": 1})
    except Exception as exc:
        logger.warning("Bazarr wanted counts failed: %s", exc)
        return out
    out["connected"] = movies.status_code == 200 or episodes.status_code == 200
    for key, response in (("movies", movies), ("episodes", episodes)):
        if response.status_code == 200:
            try:
                out[key] = int(response.json().get("total") or 0)
            except Exception:
                out[key] = None
    return out
