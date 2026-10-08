"""Dernier envoi de chaque canal, pour l'écran Canaux."""

from datetime import datetime
from types import SimpleNamespace

import pytest

from app.routers.notifications_api import NOTIFICATION_CHANNELS, last_send_line, notification_channels_last


def test_a_channel_without_sends_has_no_line():
    assert last_send_line(None) is None


def test_the_line_says_whether_it_worked_and_why_not():
    row = SimpleNamespace(
        sent_at=datetime(2026, 10, 8, 9, 0),
        success=False,
        error_msg="Webhook refusé (404)",
        event="available",
        media_title="Dune",
        recipient="#films",
    )
    line = last_send_line(row)
    assert line["success"] is False
    assert line["error"] == "Webhook refusé (404)"
    assert line["media_title"] == "Dune"


class _Db:
    def __init__(self, rows):
        self._rows = list(rows)

    async def execute(self, _query):
        row = self._rows.pop(0)

        class _R:
            def scalars(self):
                return self

            def first(self):
                return row

        return _R()


@pytest.mark.asyncio
async def test_every_channel_is_listed():
    sent = SimpleNamespace(
        sent_at=datetime(2026, 10, 8), success=True, error_msg=None, event="request", media_title="X", recipient="a"
    )
    rows = [sent] + [None] * (len(NOTIFICATION_CHANNELS) - 1)
    result = await notification_channels_last(db=_Db(rows))
    assert list(result) == list(NOTIFICATION_CHANNELS)
    assert result["email"]["success"] is True
    assert result["discord"] is None
