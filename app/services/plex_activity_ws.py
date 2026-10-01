"""Écouteur temps réel du websocket Plex (/:/websockets/notifications).

Complète le polling de playback_activity.py : Plex y pousse les changements d'état
(playing/paused/buffering/stopped) en direct, avec un évènement "stopped" explicite qui
fait autorité pour clôturer une session -- contrairement au polling, qui ne peut que
déduire un arrêt de l'absence de la session au cycle suivant (voir _MISS_THRESHOLD dans
playback_activity.py). Le polling reste actif comme filet de sécurité : Plex a un bug
connu où certains flux n'envoient jamais l'évènement "stopped", et le websocket ne
transporte pas les métadonnées complètes (codec, bande passante...) nécessaires à
l'enrichissement d'une session inconnue.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import ssl
from urllib.parse import urlsplit, urlunsplit

import websockets
from sqlalchemy.future import select

from ..database import AsyncSessionLocal
from ..models import PlexServer, Settings
from .distributed_lock import acquire_distributed_lock, release_distributed_lock, renew_distributed_lock
from .playback_activity import collect_plex_activity, handle_websocket_state

logger = logging.getLogger(__name__)

_LOCK_KEY = "watchdeck:locks:playback-websocket"
_LOCK_TTL = 90
_RENEW_INTERVAL = 30
_SETTINGS_RECHECK_INTERVAL = 30
_BACKOFF_MIN = 5
_BACKOFF_MAX = 60
_HEALTHY_CONNECTION_SECONDS = 30  # au-delà, la connexion est jugée stable : reset du backoff
_FAILURES_BEFORE_ALERT = 3  # tolère quelques coupures réseau avant d'alerter en base


def _websocket_url(plex_url: str, plex_token: str) -> str:
    parts = urlsplit(plex_url.rstrip("/"))
    scheme = "wss" if parts.scheme == "https" else "ws"
    return urlunsplit((scheme, parts.netloc, "/:/websockets/notifications", f"X-Plex-Token={plex_token}", ""))


async def _load_settings() -> Settings | None:
    async with AsyncSessionLocal() as db:
        return (await db.execute(select(Settings))).scalars().first()


async def _handle_message(raw: str | bytes, server_id: int | None = None) -> None:
    try:
        payload = json.loads(raw)
    except (ValueError, TypeError):
        return
    container = payload.get("NotificationContainer") or {}
    if container.get("type") != "playing":
        return
    for item in container.get("PlaySessionStateNotification") or []:
        try:
            session_key = int(item.get("sessionKey"))
        except (TypeError, ValueError):
            continue
        rating_key = str(item.get("ratingKey") or "") or None
        state = str(item.get("state") or "").lower()
        if not state:
            continue
        view_offset = None
        if item.get("viewOffset") is not None:
            try:
                view_offset = int(item.get("viewOffset"))
            except (TypeError, ValueError):
                pass
        try:
            result = await handle_websocket_state(
                session_key, rating_key, state, view_offset_ms=view_offset, server_id=server_id
            )
            if state != "stopped" and result.get("status") == "unknown":
                # Session jamais vue par le polling : on déclenche une collecte complète
                # plutôt que de dupliquer le parsing/l'enrichissement XML avec les seuls
                # champs (partiels) fournis par le websocket.
                await collect_plex_activity()
        except Exception:
            logger.exception("Erreur traitement évènement websocket Plex (sessionKey=%s)", session_key)


async def _renew_loop(token: str) -> None:
    while True:
        await asyncio.sleep(_RENEW_INTERVAL)
        await renew_distributed_lock(_LOCK_KEY, token, ttl=_LOCK_TTL)


async def _record(action: str, status: str, message: str, details: dict | None = None) -> None:
    """Trace durable, lisible depuis l'interface (les logs du worker n'y remontent pas).

    Import différé : `app.jobs` charge ce module au démarrage du worker, un import de
    premier niveau créerait un cycle.
    """
    from ..jobs import record_worker_event

    await record_worker_event(action, status, message, details)


async def _listen_once(settings: Settings, on_connected, conn=None) -> None:
    """Une connexion websocket, jusqu'à déconnexion ou erreur.

    `conn` : serveur supplémentaire (services.plex_servers) ; sans lui, le principal.
    """
    base_url, token = (conn.url, conn.token) if conn is not None else (settings.plex_url, settings.plex_token)
    server_id = conn.id if conn is not None else None
    url = _websocket_url(base_url, token)
    ssl_context = None
    if url.startswith("wss://"):
        ssl_context = ssl.create_default_context()
        if not settings.plex_verify_ssl:
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE

    connected_at = asyncio.get_running_loop().time()
    async with websockets.connect(url, ssl=ssl_context, open_timeout=15, ping_interval=20, ping_timeout=20) as ws:
        logger.info("Websocket Plex connecté (%s)", base_url)
        await on_connected()
        async for message in ws:
            await _handle_message(message, server_id=server_id)
    elapsed = asyncio.get_running_loop().time() - connected_at
    if elapsed < _HEALTHY_CONNECTION_SECONDS:
        raise ConnectionError("Connexion websocket Plex trop courte, probable rejet/instabilité")


async def _secondary_connection(server_id: int):
    """Connexion d'un serveur supplémentaire, ou None s'il est désactivé ou supprimé."""
    from . import plex_servers

    async with AsyncSessionLocal() as db:
        settings = (await db.execute(select(Settings))).scalars().first()
        if not settings or not settings.live_activity_enabled:
            return settings, None
        return settings, await plex_servers.connection_for(db, server_id, settings)


async def _run_secondary_listener(server_id: int) -> None:
    """Écoute le websocket d'un serveur supplémentaire, avec reconnexion et verrou propre."""
    lock_key = f"{_LOCK_KEY}:{server_id}"
    backoff = _BACKOFF_MIN
    token: str | None = None

    async def _on_connected() -> None:
        return None

    try:
        while True:
            settings, conn = await _secondary_connection(server_id)
            if settings is None or conn is None:
                return
            if token is None:
                token = await acquire_distributed_lock(lock_key, ttl=_LOCK_TTL)
                if token is None:
                    await asyncio.sleep(_LOCK_TTL / 2)
                    continue
            renew_task = asyncio.create_task(_renew_loop_for(lock_key, token))
            try:
                await _listen_once(settings, _on_connected, conn)
                backoff = _BACKOFF_MIN
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Websocket Plex (%s) deconnecte : %s, reconnexion dans %ss", conn.name, exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, _BACKOFF_MAX)
            finally:
                renew_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await renew_task
    finally:
        if token:
            await release_distributed_lock(lock_key, token)


async def _renew_loop_for(lock_key: str, token: str) -> None:
    while True:
        await asyncio.sleep(_RENEW_INTERVAL)
        await renew_distributed_lock(lock_key, token, ttl=_LOCK_TTL)


async def _supervise_secondary_listeners() -> None:
    """Un écouteur par serveur supplémentaire actif, ajusté quand la liste change."""
    tasks: dict[int, asyncio.Task] = {}
    try:
        while True:
            try:
                async with AsyncSessionLocal() as db:
                    wanted = set(
                        (
                            await db.execute(
                                select(PlexServer.id).filter(PlexServer.is_primary.is_(False), PlexServer.enabled)
                            )
                        )
                        .scalars()
                        .all()
                    )
            except Exception as exc:
                logger.warning("Liste des serveurs Plex illisible : %s", exc)
                wanted = set(tasks)
            for server_id in list(tasks):
                if server_id not in wanted or tasks[server_id].done():
                    tasks.pop(server_id).cancel()
            for server_id in wanted - set(tasks):
                tasks[server_id] = asyncio.create_task(_run_secondary_listener(server_id))
            await asyncio.sleep(_SETTINGS_RECHECK_INTERVAL)
    finally:
        for task in tasks.values():
            task.cancel()


async def run_alert_listener() -> None:
    """Boucle de fond : maintient une connexion websocket Plex, avec reconnexion et
    verrou distribué pour rester le seul écouteur actif (défensif si le déploiement
    scale un jour au-delà d'un conteneur worker).
    """
    backoff = _BACKOFF_MIN
    token: str | None = None
    failures = 0
    # Dernier état porté à la connaissance de l'utilisateur ("idle"/"connected"/"failing").
    # On n'écrit en base qu'aux transitions : sinon une instance sans Plex configuré
    # écrirait un évènement toutes les 30 s.
    reported: str | None = None

    async def _on_connected() -> None:
        nonlocal failures, reported
        if reported != "connected":
            await _record(
                "websocket.connected",
                "success",
                "Ecouteur websocket Plex connecte",
                {"plex_url": settings.plex_url, "echecs_precedents": failures},
            )
            reported = "connected"
        failures = 0

    # Les serveurs supplémentaires ont chacun leur écouteur, sous ce superviseur.
    secondary_task = asyncio.create_task(_supervise_secondary_listeners())
    try:
        while True:
            settings = await _load_settings()
            if not settings or not settings.live_activity_enabled or not settings.plex_url or not settings.plex_token:
                if reported != "idle":
                    reported = "idle"
                    logger.warning(
                        "Ecouteur websocket Plex inactif : activite temps reel desactivee ou Plex non configure"
                    )
                    await _record(
                        "websocket.idle",
                        "warning",
                        "Ecoute temps reel inactive : live_activity_enabled desactive ou URL/token Plex absent",
                    )
                await asyncio.sleep(_SETTINGS_RECHECK_INTERVAL)
                continue

            if token is None:
                token = await acquire_distributed_lock(_LOCK_KEY, ttl=_LOCK_TTL)
                if token is None:
                    # Un autre process détient déjà l'écoute (autre réplique/instance).
                    await asyncio.sleep(_LOCK_TTL / 2)
                    continue

            renew_task = asyncio.create_task(_renew_loop(token))
            try:
                await _listen_once(settings, _on_connected)
                backoff = _BACKOFF_MIN
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                failures += 1
                logger.warning(
                    "Websocket Plex deconnecte (%s), echec consecutif n%d, reconnexion dans %ss",
                    exc,
                    failures,
                    backoff,
                )
                if failures >= _FAILURES_BEFORE_ALERT and reported != "failing":
                    # Signalé une seule fois par série : l'utilisateur doit voir « ça ne
                    # marche plus depuis un moment », pas une ligne toutes les minutes.
                    reported = "failing"
                    await _record(
                        "websocket.failing",
                        "error",
                        f"Ecouteur websocket Plex en echec depuis {failures} tentatives: {exc}",
                        {"plex_url": settings.plex_url, "derniere_erreur": str(exc)},
                    )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, _BACKOFF_MAX)
            finally:
                renew_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await renew_task
    finally:
        secondary_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await secondary_task
        if token:
            await release_distributed_lock(_LOCK_KEY, token)
