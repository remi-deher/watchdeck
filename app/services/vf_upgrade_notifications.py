"""Notifications des ameliorations VF, adressees a l'administrateur.

Les cinq reglages `vf_upgrade_notify_*` existaient dans le modele, dans l'API et dans
l'interface, mais aucun code ne les lisait : l'utilisateur cochait « VF validee » et ne
recevait jamais rien. Ce module les branche.

Pourquoi un chemin dedie plutot que `notification_orchestrator._notify` : toute la pile
de notification existante est indexee sur une `MediaRequest` et sur ses demandeurs (voir
`notification_policy.request_notification_is_eligible`). Or une amelioration VF porte le
plus souvent sur un `LibraryItem` -- un film deja present dans la bibliotheque, que
personne n'a demande. Il n'y a donc pas de destinataire « demandeur » a resoudre : c'est
un evenement de maintenance de bibliotheque, qui s'adresse a l'administrateur. On
reutilise en revanche les primitives d'envoi bas niveau de `notifications.py`, pour ne
pas dupliquer la gestion des canaux.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import NotificationLog, Settings
from ..utils import parse_email_list
from . import notifications

logger = logging.getLogger(__name__)

# Transition -> (reglage qui l'autorise, libelle, couleur Discord).
_EVENTS: dict[str, tuple[str, str, int]] = {
    "found": ("vf_upgrade_notify_found", "Release VF trouvee", 0x3498DB),
    "accepted": ("vf_upgrade_notify_accepted", "Release VF acceptee par *arr", 0xE5A00D),
    "downloading": ("vf_upgrade_notify_downloading", "Telechargement VF en cours", 0xE5A00D),
    "failed": ("vf_upgrade_notify_failed", "Amelioration VF en echec", 0xE74C3C),
    "verified": ("vf_upgrade_notify_verified", "VF confirmee", 0x1DB954),
}


def event_is_enabled(settings: Settings | None, event: str) -> bool:
    entry = _EVENTS.get(event)
    if not settings or not entry:
        return False
    return bool(getattr(settings, entry[0], False))


def _scope_label(scope: str, season_number: int | None, episode_number: int | None) -> str:
    if scope == "movie":
        return ""
    if scope == "episode" and season_number is not None and episode_number is not None:
        return f" — S{season_number:02d}E{episode_number:02d}"
    if season_number is not None:
        return f" — Saison {season_number}"
    return ""


def build_message(event: str, title: str, scope_label: str, detail: str | None) -> tuple[str, str]:
    label = _EVENTS[event][1]
    subject = f"[Watchdeck] {label} : {title}{scope_label}"
    body = detail or label
    return subject, body


async def _log(
    db: AsyncSession,
    *,
    channel: str,
    recipient: str,
    subject: str,
    media_title: str,
    media_type: str | None,
    success: bool,
    error: str | None = None,
) -> None:
    db.add(
        NotificationLog(
            event="vf_upgrade",
            channel=channel,
            recipient=recipient,
            is_admin=True,
            media_title=f"{media_title} — {subject}"[:500],
            media_type=media_type,
            success=success,
            error_msg=error,
            language="vf",
            is_upgrade=True,
        )
    )


async def notify_vf_upgrade(
    db: AsyncSession,
    settings: Settings | None,
    event: str,
    *,
    media_title: str,
    media_type: str | None = None,
    scope: str = "movie",
    season_number: int | None = None,
    episode_number: int | None = None,
    detail: str | None = None,
) -> bool:
    """Expedie une transition VF sur les canaux admin configures.

    Ne leve jamais : une notification perdue ne doit pas faire echouer le cycle de vie
    qui l'a declenchee. Chaque envoi est journalise dans `NotificationLog` (succes comme
    echec), pour que l'onglet Notifications montre ce qui est reellement parti.
    """
    if not event_is_enabled(settings, event):
        return False

    scope_label = _scope_label(scope, season_number, episode_number)
    subject, body = build_message(event, media_title, scope_label, detail)
    color = _EVENTS[event][2]
    sent = False

    for recipient in parse_email_list(getattr(settings, "admin_notification_email", None)):
        try:
            from .email_service import _send

            html = f"<p><strong>{subject}</strong></p><p>{body}</p>"
            await _send(settings, recipient, subject, html)
            sent = True
            await _log(
                db,
                channel="email",
                recipient=recipient,
                subject=subject,
                media_title=media_title,
                media_type=media_type,
                success=True,
            )
        except Exception as exc:
            logger.warning("Notification VF email vers %s echouee : %s", recipient, exc)
            await _log(
                db,
                channel="email",
                recipient=recipient,
                subject=subject,
                media_title=media_title,
                media_type=media_type,
                success=False,
                error=str(exc)[:500],
            )

    channels: list[tuple[str, str, object]] = []
    if getattr(settings, "discord_enabled", False) and getattr(settings, "discord_webhook_url", None):
        channels.append(
            (
                "discord",
                "webhook",
                lambda: notifications._post_discord_embed(
                    settings.discord_webhook_url,
                    {"title": subject, "description": body, "color": color},
                ),
            )
        )
    if (
        getattr(settings, "telegram_enabled", False)
        and getattr(settings, "telegram_bot_token", None)
        and getattr(settings, "telegram_chat_id", None)
    ):
        channels.append(
            (
                "telegram",
                str(settings.telegram_chat_id),
                lambda: notifications._post_telegram_message(
                    settings.telegram_bot_token, settings.telegram_chat_id, f"*{subject}*\n{body}"
                ),
            )
        )
    if getattr(settings, "ntfy_enabled", False) and getattr(settings, "ntfy_url", None):
        channels.append(
            (
                "ntfy",
                settings.ntfy_url,
                lambda: notifications.send_ntfy(settings.ntfy_url, settings.ntfy_token, subject, body),
            )
        )
    if getattr(settings, "gotify_enabled", False) and getattr(settings, "gotify_url", None):
        channels.append(
            (
                "gotify",
                settings.gotify_url,
                lambda: notifications.send_gotify(settings.gotify_url, settings.gotify_token, subject, body),
            )
        )

    for channel, recipient, send in channels:
        try:
            await send()
            sent = True
            await _log(
                db,
                channel=channel,
                recipient=recipient,
                subject=subject,
                media_title=media_title,
                media_type=media_type,
                success=True,
            )
        except Exception as exc:
            logger.warning("Notification VF %s echouee : %s", channel, exc)
            await _log(
                db,
                channel=channel,
                recipient=recipient,
                subject=subject,
                media_title=media_title,
                media_type=media_type,
                success=False,
                error=str(exc)[:500],
            )

    return sent
