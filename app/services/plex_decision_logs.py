"""Raison du transcodage telle que Plex l'a decidee, relue dans ses journaux.

`/video/:/transcode/universal/decision` ne peut pas etre relu apres coup : c'est
l'appel du lecteur, et la reponse n'est conservee nulle part dans l'API. En revanche,
journaux de debogage actives, Plex ecrit pour chaque decision :

    Request: [...] GET /video/:/transcode/universal/decision?...&session=abc... #48355
    [Req#48355/Transcode] MDE: <titre>: Direct Play is disabled
    [Req#48355/Transcode] Streaming Resource: Reached Decision id=40859 codes=(General=1001,...
        Direct Play=3000,App cannot direct play this item. Direct play is disabled. Transcode=1001,...)

C'est la decision reellement prise, avec les parametres reellement envoyes par le
lecteur. Le format n'est pas une API stable : tout ce module doit echouer en silence,
la raison deduite de /status/sessions restant alors la seule affichee.
"""

from __future__ import annotations

import io
import json
import logging
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qs, urlsplit

import httpx

logger = logging.getLogger(__name__)

# Du plus recent au plus ancien. En mode verbeux, Plex tourne un fichier de 10 Mo toutes
# les quelques minutes : les six ne couvrent parfois qu'une demi-heure.
_LOG_FILES = ("Plex Media Server.log", *(f"Plex Media Server.{index}.log" for index in range(1, 6)))
_LINE = re.compile(r"^(?P<ts>[A-Z][a-z]{2} \d{1,2}, \d{4} \d{2}:\d{2}:\d{2}\.\d{3}) \[[^\]]*\] \w+ - (?P<msg>.*)$")
_REQUEST = re.compile(
    r"^Request: \[[^\]]*\] GET (?P<url>/video/:/transcode/universal/decision\?\S+).* #(?P<req>[0-9a-f]+) "
)
_TAGGED = re.compile(r"^\[Req#(?P<req>[0-9a-f]+)/Transcode\] (?P<body>.*)$")
_REACHED = re.compile(r"^Streaming Resource: Reached Decision id=(?P<rk>\d+) codes=\((?P<codes>.*?)\) media=")
_CODE = re.compile(r"(General|Direct Play|Transcode|MDE)=(\d+),(.*?)(?= (?:General|Direct Play|Transcode|MDE)=\d+,|$)")
# Parametres du lecteur utiles au diagnostic : ce sont eux qui different d'un lancement
# a l'autre quand le meme fichier transcode puis passe en lecture directe.
_CLIENT_PARAMS = ("location", "maxVideoBitrate", "videoBitrate", "videoResolution", "directPlay", "directStream")


@dataclass
class PlexDecision:
    at: datetime  # heure UTC naive
    rating_key: str
    session: str | None
    general_code: int | None = None
    general_text: str | None = None
    direct_play_code: int | None = None
    direct_play_text: str | None = None
    mde_code: int | None = None
    mde_text: str | None = None
    transcode_code: int | None = None
    transcode_text: str | None = None
    details: list[str] = field(default_factory=list)
    client: dict = field(default_factory=dict)

    @property
    def reason(self) -> tuple[int | None, str | None]:
        """Le pourquoi du refus de lecture directe, s'il y en a un.

        Plex l'ecrit dans « Direct Play ». Quand le lecteur a decide lui-meme
        (`hasMDE=1`), seul un code « MDE » est donne : 1000 veut dire lecture directe,
        donc rien a expliquer.
        """
        if self.direct_play_text:
            return self.direct_play_code, self.direct_play_text
        if self.mde_text and self.mde_code != 1000:
            return self.mde_code, self.mde_text
        return None, None

    def details_json(self) -> str:
        return json.dumps({"mde": self.details, "client": self.client}, ensure_ascii=False)


def _parse_ts(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%b %d, %Y %H:%M:%S.%f")
    except ValueError:
        return None


def parse_decisions(text: str, utc_offset: timedelta = timedelta(0)) -> list[PlexDecision]:
    """Decisions de lecture du journal, dans l'ordre. `utc_offset` = heure locale Plex - UTC."""
    requests: dict[str, dict] = {}
    details: dict[str, list[str]] = {}
    decisions: list[PlexDecision] = []
    for raw in text.splitlines():
        line = _LINE.match(raw)
        if not line:
            continue
        msg = line.group("msg")
        request = _REQUEST.match(msg)
        if request:
            query = parse_qs(urlsplit(request.group("url")).query)
            requests[request.group("req")] = {key: values[0] for key, values in query.items()}
            continue
        tagged = _TAGGED.match(msg)
        if not tagged:
            continue
        req, body = tagged.group("req"), tagged.group("body")
        if body.startswith("MDE: "):
            detail = body[5:]
            # « Titre: raison » : le titre n'apporte rien, la fiche l'affiche deja.
            detail = detail.split(": ", 1)[1] if ": " in detail and not detail.startswith("Selected") else detail
            if not detail.startswith(("analyzing media", "selected media", "Selected protocol")):
                bucket = details.setdefault(req, [])
                if detail not in bucket:
                    bucket.append(detail)
            continue
        reached = _REACHED.match(body)
        if not reached:
            continue
        at = _parse_ts(line.group("ts"))
        if at is None:
            continue
        params = requests.pop(req, {})
        decision = PlexDecision(
            at=at - utc_offset,
            rating_key=reached.group("rk"),
            session=params.get("session"),
            details=details.pop(req, []),
            client={key: params[key] for key in _CLIENT_PARAMS if key in params},
        )
        for name, code, label in _CODE.findall(reached.group("codes")):
            attr = {"General": "general", "Direct Play": "direct_play", "Transcode": "transcode", "MDE": "mde"}[name]
            setattr(decision, f"{attr}_code", int(code))
            setattr(decision, f"{attr}_text", label.strip())
        decisions.append(decision)
    return decisions


def _utc_offset(text: str, server_now_utc: datetime | None) -> timedelta:
    """Decalage horaire de Plex, deduit de la derniere ligne et de l'en-tete Date.

    Le journal est en heure locale du serveur Plex, sans fuseau. En mode debogage il
    s'ecrit en continu : sa derniere ligne est a quelques secondes de la reponse, ce qui
    suffit une fois arrondi au quart d'heure.
    """
    if server_now_utc is None:
        return timedelta(0)
    last = None
    for raw in reversed(text.splitlines()):
        line = _LINE.match(raw)
        if line and (last := _parse_ts(line.group("ts"))):
            break
    if last is None:
        return timedelta(0)
    quarter = 15 * 60
    seconds = round((last - server_now_utc).total_seconds() / quarter) * quarter
    return timedelta(seconds=seconds)


async def debug_logging_enabled(client: httpx.AsyncClient, base_url: str, headers: dict) -> bool:
    response = await client.get(f"{base_url}/:/prefs", headers={**headers, "Accept": "application/json"})
    response.raise_for_status()
    for setting in response.json().get("MediaContainer", {}).get("Setting", []):
        if setting.get("id") == "logDebug":
            return str(setting.get("value")).lower() in {"1", "true"}
    return False


async def fetch_decisions(base_url: str, token: str, verify: bool = True) -> tuple[list[PlexDecision], datetime | None]:
    """Decisions lisibles dans les journaux de Plex, et l'heure (UTC) de la plus ancienne ligne.

    Renvoie ([], None) si les journaux de debogage sont desactives : sans eux Plex
    n'ecrit aucune decision, inutile de telecharger plusieurs Mo pour rien.
    """
    base_url = base_url.rstrip("/")
    headers = {"X-Plex-Token": token}
    async with httpx.AsyncClient(timeout=60, verify=verify) as client:
        if not await debug_logging_enabled(client, base_url, headers):
            return [], None
        # Hors documentation officielle : c'est le « Telecharger les journaux » de Plex Web.
        response = await client.get(f"{base_url}/diagnostics/logs", headers=headers)
        response.raise_for_status()
    try:
        server_now = parsedate_to_datetime(response.headers["date"]).replace(tzinfo=None)
    except (KeyError, TypeError, ValueError):
        server_now = None
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = set(archive.namelist())
    # Du plus ancien au plus recent, pour que les decisions restent dans l'ordre.
    texts = [archive.read(name).decode("utf-8", "replace") for name in reversed(_LOG_FILES) if name in names]
    if not texts:
        return [], None
    offset = _utc_offset(texts[-1], server_now)
    decisions = [decision for text in texts for decision in parse_decisions(text, offset)]
    oldest = None
    for raw in texts[0].splitlines():
        line = _LINE.match(raw)
        if line and (oldest := _parse_ts(line.group("ts"))):
            oldest -= offset
            break
    return decisions, oldest


def match_decision(
    decisions: list[PlexDecision],
    *,
    rating_key: str | None,
    started_at: datetime,
    ended_at: datetime | None,
    session_ids: set[str] = frozenset(),
) -> PlexDecision | None:
    """Derniere decision prise pour cette lecture.

    Une decision precede la lecture de quelques secondes, et le lecteur en redemande
    une a chaque changement de qualite : on garde la plus recente de la fenetre.
    L'identifiant de session du transcodeur, quand on l'a, departage deux lectures du
    meme media au meme moment.
    """
    if not rating_key:
        return None
    start = started_at - timedelta(minutes=2)
    end = (ended_at or datetime.max - timedelta(days=1)) + timedelta(seconds=30)
    candidates = [d for d in decisions if d.rating_key == str(rating_key) and start <= d.at <= end]
    if session_ids:
        exact = [d for d in candidates if d.session and d.session in session_ids]
        candidates = exact or candidates
    return candidates[-1] if candidates else None
