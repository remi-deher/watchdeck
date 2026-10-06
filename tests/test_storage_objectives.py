"""Planning regressions: global target, exact count, capacity and exclusions."""

import itertools
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.storage.objectives import preview_batch
from app.storage.planning import choose_candidates


def items(sizes):
    return [dict(key=f"1:{n}", size_bytes=size, title=str(n)) for n, size in enumerate(sizes)]


def test_small_goal_does_not_choose_largest_series():
    plan = choose_candidates(items([430, 500, 7, 4, 14]), "release_space", 10, None, 1000, 250)
    assert plan["planned_bytes"] == 11
    assert plan["goal_covered"]


def test_distribute_over_five_titles():
    plan = choose_candidates(items([20, 4, 4, 4, 4, 4]), "release_space", 20, None, 100, 250, target_titles=5)
    assert len(plan["items"]) == 5 and plan["planned_bytes"] == 20
    assert plan["count_covered"]


def test_impossible_count_is_explained_not_claimed():
    plan = choose_candidates(items([7, 8]), "release_space", 20, None, 100, 250, target_titles=5)
    assert not plan["count_covered"] and not plan["goal_covered"]


def test_met_minimum_free_proposes_nothing():
    assert not choose_candidates(items([400]), "minimum_free", 100, 200, 1000, 250)["items"]


def test_protected_title_cannot_be_explicitly_selected():
    rows = items([20, 21])
    rows[0]["protected"] = True
    plan = choose_candidates(rows, "selection", 20, None, 100, 250, {"1:0", "1:1"})
    assert [i["key"] for i in plan["items"]] == ["1:1"]
    assert plan["excluded"][0]["explanation"] == "Titre protégé"


def test_manual_selection_is_not_truncated_at_goal():
    plan = choose_candidates(items([11, 12]), "release_space", 10, None, 100, 250, {"1:0", "1:1"})
    assert plan["planned_bytes"] == 23


def test_small_catalogue_matches_exact_subset_result():
    sizes = [2, 3, 6, 9, 15, 20]
    for goal in range(1, 40):
        possible = [sum(c) for n in range(1, 7) for c in itertools.combinations(sizes, n) if sum(c) <= 50]
        expected = min(possible, key=lambda value: (value < goal, abs(value - goal)))
        assert choose_candidates(items(sizes), "release_space", goal, None, 50, 250)["planned_bytes"] == expected


@pytest.mark.asyncio
async def test_global_goal_is_not_repeated_for_each_instance(monkeypatch):
    from app.routers.storage_api import PreviewBody
    from app.storage import service

    def result(body):
        rows = [dict(key=f"{body.arr_instance_id}:1", size_bytes=12_000_000_000, title="Film")]
        return dict(
            items=rows,
            excluded=[],
            planned_bytes=12_000_000_000,
            remaining_capacity_bytes=88_000_000_000,
            source={},
            destination={},
        )

    monkeypatch.setattr(service, "_preview", AsyncMock(side_effect=lambda db, body: result(body)))
    body = PreviewBody(goal_gb=10, routes=[dict(arr_instance_id=1), dict(arr_instance_id=2)])
    plan = await preview_batch(SimpleNamespace(), body)
    assert len(plan["items"]) == 1 and plan["requested_bytes"] == 10_000_000_000
    assert sum(len(g["items"]) for g in plan["groups"]) == 1


@pytest.mark.asyncio
async def test_protections_and_arr_added_preference():
    from app.storage.objectives import enrich_candidates

    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [2])))
    )
    candidates = [dict(arr_id=2, added="2020-01-01"), dict(arr_id=3, added="2024-01-01")]
    await enrich_candidates(db, SimpleNamespace(id=1), candidates, SimpleNamespace(preference="oldest_added"))
    assert candidates[0]["protected"] and not candidates[1]["protected"]
    assert candidates[0]["preference_rank"] == "2020-01-01"


@pytest.mark.asyncio
async def test_plex_preference_requires_actual_identity_data(monkeypatch):
    from app.services import plex_servers
    from app.storage import worker
    from app.storage.objectives import enrich_candidates

    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [])))
    )
    monkeypatch.setattr(plex_servers, "connection_for", AsyncMock(return_value=object()))
    monkeypatch.setattr(
        worker, "plex_get", AsyncMock(return_value={"Metadata": [{"Guid": [{"id": "tmdb://10"}], "lastViewedAt": 100}]})
    )
    rows = [dict(arr_id=1, snapshot={"plex_section_id": "1", "tmdb_id": 10})]
    instance = SimpleNamespace(id=1, plex_server_id=1, arr_type="radarr")
    body = SimpleNamespace(preference="least_recently_watched")
    await enrich_candidates(db, instance, rows, body)
    assert rows[0]["preference_rank"] == 100
    rows[0]["snapshot"]["tmdb_id"] = 11
    with pytest.raises(ValueError, match="Historique Plex indisponible"):
        await enrich_candidates(db, instance, rows, body)


def test_global_plan_respects_individual_destinations():
    rows = [
        dict(key="a", size_bytes=6, capacity_group="one"),
        dict(key="b", size_bytes=6, capacity_group="one"),
        dict(key="c", size_bytes=7, capacity_group="two"),
    ]
    result = choose_candidates(rows, "release_space", 12, None, 30, 250, group_limits={"one": 10, "two": 20})
    assert result["planned_bytes"] == 13


@pytest.mark.asyncio
async def test_title_protection_is_shared_and_removable():
    from app.models import ArrInstance
    from app.routers.storage_api import ProtectionBody, protect_title, protected_titles, unprotect_title
    from tests.async_support import make_test_session

    db = make_test_session()
    instance = ArrInstance(name="Protection", url="http://arr", api_key="test", arr_type="radarr", enabled=True)
    db.add(instance)
    await db.flush()
    try:
        await protect_title(instance.id, 123, ProtectionBody(title="Conserver"), db)
        await protect_title(instance.id, 123, ProtectionBody(title="Conserver"), db)
        assert any(t["key"] == f"{instance.id}:123" for t in await protected_titles(db))
        await unprotect_title(instance.id, 123, db)
        assert not any(t["key"] == f"{instance.id}:123" for t in await protected_titles(db))
    finally:
        await db.close()


@pytest.mark.asyncio
async def test_per_source_mode_keeps_explicit_goals(monkeypatch):
    from app.routers.storage_api import PreviewBody
    from app.storage import service

    captured = []

    async def run(db, body):
        captured.append(body)
        return dict(
            items=[],
            excluded=[],
            planned_bytes=0,
            remaining_capacity_bytes=100,
            requested_bytes=0,
            source={},
            destination={},
            goal_covered=True,
        )

    monkeypatch.setattr(service, "_preview", run)
    body = PreviewBody(mode="minimum_free", goal_gb=10, routes=[dict(arr_instance_id=1, root_goals={"/data": 15})])
    result = await preview_batch(SimpleNamespace(), body)
    assert result["objective_scope"] == "source"
    assert captured[-1].root_goals == {"/data": 15} and not captured[-1].catalogue


@pytest.mark.asyncio
async def test_service_dispatches_multi_instance_objective(monkeypatch):
    from app.routers.storage_api import PreviewBody
    from app.storage import objectives, service

    monkeypatch.setattr(objectives, "preview_batch", AsyncMock(return_value={"groups": []}))
    assert await service._preview(SimpleNamespace(), PreviewBody(routes=[dict(arr_instance_id=1)])) == {"groups": []}


def test_impossible_capacity_and_limit_do_not_overclaim():
    plan = choose_candidates(items([5, 6, 7]), "release_space", 20, None, 10, 1, target_titles=2)
    assert plan["planned_bytes"] <= 10 and not plan["count_covered"] and not plan["goal_covered"]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"goal": -1},
        {"available": -1},
        {"max_titles": 0},
        {"target_titles": 251},
        {"mode": "other"},
        {"mode": "minimum_free", "source_free": None},
    ],
)
def test_invalid_objectives_fail_explicitly(kwargs):
    args = dict(candidates=items([10]), mode="release_space", goal=10, source_free=0, available=100, max_titles=250)
    args.update(kwargs)
    with pytest.raises(ValueError):
        choose_candidates(**args)
