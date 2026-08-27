"""Heuristique de détection VF sur une release Sonarr/Radarr (recherche interactive).

Séparé de `routers/arr_releases_api.py` pour être réutilisable par
`vf_upgrade_scanner.py` (service) sans violer la règle du dépôt : les services
n'importent jamais depuis les routers (voir `arr_catalog.py` pour un exemple similaire
de logique partagée déplacée côté service).
"""

import re
from dataclasses import dataclass, field

_FRENCH_LANG_NAMES = {"french", "français", "francais"}

_FRENCH_TITLE_WORDS = {"french", "truefrench", "vff", "vf", "vfi", "vfq", "multi"}

# "VFF2"/"VFF3"... : convention scène pour une deuxieme/troisieme piste VF distincte sur
# la meme release (double doublage).
_VFF_VARIANT_RE = re.compile(r"^vff\d+$")

# Motifs de rejet Sonarr/Radarr (champ `rejections`, voir DownloadDecisionMaker) qui
# signalent que la release ne correspond PAS au média demande (mauvaise serie/film
# reconnue par *arr via son propre parsing de titre) -- a distinguer des rejets de
# politique (quality profile, cutoff...) qui restent pertinents pour une recherche VF
# manuelle. Sans ce filtre, un indexeur qui matche mal une requete de recherche large
# (ex: "New Game" -> "Game of Thrones") remonte tel quel dans les suggestions.
_IDENTITY_MISMATCH_RE = re.compile(r"\b(?:wrong|unknown)[ _-]?(?:series|movie|film)\b", re.IGNORECASE)


def release_identity_mismatch(rel: dict) -> bool:
    """True si *arr a lui-meme rejete la release comme ne correspondant pas au
    media cible (mauvaise serie/film), d'apres `rel["rejections"]`."""
    return any(_IDENTITY_MISMATCH_RE.search(reason or "") for reason in (rel.get("rejections") or []))


@dataclass
class ReleaseEpisodeInfo:
    """Métadonnées de saison et épisode extraites du titre d'une release."""

    is_series: bool = False
    seasons: set[int] = field(default_factory=set)
    episodes: set[int] = field(default_factory=set)
    is_season_pack: bool = False
    is_multi_season: bool = False
    is_complete_series: bool = False


def parse_release_season_episode(title: str) -> ReleaseEpisodeInfo:
    """Extrait les numéros de saison et d'épisode depuis le titre d'une release ou fichier.

    Prend en compte les formats courants de scène et P2P :
    - S01E03, s1e3, S01E01-E04, S01E01-04, S01E01E02
    - 1x03, 01x03, 01x01-04
    - S01, S1, Season 1, Saison 1, S01 COMPLETE
    - S01-S03, S1-3, Saisons 1 à 3, COMPLETE, INTEGRALE
    """
    info = ReleaseEpisodeInfo()
    if not title:
        return info

    clean_title = title.strip()

    # 1. Détection intégrale / série complète
    if re.search(r"\b(?:COMPLETE|INTEGRALE|INTÉGRALE|ALL[ ._-]?SEASONS?)\b", clean_title, re.IGNORECASE):
        info.is_series = True
        info.is_complete_series = True
        info.is_season_pack = True

    # 2. Détection multi-saisons : S01-S03, S1-3, Saisons 1 à 3, Saison 1-2
    multi_season_re = re.compile(
        r"\b(?:S|Season|Saison|Saisons)[ ._-]*(\d{1,2})[ ._-]*(?:to|-|a|à|et|and|&)[ ._-]*(?:S|Season|Saison|Saisons)?[ ._-]*(\d{1,2})\b",
        re.IGNORECASE,
    )
    for m in multi_season_re.finditer(clean_title):
        s_start, s_end = int(m.group(1)), int(m.group(2))
        if s_start <= s_end and s_end - s_start <= 30:
            info.is_series = True
            info.is_multi_season = True
            info.is_season_pack = True
            for s in range(s_start, s_end + 1):
                info.seasons.add(s)

    # 3. Motif SxxExx (ex: S01E03, S01E01-E04, S01E01E02)
    s_e_re = re.compile(
        r"\bS(\d{1,3})[ ._-]*(?:E(\d{1,4}))+(?:[ ._-]*(?:to|-|a|à)[ ._-]*E?(\d{1,4}))?\b",
        re.IGNORECASE,
    )
    for m in s_e_re.finditer(clean_title):
        season_num = int(m.group(1))
        info.is_series = True
        info.seasons.add(season_num)

        full_match = m.group(0)
        e_nums = [int(e) for e in re.findall(r"E(\d{1,4})", full_match, re.IGNORECASE)]
        if e_nums:
            for en in e_nums:
                info.episodes.add(en)
            range_match = re.search(r"E(\d{1,4})[ ._-]*(?:to|-|a|à)[ ._-]*E?(\d{1,4})", full_match, re.IGNORECASE)
            if range_match:
                e1, e2 = int(range_match.group(1)), int(range_match.group(2))
                if e1 <= e2 and e2 - e1 <= 100:
                    for ep in range(e1, e2 + 1):
                        info.episodes.add(ep)

    # Variant S01E01-04 (sans le 'E' répété)
    s_e_range2_re = re.compile(r"\bS(\d{1,3})E(\d{1,4})[-_](\d{1,4})\b", re.IGNORECASE)
    for m in s_e_range2_re.finditer(clean_title):
        season_num = int(m.group(1))
        e1, e2 = int(m.group(2)), int(m.group(3))
        info.is_series = True
        info.seasons.add(season_num)
        if e1 <= e2 and e2 - e1 <= 100:
            for ep in range(e1, e2 + 1):
                info.episodes.add(ep)

    # 4. Motif 1x03, 01x03, 01x01-04
    x_re = re.compile(r"\b(\d{1,2})x(\d{1,4})(?:[-_](\d{1,4}))?\b", re.IGNORECASE)
    for m in x_re.finditer(clean_title):
        season_num = int(m.group(1))
        ep_num = int(m.group(2))
        info.is_series = True
        info.seasons.add(season_num)
        info.episodes.add(ep_num)
        if m.group(3):
            e_end = int(m.group(3))
            if ep_num <= e_end and e_end - ep_num <= 100:
                for ep in range(ep_num, e_end + 1):
                    info.episodes.add(ep)

    # 5. Pack saison individuel : S01, S1, Season 1, Saison 1 (si aucun épisode specifique trouvé)
    if not info.episodes and not info.is_multi_season:
        season_pack_re = re.compile(
            r"\b(?:S|Season|Saison)[ ._-]*(\d{1,3})\b",
            re.IGNORECASE,
        )
        for m in season_pack_re.finditer(clean_title):
            season_num = int(m.group(1))
            info.is_series = True
            info.seasons.add(season_num)
            info.is_season_pack = True

    if info.is_series and not info.episodes:
        info.is_season_pack = True

    return info


def release_matches_target(
    title: str,
    scope: str,
    season_number: int | None = None,
    episode_number: int | None = None,
) -> tuple[bool, str | None]:
    """Vérifie si une release correspond à la cible demandée (scope: movie | season | episode).

    Retourne ``(True, None)`` si la release correspond, ou ``(False, raison)`` si elle
    ne correspond pas (ex: épisode S01E05 proposé pour la cible S01E03).
    """
    if scope == "movie":
        return True, None

    info = parse_release_season_episode(title)
    if not info.is_series:
        # Aucun marqueur de série repéré dans le titre -> on ne peut pas affirmer un rejet strict
        return True, None

    if info.is_complete_series:
        return True, None

    if season_number is not None and info.seasons:
        if season_number not in info.seasons:
            sorted_seasons = sorted(info.seasons)
            return (
                False,
                f"Saison{'s' if len(sorted_seasons) > 1 else ''} {sorted_seasons} ne correspond pas à la saison {season_number}",
            )

    if scope == "episode" and episode_number is not None:
        if info.episodes and episode_number not in info.episodes:
            sorted_eps = sorted(info.episodes)
            return (
                False,
                f"Épisode{'s' if len(sorted_eps) > 1 else ''} {sorted_eps} ne correspond pas à l'épisode {episode_number}",
            )

    return True, None


def release_is_french(rel: dict) -> bool:
    """Heuristique VF pour une release : langue « French » déclarée ou marqueur dans le titre."""
    if any((lang or "").lower() in _FRENCH_LANG_NAMES for lang in rel.get("languages", [])):
        return True
    title = (rel.get("title") or "").lower()
    words = set(title.replace(".", " ").replace("-", " ").replace("_", " ").split())
    if words & _FRENCH_TITLE_WORDS:
        return True
    return any(_VFF_VARIANT_RE.match(w) for w in words)


def french_release_evidence(rel: dict) -> dict:
    """Explique la preuve VF sans pretendre connaitre les pistes du fichier.

    Une langue French declaree par *arr ou un marqueur VF explicite et isole dans le
    titre constitue une preuve suffisante pour proposer la release. Le score reste
    expose pour compatibilite avec l'API et les reglages existants, mais la detection
    est volontairement binaire. Seule l'analyse MediaInfo/Plex apres import constitue
    une validation definitive.
    """
    title = (rel.get("title") or "").lower()
    words = set(re.sub(r"[.\-_]+", " ", title).split())
    declared = [lang for lang in rel.get("languages", []) if (lang or "").lower() in _FRENCH_LANG_NAMES]
    markers = sorted((words & _FRENCH_TITLE_WORDS) | {w for w in words if _VFF_VARIANT_RE.match(w)})
    score = 100 if declared or markers else 0
    return {
        "vf_confidence": score,
        "vf_evidence": (["Langue French declaree par *arr"] if declared else [])
        + ([f"Marqueur titre: {', '.join(markers)}"] if markers else []),
    }
