"""
Router d'authentification.

Les pages /login, /setup et /privacy sont rendues par la SPA Vue (voir serve_spa dans
app/main.py) ; ce routeur n'expose que leurs API JSON :

- GET  /api/auth/state : compte à créer ? session ouverte ?
- POST /api/auth/setup : création du compte admin (tant qu'aucun compte n'existe)
- POST /api/auth/setup/restore : restauration complète depuis une archive de sauvegarde,
  en alternative à la création manuelle d'un compte (voir app/backup_restore.py)
- POST /api/auth/login : vérification des identifiants et création de session
- POST /api/auth/plex/pin, GET /api/auth/plex/check/{id} : connexion Plex SSO
- GET  /api/privacy : données de la politique de confidentialité
- GET  /logout : destruction de la session
"""

import asyncio
import hmac
import json
import logging
import os
import time
from base64 import b64decode
from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from webauthn import (
    generate_authentication_options,
    verify_authentication_response,
)
from webauthn.helpers import options_to_json

from ..backup_restore import BackupRestoreError, perform_full_restore
from ..database import DATABASE_URL, get_db_async
from ..dependencies import current_user, require_auth
from ..models import LoginAttempt, PasskeyCredential, PlexUser, Settings
from ..services import plex_servers
from ..services.auth import hash_password, verify_password
from ..services.client_ip import client_ip
from ..services.plex_api import get_auth_pin, get_plex_account, get_plex_owner_uuid, has_server_access
from ..services.session_security import consume_challenge, open_user_session, store_challenge
from ..services.totp import verify_code
from ..utils import now_utc_naive, safe_redirect_path

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])

_MAX_ATTEMPTS = 5
_MAX_ATTEMPTS_PER_ACCOUNT = 10
_WINDOW_SECONDS = 600
_MIN_PASSWORD_LENGTH = 8


@router.get("/api/session", dependencies=[Depends(require_auth)])
async def session_info(request: Request, db: AsyncSession = Depends(get_db_async)):
    """Return the authenticated identity used by the SPA shell.

    Inclut l'etat des moyens de connexion du compte : la page Profil d'un simple
    utilisateur (qui n'a pas acces a /api/users/{id}) en a besoin pour demander le mot
    de passe actuel ou un code 2FA avant un changement."""
    identity = current_user(request, db)
    if identity and identity.get("id"):
        user = (await db.execute(select(PlexUser).filter(PlexUser.id == identity["id"]))).scalars().first()
        if user:
            identity["has_local_password"] = bool(user.password_hash)
            identity["totp_enabled"] = bool(user.totp_enabled)
    return identity


async def _is_rate_limited(db: AsyncSession, ip: str, username: str | None = None) -> bool:
    """Trop d'echecs recents depuis cette IP, ou visant ce compte (toutes IP confondues).

    La limite par compte freine une attaque repartie sur plusieurs adresses ; elle est
    plus large que celle par IP pour qu'un tiers ne bloque pas trop facilement un compte.
    Derriere un reverse-proxy, l'IP n'est celle du client que si FORWARDED_ALLOW_IPS
    designe le proxy (voir docker-compose.yml).
    """
    cutoff = now_utc_naive() - timedelta(seconds=_WINDOW_SECONDS)
    failed = (LoginAttempt.success == False, LoginAttempt.attempted_at >= cutoff)  # noqa: E712
    by_ip = (
        await db.execute(select(func.count(LoginAttempt.id)).filter(LoginAttempt.ip_address == ip, *failed))
    ).scalar()
    if (by_ip or 0) >= _MAX_ATTEMPTS:
        return True
    if username:
        by_user = (
            await db.execute(select(func.count(LoginAttempt.id)).filter(LoginAttempt.username == username, *failed))
        ).scalar()
        if (by_user or 0) >= _MAX_ATTEMPTS_PER_ACCOUNT:
            return True
    return False


async def _client_ip(request: Request, db: AsyncSession) -> str:
    """IP du client, lue dans X-Forwarded-For seulement derriere un proxy declare
    dans les parametres (voir app/services/client_ip.py)."""
    trusted = (await db.execute(select(Settings.trusted_proxies))).scalars().first()
    return client_ip(request, trusted)


async def _record_login_attempt(
    db: AsyncSession, ip: str, username: str | None, success: bool, reason: str | None = None
) -> None:
    db.add(LoginAttempt(ip_address=ip, username=username, success=success, reason=reason, attempted_at=now_utc_naive()))
    await db.commit()


class SetupBody(BaseModel):
    username: str
    password: str
    password_confirm: str


class LoginBody(BaseModel):
    username: str
    password: str
    otp_code: str = ""


async def setup_required(db: AsyncSession) -> bool:
    """Vrai tant qu'aucun compte administrateur n'a été créé sur cette instance."""
    s = (await db.execute(select(Settings))).scalars().first()
    return not (s and s.auth_username)


@router.get("/api/auth/state")
async def auth_state(request: Request, db: AsyncSession = Depends(get_db_async)):
    """État minimal lu par les pages publiques (connexion, installation) avant toute session."""
    return {
        "setup_required": await setup_required(db),
        "authenticated": bool(request.session.get("authenticated")),
    }


@router.post("/api/auth/setup")
async def setup_account(request: Request, body: SetupBody, db: AsyncSession = Depends(get_db_async)):
    """Crée le compte admin puis ouvre la session. Refusé dès qu'un compte existe."""
    s = (await db.execute(select(Settings))).scalars().first()
    # Ne pas permettre de redéfinir les identifiants via cet assistant
    if s and s.auth_username:
        raise HTTPException(403, "Un compte existe déjà sur cette instance")

    username = body.username.strip()
    if not username:
        raise HTTPException(400, "Le nom d'utilisateur ne peut pas être vide.")
    if len(body.password) < _MIN_PASSWORD_LENGTH:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 8 caractères.")
    if body.password != body.password_confirm:
        raise HTTPException(400, "Les mots de passe ne correspondent pas.")

    if not s:
        s = Settings(id=1)
        db.add(s)

    s.auth_username = username
    s.auth_password_hash = hash_password(body.password)
    await db.commit()

    # Connecter l'utilisateur immédiatement après la création du compte
    request.session["authenticated"] = True
    request.session["username"] = username
    request.session["is_owner"] = True
    request.session["role"] = "admin"
    request.session["auth_at"] = int(time.time())
    request.session["role_synced_at"] = int(time.time())
    # Enchaîner sur la configuration des services (Plex, *arr, notifications…)
    return {"authenticated": True, "redirect": "/settings?tab=connections"}


@router.post("/api/auth/setup/restore")
async def setup_restore(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_async),
):
    """Restaure une archive de sauvegarde complète à la place de la création manuelle d'un
    compte. Uniquement disponible tant qu'aucun compte n'existe déjà sur cette instance —
    revérifié juste avant l'action destructrice, pas seulement à l'entrée de la route."""
    s = (await db.execute(select(Settings))).scalars().first()
    if s and s.auth_username:
        raise HTTPException(403, "Un compte existe déjà sur cette instance")

    content = await file.read()
    # La session ouverte ci-dessus (SELECT Settings, avec sa relation email_templates) reste
    # "idle in transaction" et tient des verrous de lecture. Sans ce commit, elle bloque
    # indéfiniment le `pg_restore --clean` de `perform_full_restore`, qui a besoin d'un verrou
    # exclusif sur ces mêmes tables.
    await db.commit()
    try:
        report = await perform_full_restore(content, DATABASE_URL)
    except BackupRestoreError as exc:
        raise HTTPException(400, str(exc)) from exc

    # Re-verification post-restauration : par construction improbable ici (personne d'autre
    # ne peut avoir cree de compte pendant l'operation, protegee par le verrou Redis), gardee
    # par coherence avec le meme principe applique cote /api/backup/full/restore.
    logger.warning("Restauration complète effectuée depuis /setup ; redémarrage programmé.")
    asyncio.get_event_loop().call_later(2.0, os._exit, 0)
    return {"status": "ok", "restarting": True, **report}


@router.get("/api/privacy")
async def privacy_policy(db: AsyncSession = Depends(get_db_async)):
    """Données publiques de la politique de confidentialité -- liée depuis la connexion,
    la barre latérale et le pied de page des emails.

    Construite avec les réglages réels de l'instance (rétention, canaux actifs) plutôt
    qu'un texte générique figé, pour que le contenu reste vrai sans maintenance manuelle."""
    s = (await db.execute(select(Settings))).scalars().first()
    channels = []
    if s:
        if s.email_enabled:
            channels.append("Email")
        if s.discord_enabled and s.discord_webhook_url:
            channels.append("Discord")
        if s.telegram_enabled and s.telegram_bot_token:
            channels.append("Telegram")
        if s.ntfy_enabled and s.ntfy_url:
            channels.append("ntfy")
        if s.gotify_enabled and s.gotify_url:
            channels.append("Gotify")
    return {
        "notification_retention_days": s.notification_log_retention_days if s else None,
        "poll_history_retention_days": s.poll_history_retention_days if s else None,
        "login_attempt_retention_days": s.login_attempt_retention_days if s else None,
        "audit_log_retention_days": s.audit_log_retention_days if s else None,
        "active_channels": channels,
        "gdpr_contact_name": (s.gdpr_contact_name if s else None) or None,
        "gdpr_contact_email": (s.gdpr_contact_email if s else None) or None,
    }


@router.post("/api/auth/login")
async def login(request: Request, body: LoginBody, db: AsyncSession = Depends(get_db_async)):
    """Vérifie les identifiants et ouvre une session."""
    ip = await _client_ip(request, db)
    username, password, otp_code = body.username, body.password, body.otp_code
    if await _is_rate_limited(db, ip, username):
        raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez dans 10 minutes.")

    s = (await db.execute(select(Settings))).scalars().first()
    if not s or not s.auth_username or not s.auth_password_hash:
        raise HTTPException(409, "Aucun compte n'est encore configuré sur cette instance.")

    # 1. Vérifier dans la table PlexUser si l'utilisateur existe localement
    user = (await db.execute(select(PlexUser).filter(PlexUser.plex_user_id == username))).scalars().first()
    if user and user.password_hash:
        # Mot de passe verifie AVANT l'etat du compte : sinon la reponse revelerait
        # qu'un compte desactive existe sous ce nom, sans meme compter la tentative.
        if not verify_password(password, user.password_hash):
            await _record_login_attempt(db, ip, username, False, "bad_credentials")
            raise HTTPException(401, "Identifiants incorrects.")

        if not user.enabled or not user.can_login:
            await _record_login_attempt(db, ip, username, False, "account_disabled")
            raise HTTPException(403, "Ce compte n'est pas autorisé à se connecter.")

        if user.totp_enabled and not verify_code(user.totp_secret, otp_code):
            await _record_login_attempt(db, ip, username, False, "bad_totp")
            raise HTTPException(401, "Code 2FA incorrect.")

        open_user_session(request, user)
        await _record_login_attempt(db, ip, username, True)
        return {"authenticated": True}

    # 2. Repli historique (Settings global admin)
    if not hmac.compare_digest(username, s.auth_username) or not verify_password(password, s.auth_password_hash):
        await _record_login_attempt(db, ip, username, False, "bad_credentials")
        raise HTTPException(401, "Identifiants incorrects.")

    if s.totp_enabled and not verify_code(s.totp_secret, otp_code):
        await _record_login_attempt(db, ip, username, False, "bad_totp")
        raise HTTPException(401, "Code 2FA incorrect.")

    admin_user = (await db.execute(select(PlexUser).filter(PlexUser.plex_user_id == username))).scalars().first()
    if admin_user:
        open_user_session(request, admin_user)
        request.session["is_owner"] = True
        request.session["role"] = "admin"
    else:
        request.session.clear()
        request.session["authenticated"] = True
        request.session["username"] = username
        request.session["is_owner"] = True
        request.session["role"] = "admin"
        request.session["user_id"] = None
        request.session["auth_at"] = int(time.time())
        request.session["role_synced_at"] = int(time.time())
    await _record_login_attempt(db, ip, username, True)
    return {"authenticated": True}


_PLEX_PIN_SESSION_KEY = "plex_login_pin"


@router.post("/api/auth/plex/pin")
async def login_plex_pin(request: Request):
    """Initie une connexion Plex SSO : crée un PIN et retourne l'URL d'auth Plex.

    Le front ouvre `auth_url` dans une popup, puis interroge /api/auth/plex/check/{id}.
    Le PIN (id et code) est memorise dans la session du navigateur qui l'a demande :
    seul ce navigateur pourra ensuite l'echanger contre une session Watchdeck.
    """
    try:
        pin = await get_auth_pin()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur d'initialisation SSO Plex : {e}")
    request.session[_PLEX_PIN_SESSION_KEY] = {"id": pin.get("id"), "code": pin.get("code")}
    return pin


def _can_link_by_username(user: PlexUser, settings: Settings | None) -> bool:
    """Un compte existant ne peut etre rattache par simple nom d'utilisateur Plex que s'il
    n'a encore aucune identite propre : ni UUID Plex (sinon l'UUID fait foi), ni mot de
    passe local, ni role de compte administrateur local. Un nom Plex peut changer de
    proprietaire, et rien n'empeche un ami du serveur de porter le meme nom qu'un compte
    local."""
    if user.plex_account_uuid or user.password_hash or user.source == "local":
        return False
    if settings and settings.auth_username and user.plex_user_id == settings.auth_username:
        return False
    return True


@router.get("/api/auth/plex/check/{pin_id}")
async def login_plex_check(pin_id: int, request: Request, db: AsyncSession = Depends(get_db_async)):
    """Vérifie si le PIN Plex a été validé ; si oui, ouvre la session du bon utilisateur.

    Le token Plex ne sert qu'à identifier le compte (plex.tv /api/v2/user) — il n'est
    jamais persisté. Un compte inconnu est créé avec le rôle 'user' ; il doit être
    autorisé (can_login) et actif (enabled) pour se connecter. Seul le proprietaire du
    serveur Plex configure (titulaire du token serveur) recoit le role admin.
    """
    from ..services.plex_api import check_auth_pin

    pending = request.session.get(_PLEX_PIN_SESSION_KEY) or {}
    if pending.get("id") != pin_id:
        raise HTTPException(status_code=403, detail="Ce code de connexion Plex n'a pas été demandé par ce navigateur.")

    ip = await _client_ip(request, db)
    if await _is_rate_limited(db, ip):
        raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez dans 10 minutes.")

    s = (await db.execute(select(Settings))).scalars().first()
    if not s or not s.plex_token:
        # Sans token serveur, impossible de verifier que le compte a acces au serveur :
        # n'importe quel compte Plex pourrait se creer un acces.
        raise HTTPException(
            status_code=403, detail="La connexion Plex n'est disponible qu'une fois le serveur Plex configuré."
        )

    try:
        token = await check_auth_pin(pin_id, pending.get("code"))
    except Exception as e:
        logger.error("SSO Login check error calling check_auth_pin: %s", e)
        raise HTTPException(status_code=502, detail=str(e))

    if not token:
        return {"authenticated": False}

    request.session.pop(_PLEX_PIN_SESSION_KEY, None)
    account = await get_plex_account(token)
    if not account:
        logger.error("SSO Login check: failed to resolve Plex account from token.")
        raise HTTPException(status_code=502, detail="Impossible de résoudre le compte Plex.")

    logger.info("SSO Login check: resolved Plex account %s", account.get("username"))

    # Un compte invite sur un seul des serveurs suivis (ex. le Plex 4K d'un autre
    # proprietaire) a le droit d'entrer : chaque compte proprietaire est interroge.
    has_access = False
    for admin_token in await plex_servers.account_tokens(db, s):
        has_access = await has_server_access(
            admin_token=admin_token,
            user_username=account["username"],
            user_email=account.get("email"),
            user_uuid=account["uuid"],
        )
        if has_access:
            break
    if not has_access:
        logger.warning("SSO Login check: access denied. User %s has no access to Plex server.", account["username"])
        await _record_login_attempt(db, ip, account["username"], False, "plex_no_server_access")
        raise HTTPException(status_code=403, detail="Ce compte Plex n'a pas accès au serveur Plex de l'application.")

    owner_uuid = await get_plex_owner_uuid(s.plex_token)
    is_server_owner = bool(account["uuid"] and owner_uuid and account["uuid"] == owner_uuid)

    # Rattachement : l'UUID Plex (stable) fait foi ; le nom d'utilisateur ne sert que pour
    # les comptes sans identite propre (voir _can_link_by_username).
    user = None
    if account["uuid"]:
        user = (
            (await db.execute(select(PlexUser).filter(PlexUser.plex_account_uuid == account["uuid"]))).scalars().first()
        )
    if not user:
        same_name = (
            (await db.execute(select(PlexUser).filter(PlexUser.plex_user_id == account["username"]))).scalars().first()
        )
        if same_name and not _can_link_by_username(same_name, s):
            logger.warning(
                "SSO Login check: refus de rattacher le compte Plex %s au compte existant id=%s (identite differente)",
                account["username"],
                same_name.id,
            )
            await _record_login_attempt(db, ip, account["username"], False, "plex_identity_conflict")
            raise HTTPException(
                status_code=403,
                detail="Un autre compte Watchdeck porte déjà ce nom. Contactez l'administrateur pour le rattacher.",
            )
        user = same_name

    if not user:
        user = PlexUser(
            plex_user_id=account["username"],
            display_name=account["username"],
            plex_email=account.get("email"),
            plex_account_uuid=account["uuid"] or None,
            avatar_url=account.get("thumb"),
            role="admin" if is_server_owner else "user",
            can_login=True,
            enabled=True,
            source="plex_sso",
        )
        db.add(user)
        await db.flush()
        logger.info("SSO Login check: new user created with id=%s, role=%s", user.id, user.role)
    else:
        # Enrichit / met à jour l'enregistrement existant sans écraser les choix admin.
        if account["uuid"] and not user.plex_account_uuid:
            user.plex_account_uuid = account["uuid"]
        if account.get("thumb"):
            user.avatar_url = account["thumb"]
        if account.get("email") and not user.plex_email:
            user.plex_email = account["email"]
        if is_server_owner:
            user.role = "admin"

    if not user.enabled or not user.can_login:
        await db.commit()
        await _record_login_attempt(db, ip, account["username"], False, "account_disabled")
        raise HTTPException(
            status_code=403, detail="Ce compte n'est pas autorisé à se connecter. Contactez l'administrateur."
        )

    user.last_login_at = now_utc_naive()
    await db.commit()

    open_user_session(request, user, username=user.custom_name or user.display_name or user.plex_user_id)
    await _record_login_attempt(db, ip, account["username"], True)
    return {"authenticated": True, "role": user.role or "user"}


@router.post("/logout")
def logout(request: Request):
    """Détruit la session et redirige vers /login.

    En POST seulement : un lien ou une image pointant vers /logout depuis un autre site
    ne peut plus deconnecter l'utilisateur a son insu."""
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


@router.post("/api/webauthn/login/options")
async def webauthn_login_options(
    request: Request,
    db: AsyncSession = Depends(get_db_async),
):
    rp_id = request.url.hostname
    if rp_id == "127.0.0.1":
        rp_id = "localhost"

    options = generate_authentication_options(
        rp_id=rp_id,
    )

    await store_challenge(request, "auth", options.challenge)
    return json.loads(options_to_json(options))


@router.post("/api/webauthn/login/verify")
async def webauthn_login_verify(
    request: Request,
    credential: dict,
    db: AsyncSession = Depends(get_db_async),
):
    ip = await _client_ip(request, db)
    if await _is_rate_limited(db, ip):
        raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez dans 10 minutes.")
    challenge = await consume_challenge(request, "auth")
    if not challenge:
        raise HTTPException(status_code=400, detail="Défi d'authentification expiré ou invalide.")

    rp_id = request.url.hostname
    if rp_id == "127.0.0.1":
        rp_id = "localhost"

    host = request.headers.get("x-forwarded-host", request.url.netloc)
    expected_origin = [f"https://{host}", f"http://{host}"]

    cred_id_str = credential.get("id")
    db_cred = (
        (await db.execute(select(PasskeyCredential).filter(PasskeyCredential.credential_id == cred_id_str)))
        .scalars()
        .first()
    )
    if not db_cred:
        await _record_login_attempt(db, ip, None, False, "unknown_passkey")
        raise HTTPException(status_code=401, detail="Passkey non reconnue.")

    user = (await db.execute(select(PlexUser).filter(PlexUser.id == db_cred.user_id))).scalars().first()

    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_origin=expected_origin,
            expected_rp_id=rp_id,
            credential_public_key=b64decode(db_cred.public_key),
            credential_current_sign_count=db_cred.sign_count,
            require_user_verification=False,
        )
    except Exception as e:
        logger.error(f"WebAuthn assertion failed: {e}")
        await _record_login_attempt(db, ip, user.plex_user_id if user else None, False, "bad_passkey")
        raise HTTPException(status_code=400, detail=f"Échec de la validation de la Passkey: {e}")

    if not user or not user.enabled or not user.can_login:
        raise HTTPException(status_code=403, detail="Ce compte n'est pas autorisé à se connecter.")

    db_cred.sign_count = verification.new_sign_count
    await db.commit()

    open_user_session(request, user)
    await _record_login_attempt(db, ip, user.plex_user_id, True)
    return {"success": True}
