"""Connecteur Tracearr : import de l'historique de lecture par l'API publique v2.

Tracearr observe les sessions en direct sur Plex, Jellyfin et Emby, et en conserve ce
que Plex ne persiste pas : la décision de lecture. C'est la seule chose qui permette de
réparer les lectures enregistrées « inconnu » faute de `TranscodeSession`.

Trois particularités du contrat guident tout ce fichier.

* **Le grain est la lecture, pas la session.** Une reprise regroupe plusieurs sessions
  en une chaîne, et ``duration_ms`` en est la somme. `playback_merge` refuse donc les
  durées d'une chaîne multi-segments ; seules les caractéristiques du flux passent.

* **L'historique couvre les lectures abandonnées**, contrairement à celui de Plex qui
  n'enregistre que ce qui a été effectivement vu. C'est pourquoi il en sait davantage :
  sur l'instance de référence, 5267 lectures dont 1368 jamais terminées, là où Plex n'en
  connaissait que 3876.

* **La pagination est par curseur opaque**, jamais par décalage. Le curseur porte sur des
  lectures entières, donc une chaîne ne se coupe jamais entre deux pages.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from ..models import PlaybackSession
from .playback_merge import MatchKey, merge_playback_records

logger = logging.getLogger(__name__)

#: Chemin de l'API publique v2. Le préfixe est stable et versionné : le suffixer à l'URL
#: de l'instance permet de vivre derrière un reverse-proxy avec un sous-chemin.
API_PATH = "/api/v2/public"

#: Plafond imposé par l'API ; demander davantage fait échouer la validation côté serveur.
MAX_PAGE_SIZE = 100

#: Garde-fou de pagination. Une instance très ancienne peut compter des dizaines de
#: milliers de lectures ; on borne pour ne pas boucler indéfiniment sur un curseur qui
#: ne progresserait pas.
MAX_PAGES = 500


class TracearrError(RuntimeError):
    """Erreur fonctionnelle remontée à l'interface telle quelle."""


def _headers(api_key: str) -> dict[str, str]:
    # Format documenté : `trr_pub_<token>`, généré dans Réglages > Général.
    return {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}


def _base_url(url: str) -> str:
    return f"{url.rstrip('/')}{API_PATH}"


async def test_tracearr(url: str, api_key: str) -> tuple[bool, str]:
    """Vérifie l'accès à l'API publique et rapporte ce qu'elle donne à voir."""
    if not url or not api_key:
        return False, "URL et clé API Tracearr requises."
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            response = await client.get(
                f"{_base_url(url)}/history",
                params={"pageSize": 1},
                headers=_headers(api_key),
            )
        if response.status_code == 401:
            return False, "Clé API Tracearr refusée (401). Régénérez-la dans Réglages > Général."
        if response.status_code == 403:
            return False, "Cette clé Tracearr n'est pas rattachée à un compte propriétaire (403)."
        if response.status_code == 429:
            return False, "Quota d'appels Tracearr dépassé (429). Réessayez dans une minute."
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as exc:
        logger.warning("Test Tracearr impossible: %s", exc)
        return False, f"Connexion Tracearr impossible : {exc}"
    except ValueError:
        return False, "Réponse Tracearr illisible : l'URL ne pointe peut-être pas vers une instance Tracearr."

    if not isinstance(payload, dict) or "data" not in payload:
        return False, "Réponse Tracearr inattendue : l'URL ne pointe peut-être pas vers l'API publique v2."
    rows = payload.get("data") or []
    if not rows:
        return True, "Connexion Tracearr réussie, mais son historique est vide."
    newest = str(rows[0].get("started_at") or "")[:10]
    return True, f"Connexion Tracearr réussie. Dernière lecture connue : {newest}."


def _parse_instant(value: Any) -> Optional[datetime]:
    """ISO 8601 UTC → datetime naïf UTC, la convention de stockage de l'application."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _playback_method(record: dict) -> Optional[str]:
    """Traduit les décisions Tracearr dans notre vocabulaire.

    Les valeurs de l'API sont ``directplay``, ``copy`` et ``transcode``. La précédence est
    la même que côté Plex : dès qu'une piste est convertie, la lecture est un transcodage,
    même si l'autre est copiée telle quelle.
    """
    decisions = {
        str(record.get("video_decision") or "").strip().lower(),
        str(record.get("audio_decision") or "").strip().lower(),
    }
    if "transcode" in decisions:
        return "transcode"
    if "copy" in decisions:
        return "direct_stream"
    if "directplay" in decisions:
        return "direct_play"
    # `is_transcode` reste un dernier recours : il tranche sans dire laquelle des deux
    # pistes est convertie, mais vaut mieux qu'un « inconnu ».
    if record.get("is_transcode") is True:
        return "transcode"
    return None


def _int(value: Any) -> Optional[int]:
    """Entier tolérant : l'API sérialise ses entiers 64 bits en chaînes.

    `progress_ms`, `total_duration_ms` et `duration_ms` arrivent parfois sous la forme
    `"3029460"` alors que le schéma les annonce numériques -- un grand entier passé en
    JSON garde volontiers ses guillemets. Les insérer tels quels fait échouer la requête
    sur une colonne BIGINT.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _float(value: Any) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _media_type(record: dict) -> Optional[str]:
    """Aligne le vocabulaire des types de média sur celui de Plex."""
    value = str(record.get("media_type") or "").strip().lower()
    return value or None


def _user_name(record: dict) -> Optional[str]:
    user = record.get("user") or {}
    return user.get("username") or None


def _device_label(record: dict) -> Optional[str]:
    return record.get("player") or record.get("device") or record.get("platform") or None


def to_playback_values(record: dict) -> dict[str, Any]:
    """Projette une lecture Tracearr sur les colonnes de `PlaybackSession`.

    Seuls les champs que Tracearr renseigne vraiment sont produits : `playback_merge`
    ignore les valeurs vides, mais les omettre ici rend la correspondance lisible.
    """
    started_at = _parse_instant(record.get("started_at"))
    stopped_at = _parse_instant(record.get("stopped_at"))
    values: dict[str, Any] = {
        "source_session_id": str(record.get("id") or ""),
        "user_name": _user_name(record),
        "media_type": _media_type(record),
        "title": record.get("media_title"),
        "grandparent_title": record.get("show_title"),
        "year": _int(record.get("year")),
        "rating_key": str(record["rating_key"]) if record.get("rating_key") else None,
        "player_title": record.get("player"),
        "platform": record.get("platform"),
        "product": record.get("product"),
        "video_decision": record.get("video_decision"),
        "audio_decision": record.get("audio_decision"),
        "playback_method": _playback_method(record),
        "quality": record.get("resolution"),
        "video_codec": record.get("stream_video_codec") or record.get("source_video_codec"),
        "audio_codec": record.get("stream_audio_codec") or record.get("source_audio_codec"),
        "bandwidth_kbps": _int(record.get("bitrate")),
        "duration_ms": _int(record.get("total_duration_ms")),
        "progress_ms": _int(record.get("progress_ms")),
        "progress_percent": _float(record.get("percent_complete")),
        "watched_ms": _int(record.get("duration_ms")),
        "watched_status": 1.0 if record.get("watched") else 0.0,
        "state": record.get("state"),
        "started_at": started_at,
        "last_seen_at": stopped_at or started_at,
        "ended_at": stopped_at,
    }
    return {name: value for name, value in values.items() if value is not None}


def to_match_key(record: dict) -> MatchKey:
    """Identité d'une lecture Tracearr, pour la rapprocher de ce qu'on connaît déjà.

    Tracearr date le début de la lecture, comme nous : c'est donc `started_at` qui sert
    d'ancre. `ended_at` est fourni en second recours, ce qui aide sur une chaîne dont le
    premier segment nous aurait échappé.
    """
    return MatchKey(
        user_name=_user_name(record),
        rating_key=str(record["rating_key"]) if record.get("rating_key") else None,
        started_at=_parse_instant(record.get("started_at")),
        ended_at=_parse_instant(record.get("stopped_at")),
        title=record.get("media_title"),
        segment_count=_int(record.get("segment_count")) or 1,
        source_id=str(record.get("id") or "") or None,
    )


async def fetch_history_page(
    client: httpx.AsyncClient,
    url: str,
    api_key: str,
    *,
    cursor: str | None = None,
    page_size: int = MAX_PAGE_SIZE,
    since: datetime | None = None,
) -> tuple[list[dict], str | None]:
    params: dict[str, Any] = {"pageSize": min(max(page_size, 1), MAX_PAGE_SIZE)}
    if cursor:
        params["cursor"] = cursor
    if since:
        params["since"] = since.replace(microsecond=0).isoformat() + "Z"
    response = await client.get(f"{_base_url(url)}/history", params=params, headers=_headers(api_key))
    if response.status_code == 429:
        raise TracearrError("Quota d'appels Tracearr dépassé. Relancez l'import dans une minute.")
    response.raise_for_status()
    payload = response.json()
    return payload.get("data") or [], (payload.get("meta") or {}).get("nextCursor")


async def import_tracearr_history(
    db,
    *,
    url: str,
    api_key: str,
    since: datetime | None = None,
    max_pages: int = MAX_PAGES,
) -> dict:
    """Importe l'historique Tracearr en enrichissant les lectures déjà connues.

    Rien n'est écrasé : chaque lecture retrouvée est complétée là où elle est muette, et
    seules celles qu'aucune source locale n'a vues sont créées. Le compte rendu distingue
    donc ce qui a été créé de ce qui a été enrichi -- c'est la différence entre « Tracearr
    connaît des lectures que nous ignorions » et « Tracearr a rempli nos trous ».
    """
    if not url or not api_key:
        raise TracearrError("Tracearr n'est pas configuré.")

    from .playback_merge import MergeOutcome

    total = MergeOutcome()
    received = 0
    cursor: str | None = None
    seen_cursors: set[str] = set()

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        for _ in range(max_pages):
            rows, cursor = await fetch_history_page(client, url, api_key, cursor=cursor, since=since)
            if not rows:
                break
            received += len(rows)
            outcome = await merge_playback_records(
                db,
                [(to_match_key(record), to_playback_values(record)) for record in rows],
                "tracearr",
            )
            total.merge(outcome)
            await db.commit()
            if not cursor or cursor in seen_cursors:
                # Un curseur qui se répète signale une pagination qui n'avance plus :
                # continuer réimporterait la même page jusqu'au plafond.
                break
            seen_cursors.add(cursor)

    return {
        "received": received,
        "created": total.created,
        "enriched": total.enriched,
        "unchanged": total.unchanged,
        "conflicts": len(total.conflicts),
        "days": sorted(day.isoformat() for day in total.days),
    }


def unknown_playback_window(rows: list[PlaybackSession]) -> tuple[datetime | None, datetime | None]:
    """Fenêtre couvrant les lectures encore sans décision, pour un import ciblé."""
    candidates = [row.started_at for row in rows if row.started_at]
    if not candidates:
        return None, None
    return min(candidates) - timedelta(days=1), max(candidates) + timedelta(days=1)
