"""Lecture de la configuration langue d'une instance Sonarr/Radarr : custom formats
francais et profils de qualite qui les utilisent.

Pourquoi lire cette configuration plutot que de la gerer (a la Profilarr/Recyclarr) :
Sonarr et Radarr savent deja recuperer une VF tout seuls -- un custom format « French »
avec un score positif, un profil ou l'upgrade par score est actif, et le RSS sync fait
le travail en continu pour zero appel indexeur. Quand cette configuration existe, la
recherche interactive de `vf_upgrade_scanner` n'est qu'un filet de securite ; quand elle
n'existe pas, l'utilisateur n'a aucun moyen de le savoir depuis Watchdeck, et paie en
recherches interactives ce que son *arr aurait pu faire gratuitement.

Ce module se limite donc volontairement a :
- lire les custom formats et profils reels de l'instance ;
- reconnaitre ceux qui ciblent le francais (specification de langue, ou regex de titre
  portant les marqueurs de la scene francaise) ;
- en deduire un diagnostic factuel par profil.

Il ne reimplemente PAS le parsing de release de *arr (c'est ce que fait le service C# de
Profilarr) et ne pretend donc jamais predire si une regex matchera : seule l'instance
*arr en juge, et la recherche interactive renvoie deja `rejected`/`customFormatScore`
pour chaque release.
"""

import logging
import re
from typing import Any

from .arr_http_client import ArrClient

logger = logging.getLogger(__name__)

# Identifiant de langue « French » dans Sonarr/Radarr. Resolu dynamiquement via
# /api/v3/language quand l'instance repond ; cette valeur ne sert que de repli.
_FRENCH_LANGUAGE_ID_FALLBACK = 2

_FRENCH_LANGUAGE_NAMES = {"french", "français", "francais"}

# Marqueurs de la scene francaise cherches dans les regex de custom format « titre de
# release » -- un CF ecrit a la main contient typiquement (VFF|TRUEFRENCH|MULTI...).
_FRENCH_TITLE_MARKERS = ("truefrench", "vff", "vfi", "vfq", "multi", "french")

# Marqueurs de SOUS-TITRAGE francais, a ne jamais confondre avec un doublage : une
# release VOSTFR/SUBFRENCH est en langue originale. Ils sont retires du motif avant la
# recherche des marqueurs ci-dessus, car "SUBFRENCH" contient litteralement "french" --
# sans ce retrait, un custom format « VOSTFR » etait compte comme format francais.
_SUBTITLE_MARKERS = ("vostfr", "subfrench", "subforced", "vost", "srt")

# Specifications *arr qui portent une notion de langue ou de titre.
_LANGUAGE_IMPLEMENTATIONS = {"languagespecification", "originallanguagespecification"}
_TITLE_IMPLEMENTATIONS = {"releasetitlespecification"}


async def _get_json(url: str, api_key: str, path: str, *, timeout: int = 15) -> Any:
    client = ArrClient(url, api_key, timeout=timeout)
    resp = await client.get(path)
    resp.raise_for_status()
    return resp.json()


async def french_language_id(url: str, api_key: str) -> int:
    """Id de la langue « French » sur cette instance (2 partout en pratique, mais lu
    plutot que suppose : les ids sont des constantes de *arr, pas une API stable)."""
    try:
        languages = await _get_json(url, api_key, "/api/v3/language", timeout=10)
    except Exception as exc:
        logger.debug("Langues *arr indisponibles (%s) : repli sur l'id %s", exc, _FRENCH_LANGUAGE_ID_FALLBACK)
        return _FRENCH_LANGUAGE_ID_FALLBACK
    for entry in languages or []:
        if (entry.get("name") or "").strip().lower() in _FRENCH_LANGUAGE_NAMES:
            return int(entry.get("id", _FRENCH_LANGUAGE_ID_FALLBACK))
    return _FRENCH_LANGUAGE_ID_FALLBACK


def _without_subtitle_markers(text: str) -> str:
    """Motif en minuscules, prive de ses marqueurs de sous-titrage (voir _SUBTITLE_MARKERS)."""
    lowered = (text or "").lower()
    for marker in _SUBTITLE_MARKERS:
        lowered = lowered.replace(marker, "")
    return lowered


def _specification_targets_french(spec: dict, french_id: int) -> str | None:
    """Comment cette specification cible le francais, ou None."""
    implementation = (spec.get("implementation") or "").strip().lower()
    fields = spec.get("fields") or []
    values = [field.get("value") for field in fields if field.get("value") is not None]

    if implementation in _LANGUAGE_IMPLEMENTATIONS:
        for value in values:
            # La valeur peut etre l'id numerique (cas courant) ou le nom de la langue.
            if isinstance(value, (int, float)) and int(value) == french_id:
                return "specification de langue"
            if isinstance(value, str) and value.strip().lower() in _FRENCH_LANGUAGE_NAMES:
                return "specification de langue"
        return None

    if implementation in _TITLE_IMPLEMENTATIONS:
        for value in values:
            if not isinstance(value, str):
                continue
            if any(marker in _without_subtitle_markers(value) for marker in _FRENCH_TITLE_MARKERS):
                return "regex de titre"
    return None


def _custom_format_is_french(cf: dict, french_id: int) -> str | None:
    """Comment ce custom format cible le francais, ou None.

    Le nom seul ne suffit pas (un CF peut s'appeler « FR » ou « VF Pack ») : on inspecte
    les specifications, et le nom ne sert que de dernier indice.
    """
    for spec in cf.get("specifications") or []:
        reason = _specification_targets_french(spec, french_id)
        if reason:
            return reason
    words = set(re.split(r"[^a-z0-9]+", _without_subtitle_markers(cf.get("name") or "")))
    if words & {"french", "francais", "vf", "vff", "vfi", "truefrench", "fr"}:
        return "nom du custom format"
    return None


def _profile_diagnosis(profile: dict, french_cf_ids: dict[int, str]) -> dict:
    """Etat d'un profil de qualite vis-a-vis du francais, d'apres ses seuls champs reels."""
    scored: list[dict] = []
    for item in profile.get("formatItems") or []:
        cf_id = item.get("format")
        if cf_id in french_cf_ids:
            scored.append(
                {
                    "id": cf_id,
                    "name": item.get("name"),
                    "score": item.get("score") or 0,
                    "detected_by": french_cf_ids[cf_id],
                }
            )
    positive = [entry for entry in scored if entry["score"] > 0]
    upgrade_allowed = bool(profile.get("upgradeAllowed"))
    cutoff_format_score = profile.get("cutoffFormatScore") or 0

    # « native » : *arr peut aller chercher et remplacer tout seul un fichier non-VF --
    # il faut a la fois un CF francais valorise, l'upgrade autorise, et un seuil de score
    # a atteindre (sans cutoffFormatScore, *arr n'upgrade jamais pour un gain de score).
    if positive and upgrade_allowed and cutoff_format_score > 0:
        verdict = "native"
    elif positive:
        verdict = "partial"
    else:
        verdict = "absent"

    return {
        "id": profile.get("id"),
        "name": profile.get("name"),
        "upgrade_allowed": upgrade_allowed,
        "min_format_score": profile.get("minFormatScore") or 0,
        "cutoff_format_score": cutoff_format_score,
        "french_formats": scored,
        "verdict": verdict,
    }


async def inspect_language_config(url: str, api_key: str) -> dict:
    """Custom formats francais et diagnostic par profil pour une instance *arr."""
    french_id = await french_language_id(url, api_key)
    custom_formats = await _get_json(url, api_key, "/api/v3/customformat")
    profiles = await _get_json(url, api_key, "/api/v3/qualityprofile")

    french_cf_ids: dict[int, str] = {}
    french_formats: list[dict] = []
    for cf in custom_formats or []:
        reason = _custom_format_is_french(cf, french_id)
        if not reason:
            continue
        french_cf_ids[cf["id"]] = reason
        french_formats.append({"id": cf["id"], "name": cf.get("name"), "detected_by": reason})

    diagnosed = [_profile_diagnosis(profile, french_cf_ids) for profile in profiles or []]
    return {
        "french_language_id": french_id,
        "custom_format_count": len(custom_formats or []),
        "french_formats": french_formats,
        "profiles": diagnosed,
        # Verdict global = le meilleur etat atteint par un profil : suffit a repondre
        # « mon *arr sait-il recuperer une VF sans Watchdeck ? ».
        "verdict": (
            "native"
            if any(entry["verdict"] == "native" for entry in diagnosed)
            else "partial"
            if any(entry["verdict"] == "partial" for entry in diagnosed)
            else "absent"
        ),
    }


def recommended_custom_format(french_id: int = _FRENCH_LANGUAGE_ID_FALLBACK) -> dict:
    """Custom format « VF » pret a coller dans Sonarr/Radarr (Settings > Custom Formats
    > Import).

    Deux specifications, volontairement simples et lisibles plutot qu'exhaustives :
    la langue French declaree par *arr (mesuree a l'import par ffprobe, donc fiable) et
    les marqueurs explicites de la scene francaise dans le titre. `required: false` sur
    les deux : l'une OU l'autre suffit a marquer la release.

    A l'utilisateur d'attribuer le score dans son profil -- c'est ce score, compare a
    `cutoffFormatScore`, qui decide si *arr remplacera un fichier VO existant.
    """
    return {
        "name": "VF (Watchdeck)",
        "includeCustomFormatWhenRenaming": False,
        "specifications": [
            {
                "name": "Langue French",
                "implementation": "LanguageSpecification",
                "negate": False,
                "required": False,
                "fields": [{"name": "value", "value": french_id}],
            },
            {
                "name": "Marqueur VF dans le titre",
                "implementation": "ReleaseTitleSpecification",
                "negate": False,
                "required": False,
                "fields": [{"name": "value", "value": r"\b(TRUEFRENCH|VFF|VFI|MULTI)\b"}],
            },
        ],
    }


async def push_custom_format(url: str, api_key: str, payload: dict) -> dict:
    """Cree le custom format sur l'instance et retourne la ressource creee.

    Aucune validation de regex cote Watchdeck : *arr refuse lui-meme un payload invalide
    (400 avec le detail), et c'est son parser qui fait autorite.
    """
    client = ArrClient(url, api_key, timeout=20)
    resp = await client.post("/api/v3/customformat", json=payload)
    resp.raise_for_status()
    return resp.json()
