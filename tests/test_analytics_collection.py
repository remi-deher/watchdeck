"""Collection pagination must be bounded and must never publish partial pages."""

import asyncio
from contextlib import asynccontextmanager

import pytest

from app.models import Settings
from app.services import library_analytics as api


@pytest.mark.asyncio
@pytest.mark.parametrize("repeated", [False, True])
@pytest.mark.parametrize("page_size", [100, 500])
async def test_catalogue_pages_and_bounds_sections(monkeypatch, repeated, page_size):
    active = peak = 0
    offsets = []

    class Client:
        async def get(self, url, headers=None, params=None):
            nonlocal active, peak
            if url.endswith("/library/sections"):
                data = {"Directory": [dict(key=str(i), type="movie", title=str(i)) for i in range(5)]}
            else:
                active += 1
                peak = max(peak, active)
                await asyncio.sleep(0.001)
                active -= 1
                start = params["X-Plex-Container-Start"]
                assert params["X-Plex-Container-Size"] == 500
                offsets.append(start)
                data = {
                    "totalSize": 501,
                    "Metadata": [
                        dict(ratingKey=str(i), title=str(i), type="movie")
                        for i in range(0 if repeated else start, page_size if repeated else min(start + page_size, 501))
                    ],
                }

            class Response:
                def raise_for_status(self):
                    pass

                def json(self):
                    return {"MediaContainer": data}

            return Response()

    @asynccontextmanager
    async def client(**kwargs):
        yield Client()

    monkeypatch.setattr(api, "shared_http_client", client)
    settings = Settings(plex_url="http://plex:32400", plex_token="token")
    if repeated:
        with pytest.raises(ValueError, match="repeated"):
            await api.fetch_plex_catalog(settings)
    else:
        result = await api.fetch_plex_catalog(settings)
        assert len(result["items"]) == 5 * 501
        assert offsets.count(0) == offsets.count(page_size) == 5
    assert peak == 3
