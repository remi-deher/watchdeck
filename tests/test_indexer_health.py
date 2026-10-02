"""Sante des indexeurs Prowlarr : statistiques par indexeur et alertes de panne."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db_async
from app.dependencies import require_admin, require_auth
from app.main import app
from app.models import ArrInstance, Settings
from app.services import indexer_health, prowlarr
from tests.async_support import make_test_session


def _response(payload, status=200):
    response = MagicMock(status_code=status)
    response.json.return_value = payload
    return response


def _prowlarr_responses():
    later = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat().replace("+00:00", "Z")
    indexers = _response(
        [
            {"id": 1, "name": "YGG", "enable": True, "protocol": "torrent"},
            {"id": 2, "name": "Sharewood", "enable": True, "protocol": "torrent"},
            {"id": 3, "name": "Lent", "enable": True, "protocol": "usenet"},
            {"id": 4, "name": "Coupé", "enable": False, "protocol": "torrent"},
        ]
    )
    statuses = _response([{"indexerId": 1, "disabledTill": later, "mostRecentFailure": "2026-10-02T10:00:00Z"}])
    stats = _response(
        {
            "indexers": [
                {
                    "indexerId": 2,
                    "numberOfQueries": 50,
                    "numberOfFailedQueries": 1,
                    "averageResponseTime": 320,
                    "numberOfGrabs": 4,
                },
                {"indexerId": 3, "numberOfQueries": 10, "numberOfFailedQueries": 5, "averageResponseTime": 2500},
            ]
        }
    )
    return [indexers, statuses, stats]


@pytest.mark.asyncio
async def test_indexer_health_states_and_order():
    with patch("app.services.prowlarr.ArrClient.get", new=AsyncMock(side_effect=_prowlarr_responses())):
        health = await prowlarr.get_indexer_health("http://prowlarr", "k")
    assert health["connected"] is True
    states = [(row["name"], row["state"]) for row in health["indexers"]]
    assert states == [("YGG", "failing"), ("Lent", "degraded"), ("Sharewood", "ok"), ("Coupé", "disabled")]
    sharewood = next(row for row in health["indexers"] if row["name"] == "Sharewood")
    assert sharewood["failure_rate"] == 2.0 and sharewood["average_response_ms"] == 320 and sharewood["grabs"] == 4
    assert health["indexers"][0]["disabled_till"]


@pytest.mark.asyncio
async def test_indexer_health_when_prowlarr_is_down():
    with patch("app.services.prowlarr.ArrClient.get", new=AsyncMock(side_effect=RuntimeError("down"))):
        assert (await prowlarr.get_indexer_health("http://prowlarr", "k"))["connected"] is False


def test_transitions_and_alert_text():
    assert indexer_health.transitions({"A", "B"}, {"B", "C"}) == (["C"], ["A"])
    text = indexer_health.alert_text(
        "Prowlarr", ["C"], ["A"], {"C": {"disabled_till": "2026-10-02T12:00:00+00:00", "last_failure": "x"}}
    )
    assert "C ne répond plus (en pause jusqu'à 2026-10-02 12:00 UTC)" in text
    assert "A fonctionne de nouveau" in text


@pytest.mark.asyncio
async def test_check_indexers_alerts_only_on_change():
    db = make_test_session()
    try:
        settings = Settings(
            indexer_alerts_enabled=True,
            email_enabled=True,
            smtp_from="wd@x.fr",
            admin_notification_email="admin@x.fr",
            discord_enabled=True,
            discord_webhook_url="https://discord/hook",
        )
        db.add_all([settings, ArrInstance(name="Prowlarr", arr_type="prowlarr", url="http://prowlarr", api_key="k")])
        db.commit()

        store: dict = {}

        async def get_json(key):
            return store.get(key)

        async def set_json(key, value, ttl):
            store[key] = value

        def health(*names):
            return {"connected": True, "indexers": [{"name": n, "state": "failing"} for n in names]}

        smtp = AsyncMock()
        discord = AsyncMock()
        with (
            patch.object(indexer_health, "AsyncSessionLocal", return_value=db),
            patch.object(indexer_health.cache, "get_json", new=get_json),
            patch.object(indexer_health.cache, "set_json", new=set_json),
            patch("app.services.email_providers.has_enabled_provider", new=AsyncMock(return_value=True)),
            patch("app.services.email_service._send", new=smtp),
            patch("app.services.notifications._post_discord_embed", new=discord),
        ):
            with patch.object(prowlarr, "get_indexer_health", new=AsyncMock(return_value=health())):
                first = await indexer_health.check_indexers()
            assert first["alerts"] == 0  # premier passage : etat note, pas d'alerte

            with patch.object(prowlarr, "get_indexer_health", new=AsyncMock(return_value=health("YGG"))):
                second = await indexer_health.check_indexers()
            assert second["down"] == ["YGG"] and second["alerts"] == 2
            assert "Indexeur en panne : YGG" in smtp.call_args.args[2]

            with patch.object(prowlarr, "get_indexer_health", new=AsyncMock(return_value=health("YGG"))):
                assert (await indexer_health.check_indexers())["alerts"] == 0  # toujours en panne

            with patch.object(prowlarr, "get_indexer_health", new=AsyncMock(return_value=health())):
                fourth = await indexer_health.check_indexers()
            assert fourth["recovered"] == ["YGG"]
            assert "rétabli" in discord.call_args.args[1]["title"]

            with patch.object(prowlarr, "get_indexer_health", new=AsyncMock(return_value={"connected": False})):
                assert (await indexer_health.check_indexers())["instances"] == 0

            settings.indexer_alerts_enabled = False
            assert (await indexer_health.check_indexers()) == {"status": "disabled"}
    finally:
        db.close()


def test_indexer_health_route():
    db = make_test_session()
    try:
        prowlarr_inst = ArrInstance(name="Prowlarr", arr_type="prowlarr", url="http://prowlarr", api_key="k")
        radarr = ArrInstance(name="Radarr", arr_type="radarr", url="http://radarr", api_key="k")
        db.add_all([prowlarr_inst, radarr])
        db.commit()
        app.dependency_overrides[require_auth] = lambda: None
        app.dependency_overrides[require_admin] = lambda: None
        app.dependency_overrides[get_db_async] = lambda: db
        client = TestClient(app, raise_server_exceptions=False)
        payload = {"connected": True, "indexers": [], "days": 30}
        with patch("app.services.prowlarr.get_indexer_health", new=AsyncMock(return_value=payload)) as health:
            data = client.get(f"/api/prowlarr/{prowlarr_inst.id}/indexer-health?days=500").json()
        assert data["instance"]["name"] == "Prowlarr" and data["days"] == 30
        assert health.call_args.kwargs["days"] == 90
        assert client.get(f"/api/prowlarr/{radarr.id}/indexer-health").status_code == 400
    finally:
        for dep in (require_auth, require_admin, get_db_async):
            app.dependency_overrides.pop(dep, None)
        db.close()
