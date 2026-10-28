import asyncio
import io
import threading
import time

import httpx
import pytest
from PIL import Image
from starlette.requests import Request

from app.models import Settings
from app.routers import image_proxy_api as images
from app.services.http_pool import close_http_clients


def request(etag=None):
    return Request({"type": "http", "headers": [(b"if-none-match", etag.encode())] if etag else []})


@pytest.mark.asyncio
async def test_cold_downloads_and_encoders_are_bounded(monkeypatch, tmp_path):
    stream = io.BytesIO()
    Image.new("RGB", (64, 96)).save(stream, format="PNG")
    content = stream.getvalue()
    active = peak = encoders = encoder_peak = 0
    mutex = threading.Lock()

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url, **kwargs):
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            try:
                await asyncio.sleep(0.01)
                return httpx.Response(
                    200, request=httpx.Request("GET", url), content=content, headers={"content-type": "image/png"}
                )
            finally:
                active -= 1

    async def hosts():
        return {"fixture.test"}

    async def verify(host):
        return True

    transform = images._transform_image

    def encode(*args):
        nonlocal encoders, encoder_peak
        with mutex:
            encoders += 1
            encoder_peak = max(encoder_peak, encoders)
        try:
            time.sleep(0.01)
            return transform(*args)
        finally:
            with mutex:
                encoders -= 1

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: Client())
    monkeypatch.setattr(images, "_allowed_image_hosts", hosts)
    monkeypatch.setattr(images, "_tls_verify", verify)
    monkeypatch.setattr(images, "_transform_image", encode)
    monkeypatch.setattr(images, "_image_download_slots", asyncio.Semaphore(2))
    monkeypatch.setattr(images, "_image_encode_slots", asyncio.Semaphore(1))
    monkeypatch.setattr(images, "_IMAGE_CACHE_DIR", str(tmp_path))
    try:
        responses = await asyncio.gather(
            *(
                images.image_proxy(
                    request(),
                    url=f"http://fixture.test/{i}",
                    plex_path=None,
                    width=64,
                    height=None,
                    quality=82,
                    image_format="webp",
                    plex_server=None,
                )
                for i in range(20)
            )
        )
        assert all(r.status_code == 200 for r in responses)
        assert peak == 2 and encoder_peak == 1
    finally:
        await close_http_clients()


@pytest.mark.asyncio
async def test_cached_plex_image_avoids_sql_and_config_commit_invalidates(monkeypatch, tmp_path, async_database):
    images.invalidate_image_configuration()
    calls = 0

    def factory():
        nonlocal calls
        calls += 1
        return async_database.session_factory()

    monkeypatch.setattr(images, "AsyncSessionLocal", factory)
    monkeypatch.setattr(images, "_IMAGE_CACHE_DIR", str(tmp_path))
    try:
        async with async_database.session_factory() as db:
            db.add(Settings(id=1, plex_url="http://plex.local:32400", plex_token="first", plex_verify_ssl=False))
            await db.commit()
        url = "http://plex.local:32400/library/metadata/42/thumb"
        stamp = time.time()
        images._write_image_cache(url, b"cached", "image/png", stamp)
        etag = images._variant_etag(url, stamp)
        for _ in range(3):
            response = await images.image_proxy(
                request(etag),
                url=None,
                plex_path="/library/metadata/42/thumb",
                width=None,
                height=None,
                quality=82,
                image_format="original",
                plex_server=None,
            )
            assert response.status_code == 304
        assert calls == 1
        assert images._primary_plex.token == "first"
        async with async_database.session_factory() as db:
            settings = await db.get(Settings, 1)
            settings.plex_token = "second"
            await db.commit()
        await images._allowed_image_hosts()
        assert calls == 2 and images._primary_plex.token == "second"
    finally:
        images.invalidate_image_configuration()
