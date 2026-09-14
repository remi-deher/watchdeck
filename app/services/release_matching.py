"""Heuristique de détection VF sur une release Sonarr/Radarr (recherche interactive).

Séparé de `routers/arr_releases_api.py` pour être réutilisable par
`vf_upgrade_scanner.py` (service) sans violer la règle du dépôt : les services
n'importent jamais depuis les routers (voir `arr_catalog.py` pour un exemple similaire
de logique partagée déplacée côté service).
"""

import re
from dataclasses import dataclass, field

_FRENCH_LANG_NAMES = {"french", "français", "francais"}

_FRENCH_TITLE_WORDS = {"french", "truefrench", "vff", "vf", "vfi", "vfq", "vq", "multi"}

# "VFF2"/"VFF3"... : convention scène pour une deuxieme/troisieme piste VF distincte sur
# la meme release (double doublage).
_VFF_VARIANT_RE = re.compile(r"^vff\d+$")

# Bareme de confiance VF. Tous les marqueurs ne valent pas la meme chose : "TRUEFRENCH"
# et "VFF" designent explicitement le doublage francais de France, tandis que "MULTI"
# n'annonce qu'un conteneur multi-pistes -- frequemment MULTI-sous-titres, sans aucune
# piste audio francaise. Sans ce bareme, `vf_upgrade_min_confidence` etait un reglage
# decoratif : toute release retenue valait 100, quelle que soit la solidite de la preuve.
#
# Les valeurs sont calees sur le defaut du reglage (65) : tout ce qui est un doublage
# francais reconnaissable passe, et l'utilisateur peut monter le curseur a 75 pour
# exclure le "MULTI" seul, ou a 90 pour n'accepter que les marqueurs explicites.
_VF_SCORES = {
    "truefrench": 100,
    "vff": 100,
    "vff_variant": 95,
    "vfi": 95,
    "french_declared": 90,
    "french_title": 85,
    "vf": 80,
    "multi": 70,
    "vfq": 70,
}

# Marqueurs qui designent specifiquement un doublage francais de France. Leur presence
# l'emporte sur un marqueur quebecois : une release "MULTI.TRUEFRENCH.VFQ" porte les deux
# pistes, c'est bien une VFF.
_FRANCE_SPECIFIC_KINDS = ("truefrench", "vff", "vff_variant", "vfi", "french_declared", "french_title", "vf")

_VF_LABELS = {
    "truefrench": "TRUEFRENCH (doublage francais de France)",
    "vff": "VFF (doublage francais de France)",
    "vff_variant": "VFF2/VFF3 (second doublage francais)",
    "vfi": "VFI (VF internationale)",
    "french_declared": "Langue French declaree par *arr",
    "french_title": "Marqueur titre: french",
    "vf": "Marqueur titre: vf",
    "multi": "MULTI seul (conteneur multi-pistes, piste VF non garantie)",
    "vfq": "VFQ/VQ (doublage quebecois, different de la VF de France)",
}

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


def _release_vf_kinds(rel: dict) -> dict[str, bool]:
    """Marqueurs VF detectes sur une release, par nature (voir _VF_SCORES)."""
    title = (rel.get("title") or "").lower()
    words = set(re.sub(r"[.\-_]+", " ", title).split())
    declared = any((lang or "").lower() in _FRENCH_LANG_NAMES for lang in (rel.get("languages") or []))
    return {
        "truefrench": "truefrench" in words,
        "vff": "vff" in words,
        "vff_variant": any(_VFF_VARIANT_RE.match(word) for word in words),
        "vfi": "vfi" in words,
        "french_declared": declared,
        "french_title": "french" in words,
        "vf": "vf" in words,
        "multi": "multi" in words,
        "vfq": bool(words & {"vfq", "vq"}),
    }


def french_release_evidence(rel: dict) -> dict:
    """Note la solidite de la preuve VF d'une release, et sa nature.

    Retourne ``vf_confidence`` (0-100, voir _VF_SCORES), ``vf_kind`` (le marqueur qui
    determine la note) et ``vf_evidence`` (les preuves lisibles).

    ``vf_kind`` vaut ``"vfq"`` quand la seule preuve est un marqueur quebecois : un
    doublage du Quebec est un vrai doublage francais, mais pas celui qu'attend la
    plupart des bibliotheques francaises -- l'appelant decide de l'accepter ou non
    (voir `vf_upgrade_accept_vfq`) plutot que de le confondre avec une VFF.

    Seule l'analyse MediaInfo/Plex apres import constitue une validation definitive :
    ce score mesure la promesse du titre, jamais le contenu du fichier.
    """
    found = {kind: present for kind, present in _release_vf_kinds(rel).items() if present}
    if not found:
        return {"vf_confidence": 0, "vf_kind": None, "vf_evidence": []}

    evidence = [_VF_LABELS[kind] for kind in _VF_SCORES if kind in found]
    # Un marqueur quebecois ne decide qu'en l'absence de marqueur francais de France
    # (voir _FRANCE_SPECIFIC_KINDS) : "MULTI.VFQ" est une VFQ, "TRUEFRENCH.VFQ" une VFF.
    if "vfq" in found and not any(kind in found for kind in _FRANCE_SPECIFIC_KINDS):
        return {"vf_confidence": _VF_SCORES["vfq"], "vf_kind": "vfq", "vf_evidence": evidence}

    kind = max((k for k in found if k != "vfq"), key=lambda k: _VF_SCORES[k])
    return {"vf_confidence": _VF_SCORES[kind], "vf_kind": kind, "vf_evidence": evidence}
