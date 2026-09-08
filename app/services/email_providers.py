"""Gestion des fournisseurs d'envoi d'email (SMTP classique, SMTP+OAuth2 Microsoft, Brevo).

Plusieurs fournisseurs peuvent être actifs en parallèle : `send_with_fallback` les
essaie par ordre de `priority` croissante et bascule sur le suivant en cas d'échec,
jusqu'à un envoi réussi — miroir du principe de repli déjà en place ailleurs dans
l'app (ex: watchlist API puis RSS, voir watchlist_poller.py).
"""

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models import EmailProvider
from . import brevo_email, microsoft_oauth
from .notification_delivery import DeliveryRejected, DeliveryUncertain, claim, delivery_identity, finish

logger = logging.getLogger(__name__)


async def list_providers(db: AsyncSession) -> list[EmailProvider]:
    return (
        (await db.execute(select(EmailProvider).order_by(EmailProvider.priority.asc(), EmailProvider.id.asc())))
        .scalars()
        .all()
    )


async def get_enabled_providers(db: AsyncSession) -> list[EmailProvider]:
    return (
        (
            await db.execute(
                select(EmailProvider)
                .filter(EmailProvider.enabled)
                .order_by(EmailProvider.priority.asc(), EmailProvider.id.asc())
            )
        )
        .scalars()
        .all()
    )


async def has_enabled_provider(db: AsyncSession) -> bool:
    providers = await get_enabled_providers(db)
    return bool(providers)


async def send_via_provider(provider: EmailProvider, sender: str, recipient: str, subject: str, html: str) -> None:
    """Envoie un email via un fournisseur précis (pas de repli ici — voir send_with_fallback)."""
    if provider.provider_type == "brevo":
        if not all([provider.brevo_api_key, sender]):
            raise RuntimeError("Configuration Brevo incomplète (clé API/expéditeur) — email non envoyé")
        message_id = await brevo_email.send_transactional_email(
            api_key=provider.brevo_api_key,
            sender_email=sender,
            sender_name=None,
            to_email=recipient,
            subject=subject,
            html_content=html,
            send_key=(delivery_identity.get() or {}).get("send_key"),
        )
        identity = delivery_identity.get()
        if identity is not None:
            identity["provider_message_id"] = message_id
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient
    identity = delivery_identity.get()
    if identity:
        msg["Message-ID"] = f"<{identity['send_key']}@watchdeck.local>"
        msg["X-Watchdeck-Send-Key"] = identity["send_key"]
    msg.attach(MIMEText(html, "html"))

    if provider.provider_type == "smtp_oauth2":
        if not all([provider.smtp_host, provider.oauth_mailbox, sender]):
            raise RuntimeError("Configuration SMTP OAuth2 incomplète (host/boîte/expéditeur) — email non envoyé")

        async def _token() -> str:
            return await microsoft_oauth.get_valid_access_token(provider)

        await aiosmtplib.send(
            msg,
            hostname=provider.smtp_host,
            port=provider.smtp_port,
            username=provider.oauth_mailbox,
            oauth_token_generator=_token,
            use_tls=not provider.smtp_tls,
            start_tls=provider.smtp_tls,
        )
        return

    # provider_type == "smtp"
    if not all([provider.smtp_host, provider.smtp_user, provider.smtp_password, sender]):
        raise RuntimeError("Configuration SMTP incomplète (host/user/password/expéditeur) — email non envoyé")
    await aiosmtplib.send(
        msg,
        hostname=provider.smtp_host,
        port=provider.smtp_port,
        username=provider.smtp_user,
        password=provider.smtp_password,
        use_tls=not provider.smtp_tls,
        start_tls=provider.smtp_tls,
    )


async def test_provider(provider: EmailProvider, sender: str, test_recipient: str) -> tuple[bool, str]:
    """Envoie un email de test via UN fournisseur précis (pas de repli — on veut savoir si CELUI-CI marche)."""
    try:
        await send_via_provider(
            provider,
            sender,
            test_recipient,
            f"[Watchdeck] Test — {provider.name}",
            f"<p>Configuration « {provider.name} » opérationnelle.</p>",
        )
        return True, f"Email envoyé à {test_recipient}"
    except Exception as e:
        return False, str(e)


async def send_with_fallback(db: AsyncSession, sender: str, recipient: str, subject: str, html: str) -> None:
    """Essaie chaque fournisseur actif par ordre de priorité jusqu'à un envoi réussi.

    Lève une exception (agrégeant tous les échecs) seulement si tous les fournisseurs
    actifs ont échoué, ou s'il n'y en a aucun — jamais de succès silencieux.
    """
    providers = await get_enabled_providers(db)
    if not providers:
        raise RuntimeError("Aucun fournisseur d'email configuré et actif — email non envoyé")

    identity = delivery_identity.get()
    if identity:
        if not await claim(db, {k: identity[k] for k in ("send_key", "req_id", "event", "recipient")}):
            return
        # A timeout after SMTP DATA / HTTP POST is ambiguous. Do not switch providers:
        # their idempotency stores are independent and could both deliver the message.
        for provider in providers:
            try:
                await send_via_provider(provider, sender, recipient, subject, html)
            except (DeliveryRejected, aiosmtplib.errors.SMTPResponseException):
                continue  # explicit negative response: this provider did not accept the email
            except Exception as exc:
                await finish(db, identity["send_key"], "uncertain", provider_id=provider.id, detail=type(exc).__name__)
                raise DeliveryUncertain("Envoi sans confirmation ; reprise automatique suspendue") from exc
            await finish(
                db,
                identity["send_key"],
                "sent",
                provider_id=provider.id,
                provider_message_id=identity.get("provider_message_id"),
                detail=None,
            )
            return
        await finish(db, identity["send_key"], "failed", detail="Refus explicite des fournisseurs")
        raise DeliveryRejected("Tous les fournisseurs ont refusé l'envoi")

    errors: list[str] = []
    for provider in providers:
        try:
            await send_via_provider(provider, sender, recipient, subject, html)
            if errors:
                logger.info("Email envoyé via '%s' après échec de : %s", provider.name, "; ".join(errors))
            return
        except Exception as e:
            logger.warning("Fournisseur d'email '%s' en échec (%s), tentative suivante", provider.name, e)
            errors.append(f"{provider.name}: {e}")

    raise RuntimeError("Tous les fournisseurs d'email actifs ont échoué — " + " | ".join(errors))
