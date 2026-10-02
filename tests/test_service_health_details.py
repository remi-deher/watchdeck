"""Tests des details de sante (version, alertes...) lus sur Sonarr/Radarr/Prowlarr, Plex et Seer."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.services import service_health_details as details


def _response(status: int, payload) -> httpx.Response:
    return httpx.Response(status, json=payload, request=httpx.Request("GET", "http://x"))


def test_arr_details_keeps_warnings_and_errors_only():
    async def fake_get(path, **_kwargs):
        if path.endswith("/system/status"):
            return _response(200, {"version": "4.0.9", "instanceName": "Sonarr", "startTime": "2026-09-27T10:00:00Z"})
        return _response(
            200,
            [
                {"type": "notice", "message": "Info"},
                {"type": "warning", "message": "Indexer lent"},
                {"type": "error", "message": "Dossier racine manquant"},
            ],
        )

    client = MagicMock()
    client.get = AsyncMock(side_effect=fake_get)
    with patch.object(details, "ArrClient", return_value=client):
        result = asyncio.run(details.arr_details("http://sonarr", "key"))

    assert result["version"] == "4.0.9"
    assert result["instance_name"] == "Sonarr"
    assert result["started_at"] == "2026-09-27T10:00:00Z"
    assert result["issue_count"] == 2
    assert result["issues"][0] == {"level": "error", "message": "Dossier racine manquant"}


def test_arr_details_uses_prowlarr_api_version():
    client = MagicMock()
    client.get = AsyncMock(return_value=_response(200, {}))
    with patch.object(details, "ArrClient", return_value=client):
        asyncio.run(details.arr_details("http://prowlarr", "key", api_version="v1"))
    paths = [call.args[0] for call in client.get.call_args_list]
    assert paths == ["/api/v1/system/status", "/api/v1/health"]


def test_details_never_raise():
    client = MagicMock()
    client.get = AsyncMock(side_effect=RuntimeError("boom"))
    with patch.object(details, "ArrClient", return_value=client):
        assert asyncio.run(details.seer_details("http://seer", "key")) == {}


def test_seer_details_reports_update():
    client = MagicMock()
    client.get = AsyncMock(return_value=_response(200, {"version": "2.1.0", "updateAvailable": True}))
    with patch.object(details, "ArrClient", return_value=client):
        assert asyncio.run(details.seer_details("http://seer", "key")) == {"version": "2.1.0", "update_available": True}
