"""État des connexions : chaque instance est vérifiée une à une, sans jamais lever."""

import asyncio
from types import SimpleNamespace

import pytest

from app.routers import connections_api
from app.routers.connections_api import activity_entry, arr_entry, seer_entry, timed


@pytest.mark.asyncio
async def test_timed_reads_both_shapes_of_check():
    async def pair():
        return True, "Sonarr 4.0.9"

    async def flag():
        return False

    assert (await timed(pair()))[:2] == (True, "Sonarr 4.0.9")
    # Prowlarr ne renvoie qu'un booléen : le message est alors déduit.
    assert (await timed(flag()))[:2] == (False, "Connexion impossible")


@pytest.mark.asyncio
async def test_a_failing_check_becomes_an_error_line(monkeypatch):
    async def boom():
        raise ConnectionRefusedError("Connexion refusée")

    ok, message, ms = await timed(boom())
    assert (ok, message, ms) == (False, "Connexion refusée", None)


@pytest.mark.asyncio
async def test_a_slow_check_is_cut(monkeypatch):
    monkeypatch.setattr(connections_api, "CHECK_TIMEOUT_SECONDS", 0.01)

    async def slow():
        await asyncio.sleep(1)
        return True, "trop tard"

    ok, message, _ = await timed(slow())
    assert ok is False
    assert message.startswith("Pas de réponse")


def _instance(**extra):
    base = {
        "id": 7,
        "arr_type": "radarr",
        "name": "Radarr 4K",
        "url": "http://radarr4k:7878",
        "api_key": "k",
        "enabled": True,
        "is_default": False,
    }
    return SimpleNamespace(**{**base, **extra})


@pytest.mark.asyncio
async def test_each_arr_instance_gets_its_own_line(monkeypatch):
    async def down(url, api_key):
        return False, "Connexion refusée"

    async def no_details(*args, **kwargs):
        return {"version": "5.8.3"}

    monkeypatch.setitem(connections_api._ARR_CHECKS, "radarr", down)
    monkeypatch.setattr(connections_api.health_details, "arr_details", no_details)

    line = await arr_entry(_instance())
    assert line["key"] == "arr-7"
    assert line["state"] == "error"
    assert line["message"] == "Connexion refusée"
    # Les détails ne s'affichent que pour une instance qui répond.
    assert "version" not in line


@pytest.mark.asyncio
async def test_a_disabled_instance_is_not_contacted(monkeypatch):
    async def never(url, api_key):
        raise AssertionError("une instance désactivée ne doit pas être contactée")

    monkeypatch.setitem(connections_api._ARR_CHECKS, "radarr", never)
    line = await arr_entry(_instance(enabled=False))
    assert line["state"] == "off"


@pytest.mark.asyncio
async def test_optional_services_are_off_until_enabled():
    settings = SimpleNamespace(
        seer_enabled=False, tracearr_enabled=False, tautulli_enabled=True, tautulli_url=None, tautulli_api_key=None
    )
    assert (await seer_entry(settings))["state"] == "off"
    assert (await activity_entry("tracearr", settings))["state"] == "off"
    tautulli = await activity_entry("tautulli", settings)
    assert tautulli["state"] == "off"
    assert "manquante" in tautulli["message"]


@pytest.mark.asyncio
async def test_plex_line_carries_its_details_when_it_answers(monkeypatch):
    from app.services import plex_api

    async def up(url, token, verify_ssl=True):
        return True, "Plex joignable"

    async def details(url, token, verify_ssl=True):
        return {"version": "1.41.2", "sessions": 2, "platform": "Linux"}

    monkeypatch.setattr(plex_api, "check_connection", up)
    monkeypatch.setattr(connections_api.health_details, "plex_details", details)
    settings = SimpleNamespace(plex_url="http://plex:32400", plex_token="t", plex_verify_ssl=True)

    line = await connections_api.plex_entry(settings)
    assert line["state"] == "ok"
    assert line["version"] == "1.41.2"
    assert line["sessions"] == 2
    assert "platform" not in line
    assert (await connections_api.plex_entry(None))["state"] == "off"


@pytest.mark.asyncio
async def test_tmdb_is_off_without_a_key_and_checked_with_one(monkeypatch):
    from app.services import tmdb

    async def no_key(db):
        return None

    monkeypatch.setattr(tmdb, "_api_key", no_key)
    assert (await connections_api.tmdb_entry(object()))["state"] == "off"

    async def key(db):
        return "k"

    async def check(db, api_key=None):
        return True, "Clé valide"

    monkeypatch.setattr(tmdb, "_api_key", key)
    monkeypatch.setattr(tmdb, "check_connection", check)
    line = await connections_api.tmdb_entry(object())
    assert (line["state"], line["message"]) == ("ok", "Clé valide")
    # Désactivé dans les réglages : on ne le contacte pas, même avec une clé.
    assert (await connections_api.tmdb_entry(object(), SimpleNamespace(tmdb_enabled=False)))["state"] == "off"


@pytest.mark.asyncio
async def test_configured_services_are_checked(monkeypatch):
    from app.services import playback_activity, seer, tracearr

    async def up(url, key):
        return True, "OK"

    async def down(url, key):
        return False, "Clé refusée"

    monkeypatch.setattr(seer, "check_connection", up)
    monkeypatch.setattr(tracearr, "test_tracearr", down)
    monkeypatch.setattr(playback_activity, "test_tautulli", up)
    settings = SimpleNamespace(
        seer_enabled=True,
        seer_url="http://seer",
        seer_api_key="k",
        tracearr_enabled=True,
        tracearr_url="http://tracearr",
        tracearr_api_key="k",
        tautulli_enabled=True,
        tautulli_url="http://tautulli",
        tautulli_api_key="k",
    )
    assert (await seer_entry(settings))["state"] == "ok"
    assert (await activity_entry("tracearr", settings))["state"] == "error"
    assert (await activity_entry("tautulli", settings))["state"] == "ok"


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return self._rows


class _Db:
    """Deux lectures : les réglages, puis les instances."""

    def __init__(self, settings, instances):
        self._answers = [_Result([settings]), _Result(instances)]

    async def execute(self, _query):
        return self._answers.pop(0)


@pytest.mark.asyncio
async def test_collect_lists_plex_every_instance_then_the_others(monkeypatch):
    async def line(*args, **kwargs):
        return {"key": "x"}

    async def arr(inst):
        return {"key": f"arr-{inst.id}"}

    async def plex(s):
        return {"key": "plex"}

    async def tmdb(db, s=None):
        return {"key": "tmdb"}

    async def activity(kind, s):
        return {"key": kind}

    async def seer(s):
        return {"key": "seer"}

    monkeypatch.setattr(connections_api, "plex_entry", plex)
    monkeypatch.setattr(connections_api, "arr_entry", arr)
    monkeypatch.setattr(connections_api, "tmdb_entry", tmdb)
    monkeypatch.setattr(connections_api, "activity_entry", activity)
    monkeypatch.setattr(connections_api, "seer_entry", seer)

    payload = await connections_api.collect(_Db(SimpleNamespace(), [_instance(id=1), _instance(id=2)]))
    assert [item["key"] for item in payload["items"]] == [
        "plex",
        "arr-1",
        "arr-2",
        "seer",
        "tracearr",
        "tautulli",
        "tmdb",
    ]
    assert payload["checked_at"]


@pytest.mark.asyncio
async def test_status_is_cached_unless_a_refresh_is_asked(monkeypatch):
    calls = []
    stored = {}

    async def collect(db):
        calls.append(1)
        return {"checked_at": "t", "items": [len(calls)]}

    async def get_json(key):
        return stored.get(key)

    async def set_json(key, value, ttl_seconds):
        stored[key] = value

    monkeypatch.setattr(connections_api, "collect", collect)
    monkeypatch.setattr(connections_api.cache, "get_json", get_json)
    monkeypatch.setattr(connections_api.cache, "set_json", set_json)

    first = await connections_api.connections_status(refresh=False, db=None)
    again = await connections_api.connections_status(refresh=False, db=None)
    forced = await connections_api.connections_status(refresh=True, db=None)
    assert first == again == {"checked_at": "t", "items": [1]}
    assert forced["items"] == [2]
