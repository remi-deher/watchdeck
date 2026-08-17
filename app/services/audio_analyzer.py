"""
Détection de la présence d'une piste audio française (VF/VFF) sur un média Plex.

Porté depuis le projet « Plex VFF Auditor » et adapté au style de plex-rss :
- fonctions pures, sans état global
- réutilise la connexion PlexServer (plexapi, déjà dans les dépendances)

Le point d'entrée principal est `item_has_french_audio(item)` qui inspecte
défensivement toutes les pistes audio d'un film ou d'un épisode Plex.

Pour une série, `show_has_full_french_audio(show)` renvoie True uniquement si
TOUS les épisodes possèdent une piste VF (comportement « complet »).
"""

import logging
from typing import Any, Optional

from plexapi.server import PlexServer

logger = logging.getLogger(__name__)

# Codes ISO (2 ou 3 lettres) considérés comme français — source la plus fiable.
_LANG_CODES = {"fr", "fre", "fra"}
# Noms complets de langue.
_LANG_NAMES = {"french", "français", "francais"}
# Mots dans le titre de piste indiquant une VF ("Français 5.1", "VF", "TrueFrench"…).
_TITLE_WORDS = {"vf", "vff", "french", "français", "francais", "truefrench"}


def _truthy_attr(value) -> bool:
    if isinstance(value, str):
        return value.lower().strip() in {"1", "true", "yes", "selected", "default"}
    return bool(value)


def _stream_is_french(stream) -> bool:
    """Retourne True si cette piste audio est en français.

    Vérifie défensivement tous les attributs plexapi (certains peuvent être None).
    """
    # 1. Code langue ISO — le plus fiable
    try:
        code = (stream.languageCode or "").lower().strip()
        if code in _LANG_CODES:
            return True
    except Exception:
        pass

    # 2. Nom complet de la langue
    try:
        name = (stream.language or "").lower().strip()
        if name in _LANG_NAMES:
            return True
    except Exception:
        pass

    # 3. Titre / displayTitle de la piste — capte "Français 5.1", "VF", "MULTI", "TrueFrench"
    for attr in ("title", "displayTitle", "extendedDisplayTitle"):
        try:
            raw = (getattr(stream, attr, None) or "").strip()
            if not raw:
                continue
            low = raw.lower()
            # Match au niveau du mot pour éviter les faux positifs "vfx" ou "fr-CA"
            words = set(
                low.replace("-", " ").replace("(", " ").replace(")", " ").replace("/", " ").replace(".", " ").split()
            )
            if words & _TITLE_WORDS:
                return True
            if "multi" in low or "truefrench" in low:
                return True
        except Exception:
            pass

    return False


def languages_list_has_french(languages) -> bool:
    """Signal rapide (non autoritaire) : True si une des langues audio rapportées par
    Sonarr/Radarr (`mediaInfo.audioLanguages`, mesurées par ffprobe sur le fichier
    physique à l'import — voir webhook.py) est du français.

    N'utilise QUE la correspondance code/nom la plus fiable (mêmes ensembles que le
    point 1 de `_stream_is_french`) — pas de heuristique de mots-clés sur un titre de
    piste, cette donnée n'existe pas côté *arr. Ce signal sert uniquement à accélérer
    une confirmation VF positive dès l'import (avant même que Plex ait scanné) ; il ne
    doit JAMAIS servir à conclure à une absence de VF (mediaInfo.audioLanguages est
    fréquemment vide ou mal tagué sur les releases scène/P2P) — Plex reste l'autorité
    finale pour les négatifs et les rescans périodiques.
    """
    if not languages:
        return False
    if isinstance(languages, str):
        languages = [languages]
    for entry in languages:
        for part in str(entry or "").replace("/", ",").split(","):
            val = part.strip().lower()
            if val and (val in _LANG_CODES or val in _LANG_NAMES):
                return True
    return False


def get_audio_info(item) -> tuple[bool, list[dict], list[dict]]:
    """Retourne (has_french, liste_de_pistes, liste_de_sous_titres) pour un média Plex.

    Chaque piste : {"lang": str, "label": str, "is_fr": bool}
    Chaque sous-titre : {"lang": str, "label": str, "is_default": bool}
    Utilise getattr partout pour gérer les attributs manquants / None.
    """
    has_fr = False
    tracks: list[dict] = []
    subtitles: list[dict] = []
    seen: set[str] = set()
    seen_subs: set[str] = set()
    filename_has_vf = False

    try:
        for media in item.media:
            for part in media.parts:
                # Analyse du seul nom de fichier (dernier segment du chemin) -- le chemin
                # complet inclut le titre de l'episode, qui peut contenir "French"/"Multi"
                # comme mot anglais ordinaire (ex: "It's French Cuisine, Ms. Elf.mkv") sans
                # aucun rapport avec une piste audio doublee : un faux positif VF observe
                # sur "Welcome to Japan, Ms. Elf!" S01E06, dont l'audio est Japonais seul.
                raw_path = getattr(part, "file", "") or ""
                filename = raw_path.replace("\\", "/").rsplit("/", 1)[-1].lower()
                if filename:
                    words = set(
                        filename.replace("-", " ")
                        .replace("(", " ")
                        .replace(")", " ")
                        .replace(".", " ")
                        .replace("[", " ")
                        .replace("]", " ")
                        .replace("_", " ")
                        .split()
                    )
                    # "french"/"multi" seuls retires : trop souvent des mots ordinaires du
                    # titre d'episode plutot qu'un tag de release -- seuls "vf"/"vff"/
                    # "truefrench" restent suffisamment distinctifs pour ne jamais
                    # apparaitre autrement dans un nom de fichier legitime.
                    if words & {"vf", "vff", "truefrench"}:
                        filename_has_vf = True

                for stream in part.audioStreams():
                    lc = getattr(stream, "languageCode", None)
                    lang = getattr(stream, "language", None)
                    title = getattr(stream, "title", None)
                    disp = getattr(stream, "displayTitle", None)

                    is_fr = _stream_is_french(stream)
                    if is_fr:
                        has_fr = True

                    is_default = any(
                        _truthy_attr(getattr(stream, attr, None))
                        for attr in ("selected", "default", "defaultAudioStream")
                    )

                    label = disp or title or lc or lang or "?"
                    key = label.lower()
                    if key not in seen:
                        seen.add(key)
                        tracks.append(
                            {
                                "lang": (lc or lang or "?").lower(),
                                "label": label,
                                "is_fr": is_fr,
                                "is_default": is_default,
                            }
                        )

                for stream in part.subtitleStreams():
                    lc = getattr(stream, "languageCode", None)
                    lang = getattr(stream, "language", None)
                    title = getattr(stream, "title", None)
                    disp = getattr(stream, "displayTitle", None)

                    is_default = any(
                        _truthy_attr(getattr(stream, attr, None))
                        for attr in ("selected", "default", "defaultSubtitleStream")
                    )
                    # "Forcé" est un attribut plexapi distinct de "par défaut" -- une piste
                    # peut être l'une, l'autre, les deux ou ni l'une ni l'autre (ex: sous-titre
                    # forcé pour les seuls passages en langue étrangère, jamais sélectionné par
                    # défaut). Les confondre (comme avant) empêchait toute détection fiable
                    # d'un "sous-titre français forcé" spécifiquement.
                    is_forced = _truthy_attr(getattr(stream, "forced", None))
                    is_fr = _stream_is_french(stream)

                    label = disp or title or lc or lang or "?"
                    key = label.lower()
                    if key not in seen_subs:
                        seen_subs.add(key)
                        subtitles.append(
                            {
                                "lang": (lc or lang or "?").lower(),
                                "label": label,
                                "is_fr": is_fr,
                                "is_default": is_default,
                                "is_forced": is_forced,
                            }
                        )

        # Fallback nom de fichier si aucune piste détectée
        if not has_fr and filename_has_vf:
            has_fr = True
            tracks.append(
                {
                    "lang": "fr",
                    "label": "VF/VFF (via nom de fichier)",
                    "is_fr": True,
                }
            )
    except Exception as exc:
        logger.warning("Erreur lecture pistes audio pour %r: %s", getattr(item, "title", "?"), exc)

    return has_fr, tracks, subtitles


def item_has_french_audio(item) -> bool:
    """True si le média (film ou épisode) possède au moins une piste VF."""
    has_fr, _, _ = get_audio_info(item)
    return has_fr


def get_french_audio_state(item) -> dict:
    """Etat compact de priorite audio FR pour un film ou episode Plex."""
    has_fr, tracks, subtitles = get_audio_info(item)
    if not has_fr:
        return {"has_fr": False, "fr_is_default": False, "tracks": tracks, "subtitles": subtitles}

    try:
        first_audio_is_fr = None
        fr_marked_default = False
        any_marked_default = False
        for media in item.media:
            for part in media.parts:
                for stream in part.audioStreams():
                    is_fr = _stream_is_french(stream)
                    if first_audio_is_fr is None:
                        first_audio_is_fr = is_fr
                    is_default = any(
                        _truthy_attr(getattr(stream, attr, None))
                        for attr in ("selected", "default", "defaultAudioStream")
                    )
                    if is_default:
                        any_marked_default = True
                        if is_fr:
                            fr_marked_default = True
        if fr_marked_default:
            return {"has_fr": True, "fr_is_default": True, "tracks": tracks, "subtitles": subtitles}
        if any_marked_default:
            return {"has_fr": True, "fr_is_default": False, "tracks": tracks, "subtitles": subtitles}
        if first_audio_is_fr is None:
            return {"has_fr": True, "fr_is_default": True, "tracks": tracks, "subtitles": subtitles}
        return {"has_fr": True, "fr_is_default": bool(first_audio_is_fr), "tracks": tracks, "subtitles": subtitles}
    except Exception as exc:
        logger.warning("Erreur lecture priorite audio pour %r: %s", getattr(item, "title", "?"), exc)
        return {"has_fr": True, "fr_is_default": True, "tracks": tracks, "subtitles": subtitles}


def _reload(item, label: str = "item") -> None:
    """Appelle item.reload() pour récupérer les métadonnées complètes (pistes audio).

    lib.all() / season.episodes() renvoient des stubs sans détail de flux ;
    reload() complète ces informations.
    """
    try:
        item.reload()
    except Exception as exc:
        logger.warning("Impossible de recharger %s %r: %s", label, getattr(item, "title", "?"), exc)


# Nombre de clés Plex demandées par requête groupée. Plex accepte une liste de ratingKeys
# séparées par des virgules sur /library/metadata ; on plafonne pour ne pas construire une
# URL démesurée sur les séries à plusieurs centaines d'épisodes.
_BULK_METADATA_CHUNK = 100


def bulk_reload_episodes(episodes: list) -> dict[int, Any]:
    """Recharge les métadonnées complètes (pistes audio/sous-titres) de plusieurs épisodes
    en quelques requêtes au lieu d'une par épisode.

    `episode.reload()` coûte un aller-retour Plex chacun, ce qui domine le temps d'un scan
    de série (des dizaines de milliers d'appels sur une bibliothèque entière). Plex accepte
    plusieurs ratingKeys d'un coup sur /library/metadata et renvoie alors les flux de tous
    les épisodes demandés — mesuré ~2,4x plus rapide sur une série de 399 épisodes.

    Retourne {ratingKey: épisode rechargé} — un épisode absent du résultat (lot en échec)
    doit retomber sur `_reload`, l'appelant reste donc toujours correct.
    """
    out: dict[int, Any] = {}
    keyed = [ep for ep in episodes if getattr(ep, "ratingKey", None)]
    if not keyed:
        return out
    server = getattr(keyed[0], "_server", None)
    if server is None:
        return out
    for start in range(0, len(keyed), _BULK_METADATA_CHUNK):
        chunk = keyed[start : start + _BULK_METADATA_CHUNK]
        path = "/library/metadata/" + ",".join(str(ep.ratingKey) for ep in chunk)
        try:
            for item in server.fetchItems(path):
                rating_key = getattr(item, "ratingKey", None)
                if rating_key is not None:
                    out[rating_key] = item
        except Exception as exc:
            logger.warning("Rechargement groupé Plex impossible (%d episodes): %s", len(chunk), exc)
    return out


def movie_has_french_audio(item) -> bool:
    """True si le film possède une piste VF (recharge d'abord les métadonnées complètes)."""
    _reload(item, "movie")
    return item_has_french_audio(item)


def movie_french_audio_state(item) -> dict:
    """Etat VF + priorite (piste par defaut ou secondaire) d'un film (recharge d'abord
    les metadonnees completes). Equivalent film de `get_french_audio_state`, qui a
    besoin d'un item deja recharge (voir usage episode dans `show_has_full_french_audio`)."""
    _reload(item, "movie")
    return get_french_audio_state(item)


def show_has_full_french_audio(
    show,
    known_vf: Optional[dict[int, set[int]]] = None,
    known_episode_numbers: Optional[dict[int, set[int]]] = None,
) -> tuple[
    bool,
    bool,
    int,
    int,
    dict[int, dict[int, bool]],
    dict[int, dict[int, bool]],
    dict[int, dict[int, dict]],
    dict[int, dict[int, bool]],
]:
    """Analyse tous les épisodes d'une série.

    `known_vf` : {season_number: {episode_number déjà confirmés VF lors d'un scan
    précédent}}. Ces épisodes ne sont PAS re-scannés (aucun appel Plex) — une fois
    qu'un épisode a une piste VF, elle ne disparaît pas, donc c'est un cache sûr.
    Passer None ou {} pour un scan complet sans cache.

    `known_episode_numbers` : {season_number: {episode_number connu de Sonarr/TheTVDB}},
    voir `vff_scanner._sonarr_episode_numbers_for`. Quand fourni, un épisode que Plex
    indexe mais que Sonarr ne connaît pas (erreur de classement Plex, bonus...) est
    toujours scanné/affiché normalement mais EXCLU du calcul d'agrégation (total/with_vf,
    donc complete/should_track/fr_is_default) -- TheTVDB fait foi pour ce qui "compte"
    comme épisode réel. Passer None pour ne rien exclure (pas de lien Sonarr connu).

    Returns:
        (complet, should_track, episodes_avec_vf, total_episodes, episode_status,
        french_default_status, episode_metadata, known_episode_status)
        `complet` est True uniquement si TOUS les épisodes connus ont une piste VF.
        `should_track` détermine si on doit continuer à surveiller cette série en VO.
        `episode_status` : {season_number: {episode_number: has_vf}} pour persistance.
        `known_episode_status` : {season_number: {episode_number: is_known_episode}},
        toujours True si `known_episode_numbers` n'est pas fourni.
        `episode_metadata` : {season_number: {episode_number: {title, overview, thumb,
        air_date}}} -- titre/resume/miniature Plex, uniquement pour les episodes
        reellement rechauges cette passe (pas ceux servis depuis `known_vf`, deja captures
        lors d'un passage precedent) -- alimente l'onglet Saisons & episodes cote UI sans
        appel Plex dedie (voir routers/vff_api.py _season_episodes_payload).
    """
    known_vf = known_vf or {}
    total = 0
    with_vf = 0
    seasons_info = {}
    episode_status: dict[int, dict[int, bool]] = {}
    french_default_status: dict[int, dict[int, bool]] = {}
    episode_metadata: dict[int, dict[int, dict]] = {}
    known_episode_status: dict[int, dict[int, bool]] = {}

    try:
        # Les saisons sont parcourues une premiere fois pour lister les episodes a analyser,
        # puis leurs metadonnees completes sont rechargees en lot (voir
        # `bulk_reload_episodes`) : un `reload()` par episode etait le cout dominant du scan.
        # Les episodes deja confirmes VF (`known_vf`) sont exclus du lot, ils ne sont pas relus.
        seasons_to_scan: list[tuple[int, list]] = []
        for season in show.seasons():
            sn = getattr(season, "seasonNumber", None)
            if sn is None or sn == 0:  # ignore les spéciaux (saison 0)
                continue
            seasons_to_scan.append((sn, season.episodes()))

        pending_reload = [
            ep
            for sn, eps in seasons_to_scan
            for ep in eps
            if getattr(ep, "index", None) is not None and getattr(ep, "index") not in known_vf.get(sn, set())
        ]
        reloaded_by_key = bulk_reload_episodes(pending_reload)

        for sn, season_episodes in seasons_to_scan:
            seasons_info[sn] = {"total": 0, "vf": 0}
            episode_status[sn] = {}
            french_default_status[sn] = {}
            episode_metadata[sn] = {}
            known_episode_status[sn] = {}
            known_season = known_vf.get(sn, set())
            known_sonarr_season = known_episode_numbers.get(sn) if known_episode_numbers is not None else None
            for ep in season_episodes:
                en = getattr(ep, "index", None)
                if en is None:
                    continue
                is_known_episode = known_sonarr_season is None or en in known_sonarr_season
                known_episode_status[sn][en] = is_known_episode
                if is_known_episode:
                    total += 1
                    seasons_info[sn]["total"] += 1
                if en in known_season:
                    # Déjà confirmé VF lors d'un scan précédent : pas de re-scan Plex, donc
                    # pas de nouvelles metadonnees non plus (deja capturees a l'epoque).
                    has_fr = True
                    fr_is_default = True
                else:
                    # Repli sur un rechargement unitaire si l'episode n'etait pas dans un lot
                    # abouti -- le resultat reste identique, seul le nombre d'appels change.
                    bulk_ep = reloaded_by_key.get(getattr(ep, "ratingKey", None))
                    if bulk_ep is not None:
                        ep = bulk_ep
                    else:
                        _reload(ep, "episode")
                    audio_state = get_french_audio_state(ep)
                    has_fr = audio_state["has_fr"]
                    fr_is_default = audio_state["fr_is_default"]
                    episode_metadata[sn][en] = {
                        "title": getattr(ep, "title", None),
                        "overview": getattr(ep, "summary", None) or "",
                        "thumb": getattr(ep, "thumb", None),
                        "air_date": getattr(ep, "originallyAvailableAt", None),
                        # Deja calcules par get_french_audio_state (memes objets
                        # audioStreams()/subtitleStreams() de l'episode deja recharge, pas
                        # de second appel Plex) -- alimente le detail par piste au clic sur
                        # un episode cote UI (voir routers/vff_api.py _season_episodes_payload).
                        "tracks": audio_state.get("tracks", []),
                        "subtitles": audio_state.get("subtitles", []),
                    }
                episode_status[sn][en] = has_fr
                french_default_status[sn][en] = fr_is_default
                if has_fr and is_known_episode:
                    with_vf += 1
                    seasons_info[sn]["vf"] += 1
    except Exception as exc:
        logger.warning("Erreur analyse épisodes pour %r: %s", getattr(show, "title", "?"), exc)

    complete = total > 0 and with_vf == total

    if complete:
        return (
            True,
            False,
            with_vf,
            total,
            episode_status,
            french_default_status,
            episode_metadata,
            known_episode_status,
        )

    # Calcul du nombre de saisons qui ont au moins 1 VF
    vf_seasons = {sn for sn, info in seasons_info.items() if info["vf"] > 0}
    num_vf_seasons = len(vf_seasons)

    should_track = False
    for sn, info in seasons_info.items():
        if info["total"] > info["vf"]:
            # Cette saison a des épisodes en VO uniquement
            track_this_season = False
            if info["vf"] > 0:
                # Règle 1 : saison partiellement en VF -> on la surveille
                track_this_season = True
            elif num_vf_seasons >= 2:
                # Règle 2 : au moins 2 saisons ont de la VF -> on surveille les autres
                track_this_season = True
            elif num_vf_seasons == 0:
                # Aucun épisode VF sur toute la série pour le moment -> on surveille tout
                track_this_season = True

            if track_this_season:
                should_track = True
                break

    return (
        complete,
        should_track,
        with_vf,
        total,
        episode_status,
        french_default_status,
        episode_metadata,
        known_episode_status,
    )


def compute_vf_granularity(
    episode_status: dict[int, dict[int, bool]] | None,
    known_episode_status: dict[int, dict[int, bool]] | None = None,
) -> str:
    """Niveau de granularité VF d'une série non-complète, à partir de son statut par épisode.

    - "season_partial"  : au moins une saison entièrement en VF (mais pas toute la série)
    - "episode_partial" : au moins un épisode en VF, mais aucune saison complète
    - "none"             : aucun épisode en VF (ou pas encore de données)

    Une saison est considérée « entièrement en VF » par rapport aux épisodes connus de
    Plex (mêmes données que `has_vf` au niveau série) — si Sonarr n'a pas encore
    tout téléchargé, seuls les épisodes présents comptent.

    `known_episode_status` : {season_number: {episode_number: is_known_episode}}, voir
    `show_has_full_french_audio` — un épisode que Plex indexe mais que Sonarr ne
    reconnaît pas (is_known_episode=False) est ignoré ici, TheTVDB faisant foi, comme pour
    l'agrégat has_vf calculé côté scan.
    """
    if not episode_status:
        return "none"
    any_vf = False
    any_full_season = False
    for sn, season_eps in episode_status.items():
        if not season_eps:
            continue
        known_season = (known_episode_status or {}).get(sn, {})
        vals = [has_vf for en, has_vf in season_eps.items() if known_season.get(en, True)]
        if not vals:
            continue
        if any(vals):
            any_vf = True
        if all(vals):
            any_full_season = True
    if any_full_season:
        return "season_partial"
    if any_vf:
        return "episode_partial"
    return "none"
