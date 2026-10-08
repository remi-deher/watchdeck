"""Lancer une tâche planifiée tout de suite."""

import pytest
from fastapi import HTTPException

from app.routers import scheduled_tasks_api
from app.routers.scheduled_tasks_api import JOB_CATALOG, job_function_name, run_scheduled_task


def test_every_catalog_task_maps_to_a_worker_function():
    # Une tâche affichée sans fonction ne pourrait jamais être lancée depuis l'écran.
    missing = [entry["job"] for entry in JOB_CATALOG if job_function_name(entry["job"]) is None]
    assert missing == []


def test_an_unknown_task_has_no_function():
    assert job_function_name("rm-rf") is None


@pytest.mark.asyncio
async def test_run_enqueues_the_task_with_force(monkeypatch):
    calls = []

    async def enqueue(function, **kwargs):
        calls.append((function, kwargs))
        return "job-1"

    monkeypatch.setattr(scheduled_tasks_api, "enqueue_job", enqueue)
    assert await run_scheduled_task("watchlist") == {"job": "watchlist", "job_id": "job-1"}
    assert calls == [("job_watchlist", {"force": True})]


@pytest.mark.asyncio
async def test_run_says_when_the_queue_is_missing(monkeypatch):
    async def enqueue(function, **kwargs):
        return None

    monkeypatch.setattr(scheduled_tasks_api, "enqueue_job", enqueue)
    with pytest.raises(HTTPException) as error:
        await run_scheduled_task("watchlist")
    assert error.value.status_code == 503
    with pytest.raises(HTTPException) as unknown:
        await run_scheduled_task("nope")
    assert unknown.value.status_code == 404
