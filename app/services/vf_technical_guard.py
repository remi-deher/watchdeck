"""Garde-fous techniques d'une amelioration VF : ne pas gagner une langue au prix d'une
regression de qualite.

Les quatre reglages `vf_upgrade_protect_resolution`, `vf_upgrade_preserve_hdr`,
`vf_upgrade_protect_custom_format_score` et `vf_upgrade_allow_technical_downgrade`
existaient dans le modele, l'API et l'interface sans qu'aucun code ne les lise :
Watchdeck pouvait proposer de remplacer un 2160p HDR par un 1080p MULTI sans rien
signaler. C'est exactement ce que le score de custom format de Radarr/Sonarr empeche
pour ses propres upgrades ; ce module rend le meme service aux ameliorations VF.

Asymetrie assumee entre les deux cotes de la comparaison :
- le fichier EN PLACE est decrit par *arr lui-meme (`quality.quality.resolution`,
  `mediaInfo.videoDynamicRange`, score de custom format) -- mesure a l'import, donc
  fiable ;
- la release CANDIDATE n'existe encore que sous forme de titre, plus la qualite que
  *arr en a deduite. On y lit donc ce que le titre annonce, sans pretendre connaitre le
  contenu du fichier.

Une comparaison impossible (donnee absente d'un cote) ne bloque jamais : en l'absence de
preuve de regression, la suggestion reste proposee et signale simplement son incertitude.
"""

import re
from typing import Any

# Resolutions normalisees, de la plus faible a la plus elevee.
_RESOLUTION_TOKENS: tuple[tuple[int, tuple[str, ...]], ...] = (
    (480, ("480p", "480i", "sd", "dvd")),
    (576, ("576p", "576i")),
    (720, ("720p", "720i", "hdtv-720", "hd")),
    (1080, ("1080p", "1080i", "fullhd", "fhd")),
    (2160, ("2160p", "4k", "uhd", "ultrahd")),
    (4320, ("4320p", "8k")),
)

# Plages dynamiques etendues. "hdr10+"/"dv" sont des sur-ensembles de "hdr10"/"hdr" pour
# nos besoins : on ne cherche pas a les hierarchiser, seulement a detecter une PERTE.
_HDR_TOKENS = ("hdr10+", "hdr10plus", "hdr10", "hdr", "pq", "hlg")
_DV_TOKENS = ("dv", "dovi", "dolbyvision", "dolby-vision")

_SEPARATORS_RE = re.compile(r"[.\-_\s()\[\]]+")


def _words(text: str) -> set[str]:
    return {word for word in _SEPARATORS_RE.split((text or "").lower()) if word}


def resolution_from_text(*sources: str | None) -> int | None:
    """Resolution annoncee par un titre de release ou un nom de qualite *arr."""
    for source in sources:
        if not source:
            continue
        words = _words(source)
        lowered = source.lower()
        for value, tokens in reversed(_RESOLUTION_TOKENS):
            if any(token in words for token in tokens):
                return value
            # "bluray-2160p", "webdl1080p" : le token est colle, pas isole.
            if any(token in lowered for token in tokens if token[0].isdigit()):
                return value
    return None


def dynamic_range_from_text(*sources: str | None) -> set[str]:
    """{"hdr", "dv"} annonces par un titre, un nom de qualite ou un champ mediaInfo."""
    found: set[str] = set()
    for source in sources:
        if not source:
            continue
        words = _words(source)
        lowered = source.lower()
        if any(token in words for token in _HDR_TOKENS) or "hdr" in lowered:
            found.add("hdr")
        if any(token in words for token in _DV_TOKENS) or "dolby vision" in lowered:
            found.add("dv")
    return found


def _file_release_name(item: dict) -> str:
    name = (item.get("sceneName") or item.get("relativePath") or item.get("path") or "").strip()
    return re.split(r"[/\\]", name)[-1] if name else ""


def _quality_name(payload: Any) -> str | None:
    """Nom de qualite d'un enregistrement *arr (`quality.quality.name`)."""
    if not isinstance(payload, dict):
        return None
    quality = payload.get("quality")
    if isinstance(quality, dict):
        inner = quality.get("quality")
        if isinstance(inner, dict):
            return inner.get("name")
        return quality.get("name")
    return quality if isinstance(quality, str) else None


def _quality_resolution(payload: Any) -> int | None:
    """Resolution declaree par *arr (`quality.quality.resolution`), en pixels de hauteur."""
    if not isinstance(payload, dict):
        return None
    quality = payload.get("quality")
    inner = quality.get("quality") if isinstance(quality, dict) else None
    for candidate in (inner, quality):
        if isinstance(candidate, dict) and isinstance(candidate.get("resolution"), int):
            value = candidate["resolution"]
            # Radarr expose la hauteur (1080, 2160) ; certains champs donnent la largeur.
            return 2160 if value in (3840, 4096) else 1080 if value == 1920 else value
    return None


def current_file_profile(files: list[dict]) -> dict:
    """Profil technique du MEILLEUR fichier en place dans la portee.

    Le meilleur, et non le premier : pour une saison, une seule recherche remplace
    plusieurs fichiers -- c'est donc le plus haut de gamme d'entre eux qu'il ne faut pas
    degrader.
    """
    best: dict = {"resolution": None, "dynamic_range": set(), "custom_format_score": None, "quality": None}
    for item in files or []:
        release_name = _file_release_name(item)
        media_info = item.get("mediaInfo") if isinstance(item.get("mediaInfo"), dict) else {}
        resolution = _quality_resolution(item) or resolution_from_text(_quality_name(item), release_name)
        ranges = dynamic_range_from_text(media_info.get("videoDynamicRange"), release_name)
        score = item.get("customFormatScore")

        if resolution is not None and (best["resolution"] is None or resolution > best["resolution"]):
            best["resolution"] = resolution
            best["quality"] = _quality_name(item) or best["quality"]
        best["dynamic_range"] |= ranges
        if isinstance(score, int) and (best["custom_format_score"] is None or score > best["custom_format_score"]):
            best["custom_format_score"] = score
    return best


def release_profile(release: dict) -> dict:
    """Profil technique annonce par une release candidate."""
    title = release.get("title") or ""
    quality = release.get("quality")
    quality_name = quality if isinstance(quality, str) else _quality_name(release)
    score = release.get("custom_format_score")
    return {
        "resolution": resolution_from_text(quality_name, title),
        "dynamic_range": dynamic_range_from_text(quality_name, title),
        "custom_format_score": score if isinstance(score, int) else None,
        "quality": quality_name,
    }


def compare(current: dict, candidate: dict) -> dict:
    """Comparatif technique entre le fichier en place et une release candidate.

    `regressions` liste les codes de regression CERTAINE (`resolution`, `hdr`,
    `custom_format_score`). `unknown` liste les criteres qu'on n'a pas pu comparer :
    ils n'autorisent ni ne bloquent rien, mais expliquent a l'utilisateur pourquoi un
    critere ne s'est pas prononce.
    """
    regressions: list[str] = []
    unknown: list[str] = []

    if current["resolution"] is None or candidate["resolution"] is None:
        unknown.append("resolution")
    elif candidate["resolution"] < current["resolution"]:
        regressions.append("resolution")

    lost_ranges = sorted(current["dynamic_range"] - candidate["dynamic_range"])
    if current["dynamic_range"] and not candidate["dynamic_range"] and not candidate["resolution"]:
        # Aucun indice technique dans le titre : l'absence de marqueur HDR n'est alors
        # pas une preuve de perte, seulement un titre peu descriptif.
        unknown.append("hdr")
        lost_ranges = []
    elif lost_ranges:
        regressions.append("hdr")

    if current["custom_format_score"] is None or candidate["custom_format_score"] is None:
        unknown.append("custom_format_score")
    elif candidate["custom_format_score"] < current["custom_format_score"]:
        regressions.append("custom_format_score")

    return {
        "current": {**current, "dynamic_range": sorted(current["dynamic_range"])},
        "candidate": {**candidate, "dynamic_range": sorted(candidate["dynamic_range"])},
        "regressions": regressions,
        "lost_dynamic_range": lost_ranges,
        "unknown": unknown,
    }


# Regression -> (reglage qui la protege, gabarit d'explication).
_GUARDS: dict[str, tuple[str, str]] = {
    "resolution": ("vf_upgrade_protect_resolution", "resolution en baisse ({current} -> {candidate})"),
    "hdr": ("vf_upgrade_preserve_hdr", "perte de {lost}"),
    "custom_format_score": (
        "vf_upgrade_protect_custom_format_score",
        "score de custom format en baisse ({current} -> {candidate})",
    ),
}


def _setting(settings, name: str, default):
    value = getattr(settings, name, None) if settings is not None else None
    return default if value is None else value


def blocking_reasons(settings, comparison: dict) -> list[str]:
    """Raisons, lisibles, pour lesquelles cette release doit etre ecartee.

    Vide si aucune regression protegee, ou si `vf_upgrade_allow_technical_downgrade`
    autorise explicitement la regression -- dans ce cas le comparatif reste attache a la
    release pour affichage, mais ne bloque plus.
    """
    if _setting(settings, "vf_upgrade_allow_technical_downgrade", False):
        return []
    reasons: list[str] = []
    for regression in comparison["regressions"]:
        guard = _GUARDS.get(regression)
        if not guard or not _setting(settings, guard[0], True):
            continue
        setting_name, template = guard
        reasons.append(
            template.format(
                current=comparison["current"].get(
                    "resolution" if regression == "resolution" else "custom_format_score"
                ),
                candidate=comparison["candidate"].get(
                    "resolution" if regression == "resolution" else "custom_format_score"
                ),
                lost=", ".join(value.upper() for value in comparison["lost_dynamic_range"]) or "HDR",
            )
        )
    return reasons


def annotate(release: dict, current: dict, settings) -> dict:
    """Attache le comparatif technique a une release et dit si elle doit etre ecartee.

    Le comparatif est TOUJOURS attache (l'interface le montre, y compris quand rien ne
    bloque) ; seul `vf_technical_blocked` depend des reglages.
    """
    comparison = compare(current, release_profile(release))
    reasons = blocking_reasons(settings, comparison)
    release["vf_technical"] = comparison
    release["vf_technical_blocked"] = bool(reasons)
    release["vf_technical_reasons"] = reasons
    return release
