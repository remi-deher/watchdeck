import logging
from typing import Optional

from plexapi.server import PlexServer

from .audio_analyzer import (
    _reload,
    get_audio_info,
    get_french_audio_state,
    movie_french_audio_state,
    show_has_full_french_audio,
)

logger = logging.getLogger(__name__)

def connect(plex_url: str, plex_token: str, timeout: int = 30) -> PlexServer:
    """Ouvre une connexion au serveur Plex local (lève une exception si échec)."""
    return PlexServer(plex_url, plex_token, timeout=timeout)


def refresh_sections_blocking(plex_url: str, plex_token: str, section_names: list[str]) -> None:
    """Déclenche un scan Plex (refresh complet de section) pour les sections données.

    Utilisé pour prévenir Plex dès qu'un import Sonarr/Radarr est détecté, au lieu
    d'attendre son propre calendrier de scan de bibliothèque. Best-effort : une section
    en erreur (introuvable, Plex temporairement indisponible...) n'interrompt pas les
    autres.
    """
    plex = connect(plex_url, plex_token)
    for name in section_names:
        try:
            plex.library.section(name).update()
        except Exception as exc:
            logger.warning(f"Refresh Plex échoué pour la section {name!r}: {exc}")


def _external_id_matches(item, tmdb_id: Optional[str], tvdb_id: Optional[str], imdb_id: Optional[str]) -> bool:
    """True si les GUIDs Plex de l'item correspondent à l'un des identifiants fournis."""
    try:
        for guid in getattr(item, "guids", []):
            gid = guid.id or ""
            if tmdb_id and gid == f"tmdb://{tmdb_id}":
                return True
            if tvdb_id and gid == f"tvdb://{tvdb_id}":
                return True
            if imdb_id and gid == f"imdb://{imdb_id}":
                return True
        # Vérification du guid principal (prise en charge des agents classiques)
        main_guid = getattr(item, "guid", "") or ""
        if tmdb_id and (f"tmdb://{tmdb_id}" in main_guid or f"themoviedb://{tmdb_id}" in main_guid):
            return True
        if tvdb_id and (f"tvdb://{tvdb_id}" in main_guid or f"thetvdb://{tvdb_id}" in main_guid):
            return True
        if imdb_id and (f"imdb://{imdb_id}" in main_guid or f"themoviedb://{imdb_id}" in main_guid):
            return True
    except Exception:
        pass
    return False


def get_movie_audio_detail_blocking(
    plex_url: str,
    plex_token: str,
    movie_libs: list[str],
    title: str,
    year: Optional[int],
    tmdb_id: Optional[str],
    tvdb_id: Optional[str],
    imdb_id: Optional[str],
) -> dict:
    """Détail audio d'un film (bloquant, plexapi) : pistes détectées + has_vf.

    Retourne {"found": bool, "has_vf": bool, "tracks": [...]}.
    """
    try:
        plex = connect(plex_url, plex_token)
    except Exception as exc:
        return {"found": False, "error": str(exc)}
    item = find_item_in_libraries(plex, movie_libs, title, year, tmdb_id, tvdb_id, imdb_id)
    if not item:
        return {"found": False}
    _reload(item, "movie")
    has_fr, tracks, subtitles = get_audio_info(item)
    return {"found": True, "has_vf": has_fr, "tracks": tracks, "subtitles": subtitles}


def get_show_episode_vf_blocking(
    plex_url: str,
    plex_token: str,
    show_libs: list[str],
    title: str,
    year: Optional[int],
    tmdb_id: Optional[str],
    tvdb_id: Optional[str],
    imdb_id: Optional[str],
    known_vf: Optional[dict[int, set[int]]] = None,
) -> dict:
    """Carte VF par épisode d'une série présente dans Plex (bloquant, plexapi).

    `known_vf` : cache des épisodes déjà confirmés VF lors d'un scan précédent
    (voir `show_has_full_french_audio`) — ils ne sont pas re-scannés dans Plex.

    Retourne {"found": bool, "episodes": {season_number: {episode_number: has_vf}}}.
    Seuls les épisodes réellement présents dans Plex apparaissent ici ; le croisement
    avec la liste attendue de Sonarr (épisodes absents) se fait côté appelant.
    """
    known_vf = known_vf or {}
    try:
        plex = connect(plex_url, plex_token)
    except Exception as exc:
        return {"found": False, "error": str(exc)}
    item = None
    for name in show_libs:
        item = find_item_in_libraries(plex, [name], title, year, tmdb_id, tvdb_id, imdb_id)
        if item:
            break
    if not item:
        return {"found": False}

    ep_map: dict[int, dict[int, bool]] = {}
    priority_map: dict[int, dict[int, bool]] = {}
    try:
        for season in item.seasons():
            sn = getattr(season, "seasonNumber", None)
            if sn is None:
                continue
            for ep in season.episodes():
                en = getattr(ep, "index", None)
                if en is None:
                    continue
                _reload(ep, "episode")
                audio_state = get_french_audio_state(ep)
                ep_map.setdefault(sn, {})[en] = audio_state["has_fr"]
                priority_map.setdefault(sn, {})[en] = audio_state["fr_is_default"]
    except Exception as exc:
        logger.warning("Erreur détail épisodes VF pour %r: %s", getattr(item, "title", "?"), exc)
    return {"found": True, "episodes": ep_map, "french_default": priority_map}


def find_item_in_libraries(
    plex: PlexServer,
    library_names: list[str],
    title: str,
    year: Optional[int] = None,
    tmdb_id: Optional[str] = None,
    tvdb_id: Optional[str] = None,
    imdb_id: Optional[str] = None,
    plex_guid: Optional[str] = None,
):
    """Localise un média dans les bibliothèques Plex données.

    Priorité de correspondance : GUID Plex, identifiants externes (TMDB/TVDB/IMDB) puis titre+année.
    Renvoie l'objet plexapi (Movie ou Show) ou None.
    """
    if not library_names:
        try:
            library_names = [s.title for s in plex.library.sections()]
        except Exception:
            library_names = []

    for lib_name in library_names:
        try:
            section = plex.library.section(lib_name)
        except Exception as exc:
            logger.debug("Bibliothèque %r indisponible: %s", lib_name, exc)
            continue

        # 1. Recherche par GUID Plex si présent
        if plex_guid:
            try:
                candidates = section.search(guid=plex_guid) if hasattr(section, "search") else []
                if candidates:
                    return candidates[0]
            except Exception as e:
                logger.debug(f"Search by guid {plex_guid} in {lib_name} failed: {e}")

        # 2. Recherche par GUID d'identifiant externe direct (TMDB / TVDB / IMDB)
        for provider, val in [("tmdb", tmdb_id), ("tvdb", tvdb_id), ("imdb", imdb_id)]:
            if val:
                try:
                    candidates = section.search(guid=f"{provider}://{val}")
                    if candidates:
                        return candidates[0]
                except Exception:
                    pass

        # 3. Recherche par ID externe textuel (Plex indexe les IDs externes dans l'index de recherche)
        for val in [imdb_id, tmdb_id, tvdb_id]:
            if val:
                try:
                    candidates = section.search(title=val)
                    for cand in candidates:
                        try:
                            cand.reload()
                        except Exception:
                            pass
                        if _external_id_matches(cand, tmdb_id, tvdb_id, imdb_id):
                            return cand
                except Exception:
                    pass

        # 4. Recherche par titre (fuzzy/rapide via l'index Plex)
        try:
            candidates = section.search(title=title) if hasattr(section, "search") else []
        except Exception:
            candidates = []

        # 5. Validation par identifiants externes sur les candidats trouvés par titre
        if tmdb_id or tvdb_id or imdb_id:
            for cand in candidates:
                try:
                    cand.reload()
                except Exception:
                    pass
                if _external_id_matches(cand, tmdb_id, tvdb_id, imdb_id):
                    return cand

        # 6. Fallback titre exact (+ année si connue)
        tl = title.lower().strip()
        for cand in candidates:
            if (getattr(cand, "title", "") or "").lower().strip() == tl:
                if year is None or getattr(cand, "year", None) in (None, year):
                    return cand

        # 7. Fallback ultime : Parcours complet de la bibliothèque en Python (rapide, sans rechargement)
        if tmdb_id or tvdb_id or imdb_id:
            try:
                all_items = section.all()
                for cand in all_items:
                    if _external_id_matches(cand, tmdb_id, tvdb_id, imdb_id):
                        return cand
            except Exception as e:
                logger.debug(f"Ultimate fallback scan in {lib_name} failed: {e}")

    return None


def scan_media_vf(
    plex: PlexServer,
    media_type: str,
    movie_libs: list[str],
    show_libs: list[tuple[str, str]],
    title: str,
    year: Optional[int],
    tmdb_id: Optional[str],
    tvdb_id: Optional[str],
    imdb_id: Optional[str],
    plex_guid: Optional[str] = None,
    known_vf: Optional[dict[int, set[int]]] = None,
    known_episodes: Optional[dict[int, set[int]]] = None,
) -> dict:
    """Localise un média dans Plex et détermine son statut VF (bloquant, plexapi).

    `show_libs` est une liste de tuples (nom_bibliothèque, kind) où kind vaut
    "series" — les bibliothèques musique ("music") ne sont jamais scannées pour la VF,
    voir l'exclusion faite en amont dans `vff_scanner._scan_vf_blocking`.

    `known_vf` (séries uniquement) : cache des épisodes déjà confirmés VF, voir
    `show_has_full_french_audio`. Ignoré pour les films.

    `known_episodes` (séries uniquement) : {season_number: {episode_number}} connus de
    Sonarr, voir `show_has_full_french_audio`. Ignoré pour les films.

    Retourne {"found": False} si le média n'est pas trouvé, sinon
    {"found": True, "has_vf": bool, "category": "movie"|"series", "title", "year",
    "overview"} (+ "episode_status" pour les séries, à persister dans le cache par
    l'appelant). `title`/`year`/`overview` reflètent l'état actuel dans Plex (Plex fait
    foi) — l'appelant peut s'en servir pour rafraîchir sa propre copie (LibraryItem),
    par exemple après un renommage manuel dans Plex (ex: retrait d'un suffixe "(VOSTFR)").
    """
    if media_type == "movie":
        item = find_item_in_libraries(plex, movie_libs, title, year, tmdb_id, tvdb_id, imdb_id, plex_guid=plex_guid)
        if not item:
            return {"found": False}
        audio_state = movie_french_audio_state(item)
        return {
            "found": True, "has_vf": audio_state["has_fr"], "category": "movie",
            # None (pas de VF du tout) plutot que False : "secondaire" n'a de sens que
            # si la VF existe (voir apply_plex_metadata et le badge front qui distingue
            # VO de VF-secondaire).
            "fr_is_default": audio_state["fr_is_default"] if audio_state["has_fr"] else None,
            "title": item.title, "year": item.year, "overview": item.summary,
        }

    item = None
    category = "series"
    for name, _kind in show_libs:
        item = find_item_in_libraries(plex, [name], title, year, tmdb_id, tvdb_id, imdb_id, plex_guid=plex_guid)
        if item:
            break
    if not item:
        return {"found": False}
    complete, should_track, _, _, episode_status, french_default, episode_metadata, known_episode_status = show_has_full_french_audio(
        item, known_vf=known_vf, known_episode_numbers=known_episodes
    )
    has_vf = complete or (not should_track)
    # Agrege le detail par episode (french_default) en un seul indicateur serie : False
    # des qu'au moins un episode a la VF mais pas en piste par defaut, sinon True (ou
    # None si aucun episode VF trouve) -- meme principe que pour un film, juste agrege.
    any_vf_episode = False
    any_secondary_episode = False
    for sn, eps in episode_status.items():
        for en, has_fr in eps.items():
            if not has_fr:
                continue
            any_vf_episode = True
            if french_default.get(sn, {}).get(en) is False:
                any_secondary_episode = True
    fr_is_default = (not any_secondary_episode) if any_vf_episode else None
    # Formate les metadonnees episode brutes plexapi (chemin relatif "thumb", date
    # possiblement un objet date) en valeurs directement persistables/serialisables --
    # voir vff_scanner._persist_episode_metadata.
    formatted_metadata: dict[int, dict[int, dict]] = {}
    for sn, eps in episode_metadata.items():
        formatted_metadata[sn] = {}
        for en, meta in eps.items():
            thumb = meta.get("thumb")
            air_date = meta.get("air_date")
            formatted_metadata[sn][en] = {
                "title": meta.get("title"),
                "overview": meta.get("overview") or "",
                "still_url": plex.url(thumb, includeToken=True) if thumb else None,
                "air_date": air_date.isoformat() if hasattr(air_date, "isoformat") else air_date,
                "tracks": meta.get("tracks") or [],
                "subtitles": meta.get("subtitles") or [],
            }
    return {
        "found": True,
        "has_vf": has_vf,
        "category": category,
        "fr_is_default": fr_is_default,
        "title": item.title, "year": item.year, "overview": item.summary,
        "episode_status": episode_status,
        "french_default": french_default,
        "episode_metadata": formatted_metadata,
        "known_episode_status": known_episode_status,
    }


def apply_plex_metadata(obj, res: dict) -> None:
    """Reporte title/year/overview d'un resultat `scan_media_vf` sur un LibraryItem (ou
    MediaRequest) — Plex fait foi : un renommage manuel dans Plex (ex: retrait d'un
    suffixe "(VOSTFR)" apres remplacement du fichier VO par le VF) doit se refleter, pas
    rester fige sur le titre capture a la premiere synchronisation. Facteur commun entre
    le scan periodique (vff_scanner._run_vf_scan) et les scans a la demande
    (routers/vff_api.py), plutot que duplique a chaque appelant.
    """
    if not res.get("found"):
        return
    if res.get("title"):
        obj.title = res["title"]
    if res.get("year") is not None:
        obj.year = res["year"]
    if res.get("overview"):
        obj.overview = res["overview"]


def _plex_item_to_dict(m, lib: dict, plex_url: str, plex_token: str) -> dict:
    """Convertit un item plexapi (Movie/Show/Artist/Album/Track) en dict structuré pour l'intégration en base."""
    tmdb_id = None
    tvdb_id = None
    imdb_id = None
    for guid in getattr(m, "guids", []):
        gid = guid.id or ""
        if gid.startswith("tmdb://"):
            tmdb_id = gid.split("tmdb://")[-1]
        elif gid.startswith("tvdb://"):
            tvdb_id = gid.split("tvdb://")[-1]
        elif gid.startswith("imdb://"):
            imdb_id = gid.split("imdb://")[-1]

    m_type = getattr(m, "type", None)
    if m_type == "artist":
        media_type = "artist"
    elif m_type == "album":
        media_type = "album"
    elif m_type == "track":
        media_type = "track"
    else:
        media_type = {"series": "show", "music": "artist"}.get(lib.get("kind"), "movie")

    overview = getattr(m, "summary", None) or ""
    parent_title = getattr(m, "parentTitle", None) or getattr(m, "grandparentTitle", None)
    if parent_title and media_type in ("album", "track") and parent_title not in overview:
        overview = f"Artiste / Album: {parent_title}\n{overview}".strip()

    thumb = getattr(m, "thumb", None) or getattr(m, "grandparentThumb", None)
    art = getattr(m, "art", None) or getattr(m, "grandparentArt", None)
    # genres n'existe que sur movie/show/artist -- absent (AttributeError via plexapi
    # lazy-load, pas juste None) sur album/track, d'ou le getattr avec liste par defaut.
    genres = ", ".join(g.tag for g in (getattr(m, "genres", None) or []) if getattr(g, "tag", None)) or None

    audio_codec = None
    audio_bitrate = None
    audio_sample_rate = None
    audio_channels = None
    if media_type == "track":
        audio_codec = "FLAC"
        media_item = (getattr(m, "media", None) or [None])[0]
        if media_item is not None:
            audio_codec = (getattr(media_item, "audioCodec", None) or getattr(media_item, "container", None) or audio_codec).upper()
            audio_bitrate = getattr(media_item, "bitrate", None)
            part = (getattr(media_item, "parts", None) or [None])[0]
            for stream in getattr(part, "streams", []) or []:
                if getattr(stream, "streamType", None) == 2 or getattr(stream, "type", None) == "audio":
                    audio_codec = (getattr(stream, "codec", None) or audio_codec).upper()
                    audio_bitrate = getattr(stream, "bitrate", None) or audio_bitrate
                    audio_sample_rate = getattr(stream, "samplingRate", None)
                    audio_channels = getattr(stream, "channels", None)
                    break

    return {
        "title": m.title,
        "year": getattr(m, "year", None),
        "media_type": media_type,
        "plex_guid": getattr(m, "guid", None),
        "tmdb_id": tmdb_id,
        "tvdb_id": tvdb_id,
        "imdb_id": imdb_id,
        "poster_url": f"{plex_url.rstrip('/')}{thumb}?X-Plex-Token={plex_token}"
        if thumb
        else None,
        "art_url": f"{plex_url.rstrip('/')}{art}?X-Plex-Token={plex_token}"
        if art
        else None,
        "genres": genres,
        "overview": overview or None,
        "added_at": getattr(m, "addedAt", None),
        "audio_codec": audio_codec,
        "audio_bitrate": audio_bitrate,
        "audio_sample_rate": audio_sample_rate,
        "audio_channels": audio_channels,
        "duration_ms": getattr(m, "duration", None) if media_type == "track" else None,
    }


def sync_plex_library_blocking(plex_url: str, plex_token: str, libs: list[dict]) -> list[dict]:
    """Récupère l'intégralité des médias présents dans les bibliothèques Plex spécifiées."""
    try:
        plex = connect(plex_url, plex_token)
    except Exception as exc:
        logger.error(f"VFF sync : connexion Plex impossible : {exc}")
        return []

    items = []
    for lib in libs:
        try:
            section = plex.library.section(lib["name"])
            all_media = list(section.all())
            if lib.get("kind") == "music":
                if hasattr(section, "albums"):
                    try:
                        all_media.extend(section.albums())
                    except Exception as alb_exc:
                        logger.warning(f"VFF sync : erreur lecture albums pour '{lib['name']}' : {alb_exc}")
                if hasattr(section, "searchTracks"):
                    try:
                        all_media.extend(section.searchTracks())
                    except Exception as trk_exc:
                        logger.warning(f"VFF sync : erreur lecture pistes pour '{lib['name']}' : {trk_exc}")
            for m in all_media:
                try:
                    items.append(_plex_item_to_dict(m, lib, plex_url, plex_token))
                except Exception as item_exc:
                    logger.warning(f"VFF sync : erreur lecture média '{getattr(m, 'title', '?')}' : {item_exc}")
        except Exception as lib_exc:
            logger.warning(f"VFF sync : impossible de lire la bibliothèque '{lib['name']}' : {lib_exc}")

    return items


def sync_plex_library_recent_blocking(plex_url: str, plex_token: str, libs: list[dict], since) -> list[dict]:
    """Recupere uniquement les medias ajoutes a Plex depuis `since` (scan incremental)."""
    try:
        plex = connect(plex_url, plex_token)
    except Exception as exc:
        logger.error(f"VFF sync (recent) : connexion Plex impossible : {exc}")
        return []

    items = []
    for lib in libs:
        try:
            section = plex.library.section(lib["name"])
            recent_media = list(section.search(filters={"addedAt>>": since}))
            if lib.get("kind") == "music":
                if hasattr(section, "searchAlbums"):
                    try:
                        recent_media.extend(section.searchAlbums(filters={"addedAt>>": since}))
                    except Exception as alb_exc:
                        logger.warning(f"VFF sync (recent) : erreur lecture albums pour '{lib['name']}' : {alb_exc}")
                if hasattr(section, "searchTracks"):
                    try:
                        recent_media.extend(section.searchTracks(filters={"addedAt>>": since}))
                    except Exception as trk_exc:
                        logger.warning(f"VFF sync (recent) : erreur lecture pistes pour '{lib['name']}' : {trk_exc}")
            for m in recent_media:
                try:
                    items.append(_plex_item_to_dict(m, lib, plex_url, plex_token))
                except Exception as item_exc:
                    logger.warning(f"VFF sync (recent) : erreur lecture média '{getattr(m, 'title', '?')}' : {item_exc}")
        except Exception as lib_exc:
            logger.warning(f"VFF sync (recent) : impossible de lire la bibliothèque '{lib['name']}' : {lib_exc}")

    return items
