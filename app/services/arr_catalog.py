"""Cache court du catalogue complet Sonarr/Radarr, partagé par tous les appelants.

Résoudre un identifiant externe (tvdb_id, tmdb_id, imdb_id) en identifiant *arr impose de
parcourir le catalogue complet de l'instance : Sonarr/Radarr n'exposent pas de recherche
par ID externe sur les médias déjà ajoutés. Ce catalogue pèse plusieurs Mo (mesuré : 2,3 Mo
côté Sonarr, 4,8 Mo côté Radarr) et était retéléchargé **à chaque résolution** — un scan VF
complet en faisait 774, le cron de disponibilité des épisodes en fait un par série (770),
et chaque ouverture de fiche média en déclenchait un de plus.

Le catalogue ne bouge qu'à l'ajout/suppression d'un média : le mettre en cache quelques
dizaines de secondes suffit à effondrer ce trafic sans introduire d'incohérence visible.

Deux garde-fous contre le risque de péremption :

* un **verrou par instance** : dix résolutions simultanées déclenchent un seul
  téléchargement, les autres attendent son résultat plutôt que de le refaire en parallèle ;
* un **rafraîchissement sur échec** : un média absent du catalogue en cache est la seule
  situation où la péremption change le résultat (média ajouté à *arr depuis la mise en
  cache). L'appelant peut alors redemander une copie fraîche via `force_refresh` — voir
  l'usage dans `sonarr.lookup_series` / `radarr.lookup_movie`. Un « introuvable » reste
  donc toujours un vrai « introuvable », jamais un artefact du cache.
"""

import asyncio
import logging
import time

from .arr_http_client import ArrClient

logger = logging.getLogger(__name__)

# Durée de vie d'un catalogue en cache. Assez court pour qu'un média ajouté à *arr soit vu
# rapidement par les tâches de fond, assez long pour couvrir une passe de scan complète.
_TTL_SECONDS = 90.0

# Intervalle minimal entre deux téléchargements forcés (`force_refresh`) d'un même
# catalogue : sans lui, une série réellement absente de *arr provoquerait un
# retéléchargement complet à chaque résolution qui la concerne.
_FORCE_REFRESH_COOLDOWN_SECONDS = 30.0

_ENDPOINTS = {"sonarr": "/api/v3/series", "radarr": "/api/v3/movie"}

# {(arr_type, url): (catalogue, instant_de_mise_en_cache)}
_cache: dict[tuple[str, str], tuple[list[dict], float]] = {}
_last_forced: dict[tuple[str, str], float] = {}
_locks: dict[tuple[str, str], asyncio.Lock] = {}


def _lock_for(key: tuple[str, str]) -> asyncio.Lock:
    lock = _locks.get(key)
    if lock is None:
        lock = _locks[key] = asyncio.Lock()
    return lock


async def get_catalog(
    arr_type: str, url: str, api_key: str, *, force_refresh: bool = False
) -> list[dict] | None:
    """Catalogue complet d'une instance *arr, servi depuis le cache quand il est frais.

    `force_refresh` ignore le cache (voir « rafraîchissement sur échec » ci-dessus), tout en
    restant limité par `_FORCE_REFRESH_COOLDOWN_SECONDS`. Retourne None si le catalogue est
    inaccessible : l'appelant garde alors son comportement d'origine.
    """
    endpoint = _ENDPOINTS.get(arr_type)
    if not endpoint or not url or not api_key:
        return None
    key = (arr_type, url.rstrip("/"))
    now = time.monotonic()

    if force_refresh and now - _last_forced.get(key, 0.0) < _FORCE_REFRESH_COOLDOWN_SECONDS:
        force_refresh = False

    cached = _cache.get(key)
    if not force_refresh and cached and now - cached[1] < _TTL_SECONDS:
        return cached[0]

    async with _lock_for(key):
        # Un autre appelant a pu rafraichir pendant l'attente du verrou.
        cached = _cache.get(key)
        now = time.monotonic()
        if not force_refresh and cached and now - cached[1] < _TTL_SECONDS:
            return cached[0]
        try:
            client = ArrClient(key[1], api_key, timeout=60)
            resp = await client.get(endpoint)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("Catalogue %s indisponible (%s) : %s", arr_type, key[1], exc)
            # Mieux vaut un catalogue perime qu'aucun : l'appelant re-tentera au prochain TTL.
            return cached[0] if cached else None
        _cache[key] = (data, time.monotonic())
        if force_refresh:
            _last_forced[key] = time.monotonic()
        return data


def invalidate(arr_type: str | None = None, url: str | None = None) -> None:
    """Oublie un catalogue en cache — à appeler après un ajout/suppression dans *arr pour
    que la nouvelle entrée soit visible sans attendre l'expiration du TTL."""
    if arr_type is None and url is None:
        _cache.clear()
        return
    normalized = url.rstrip("/") if url else None
    for key in [k for k in _cache if (arr_type is None or k[0] == arr_type) and (normalized is None or k[1] == normalized)]:
        _cache.pop(key, None)
