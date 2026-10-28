import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.routers import storage_api


@pytest.mark.asyncio
async def test_roots_use_isolated_sessions_and_cancel_slow_instances(monkeypatch):
    instances = [SimpleNamespace(id=i, name=f"Arr {i}", enabled=True) for i in range(4)]
    main = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalars=lambda: instances)), rollback=AsyncMock()
    )
    sessions = []
    cancelled = asyncio.Event()
    finished = []

    class Session:
        async def __aenter__(self):
            sessions.append(self)
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, model, identifier):
            return instances[identifier]

    async def discover(db, instance):
        assert db is not main
        if instance.id == 0:
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        finished.append(instance.id)
        return {"arr_instance_id": instance.id, "arr_roots": ["root"], "plex_roots": []}

    monkeypatch.setattr(storage_api, "AsyncSessionLocal", Session)
    monkeypatch.setattr(storage_api.service, "discover_instance_roots", discover)
    monkeypatch.setattr(storage_api, "_ROOT_BUDGET_SECONDS", 0.05)
    results = await storage_api.roots(main)
    assert results[0]["error"]
    assert all(r["arr_roots"] == ["root"] for r in results[1:])
    assert set(finished) == {1, 2, 3}
    assert cancelled.is_set() and len(set(map(id, sessions))) == 4
    main.rollback.assert_awaited_once()
