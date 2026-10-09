"""Alertes administrateur : chaque canal seulement s'il est activé et configuré."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import Settings
from app.services import admin_alerts, fileflows_monitor


def _settings(**extra):
    base = dict(
        email_enabled=True,
        smtp_from="wd@x.fr",
        admin_notification_email="a@x.fr, b@x.fr",
        discord_enabled=True,
        discord_webhook_url="https://discord/hook",
        telegram_enabled=True,
        telegram_bot_token="t",
        telegram_chat_id="c",
        ntfy_enabled=True,
        ntfy_url="https://ntfy/topic",
        ntfy_token=None,
        gotify_enabled=False,
        gotify_url="https://gotify",
        gotify_token="g",
    )
    base.update(extra)
    return Settings(**base)


def test_channel_ready():
    settings = _settings()
    assert [c for c in admin_alerts.CHANNELS if admin_alerts.channel_ready(settings, c)] == [
        "email",
        "discord",
        "telegram",
        "ntfy",
    ]
    assert admin_alerts.channel_ready(settings, "pigeon") is False


@pytest.mark.asyncio
async def test_send_uses_only_ready_channels_and_survives_failures():
    session = MagicMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    smtp, discord = AsyncMock(), AsyncMock(side_effect=RuntimeError("down"))
    telegram, ntfy, gotify = AsyncMock(), AsyncMock(), AsyncMock()
    with (
        patch.object(admin_alerts, "AsyncSessionLocal", return_value=session),
        patch("app.services.email_providers.has_enabled_provider", new=AsyncMock(return_value=True)),
        patch("app.services.email_service._send", new=smtp),
        patch("app.services.notifications._post_discord_embed", new=discord),
        patch("app.services.notifications._post_telegram_message", new=telegram),
        patch("app.services.notifications.send_ntfy", new=ntfy),
        patch("app.services.notifications.send_gotify", new=gotify),
    ):
        sent = await admin_alerts.send(_settings(), "Sujet", "Ligne 1\nLigne 2", admin_alerts.CHANNELS)
    assert sent == 4  # 2 emails + Telegram + ntfy ; Discord en panne, Gotify désactivé
    assert smtp.call_args.args[3] == "<p>Ligne 1<br>Ligne 2</p>"
    assert "*Sujet*" in telegram.call_args.args[2]
    gotify.assert_not_called()
    with patch("app.services.email_providers.has_enabled_provider", new=AsyncMock(return_value=False)):
        with patch.object(admin_alerts, "AsyncSessionLocal", return_value=session):
            assert await admin_alerts.send(_settings(), "S", "T", ["email"]) == 0


def test_fileflows_alert_channels_setting():
    assert fileflows_monitor.alert_channels(Settings()) == ["email", "discord"]
    assert fileflows_monitor.alert_channels(Settings(fileflows_alert_channels='["ntfy", "fax"]')) == ["ntfy"]
    assert fileflows_monitor.alert_channels(Settings(fileflows_alert_channels="[]")) == []
    assert fileflows_monitor.alert_channels(Settings(fileflows_alert_channels="{bad")) == []
