from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.arr_common import get_wanted_missing


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class _Client:
    def __init__(self, responses):
        self.get = AsyncMock(side_effect=responses)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None


@pytest.mark.asyncio
async def test_wanted_missing_reads_every_page():
    client = _Client(
        [
            _Response(
                {
                    "totalRecords": 3,
                    "records": [
                        {
                            "id": 1,
                            "seriesId": 9,
                            "title": "Épisode 1",
                            "series": {
                                "title": "Série test",
                                "images": [{"coverType": "poster", "remoteUrl": "https://images.test/poster.jpg"}],
                            },
                        },
                        {"id": 2, "title": "Film 2"},
                    ],
                }
            ),
            _Response({"totalRecords": 3, "records": [{"id": 3, "title": "Film 3"}]}),
        ]
    )
    instance = SimpleNamespace(id=4, name="Sonarr", arr_type="sonarr", url="http://sonarr", api_key="key")

    with patch("app.services.arr_common.httpx.AsyncClient", return_value=client):
        rows = await get_wanted_missing(instance, page_size=2)

    assert [row["id"] for row in rows] == [1, 2, 3]
    assert rows[0]["series_title"] == "Série test"
    assert rows[0]["poster_url"] == "https://images.test/poster.jpg"
    assert client.get.await_args_list[0].kwargs["params"]["page"] == 1
    assert client.get.await_args_list[1].kwargs["params"]["page"] == 2
    assert client.get.await_args_list[0].kwargs["params"]["includeSeries"] == "true"
    assert client.get.await_args_list[0].kwargs["params"]["includeImages"] == "true"


@pytest.mark.asyncio
async def test_wanted_missing_propagates_instance_failure():
    client = _Client([RuntimeError("instance indisponible")])
    instance = SimpleNamespace(id=4, name="Radarr", arr_type="radarr", url="http://radarr", api_key="key")

    with patch("app.services.arr_common.httpx.AsyncClient", return_value=client):
        with pytest.raises(RuntimeError, match="indisponible"):
            await get_wanted_missing(instance)
