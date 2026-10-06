from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.storage.worker import update_item


@pytest.mark.asyncio
async def test_phase_transitions_keep_dates_and_invalidate_copy_rate():
    db = SimpleNamespace(commit=AsyncMock())
    item = SimpleNamespace(
        status="copying", progress={"started_at": "2026-10-04T10:00:00", "copied_bytes": 100, "bytes_per_second": 50}
    )
    await update_item(db, item, "verifying")
    assert item.progress["copied_bytes"] == 100
    assert item.progress["bytes_per_second"] is None
    assert item.progress["last_bytes_per_second"] == 50
    assert item.progress["rate_measured_at"] > 0
    await update_item(db, item, "completed", progress={})
    assert item.progress["started_at"] == "2026-10-04T10:00:00"
    assert item.progress["finished_at"]
