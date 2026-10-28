"""Cold-grid queue timings with a synthetic upstream and real Pillow encoding."""

import asyncio
import io
import json
import tempfile
import time
from unittest.mock import patch

import httpx
from backend import RESULTS, summary
from PIL import Image
from starlette.requests import Request

from app.routers import image_proxy_api as images
from app.services.http_pool import close_http_clients


class TimedSemaphore(asyncio.Semaphore):
    def __init__(self, value):
        super().__init__(value)
        self.waits = []
        self.active = self.peak = 0

    async def __aenter__(self):
        start = time.perf_counter()
        await super().__aenter__()
        self.waits.append((time.perf_counter() - start) * 1000)
        self.active += 1
        self.peak = max(self.peak, self.active)

    async def __aexit__(self, *args):
        self.active -= 1
        await super().__aexit__(*args)


async def main():
    source = io.BytesIO()
    Image.effect_noise((1280, 1920), 80).convert("RGB").save(source, format="JPEG")
    content = source.getvalue()
    calls = 0

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url, **kwargs):
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.02)
            return httpx.Response(
                200, request=httpx.Request("GET", url), content=content, headers={"content-type": "image/jpeg"}
            )

    async def hosts():
        return {"fixture.test"}

    async def verify(host):
        return True

    downloads, encoders = TimedSemaphore(6), TimedSemaphore(2)

    async def grid():
        times = []

        async def one(i):
            start = time.perf_counter()
            response = await images.image_proxy(
                Request({"type": "http", "headers": []}),
                url=f"http://fixture.test/{i}",
                plex_path=None,
                width=300,
                height=None,
                quality=82,
                image_format="webp",
                plex_server=None,
            )
            assert response.status_code == 200
            times.append((time.perf_counter() - start) * 1000)

        await asyncio.gather(*(one(i) for i in range(60)))
        return summary(times)

    with (
        tempfile.TemporaryDirectory() as directory,
        patch.object(httpx, "AsyncClient", lambda **kwargs: Client()),
        patch.object(images, "_allowed_image_hosts", hosts),
        patch.object(images, "_tls_verify", verify),
        patch.object(images, "_IMAGE_CACHE_DIR", directory),
        patch.object(images, "_image_download_slots", downloads),
        patch.object(images, "_image_encode_slots", encoders),
    ):
        try:
            cold = await grid()
            warm = await grid()
        finally:
            await close_http_clients()
    result = dict(
        scope="60 synthetic 1280x1920 JPEGs, upstream fixture 20ms, real Pillow WebP 300px; no real CDN",
        cold_ms=cold,
        warm_ms=warm,
        download_wait_ms=summary(downloads.waits),
        encode_wait_ms=summary(encoders.waits),
        download_peak=downloads.peak,
        encoder_peak=encoders.peak,
        upstream_calls=calls,
    )
    (RESULTS / "images.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    asyncio.run(main())
