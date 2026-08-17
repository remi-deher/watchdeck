import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_pwa_manifest_serving():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/manifest.webmanifest")
        assert response.status_code == 200
        assert "application/manifest+json" in response.headers.get("content-type", "")
        data = response.json()
        assert data["name"] == "Watchdeck"
        assert data["display"] == "standalone"
        assert len(data.get("shortcuts", [])) >= 4


@pytest.mark.asyncio
async def test_pwa_service_worker_serving():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/sw.js")
        assert response.status_code == 200
        assert "application/javascript" in response.headers.get("content-type", "")
        assert response.headers.get("service-worker-allowed") == "/"


@pytest.mark.asyncio
async def test_pwa_icons_serving():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/icon.svg")
        assert response.status_code == 200
        assert "image/svg+xml" in response.headers.get("content-type", "")
