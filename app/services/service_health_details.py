"""Détails affichés sous chaque service de la carte « Santé des services ».

Le contrôle de connectivité (voir metrics_api.health_check) dit si un service répond ;
ces fonctions disent *ce qu'il est* : version, nom de l'instance, depuis quand il tourne,
les alertes qu'il remonte lui-même (Sonarr, Radarr et Prowlarr exposent /health), une
mise à jour disponible (Seer), les lectures en cours (Plex).

Chaque appel est best-effort et borné dans le temps : un détail manquant ne doit jamais
faire échouer ni ralentir le verdict de santé. En cas d'erreur, le service n'a
simplement pas de détails.
"""

import asyncio
import logging
from datetime import timedelta
from typing import Any

import httpx
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models import NotificationLog, PollHistory
from ..utils import now_utc_naive
from .arr_http_client import ArrClient

logger = logging.getLogger(__name__)

DETAILS_TIMEOUT_SECONDS = 5
MAX_ISSUES = 5


async def _bounded(coro) -> dict[str, Any]:
    try:
        return await asyncio.wait_for(coro, timeout=DETAILS_TIMEOUT_SECONDS)
    except Exception as exc:  # noqa: BLE001 — un détail absent n'est jamais une panne
        logger.debug("Détails de santé indisponibles : %s", exc)
        return {}


async def _json_or_none(request) -> Any:
    """Corps JSON d'une reponse 200, ou None si l'appel echoue."""
    try:
        resp: httpx.Response = await request
    except Exception:  # noqa: BLE001
        return None
    return resp.json() if resp.status_code == 200 else None


def _issue_level(raw: str | None) -> str:
    return "error" if str(raw or "").lower() == "error" else "warning"


async def _arr(url: str, api_key: str, api_version: str) -> dict[str, Any]:
    client = ArrClient(url, api_key, timeout=DETAILS_TIMEOUT_SECONDS)
    status, rows = await asyncio.gather(
        _json_or_none(client.get(f"/api/{api_version}/system/status")),
        _json_or_none(client.get(f"/api/{api_version}/health")),
    )
    details: dict[str, Any] = {}
    if isinstance(status, dict):
        details["version"] = status.get("version")
        details["instance_name"] = status.get("instanceName")
        details["started_at"] = status.get("startTime")
    if isinstance(rows, list):
        # Les « notice » de Sonarr/Radarr sont informatives : seules les alertes comptent.
        issues = [
            {"level": _issue_level(row.get("type")), "message": row.get("message") or row.get("source") or ""}
            for row in rows
            if str(row.get("type") or "").lower() in {"warning", "error"}
        ]
        issues.sort(key=lambda issue: issue["level"] != "error")
        details["issues"] = issues[:MAX_ISSUES]
        details["issue_count"] = len(issues)
    return {key: value for key, value in details.items() if value not in (None, "")}


async def arr_details(url: str, api_key: str, *, api_version: str = "v3") -> dict[str, Any]:
    """Version, nom, démarrage et alertes d'une instance Sonarr/Radarr (v3) ou Prowlarr (v1)."""
    return await _bounded(_arr(url, api_key, api_version))


async def _plex(plex_url: str, plex_token: str, verify_ssl: bool) -> dict[str, Any]:
    headers = {"X-Plex-Token": plex_token, "Accept": "application/json"}
    base = plex_url.rstrip("/")
    async with httpx.AsyncClient(timeout=DETAILS_TIMEOUT_SECONDS, verify=verify_ssl) as client:
        root, sessions = await asyncio.gather(
            _json_or_none(client.get(f"{base}/", headers=headers)),
            _json_or_none(client.get(f"{base}/status/sessions", headers=headers)),
        )
    details: dict[str, Any] = {}
    if isinstance(root, dict):
        container = root.get("MediaContainer") or {}
        details["version"] = container.get("version")
        details["instance_name"] = container.get("friendlyName")
        details["platform"] = container.get("platform")
    if isinstance(sessions, dict):
        container = sessions.get("MediaContainer") or {}
        details["sessions"] = int(container.get("size") or 0)
    return {key: value for key, value in details.items() if value not in (None, "")}


async def plex_details(plex_url: str, plex_token: str, verify_ssl: bool = True) -> dict[str, Any]:
    """Nom, version et plateforme du serveur Plex, et nombre de lectures en cours."""
    return await _bounded(_plex(plex_url, plex_token, verify_ssl))


async def _seer(seer_url: str, api_key: str) -> dict[str, Any]:
    resp = await ArrClient(seer_url, api_key, timeout=DETAILS_TIMEOUT_SECONDS).get("/api/v1/status")
    if resp.status_code != 200:
        return {}
    data = resp.json() or {}
    details: dict[str, Any] = {"version": data.get("version")}
    if data.get("updateAvailable"):
        details["update_available"] = True
    return {key: value for key, value in details.items() if value not in (None, "")}


async def seer_details(seer_url: str, api_key: str) -> dict[str, Any]:
    """Version de Seer et mise à jour disponible."""
    return await _bounded(_seer(seer_url, api_key))


async def email_details(db: AsyncSession, provider_names: list[str]) -> dict[str, Any]:
    """Fournisseurs actifs, dernier e-mail envoyé et échecs des dernières 24 h."""
    details: dict[str, Any] = {}
    if provider_names:
        details["providers"] = provider_names
    last_sent = (
        await db.execute(
            select(func.max(NotificationLog.sent_at)).filter(
                NotificationLog.channel == "email", NotificationLog.success.is_(True)
            )
        )
    ).scalar()
    if last_sent:
        details["last_activity_at"] = last_sent.isoformat()
    failures = (
        await db.execute(
            select(func.count())
            .select_from(NotificationLog)
            .filter(
                NotificationLog.channel == "email",
                NotificationLog.success.is_(False),
                NotificationLog.sent_at >= now_utc_naive() - timedelta(hours=24),
            )
        )
    ).scalar() or 0
    if failures:
        details["issues"] = [
            {"level": "warning", "message": f"{failures} envoi{'s' if failures > 1 else ''} en échec sur 24 h"}
        ]
        details["issue_count"] = 1
    return details


async def watchlist_details(db: AsyncSession) -> dict[str, Any]:
    """Dernière relève des watchlists : quand, combien d'éléments, erreurs éventuelles."""
    last = (
        (
            await db.execute(
                select(PollHistory).filter(PollHistory.job == "watchlist").order_by(PollHistory.started_at.desc())
            )
        )
        .scalars()
        .first()
    )
    if not last:
        return {}
    details: dict[str, Any] = {
        "last_activity_at": last.started_at.isoformat(),
        "items": last.items_processed,
    }
    if last.errors:
        details["issues"] = [
            {"level": "warning", "message": last.error_detail or f"{last.errors} erreur(s) à la dernière relève"}
        ]
        details["issue_count"] = 1
    return details
