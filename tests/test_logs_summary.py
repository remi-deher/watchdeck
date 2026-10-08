"""Verdict des journaux : erreurs récentes par source, envois de notification compris."""

from datetime import datetime

import pytest

from app.routers import notifications_api
from app.routers.notifications_api import app_log_errors_since, logs_summary


def test_only_recent_errors_of_the_app_log_count():
    cutoff = datetime(2026, 10, 8, 0, 0)
    entries = [
        {"time": "2026-10-08 09:00:00", "level": "ERROR"},
        {"time": "2026-10-08 09:00:00", "level": "INFO"},
        {"time": "2026-10-07 09:00:00", "level": "CRITICAL"},
        {"time": "pas une date", "level": "ERROR"},
    ]
    assert app_log_errors_since(entries, cutoff) == 1


class _Db:
    def __init__(self, counts):
        self._counts = list(counts)

    async def execute(self, _query):
        value = self._counts.pop(0)

        class _R:
            def scalar(self):
                return value

        return _R()


@pytest.mark.asyncio
async def test_summary_adds_every_source(monkeypatch):
    monkeypatch.setattr("app.log_buffer.get_logs", lambda: [])
    result = await logs_summary(hours=24, db=_Db([2, 1, 3]))
    assert result["errors"] == {"diagnostic": 2, "app": 0, "polls": 1, "notifications": 3}
    assert result["total"] == 6
    assert notifications_api.NON_JOURNEY_CATEGORIES
