"""Ouverture, resynchronisation et revocation des sessions de connexion.

La session est un cookie signe cote client : le serveur ne peut pas le detruire a
distance. La revocation repose donc sur deux mecanismes verifies a chaque
resynchronisation (voir SessionSyncMiddleware dans app/main.py) :

- l'etat du compte (supprime, desactive, connexion interdite) ;
- `PlexUser.session_version`, incremente quand toutes les sessions d'un compte doivent
  tomber (changement de mot de passe, desactivation de la 2FA). La session porte la
  version connue a son ouverture (`sv`) ; un ecart la ferme.
"""

import asyncio
import secrets
import time
from base64 import b64decode, b64encode

from sqlalchemy.future import select

from ..cache import cache
from ..models import PlexUser, Settings

REVOKED = {"_revoked": True}

_role_cache: dict[str, tuple[float, dict]] = {}
_role_locks: dict[str, asyncio.Lock] = {}


def open_user_session(request, user: PlexUser, *, username: str | None = None) -> None:
    """Ouvre la session d'un compte PlexUser apres une authentification reussie.

    `plex_user_id` est toujours renseigne, quelle que soit la methode de connexion
    (mot de passe local, passkey, Plex) : c'est lui qui cloisonne les demandes d'un
    simple utilisateur. Il etait autrefois vide pour les comptes locaux, qui voyaient
    alors les demandes de tout le monde."""
    request.session.clear()
    request.session["authenticated"] = True
    request.session["username"] = username or user.plex_user_id
    request.session["is_owner"] = user.role == "admin"
    request.session["role"] = user.role or "user"
    request.session["plex_user_id"] = user.plex_user_id
    request.session["user_id"] = user.id
    request.session["sv"] = user.session_version or 0
    request.session["role_synced_at"] = int(time.time())
    # Heure de l'authentification : sert de preuve d'identite recente pour les
    # changements de securite d'un compte sans autre secret (voir security_api).
    request.session["auth_at"] = int(time.time())


def _user_session_state(user: PlexUser, session_version: int) -> dict:
    if not user.enabled or not user.can_login:
        return REVOKED
    if (user.session_version or 0) != session_version:
        return REVOKED
    return {
        "role": user.role or "user",
        "is_owner": user.role == "admin",
        "user_id": user.id,
        "plex_user_id": user.plex_user_id,
    }


async def resolve_session_state(
    plex_user_id: str | None, username: str | None, user_id: int | None, session_version: int
) -> dict:
    """Etat courant d'une session : droits a jour, ou REVOKED si elle ne doit plus valoir."""
    from ..database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        user = None
        if user_id:
            user = (await db.execute(select(PlexUser).filter(PlexUser.id == user_id))).scalars().first()
        elif plex_user_id:
            user = (await db.execute(select(PlexUser).filter(PlexUser.plex_user_id == plex_user_id))).scalars().first()
        elif username:
            user = (await db.execute(select(PlexUser).filter(PlexUser.plex_user_id == username))).scalars().first()
        if user:
            return _user_session_state(user, session_version)
        if not user_id and username:
            # Session admin historique ouverte avant la creation du compte PlexUser miroir.
            s = (await db.execute(select(Settings))).scalars().first()
            if s and s.auth_username and username == s.auth_username:
                return {"role": "admin", "is_owner": True}
        return REVOKED


async def cached_session_state(
    plex_user_id: str | None, username: str | None, user_id: int | None, session_version: int, ttl: int
) -> dict:
    """Dedoublonne aussi les rafales du premier affichage d'une page."""
    key = f"{user_id or ''}|{plex_user_id or ''}|{username or ''}|{session_version}"
    cached = _role_cache.get(key)
    now = time.monotonic()
    if cached and now - cached[0] < ttl:
        return cached[1]
    lock = _role_locks.setdefault(key, asyncio.Lock())
    async with lock:
        cached = _role_cache.get(key)
        now = time.monotonic()
        if cached and now - cached[0] < ttl:
            return cached[1]
        value = await resolve_session_state(plex_user_id, username, user_id, session_version)
        _role_cache[key] = (now, value)
        return value


def invalidate_session_cache() -> None:
    """A appeler apres un changement de droits ou une revocation : la prochaine
    resynchronisation relit la base au lieu du cache local."""
    _role_cache.clear()


def revoke_user_sessions(user: PlexUser, request=None) -> None:
    """Ferme toutes les sessions du compte. Si `request` est la session de ce compte,
    elle est conservee (c'est elle qui vient de changer le mot de passe)."""
    user.session_version = (user.session_version or 0) + 1
    if request is not None and request.session.get("user_id") == user.id:
        request.session["sv"] = user.session_version
    invalidate_session_cache()


# --- Defis WebAuthn a usage unique, gardes cote serveur -------------------------------
#
# Le cookie de session etant cote client, un defi stocke uniquement dedans pourrait etre
# rejoue avec une ancienne copie du cookie. La session ne garde qu'un identifiant opaque ;
# le defi lui-meme vit dans le cache partage et disparait a la premiere lecture.

_CHALLENGE_TTL = 300


async def store_challenge(request, kind: str, challenge: bytes) -> None:
    nonce = secrets.token_urlsafe(24)
    await cache.set_json(f"webauthn:{kind}:{nonce}", {"challenge": b64encode(challenge).decode()}, _CHALLENGE_TTL)
    request.session[f"{kind}_challenge_id"] = nonce


async def consume_challenge(request, kind: str) -> bytes | None:
    nonce = request.session.pop(f"{kind}_challenge_id", None)
    if not nonce:
        return None
    key = f"webauthn:{kind}:{nonce}"
    value = await cache.get_json(key)
    await cache.delete(key)
    if not value or not value.get("challenge"):
        return None
    return b64decode(value["challenge"])
