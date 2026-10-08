"""Le message de test qBittorrent n'écrit pas « vv5.2.4 »."""

import pytest

from app.services import download_clients


class _Resp:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        return None


class _Client:
    def __init__(self, text):
        self._text = text

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, *args, **kwargs):
        return _Resp(self._text)


@pytest.mark.asyncio
@pytest.mark.parametrize("answer", ["v5.2.4", "5.2.4", "v5.2.4\n"])
async def test_the_version_has_a_single_v(monkeypatch, answer):
    async def no_auth(client, url, username, password):
        return {}

    monkeypatch.setattr(download_clients, "qbittorrent_auth_cookies", no_auth)
    monkeypatch.setattr(download_clients.httpx, "AsyncClient", lambda *a, **k: _Client(answer))
    ok, message = await download_clients.check_qbittorrent("http://q", "", "")
    assert (ok, message) == (True, "Connecté à qBittorrent v5.2.4")
