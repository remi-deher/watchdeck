"""Alertes destinées à l'administrateur, sur les canaux de notification configurés.

Les notifications de Watchdeck sont pensées pour les demandes (un média, un demandeur).
Une alerte d'exploitation (traitement FileFlows en échec…) n'a ni l'un ni l'autre : elle
part telle quelle vers l'email administrateur et les canaux globaux choisis, chacun
seulement s'il est activé et configuré dans Notifications.
"""

import logging

from ..database import AsyncSessionLocal
from ..models import Settings
from ..utils import parse_email_list

logger = logging.getLogger(__name__)

CHANNELS = ("email", "discord", "telegram", "ntfy", "gotify")


def channel_ready(settings: Settings, channel: str) -> bool:
    """Canal activé et configuré (l'email demande en plus un fournisseur actif, vérifié à l'envoi)."""
    if channel == "email":
        return bool(settings.email_enabled and settings.smtp_from and settings.admin_notification_email)
    if channel == "discord":
        return bool(settings.discord_enabled and settings.discord_webhook_url)
    if channel == "telegram":
        return bool(settings.telegram_enabled and settings.telegram_bot_token and settings.telegram_chat_id)
    if channel == "ntfy":
        return bool(settings.ntfy_enabled and settings.ntfy_url)
    if channel == "gotify":
        return bool(settings.gotify_enabled and settings.gotify_url and settings.gotify_token)
    return False


async def send(settings: Settings, subject: str, text: str, channels: list[str] | tuple[str, ...]) -> int:
    """Envoie l'alerte sur chaque canal demandé et prêt ; renvoie le nombre d'envois réussis."""
    from .email_providers import has_enabled_provider
    from .email_service import _send as smtp_send
    from .notifications import _post_discord_embed, _post_telegram_message, send_gotify, send_ntfy

    sent = 0
    for channel in channels:
        if not channel_ready(settings, channel):
            continue
        try:
            if channel == "email":
                async with AsyncSessionLocal() as db:
                    if not await has_enabled_provider(db):
                        continue
                html = "<p>" + "<br>".join(text.splitlines()) + "</p>"
                for address in parse_email_list(settings.admin_notification_email):
                    await smtp_send(settings, address, subject, html)
                    sent += 1
                continue
            if channel == "discord":
                await _post_discord_embed(
                    settings.discord_webhook_url, {"title": subject, "description": text[:4000], "color": 0xE74C3C}
                )
            elif channel == "telegram":
                await _post_telegram_message(
                    settings.telegram_bot_token, settings.telegram_chat_id, f"*{subject}*\n{text}"
                )
            elif channel == "ntfy":
                await send_ntfy(settings.ntfy_url, settings.ntfy_token, subject, text)
            elif channel == "gotify":
                await send_gotify(settings.gotify_url, settings.gotify_token, subject, text, priority=7)
            sent += 1
        except Exception as exc:  # noqa: BLE001 -- un canal en panne n'empêche pas les autres
            logger.error("Alerte administrateur : échec %s (%s)", channel, exc)
    return sent
