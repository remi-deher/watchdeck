"""Serveurs Plex suivis : resolution de la connexion de chacun.

Le serveur principal garde sa configuration historique dans `Settings` (plex_url,
plex_token, vff_libraries) : toutes les fonctions qui ne parlent qu'a un serveur
(scan VF, activite en direct, SSO, outils de pistes...) continuent de la lire. Sa
ligne `plex_servers` ne sert qu'a rattacher les emplacements de bibliotheque. Les
serveurs supplementaires portent leur propre URL, jeton et bibliotheques.
"""

import json
import logging
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models import PlexServer, Settings

logger = logging.getLogger(__name__)

PRIMARY_DEFAULT_NAME = "Serveur principal"


@dataclass(frozen=True)
class PlexServerConnection:
    """Connexion resolue d'un serveur Plex, prete a passer aux fonctions plexapi."""

    id: int
    name: str
    is_primary: bool
    url: str
    token: str
    libraries: list[dict]


def parse_libraries(raw: Optional[str]) -> list[dict]:
    """Bibliotheques suivies au format de Settings.vff_libraries ; [] si absent ou invalide."""
    if not raw:
        return []
    try:
        libs = json.loads(raw)
    except Exception:
        logger.warning("Bibliotheques Plex : JSON invalide, ignore")
        return []
    out = []
    for entry in libs if isinstance(libs, list) else []:
        if not isinstance(entry, dict):
            continue
        name = (entry.get("name") or "").strip()
        kind = (entry.get("kind") or "").strip().lower()
        if name and kind in ("movie", "series", "music"):
            out.append({"name": name, "kind": kind})
    return out


async def ensure_primary_server(db: AsyncSession) -> PlexServer:
    """Retourne la ligne du serveur principal, creee si besoin (base neuve ou restauree)."""
    primary = (await db.execute(select(PlexServer).filter(PlexServer.is_primary))).scalars().first()
    if primary is None:
        primary = PlexServer(name=PRIMARY_DEFAULT_NAME, is_primary=True, enabled=True)
        db.add(primary)
        await db.flush()
    return primary


async def list_servers(db: AsyncSession) -> list[PlexServer]:
    """Tous les serveurs, principal en tete."""
    await ensure_primary_server(db)
    rows = (await db.execute(select(PlexServer))).scalars().all()
    return sorted(rows, key=lambda s: (not s.is_primary, s.name.lower(), s.id))


def resolve_connection(server: PlexServer, settings: Optional[Settings]) -> Optional[PlexServerConnection]:
    """Connexion d'un serveur, ou None s'il est desactive ou incomplet."""
    if not server.enabled:
        return None
    from .vff_scanner import _parse_vff_libraries

    primary_libs = _parse_vff_libraries(settings) if settings else []
    if server.is_primary:
        if not settings or not settings.plex_url or not settings.plex_token:
            return None
        url, token, libs = settings.plex_url, settings.plex_token, primary_libs
    else:
        if not server.url or not server.token:
            return None
        url, token = server.url, server.token
        libs = parse_libraries(server.libraries) if server.libraries else primary_libs
    return PlexServerConnection(
        id=server.id,
        name=server.name,
        is_primary=server.is_primary,
        url=url,
        token=token,
        libraries=libs,
    )


async def active_connections(db: AsyncSession, settings: Optional[Settings] = None) -> list[PlexServerConnection]:
    """Connexions des serveurs actifs et configures, principal en tete."""
    if settings is None:
        settings = (await db.execute(select(Settings))).scalars().first()
    connections = []
    for server in await list_servers(db):
        conn = resolve_connection(server, settings)
        if conn is not None:
            connections.append(conn)
    return connections


async def configured_hosts(db: AsyncSession) -> dict[str, Optional[str]]:
    """Hote (minuscule) de chaque serveur configure -> jeton, pour le proxy d'images."""
    from urllib.parse import urlparse

    settings = (await db.execute(select(Settings))).scalars().first()
    hosts: dict[str, Optional[str]] = {}
    if settings and settings.plex_url:
        host = urlparse(settings.plex_url).hostname
        if host:
            hosts[host.lower()] = settings.plex_token
    rows = (await db.execute(select(PlexServer).filter(PlexServer.is_primary.is_(False)))).scalars().all()
    for server in rows:
        if not server.url:
            continue
        host = urlparse(server.url).hostname
        if host and host.lower() not in hosts:
            hosts[host.lower()] = server.token
    return hosts


async def connection_for(
    db: AsyncSession, server_id: Optional[int], settings: Optional[Settings] = None
) -> Optional[PlexServerConnection]:
    """Connexion d'un serveur par son id ; None designe le principal (lignes historiques).

    Les tables qui notent un serveur (sessions de lecture...) laissent server_id a NULL
    pour le principal : leurs lignes anterieures au multi-serveurs restent ainsi justes.
    """
    if settings is None:
        settings = (await db.execute(select(Settings))).scalars().first()
    if server_id is None:
        server = await ensure_primary_server(db)
    else:
        server = (await db.execute(select(PlexServer).filter(PlexServer.id == server_id))).scalars().first()
        if server is None:
            return None
    return resolve_connection(server, settings)


def stored_server_id(conn: PlexServerConnection) -> Optional[int]:
    """Valeur a enregistrer dans une colonne server_id : NULL pour le principal."""
    return None if conn.is_primary else conn.id
