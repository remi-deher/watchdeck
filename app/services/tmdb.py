"""Client TMDB pour le catalogue de découverte (façon Overseerr).

Fournit les listes (tendances, populaires, à l'affiche, découverte par genre),
la recherche, et le détail enrichi (recommandations/similaires/ids externes).
Les réponses sont normalisées vers une forme commune consommée par le frontend.

La clé API TMDB (v3) est stockée dans Settings.tmdb_api_key. Sans clé, les
fonctions lèvent TmdbNotConfigured (le routeur renvoie alors un message clair).

Un cache léger (table SearchCache) évite de refaire les mêmes appels : TTL court
sur les listes/détails, suffisant pour rester bien sous les limites de TMDB.
"""

import json
import logging
from datetime import timedelta
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models import SearchCache, Settings
from ..utils import now_utc_naive

logger = logging.getLogger(__name__)

API_BASE = "https://api.themoviedb.org/3"
IMG_BASE = "https://image.tmdb.org/t/p"
LANG = "fr-FR"
REGION = "FR"
CACHE_TTL = timedelta(hours=12)

CURATED_DISCOVERY_SOURCES = (
    # Plateformes de streaming (SVOD)
    {"id": 8, "name": "Netflix", "kind": "provider"},
    {"id": 119, "name": "Prime Video", "kind": "provider"},
    {"id": 337, "name": "Disney+", "kind": "provider"},
    {"id": 381, "name": "Canal+", "kind": "provider"},
    {"id": 350, "name": "Apple TV+", "kind": "provider"},
    {"id": 1899, "name": "Max", "kind": "provider"},
    {"id": 531, "name": "Paramount+", "kind": "provider"},
    {"id": 283, "name": "Crunchyroll", "kind": "provider"},
    {"id": 415, "name": "Animation Digital Network", "kind": "provider"},
    {"id": 1754, "name": "TF1+", "kind": "provider"},
    {"id": 147, "name": "M6+", "kind": "provider"},
    {"id": 234, "name": "Arte", "kind": "provider"},
    # Réseaux et diffuseurs TV
    {"id": 49, "name": "HBO", "kind": "network"},
    {"id": 174, "name": "AMC", "kind": "network"},
    {"id": 88, "name": "FX", "kind": "network"},
    {"id": 361, "name": "France TV", "kind": "network"},
    {"id": 4, "name": "BBC", "kind": "network"},
    # Studios et maisons de production
    {"id": 41077, "name": "A24", "kind": "company"},
    {"id": 420, "name": "Marvel Studios", "kind": "company"},
    {"id": 3, "name": "Pixar", "kind": "company"},
    {"id": 10342, "name": "Studio Ghibli", "kind": "company"},
    {"id": 174, "name": "Warner Bros.", "kind": "company"},
    {"id": 33, "name": "Universal Pictures", "kind": "company"},
    {"id": 25, "name": "20th Century Studios", "kind": "company"},
    {"id": 4, "name": "Paramount Pictures", "kind": "company"},
    {"id": 5, "name": "Sony Pictures", "kind": "company"},
    {"id": 521, "name": "DreamWorks Animation", "kind": "company"},
    {"id": 6704, "name": "Illumination", "kind": "company"},
    {"id": 923, "name": "Legendary", "kind": "company"},
    {"id": 1632, "name": "Lionsgate", "kind": "company"},
    {"id": 3172, "name": "Blumhouse", "kind": "company"},
)

PROVIDER_ALIASES = {
    119: [119, 9, 10, 2100],
    283: [283, 1968],
    531: [531, 582, 1773, 2303],
    350: [350, 2, 2243],
    1899: [1899, 1825],
    337: [337, 390],
    381: [381, 345],
    234: [234, 2671],
    415: [415, 2173],
    1754: [1754],
    147: [147, 2672],
}

GENRE_RAIL_MAPPING = {
    "genre_action": {"movie": 28, "show": 10759, "title": "Action & Aventure"},
    "genre_scifi": {"movie": 878, "show": 10765, "title": "Science-Fiction & Fantastique"},
    "genre_animation": {"movie": 16, "show": 16, "title": "Animation"},
    "genre_comedy": {"movie": 35, "show": 35, "title": "Comédies"},
    "genre_thriller": {"movie": 5388, "show": 80, "title": "Thrillers & Policiers"},
    "genre_horror": {"movie": 27, "show": 9648, "title": "Horreur & Mystère"},
}


class TmdbNotConfigured(Exception):
    """Levée quand aucune clé API TMDB n'est configurée."""


async def _api_key(db: AsyncSession) -> str:
    s = (await db.execute(select(Settings))).scalars().first()
    if s and not s.tmdb_enabled:
        raise TmdbNotConfigured("TMDB est désactivé dans les paramètres")
    key = (s.tmdb_api_key if s else None) or ""
    if not key.strip():
        raise TmdbNotConfigured("Clé API TMDB non configurée")
    return key.strip()


def _poster(path: Optional[str], size: str = "w342") -> Optional[str]:
    return f"{IMG_BASE}/{size}{path}" if path else None


def _backdrop(path: Optional[str], size: str = "w780") -> Optional[str]:
    return f"{IMG_BASE}/{size}{path}" if path else None


def _logo(path: Optional[str], size: str = "w154") -> Optional[str]:
    return f"{IMG_BASE}/{size}{path}" if path else None


def _profile(path: Optional[str], size: str = "w185") -> Optional[str]:
    return f"{IMG_BASE}/{size}{path}" if path else None


async def _cache_get(db: AsyncSession, key: str) -> Optional[dict]:
    row = (
        (await db.execute(select(SearchCache).filter(SearchCache.query == key, SearchCache.category == "tmdb")))
        .scalars()
        .first()
    )
    if not row:
        return None
    if row.cached_at and (now_utc_naive() - row.cached_at) > CACHE_TTL:
        return None
    try:
        return json.loads(row.results_json)
    except Exception:
        return None


async def _cache_put(db: AsyncSession, key: str, payload: dict) -> None:
    row = (
        (await db.execute(select(SearchCache).filter(SearchCache.query == key, SearchCache.category == "tmdb")))
        .scalars()
        .first()
    )
    if row:
        row.results_json = json.dumps(payload)
        row.cached_at = now_utc_naive()
    else:
        db.add(SearchCache(query=key, category="tmdb", results_json=json.dumps(payload), cached_at=now_utc_naive()))
    await db.commit()


async def check_connection(db: AsyncSession, api_key: Optional[str] = None) -> tuple[bool, str]:
    """Valide la clé API TMDB via un appel léger (/configuration). Retourne (ok, message)."""
    if api_key is not None:
        key = api_key
    else:
        try:
            key = await _api_key(db)
        except TmdbNotConfigured:
            return False, "Clé API TMDB non configurée"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{API_BASE}/configuration", params={"api_key": key})
        if resp.status_code == 200:
            return True, "Clé TMDB valide"
        if resp.status_code == 401:
            return False, "Clé TMDB invalide (401 Unauthorized)"
        return False, f"Réponse TMDB inattendue ({resp.status_code})"
    except Exception as e:
        return False, f"Erreur de connexion TMDB : {e}"


async def _get(db: AsyncSession, path: str, params: Optional[dict] = None, *, cache: bool = True) -> dict:
    """Appel GET TMDB avec cache optionnel. `path` commence par '/'."""
    key = await _api_key(db)
    params = {**(params or {}), "api_key": key, "language": LANG}
    cache_key = f"{path}?{json.dumps({k: v for k, v in params.items() if k != 'api_key'}, sort_keys=True)}"
    if cache:
        cached = await _cache_get(db, cache_key)
        if cached is not None:
            return cached
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{API_BASE}{path}", params=params)
        resp.raise_for_status()
        data = resp.json()
    if cache:
        try:
            await _cache_put(db, cache_key, data)
        except Exception as e:
            logger.debug("Cache TMDB non écrit pour %s: %s", cache_key, e)
    return data


def _norm(item: dict, forced_type: Optional[str] = None) -> Optional[dict]:
    """Normalise un résultat TMDB (movie/tv) vers la forme commune du frontend."""
    mt = forced_type or item.get("media_type")
    if mt not in ("movie", "tv"):
        return None  # ignore les résultats "person" du multi-search
    is_movie = mt == "movie"
    title = item.get("title") if is_movie else item.get("name")
    date = (item.get("release_date") if is_movie else item.get("first_air_date")) or ""
    year = int(date[:4]) if date[:4].isdigit() else None
    return {
        "tmdb_id": item.get("id"),
        "media_type": "movie" if is_movie else "show",  # convention interne du reste de l'app
        "title": title or "",
        "year": year,
        "overview": item.get("overview") or "",
        "poster_url": _poster(item.get("poster_path")),
        "backdrop_url": _backdrop(item.get("backdrop_path")),
        "vote": round(item.get("vote_average") or 0, 1),
        "popularity": item.get("popularity") or 0,
        "genre_ids": item.get("genre_ids") or [],
    }


def _norm_list(data: dict, forced_type: Optional[str] = None) -> list[dict]:
    out = []
    for r in data.get("results", []):
        n = _norm(r, forced_type)
        if n and n["tmdb_id"]:
            out.append(n)
    return out


def _norm_page(data: dict, forced_type: Optional[str] = None) -> dict:
    """Normalise une page TMDB sans perdre les métadonnées de pagination."""
    return {
        "items": _norm_list(data, forced_type),
        "page": max(1, int(data.get("page") or 1)),
        "total_pages": max(1, int(data.get("total_pages") or 1)),
        "total_results": max(0, int(data.get("total_results") or 0)),
    }


def _norm_cast(data: dict, limit: int = 18) -> list[dict]:
    return [
        {
            "tmdb_id": person.get("id"),
            "name": person.get("name") or "",
            "character": person.get("character") or "",
            "profile_url": _profile(person.get("profile_path")),
            "order": person.get("order", index),
        }
        for index, person in enumerate((data or {}).get("cast", [])[:limit])
        if person.get("id") and person.get("name")
    ]


def _merge_pages(movie_page: dict, show_page: dict, page: int) -> dict:
    """Fusionne films et séries avec un ordre stable de pertinence."""
    items = [*movie_page["items"], *show_page["items"]]
    items.sort(key=lambda item: (item.get("popularity") or 0, item.get("vote") or 0), reverse=True)
    return {
        "items": items,
        "page": page,
        "total_pages": max(movie_page["total_pages"], show_page["total_pages"]),
        "total_results": movie_page["total_results"] + show_page["total_results"],
    }


# --- API publiques (consommées par le routeur discover) ---------------------


async def trending(db: AsyncSession, media_type: str = "all", window: str = "week", page: int = 1) -> dict:
    mt = "tv" if media_type == "show" else media_type
    data = await _get(db, f"/trending/{mt}/{window}", {"page": page})
    forced = None if mt == "all" else mt
    return _norm_page(data, forced)


async def popular(db: AsyncSession, media_type: str, page: int = 1, region: str = REGION) -> dict:
    if media_type == "all":
        return _merge_pages(
            await popular(db, "movie", page, region),
            await popular(db, "show", page, region),
            page,
        )
    mt = "movie" if media_type == "movie" else "tv"
    data = await _get(db, f"/{mt}/popular", {"page": page, "region": region})
    return _norm_page(data, mt)


async def coming_soon(db: AsyncSession, media_type: str, page: int = 1, region: str = REGION) -> dict:
    """Films : upcoming ; Séries : on_the_air."""
    if media_type == "all":
        return _merge_pages(
            await coming_soon(db, "movie", page, region),
            await coming_soon(db, "show", page, region),
            page,
        )
    if media_type == "movie":
        data = await _get(db, "/movie/upcoming", {"page": page, "region": region})
        return _norm_page(data, "movie")
    data = await _get(db, "/tv/on_the_air", {"page": page})
    return _norm_page(data, "tv")


async def genres(db: AsyncSession, media_type: str) -> list[dict]:
    if media_type == "all":
        combined = [*(await genres(db, "movie")), *(await genres(db, "show"))]
        return sorted({g["id"]: g for g in combined}.values(), key=lambda g: g["name"])
    mt = "movie" if media_type == "movie" else "tv"
    data = await _get(db, f"/genre/{mt}/list")
    return data.get("genres", [])


async def discover(
    db: AsyncSession,
    media_type: str,
    genre: Optional[int] = None,
    sort_by: str = "popularity.desc",
    page: int = 1,
    region: str = REGION,
) -> dict:
    if media_type == "all":
        return _merge_pages(
            await discover(db, "movie", genre, sort_by, page, region),
            await discover(db, "show", genre, sort_by, page, region),
            page,
        )
    mt = "movie" if media_type == "movie" else "tv"
    params = {"page": page, "sort_by": sort_by, "region": region}
    if genre:
        params["with_genres"] = genre
    data = await _get(db, f"/discover/{mt}", params)
    return _norm_page(data, mt)


async def discover_genre_rail(
    db: AsyncSession,
    genre_key: str,
    page: int = 1,
    region: str = REGION,
) -> dict:
    """Découvre les médias phares d'un genre pour l'affichage en rail sur l'accueil."""
    mapping = GENRE_RAIL_MAPPING.get(genre_key)
    if not mapping:
        raise ValueError(f"Genre inconnu: {genre_key}")
    movie_genre = mapping.get("movie")
    tv_genre = mapping.get("show")
    movie_res = await discover(db, "movie", movie_genre, "popularity.desc", page, region)
    tv_res = await discover(db, "show", tv_genre, "popularity.desc", page, region)
    return _merge_pages(movie_res, tv_res, page)


async def discovery_sources(db: AsyncSession, region: str = REGION) -> list[dict]:
    """Retourne une courte sélection éditoriale de plateformes, réseaux et studios."""
    movie_providers = await _get(db, "/watch/providers/movie", {"watch_region": region})
    tv_providers = await _get(db, "/watch/providers/tv", {"watch_region": region})
    providers = {
        int(provider["provider_id"]): provider
        for provider in [*movie_providers.get("results", []), *tv_providers.get("results", [])]
        if provider.get("provider_id") is not None
    }

    result = []
    for source in CURATED_DISCOVERY_SOURCES:
        item = dict(source)
        if item["kind"] == "provider":
            aliases = PROVIDER_ALIASES.get(item["id"], [item["id"]])
            provider = next((providers.get(aid) for aid in aliases if providers.get(aid)), None)
            if not provider:
                continue
            item["id"] = int(provider.get("provider_id") or item["id"])
            item["name"] = provider.get("provider_name") or item["name"]
            item["logo_url"] = _logo(provider.get("logo_path"))
        elif item["kind"] == "network":
            try:
                net = await _get(db, f"/network/{item['id']}")
                if net and net.get("logo_path"):
                    item["logo_url"] = _logo(net.get("logo_path"))
                    item["name"] = net.get("name") or item["name"]
                else:
                    item["logo_url"] = None
            except Exception:
                item["logo_url"] = None
        elif item["kind"] == "company":
            try:
                comp = await _get(db, f"/company/{item['id']}")
                if comp and comp.get("logo_path"):
                    item["logo_url"] = _logo(comp.get("logo_path"))
                    item["name"] = comp.get("name") or item["name"]
                else:
                    item["logo_url"] = None
            except Exception:
                item["logo_url"] = None
        result.append(item)
    return result


async def _company_movies(db: AsyncSession, company_id: int, page: int = 1) -> dict:
    """Utilise l'endpoint officiel /company/{id}/movies pour obtenir la filmographie
    précise d'un studio. Contrairement à /discover/movie?with_companies, cet endpoint
    retourne uniquement les films directement associés au studio dans TMDB, évitant
    ainsi les faux positifs (ex: Ghost in the Shell sur Studio Ghibli).
    Pagination simulée côté Python car l'endpoint TMDB n'est pas paginé."""
    data = await _get(db, f"/company/{company_id}/movies")
    all_items = _norm_list(data, "movie")
    # Trier par popularité décroissante puis par année
    all_items.sort(key=lambda item: (item.get("popularity") or 0, item.get("year") or 0), reverse=True)
    per_page = 20
    start = (page - 1) * per_page
    page_items = all_items[start : start + per_page]
    total = len(all_items)
    return {
        "items": page_items,
        "page": page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
        "total_results": total,
    }


async def discover_by_source(
    db: AsyncSession,
    kind: str,
    source_id: int,
    media_type: str = "all",
    page: int = 1,
    region: str = REGION,
    sort_by: str = "popularity.desc",
) -> dict:
    """Découvre des médias par plateforme, réseau de diffusion ou studio.

    Pour les studios (company), utilise /company/{id}/movies au lieu de
    /discover/movie?with_companies afin d'éviter les correspondances incorrectes
    (TMDB retourne parfois des films sans rapport avec le studio demandé).
    """
    if kind == "network":
        if media_type == "movie":
            return {"items": [], "page": page, "total_pages": 1, "total_results": 0}
        media_type = "show"

    # Pour les studios, utiliser l'endpoint filmographie officielle TMDB
    if kind == "company":
        if media_type == "show":
            # Les studios de production n'ont pas d'endpoint TV équivalent :
            # on utilise /discover/tv?with_companies avec un filtre popularité minimale
            params: dict[str, str | int] = {
                "page": page,
                "sort_by": sort_by,
                "with_companies": source_id,
                "vote_count.gte": 20,  # Filtre anti-faux-positifs : exige un minimum de votes
            }
            data = await _get(db, "/discover/tv", params)
            return _norm_page(data, "tv")
        if media_type == "all":
            return _merge_pages(
                await _company_movies(db, source_id, page),
                await discover_by_source(db, kind, source_id, "show", page, region, sort_by=sort_by),
                page,
            )
        # media_type == "movie"
        return await _company_movies(db, source_id, page)

    if media_type == "all":
        return _merge_pages(
            await discover_by_source(db, kind, source_id, "movie", page, region, sort_by=sort_by),
            await discover_by_source(db, kind, source_id, "show", page, region, sort_by=sort_by),
            page,
        )

    mt = "movie" if media_type == "movie" else "tv"
    params = {
        "page": page,
        "sort_by": sort_by,
        "region": region,
    }
    if kind == "provider":
        params.update(
            {
                "watch_region": region,
                "with_watch_providers": source_id,
                "with_watch_monetization_types": "flatrate|free|ads",
            }
        )
    elif kind == "network":
        params["with_networks"] = source_id
    else:
        raise ValueError(f"Type de source inconnu: {kind}")

    data = await _get(db, f"/discover/{mt}", params)
    return _norm_page(data, mt)


async def discover_genre_rail_by_provider(
    db: AsyncSession,
    genre_key: str,
    provider_id: int,
    page: int = 1,
    region: str = REGION,
) -> dict:
    """Rail thématique par genre filtré sur une plateforme SVOD (watch_provider).
    Utilisé pour construire les rails de la page dédiée provider (Netflix, Disney+, etc.).
    """
    mapping = GENRE_RAIL_MAPPING.get(genre_key)
    if not mapping:
        raise ValueError(f"Genre inconnu: {genre_key}")
    base_params = {
        "page": page,
        "sort_by": "popularity.desc",
        "watch_region": region,
        "with_watch_providers": provider_id,
        "with_watch_monetization_types": "flatrate|free|ads",
    }
    movie_params = {**base_params, "with_genres": mapping["movie"]}
    tv_params = {**base_params, "with_genres": mapping["show"]}
    movie_data = await _get(db, "/discover/movie", movie_params)
    tv_data = await _get(db, "/discover/tv", tv_params)
    return _merge_pages(_norm_page(movie_data, "movie"), _norm_page(tv_data, "tv"), page)


async def search(db: AsyncSession, query: str, page: int = 1, media_type: str = "all") -> dict:
    if media_type == "all":
        path, forced = "/search/multi", None
    else:
        forced = "movie" if media_type == "movie" else "tv"
        path = f"/search/{forced}"
    data = await _get(db, path, {"query": query, "page": page, "include_adult": "false"}, cache=False)
    return _norm_page(data, forced)


_MOVIE_RELEASE_TYPES = {3: "cinema", 4: "plateforme", 5: "dvd_bluray"}


def _norm_movie_release_dates(payload: dict) -> dict:
    """Dates de sortie ciné / plateforme / DVD-Bluray pour un film, à partir de
    `release_dates.results[]` (TMDB). Priorité à la région FR, repli sur US puis
    sur la première région disponible si FR n'a pas ce type de sortie."""
    results = (payload or {}).get("results") or []
    by_region = {r.get("iso_3166_1"): r.get("release_dates") or [] for r in results}
    ordered_regions = [REGION, "US", *by_region.keys()]
    out: dict[str, Optional[str]] = {"cinema": None, "plateforme": None, "dvd_bluray": None}
    for key, wanted_type in _MOVIE_RELEASE_TYPES.items():
        for region in ordered_regions:
            found = next(
                (
                    rd.get("release_date")
                    for rd in by_region.get(region, [])
                    if rd.get("type") == key and rd.get("release_date")
                ),
                None,
            )
            if found:
                out[wanted_type] = found[:10]
                break
    return out


def _current_season_air_date(data: dict) -> Optional[str]:
    """Date de première diffusion de la saison en cours (celle de l'épisode
    suivant, ou à défaut du dernier épisode diffusé, ou la plus récente saison)."""
    target_season = (data.get("next_episode_to_air") or {}).get("season_number") or (
        data.get("last_episode_to_air") or {}
    ).get("season_number")
    seasons = [s for s in data.get("seasons", []) if s.get("season_number") and s.get("season_number") > 0]
    if not seasons:
        return None
    if target_season is not None:
        match = next((s for s in seasons if s.get("season_number") == target_season), None)
        if match:
            return match.get("air_date")
    return max(seasons, key=lambda s: s.get("season_number") or 0).get("air_date")


async def detail(db: AsyncSession, media_type: str, tmdb_id: int) -> dict:
    mt = "movie" if media_type in ("movie", "movies") else "tv"
    append = "external_ids,recommendations,similar,credits"
    if mt == "movie":
        append += ",release_dates"
    data = await _get(db, f"/{mt}/{tmdb_id}", {"append_to_response": append})
    ext = data.get("external_ids") or {}
    base = _norm({**data, "media_type": mt}, mt) or {}
    saga = None
    collection = data.get("belongs_to_collection") if mt == "movie" else None
    if collection and collection.get("id"):
        try:
            saga = await get_collection(db, collection["id"])
        except Exception as e:
            logger.debug("Saga TMDB indisponible pour la collection %s: %s", collection.get("id"), e)
    base.update(
        {
            "tvdb_id": ext.get("tvdb_id"),
            "imdb_id": ext.get("imdb_id") or data.get("imdb_id"),
            "genres": [g.get("name") for g in data.get("genres", [])],
            "runtime": data.get("runtime") or (data.get("episode_run_time") or [None])[0],
            "status": data.get("status"),
            "number_of_seasons": data.get("number_of_seasons"),
            "next_episode_to_air": data.get("next_episode_to_air"),
            "recommendations": _norm_list(data.get("recommendations") or {}, mt),
            "similar": _norm_list(data.get("similar") or {}, mt),
            "cast": _norm_cast(data.get("credits") or {}),
            "saga": saga,
        }
    )
    if mt == "movie":
        base["release_dates"] = _norm_movie_release_dates(data.get("release_dates") or {})
    else:
        base["first_air_date"] = data.get("first_air_date")
        base["current_season_air_date"] = _current_season_air_date(data)
    return base


async def person_detail(db: AsyncSession, person_id: int) -> dict:
    data = await _get(db, f"/person/{person_id}", {"append_to_response": "combined_credits"})
    credits = []
    seen = set()
    for raw in (data.get("combined_credits") or {}).get("cast", []):
        item = _norm(raw)
        key = (item or {}).get("media_type"), (item or {}).get("tmdb_id")
        if not item or not key[1] or key in seen:
            continue
        seen.add(key)
        item["character"] = raw.get("character") or ""
        credits.append(item)
    credits.sort(key=lambda item: (item.get("popularity") or 0, item.get("vote") or 0), reverse=True)
    return {
        "tmdb_id": data.get("id"),
        "name": data.get("name") or "",
        "biography": data.get("biography") or "",
        "birthday": data.get("birthday"),
        "deathday": data.get("deathday"),
        "place_of_birth": data.get("place_of_birth") or "",
        "known_for_department": data.get("known_for_department") or "",
        "profile_url": _profile(data.get("profile_path"), "h632"),
        "credits": credits[:60],
    }


async def get_collection(db: AsyncSession, collection_id: int) -> dict:
    """Collection TMDB (saga) : tous les volets d'une franchise cinéma. Pas d'équivalent
    TMDB pour les séries (belongs_to_collection n'existe que côté films)."""
    data = await _get(db, f"/collection/{collection_id}")
    items = [
        item for item in (_norm(part, "movie") for part in data.get("parts", []) or []) if item and item["tmdb_id"]
    ]
    items.sort(key=lambda item: item["year"] or 0)
    return {
        "id": data.get("id"),
        "name": data.get("name"),
        "overview": data.get("overview") or "",
        "poster_url": _poster(data.get("poster_path")),
        "backdrop_url": _backdrop(data.get("backdrop_path")),
        "items": items,
    }


async def external_ids(db: AsyncSession, media_type: str, tmdb_id: int) -> dict:
    mt = "movie" if media_type in ("movie", "movies") else "tv"
    data = await _get(db, f"/{mt}/{tmdb_id}/external_ids")
    return {"tvdb_id": data.get("tvdb_id"), "imdb_id": data.get("imdb_id")}


async def get_tv_seasons_overview(db: AsyncSession, tmdb_id: int) -> list[dict]:
    """Liste des saisons (numéro, nom, nombre d'épisodes) — l'enveloppe légère
    affichée avant même de savoir quoi que ce soit sur la disponibilité ou le VF/VO
    (façon Seerr : `Media.getMedia`, une lecture rapide, jamais un appel Sonarr/Plex).
    Saison 0 (spéciaux) exclue : jamais suivie côté VF/disponibilité dans cette app.
    """
    data = await _get(db, f"/tv/{tmdb_id}")
    return [
        {
            "season_number": s.get("season_number"),
            "name": s.get("name"),
            "episode_count": s.get("episode_count"),
        }
        for s in data.get("seasons", [])
        if s.get("season_number") and s.get("season_number") > 0
    ]


async def get_tv_season_episodes(db: AsyncSession, tmdb_id: int, season_number: int) -> list[dict]:
    """Épisodes d'une saison (numéro, titre, date de diffusion) — même principe que
    `/tv/:id/season/:seasonNumber` chez Seerr : pure métadonnée, aucune notion de
    disponibilité ou de VF/VO ici."""
    data = await _get(db, f"/tv/{tmdb_id}/season/{season_number}")
    return [
        {
            "episode_number": e.get("episode_number"),
            "title": e.get("name"),
            "air_date": e.get("air_date"),
            "overview": e.get("overview") or "",
            "still_url": _backdrop(e.get("still_path"), "w300"),
        }
        for e in data.get("episodes", [])
    ]


async def find_by_external_id(db: AsyncSession, source: str, external_id: int | str) -> Optional[int]:
    """Trouve l'ID TMDB a partir d'un identifiant externe (ex : tvdb_id)."""
    try:
        data = await _get(db, f"/find/{external_id}", {"external_source": source})
        tv_results = data.get("tv_results") or []
        if tv_results:
            return tv_results[0].get("id")
        movie_results = data.get("movie_results") or []
        if movie_results:
            return movie_results[0].get("id")
    except Exception as e:
        logger.warning(f"TMDB /find failed for {source}={external_id}: {e}")
    return None
