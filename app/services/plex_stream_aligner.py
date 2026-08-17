"""Service d'alignement intelligent des flux audio et sous-titres Plex (mode PASTA).

Permet de forcer la sélection des pistes optimales (Audio FR + ST Forcés ou Audio VO + ST Complets)
directement via l'API Plex, pour l'administrateur et tous les utilisateurs partagés du serveur
(membres du Plex Home comme invités).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from plexapi.server import PlexServer

from app.models.media import LibraryItem
from app.services.audio_analyzer import _reload, _stream_is_french, _truthy_attr
from app.services.plex_finder import connect, find_item_in_libraries

logger = logging.getLogger(__name__)

_AUDIO_EXCLUDE_WORDS = {
    "commentary",
    "commentaire",
    "commentaires",
    "director",
    "directors",
    "réalisateur",
    "realisateur",
    "audiodescription",
    "audio description",
    "ad",
    "qad",
    "vf-ad",
    "vff-ad",
    "vf ad",
    "visual impaired",
    "description audio",
    "malvoyant",
    "malvoyants",
}

_SDH_WORDS = {
    "sdh",
    "sme",
    "malentendant",
    "malentendants",
    "cc",
    "sourds",
    "deaf",
}


def is_commentary_or_ad(stream) -> bool:
    """True si la piste audio est un commentaire ou de l'audiodescription."""
    for attr in ("title", "displayTitle", "extendedDisplayTitle"):
        val = (getattr(stream, attr, None) or "").lower().strip()
        if not val:
            continue
        words = set(
            val.replace("-", " ").replace("(", " ").replace(")", " ").replace("/", " ").replace(".", " ").split()
        )
        if words & _AUDIO_EXCLUDE_WORDS:
            return True
        if any(
            term in val for term in ("audio description", "audiodescription", "commentaire", "commentaires", "director")
        ):
            return True
    return False


def is_sdh_subtitle(stream) -> bool:
    """True si le sous-titre est pour sourds et malentendants (SDH / SME)."""
    for attr in ("title", "displayTitle", "extendedDisplayTitle"):
        val = (getattr(stream, attr, None) or "").lower().strip()
        if not val:
            continue
        words = set(
            val.replace("-", " ").replace("(", " ").replace(")", " ").replace("/", " ").replace(".", " ").split()
        )
        if words & _SDH_WORDS:
            return True
        if any(term in val for term in ("sourds et malentendants", "malentendant", "hearing impaired")):
            return True
    return False


def is_forced_subtitle(stream) -> bool:
    """True si le sous-titre est forcé (flag MKV ou mention dans le titre/displayTitle)."""
    if _truthy_attr(getattr(stream, "forced", None)):
        return True
    for attr in ("title", "displayTitle", "extendedDisplayTitle"):
        val = (getattr(stream, attr, None) or "").lower()
        if any(w in val for w in ("force", "forcé", "forcés", "forced")):
            return True
    return False


def choose_best_audio_stream(streams: list) -> tuple[Any | None, bool]:
    """Sélectionne le meilleur flux audio.

    Retourne (selected_stream, is_french).
    Priorités pour l'audio français :
    - Exclut les commentaires et l'audiodescription.
    - Priorise 'vff' ou 'truefrench'.
    - Priorise le nombre de canaux (7.1 > 5.1 > 2.0).
    - Ordre d'apparition dans le conteneur.
    """
    if not streams:
        return None, False

    # Filtrer les flux français valides (hors commentaires et audiodescription)
    valid_fr_streams = [s for s in streams if _stream_is_french(s) and not is_commentary_or_ad(s)]

    if valid_fr_streams:
        if len(valid_fr_streams) == 1:
            return valid_fr_streams[0], True

        def _score_fr_stream(s) -> int:
            score = 0
            title = ((getattr(s, "title", None) or "") + " " + (getattr(s, "displayTitle", None) or "")).lower()
            if "truefrench" in title or "vff" in title:
                score += 100
            elif "vfq" in title or "qc" in title:
                score += 20
            channels = getattr(s, "channels", None) or 2
            score += min(channels * 10, 80)
            return score

        best_fr = max(valid_fr_streams, key=_score_fr_stream)
        return best_fr, True

    # Pas de flux français valide : on conserve le flux VO sélectionné ou le premier
    selected = next((s for s in streams if _truthy_attr(getattr(s, "selected", None))), streams[0])
    return selected, False


def choose_best_subtitle_stream(
    streams: list,
    is_french_audio: bool,
    current_selected_sub: Any | None = None,
) -> tuple[Any | None, bool]:
    """Sélectionne le flux de sous-titres adapté à la piste audio.

    Retourne (selected_subtitle, should_apply).
    - Si should_apply est False : en cas de doute, on ne touche à rien (maintient la sélection existante).
    - Si audio FR : cherche un sous-titre Français Forcé (priorité format SRT). Si absent -> None (désactive les ST).
    - Si audio VO : cherche un sous-titre Français Complet (priorité SRT non-SDH).
    """
    if not streams:
        return None, False

    fr_subs = [s for s in streams if _stream_is_french(s)]

    if is_french_audio:
        # Audio FR certifié : cherche les sous-titres forcés
        forced = [s for s in fr_subs if is_forced_subtitle(s)]
        if forced:
            # Préférer SRT texte pour éviter le transcodage vidéo sur les télés
            srt_forced = [s for s in forced if (getattr(s, "codec", "") or "").lower() == "srt"]
            return (srt_forced[0] if srt_forced else forced[0]), True
        # Aucun sous-titre forcé présent -> on désactive les sous-titres complets superflus
        return None, True
    else:
        # Audio VO : cherche les sous-titres français complets (non forcés)
        if fr_subs:
            full = [s for s in fr_subs if not is_forced_subtitle(s)]
            if full:
                # 1. Préférer SRT texte standard (non-SDH)
                srt_standard = [
                    s for s in full if (getattr(s, "codec", "") or "").lower() == "srt" and not is_sdh_subtitle(s)
                ]
                if srt_standard:
                    return srt_standard[0], True
                # 2. Préférer SRT tout court
                srt_any = [s for s in full if (getattr(s, "codec", "") or "").lower() == "srt"]
                if srt_any:
                    return srt_any[0], True
                # 3. Préférer non-SDH (formats images PGS/VOBSUB)
                non_sdh = [s for s in full if not is_sdh_subtitle(s)]
                if non_sdh:
                    return non_sdh[0], True
                return full[0], True

            # Si aucune piste complète n'existe mais qu'une unique piste française est présente
            # (cas fréquent des releases VO où l'unique piste FR est taguée 'forced' par erreur de muxing)
            if len(fr_subs) == 1:
                return fr_subs[0], True

        # En cas de doute ou d'absence de sous-titres français correspondants : NE RIEN TOUCHER
        return current_selected_sub, False


def apply_streams_to_part(part, target_audio, target_subtitle, should_apply_subtitle: bool = True) -> tuple[bool, bool]:
    """Applique les flux cibles sur un media part Plex.

    Retourne (audio_changed, subtitle_changed).
    """
    audio_changed = False
    sub_changed = False

    # 1. Audio
    if target_audio is not None:
        target_audio_id = getattr(target_audio, "id", None)
        is_already_selected = False
        for s in part.audioStreams():
            if _truthy_attr(getattr(s, "selected", None)) and getattr(s, "id", None) == target_audio_id:
                is_already_selected = True
                break
        if not is_already_selected:
            try:
                part.setSelectedAudioStream(target_audio)
                audio_changed = True
            except Exception as e:
                logger.warning("Erreur setSelectedAudioStream pour part %s: %s", getattr(part, "id", "?"), e)

    # 2. Sous-titre (uniquement si should_apply_subtitle est True)
    if should_apply_subtitle:
        curr_sub_selected = next(
            (s for s in part.subtitleStreams() if _truthy_attr(getattr(s, "selected", None))), None
        )
        curr_sub_id = getattr(curr_sub_selected, "id", None) if curr_sub_selected else None
        target_sub_id = getattr(target_subtitle, "id", None) if target_subtitle else None

        if curr_sub_id != target_sub_id:
            try:
                if target_subtitle is not None:
                    part.setSelectedSubtitleStream(target_subtitle)
                else:
                    try:
                        part.setSelectedSubtitleStream(0)
                    except Exception:
                        part._server.query(
                            f"/library/parts/{part.id}?subtitleStreamID=0&allParts=1", method=part._server._session.put
                        )
                sub_changed = True
            except Exception as e:
                logger.warning("Erreur setSelectedSubtitleStream pour part %s: %s", getattr(part, "id", "?"), e)

    return audio_changed, sub_changed


def get_plex_users_list(plex_url: str, plex_token: str) -> list[dict]:
    """Retourne la liste des utilisateurs Plex Home et invités disponibles."""
    try:
        plex = connect(plex_url, plex_token)
        users = [{"id": "admin", "name": "Admin", "title": "Administrateur", "is_admin": True, "is_home": True}]
        try:
            account = plex.myPlexAccount()
            shared_users = []
            try:
                shared_users = account.users()
            except Exception:
                shared_users = []
            for u in shared_users:
                uname = (
                    getattr(u, "title", None)
                    or getattr(u, "name", None)
                    or getattr(u, "username", None)
                    or str(getattr(u, "id", ""))
                )
                if uname and uname.lower() not in ("admin", "owner", "administrateur"):
                    users.append(
                        {
                            "id": str(getattr(u, "id", uname)),
                            "name": uname,
                            "title": getattr(u, "title", uname),
                            "is_admin": False,
                            "is_home": bool(getattr(u, "home", False)),
                            "thumb": getattr(u, "thumb", None),
                        }
                    )
        except Exception as e:
            logger.debug("Erreur interrogation compte MyPlex pour utilisateurs: %s", e)
        return users
    except Exception as e:
        logger.warning("Erreur connexion Plex pour liste utilisateurs: %s", e)
        return [{"id": "admin", "name": "Admin", "title": "Administrateur", "is_admin": True, "is_home": True}]


def get_plex_target_servers(
    plex: PlexServer,
    include_home_users: bool = True,
    selected_users: Optional[list[str]] = None,
) -> list[tuple[str, PlexServer]]:
    """Retourne la liste des serveurs Plex cibles : [(nom_utilisateur, instance_PlexServer)]."""
    targets = []
    want_admin = not selected_users or "all" in selected_users or "Admin" in selected_users or "admin" in selected_users
    if want_admin:
        targets.append(("Admin", plex))

    if not include_home_users and not selected_users:
        return targets

    try:
        account = plex.myPlexAccount()
        try:
            shared_users = account.users()
        except Exception:
            shared_users = []

        for user in shared_users:
            uname = (
                getattr(user, "title", None)
                or getattr(user, "name", None)
                or getattr(user, "username", None)
                or str(getattr(user, "id", ""))
            )
            if not uname or uname.lower() in ("admin", "owner", "administrateur"):
                continue
            if selected_users and "all" not in selected_users and uname not in selected_users:
                continue
            try:
                user_server = plex.switchUser(user)
                targets.append((uname, user_server))
            except Exception as e:
                logger.debug("Impossible de basculer sur l'utilisateur Plex %r: %s", uname, e)
    except Exception as e:
        logger.debug("Détection des utilisateurs Plex partagés non disponible: %s", e)

    return targets


def _episodes_in_scope(item, episode_refs: Optional[list[tuple[int, int]]] = None) -> list:
    """Retourne les épisodes d'une série correspondant à la portée demandée.

    `episode_refs` est une liste de couples (season_number, episode_number), pouvant
    couvrir plusieurs saisons à la fois (la portée est décidée par le code appelant,
    typiquement à partir du scan VF déjà en cache -- voir useSeasonEpisodes côté front).
    Sans `episode_refs` : série entière.
    """
    if not episode_refs:
        try:
            return item.episodes()
        except Exception:
            return []

    wanted = set(episode_refs)
    seasons_needed = sorted({season_number for season_number, _ in wanted})
    result = []
    for season_number in seasons_needed:
        try:
            season = item.season(season=season_number)
            eps = season.episodes()
        except Exception:
            continue
        result.extend(e for e in eps if (season_number, getattr(e, "index", None)) in wanted)
    return result


def preview_media_item_streams_blocking(
    plex_url: str,
    plex_token: str,
    library_names: list[str],
    title: str,
    year: Optional[int] = None,
    media_type: str = "movie",
    tmdb_id: Optional[str] = None,
    tvdb_id: Optional[str] = None,
    imdb_id: Optional[str] = None,
    plex_guid: Optional[str] = None,
    episode_refs: Optional[list[tuple[int, int]]] = None,
) -> dict:
    """Analyse un média et retourne les flux actuels vs flux cibles optimaux pour la prévisualisation."""
    try:
        plex = connect(plex_url, plex_token)
    except Exception as exc:
        return {"success": False, "error": f"Connexion Plex impossible : {exc}"}

    item = find_item_in_libraries(plex, library_names, title, year, tmdb_id, tvdb_id, imdb_id, plex_guid)
    if not item:
        return {"success": False, "error": f"Média '{title}' introuvable dans Plex"}

    is_show = media_type == "show" or getattr(item, "type", "") == "show"
    sample_part = None
    total_parts = 0

    if is_show:
        scoped_episodes = _episodes_in_scope(item, episode_refs)
        if not scoped_episodes:
            return {"success": False, "error": "Aucun épisode ne correspond à la portée sélectionnée"}
        try:
            for ep in scoped_episodes:
                _reload(ep, "episode")
                for m in getattr(ep, "media", []):
                    for p in getattr(m, "parts", []):
                        total_parts += 1
                        if not sample_part:
                            sample_part = p
        except Exception as e:
            logger.warning("Erreur scan épisodes pour preview %r: %s", title, e)
    else:
        try:
            _reload(item, "movie")
            for m in getattr(item, "media", []):
                for p in getattr(m, "parts", []):
                    total_parts += 1
                    if not sample_part:
                        sample_part = p
        except Exception as e:
            logger.warning("Erreur scan film pour preview %r: %s", title, e)

    if not sample_part:
        return {"success": False, "error": "Aucun fichier média trouvé sur Plex pour ce titre"}

    audio_streams = sample_part.audioStreams()
    sub_streams = sample_part.subtitleStreams()

    curr_audio = next(
        (s for s in audio_streams if _truthy_attr(getattr(s, "selected", None))),
        audio_streams[0] if audio_streams else None,
    )
    curr_sub = next((s for s in sub_streams if _truthy_attr(getattr(s, "selected", None))), None)

    target_audio, is_fr_audio = choose_best_audio_stream(audio_streams)
    target_sub, should_apply_sub = choose_best_subtitle_stream(sub_streams, is_fr_audio, curr_sub)

    def _stream_info(s, is_sub=False):
        if not s:
            return None
        title_str = (
            getattr(s, "displayTitle", None)
            or getattr(s, "title", None)
            or getattr(s, "extendedDisplayTitle", None)
            or ""
        )
        lang = (
            getattr(s, "language", None) or getattr(s, "languageCode", None) or ("fr" if _stream_is_french(s) else "vo")
        )
        codec = getattr(s, "codec", None) or ""
        channels = getattr(s, "audioChannelLayout", None) or (
            f"{getattr(s, 'channels', '')}ch" if getattr(s, "channels", None) else ""
        )
        forced = is_forced_subtitle(s) if is_sub else False
        return {
            "id": getattr(s, "id", None),
            "title": title_str,
            "language": lang,
            "codec": codec,
            "channels": channels,
            "forced": forced,
        }

    available_users = get_plex_users_list(plex_url, plex_token)

    return {
        "success": True,
        "title": title,
        "media_type": "show" if is_show else "movie",
        "total_parts": total_parts,
        "scope": {"episodes": episode_refs} if is_show else None,
        "current_audio": _stream_info(curr_audio),
        "target_audio": _stream_info(target_audio),
        "audio_will_change": getattr(curr_audio, "id", None) != getattr(target_audio, "id", None),
        "current_subtitle": _stream_info(curr_sub, is_sub=True),
        "target_subtitle": _stream_info(target_sub, is_sub=True),
        "subtitle_will_change": should_apply_sub and (getattr(curr_sub, "id", None) != getattr(target_sub, "id", None)),
        "should_apply_subtitle": should_apply_sub,
        "available_users": available_users,
    }


def align_media_item_streams_blocking(
    plex_url: str,
    plex_token: str,
    library_names: list[str],
    title: str,
    year: Optional[int] = None,
    media_type: str = "movie",
    tmdb_id: Optional[str] = None,
    tvdb_id: Optional[str] = None,
    imdb_id: Optional[str] = None,
    plex_guid: Optional[str] = None,
    include_home_users: bool = True,
    selected_users: Optional[list[str]] = None,
    episode_refs: Optional[list[tuple[int, int]]] = None,
) -> dict:
    """Réaligne les flux audio et sous-titres d'un film ou d'une série pour les profils Plex cibles.

    Pour une série, `episode_refs` (liste de couples saison/épisode, pouvant couvrir plusieurs
    saisons) permet de restreindre l'alignement à des épisodes précis plutôt qu'à la série
    entière (comportement par défaut sans `episode_refs`).
    """
    try:
        plex = connect(plex_url, plex_token)
    except Exception as exc:
        return {"success": False, "error": f"Connexion Plex impossible : {exc}"}

    item = find_item_in_libraries(plex, library_names, title, year, tmdb_id, tvdb_id, imdb_id, plex_guid)
    if not item:
        return {"success": False, "error": f"Média '{title}' introuvable dans Plex"}

    is_show = media_type == "show" or getattr(item, "type", "") == "show"

    if is_show and episode_refs:
        if not _episodes_in_scope(item, episode_refs):
            return {"success": False, "error": "Aucun épisode ne correspond à la portée sélectionnée"}

    target_servers = get_plex_target_servers(plex, include_home_users=include_home_users, selected_users=selected_users)
    users_updated = set()
    total_episodes_or_parts = 0
    total_audio_changed = 0
    total_sub_changed = 0

    for uname, user_plex in target_servers:
        user_item = item
        if user_plex is not plex:
            try:
                user_item = user_plex.fetchItem(item.ratingKey)
            except Exception:
                try:
                    user_item = find_item_in_libraries(
                        user_plex, library_names, title, year, tmdb_id, tvdb_id, imdb_id, plex_guid
                    )
                except Exception:
                    continue
        if not user_item:
            continue

        users_updated.add(uname)

        if is_show:
            scoped_episodes = _episodes_in_scope(user_item, episode_refs)
            try:
                for ep in scoped_episodes:
                    _reload(ep, "episode")
                    for media in getattr(ep, "media", []):
                        for part in getattr(media, "parts", []):
                            total_episodes_or_parts += 1
                            audio_streams = part.audioStreams()
                            sub_streams = part.subtitleStreams()
                            curr_sub = next(
                                (s for s in sub_streams if _truthy_attr(getattr(s, "selected", None))), None
                            )

                            target_audio, is_fr_audio = choose_best_audio_stream(audio_streams)
                            target_sub, should_apply_sub = choose_best_subtitle_stream(
                                sub_streams, is_fr_audio, curr_sub
                            )

                            a_ch, s_ch = apply_streams_to_part(part, target_audio, target_sub, should_apply_sub)
                            if a_ch:
                                total_audio_changed += 1
                            if s_ch:
                                total_sub_changed += 1
            except Exception as exc:
                logger.warning("Erreur réalignement épisodes pour %r (user %s): %s", title, uname, exc)
        else:
            try:
                _reload(user_item, "movie")
                for media in getattr(user_item, "media", []):
                    for part in getattr(media, "parts", []):
                        total_episodes_or_parts += 1
                        audio_streams = part.audioStreams()
                        sub_streams = part.subtitleStreams()
                        curr_sub = next((s for s in sub_streams if _truthy_attr(getattr(s, "selected", None))), None)

                        target_audio, is_fr_audio = choose_best_audio_stream(audio_streams)
                        target_sub, should_apply_sub = choose_best_subtitle_stream(sub_streams, is_fr_audio, curr_sub)

                        a_ch, s_ch = apply_streams_to_part(part, target_audio, target_sub, should_apply_sub)
                        if a_ch:
                            total_audio_changed += 1
                        if s_ch:
                            total_sub_changed += 1
            except Exception as exc:
                logger.warning("Erreur réalignement film pour %r (user %s): %s", title, uname, exc)

    return {
        "success": True,
        "title": title,
        "is_show": is_show,
        "scope": {"episodes": episode_refs} if is_show else None,
        "parts_processed": total_episodes_or_parts,
        "users_count": len(users_updated),
        "users": sorted(list(users_updated)),
        "audio_changed": total_audio_changed,
        "subtitles_changed": total_sub_changed,
    }
