"""Adresse IP reelle du client, y compris derriere un reverse-proxy.

Derriere Nginx Proxy Manager, Traefik ou Caddy, toutes les connexions arrivent depuis
l'IP du proxy : l'anti-bruteforce de la connexion bloquerait alors tout le monde au
bout de quelques echecs. Les proxies de confiance sont declares dans les parametres
(onglet Webhooks et API) ; seule une connexion venant de l'un d'eux peut annoncer l'IP
du client dans `X-Forwarded-For`, sans quoi n'importe qui pourrait s'en inventer une.
"""

import ipaddress
from functools import lru_cache

from fastapi import Request

IpNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


class InvalidTrustedProxies(ValueError):
    pass


def _entries(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").replace("\n", ",").replace(";", ",").split(",") if part.strip()]


def validate_trusted_proxies(value: str | None) -> str:
    """Normalise la saisie (une IP ou un reseau CIDR par entree) ; leve sur une entree invalide."""
    networks = []
    for entry in _entries(value):
        try:
            networks.append(str(ipaddress.ip_network(entry, strict=False)))
        except ValueError as exc:
            raise InvalidTrustedProxies(f"Adresse de proxy invalide : {entry}") from exc
    return ", ".join(networks)


@lru_cache(maxsize=16)
def _networks(value: str | None) -> tuple[IpNetwork, ...]:
    networks = []
    for entry in _entries(value):
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            continue
    return tuple(networks)


def _ip(value: str | None) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address((value or "").strip())
    except ValueError:
        return None


def _is_trusted(ip: ipaddress.IPv4Address | ipaddress.IPv6Address, networks: tuple[IpNetwork, ...]) -> bool:
    return any(ip.version == network.version and ip in network for network in networks)


def resolve_client_ip(peer: str | None, forwarded_for: str | None, trusted_proxies: str | None) -> str:
    """IP du client : celle de la connexion, sauf si elle vient d'un proxy de confiance.

    `X-Forwarded-For` est lu de droite a gauche : chaque proxy ajoute l'adresse de celui
    qui l'a contacte. La premiere adresse qui n'est pas un proxy de confiance est le
    client ; les valeurs plus a gauche ont pu etre ecrites par le client lui-meme."""
    peer_ip = _ip(peer)
    networks = _networks(trusted_proxies)
    if peer_ip is None or not networks or not _is_trusted(peer_ip, networks):
        return peer or "unknown"
    hops = [hop.strip() for hop in (forwarded_for or "").split(",") if hop.strip()]
    for hop in reversed(hops):
        hop_ip = _ip(hop)
        if hop_ip is None:
            break
        if not _is_trusted(hop_ip, networks):
            return str(hop_ip)
    return peer or "unknown"


def client_ip(request: Request, trusted_proxies: str | None) -> str:
    peer = request.client.host if request.client else None
    return resolve_client_ip(peer, request.headers.get("x-forwarded-for"), trusted_proxies)
