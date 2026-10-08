"""Page Version : les releases publiées depuis la version installée."""

import pytest

from app.routers import system_api
from app.routers.system_api import newer_releases, version_key


def test_version_key_reads_tags():
    assert version_key("v1.80.0") == (1, 80, 0)
    assert version_key("1.9.2-rc1") == (1, 9, 2)
    assert version_key("0.0.0-dev") == (0, 0, 0)
    assert version_key("nightly") is None


def test_only_newer_published_releases_are_kept_newest_first():
    releases = [
        {"tag_name": "v1.79.0"},
        {"tag_name": "v1.81.0", "name": "1.81"},
        {"tag_name": "v1.82.0"},
        {"tag_name": "v1.83.0", "draft": True},
        {"tag_name": "v1.83.0-rc1", "prerelease": True},
        {"tag_name": "nightly"},
    ]
    assert [release["tag_name"] for release in newer_releases(releases, "v1.80.0")] == ["v1.82.0", "v1.81.0"]


def test_unknown_current_version_lists_everything():
    assert len(newer_releases([{"tag_name": "v1.0.0"}], "unknown")) == 1


@pytest.mark.asyncio
async def test_refresh_forgets_the_cache(monkeypatch):
    calls = []

    async def latest():
        calls.append("latest")
        return {"tag_name": "v1.80.0"}

    async def releases():
        return [{"tag_name": "v1.81.0"}]

    monkeypatch.setattr(system_api, "_fetch_latest_release", latest)
    monkeypatch.setattr(system_api, "_fetch_releases", releases)
    monkeypatch.setattr(
        system_api, "_read_local_version", lambda: {"version": "v1.80.0", "git_sha": "abc", "branch": "main"}
    )
    forgotten = []
    monkeypatch.setattr(system_api, "forget_release_cache", lambda: forgotten.append(True))

    info = await system_api.get_version_info(refresh=True)
    assert forgotten == [True]
    assert [release["tag_name"] for release in info["releases_since"]] == ["v1.81.0"]


class _Resp:
    def __init__(self, status, data):
        self.status_code = status
        self._data = data

    def json(self):
        return self._data


class _Client:
    def __init__(self, response):
        self._response = response
        self.calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, *args, **kwargs):
        self.calls += 1
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


@pytest.mark.asyncio
async def test_releases_are_fetched_once_then_kept(monkeypatch):
    client = _Client(_Resp(200, [{"tag_name": "v1.81.0"}]))
    monkeypatch.setattr(system_api.httpx, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(system_api, "_releases_cache", None)
    monkeypatch.setattr(system_api, "_releases_cache_at", 0.0)

    assert await system_api._fetch_releases() == [{"tag_name": "v1.81.0"}]
    assert await system_api._fetch_releases() == [{"tag_name": "v1.81.0"}]
    assert client.calls == 1

    system_api.forget_release_cache()
    await system_api._fetch_releases()
    assert client.calls == 2


@pytest.mark.asyncio
async def test_github_errors_keep_what_was_known(monkeypatch):
    monkeypatch.setattr(system_api, "_releases_cache", [{"tag_name": "v1.80.0"}])
    monkeypatch.setattr(system_api, "_releases_cache_at", 0.0)
    monkeypatch.setattr(system_api.httpx, "AsyncClient", lambda **kwargs: _Client(_Resp(503, None)))
    assert await system_api._fetch_releases() == [{"tag_name": "v1.80.0"}]

    monkeypatch.setattr(system_api, "_releases_cache", None)
    monkeypatch.setattr(
        system_api.httpx, "AsyncClient", lambda **kwargs: _Client(system_api.httpx.ConnectError("hors ligne"))
    )
    assert await system_api._fetch_releases() == []

    monkeypatch.setattr(
        system_api.httpx, "AsyncClient", lambda **kwargs: _Client(_Resp(200, {"message": "pas une liste"}))
    )
    assert await system_api._fetch_releases() == []
