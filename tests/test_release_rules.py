"""Règles de sélection des releases : une seule source pour le filtre et pour l'outil de test."""

from types import SimpleNamespace

import pytest

from app.routers import acquisition_api
from app.routers.acquisition_api import ReleaseCheckBody, client_status, release_check, torrent_counts
from app.services.release_rules import GIB, release_accepted, release_checks, rules_for
from app.services.watchlist_poller import _filter_torrent_results


def _settings(**extra):
    base = dict(
        torrent_required_keywords="multi, VFF",
        torrent_forbidden_keywords="cam",
        torrent_min_size_gb=1.0,
        torrent_max_size_gb=60.0,
        torrent_split_by_type=False,
        torrent_show_required_keywords="vostfr",
        torrent_show_forbidden_keywords="",
        torrent_show_min_size_gb=0.2,
        torrent_show_max_size_gb=8.0,
    )
    base.update(extra)
    return SimpleNamespace(**base)


def test_each_rule_says_why():
    checks = release_checks("Dune.2024.MULTi.1080p", 12, rules_for(_settings()))
    assert [check["ok"] for check in checks] == [True, True, True]
    assert checks[0]["message"] == "Contient « multi »"

    rejected = release_checks("Dune.2024.CAM", 0.5, rules_for(_settings()))
    assert [check["ok"] for check in rejected] == [False, False, False]
    assert "sous le minimum" in rejected[2]["message"]


def test_unknown_size_is_not_judged():
    checks = release_checks("Dune MULTI", None, rules_for(_settings()))
    assert checks[2] == {"rule": "size", "ok": True, "message": "Taille non jugée (inconnue)"}


def test_series_use_their_own_rules_only_when_split():
    shared = rules_for(_settings(), "show")
    assert shared.required == ("multi", "vff")
    split = rules_for(_settings(torrent_split_by_type=True), "show")
    assert (split.required, split.max_gb) == (("vostfr",), 8.0)
    # Les films gardent toujours les règles générales.
    assert rules_for(_settings(torrent_split_by_type=True), "movie").required == ("multi", "vff")


def test_the_search_filter_applies_the_same_rules():
    results = [
        {"title": "Show.S01E01.MULTi", "size": 2 * GIB},
        {"title": "Show.S01E01.VOSTFR", "size": 2 * GIB},
        {"title": "Show.S01E01.MULTi.CAM", "size": 2 * GIB},
    ]
    assert [r["title"] for r in _filter_torrent_results(results, _settings(), "show")] == ["Show.S01E01.MULTi"]
    split = _settings(torrent_split_by_type=True)
    assert [r["title"] for r in _filter_torrent_results(results, split, "show")] == ["Show.S01E01.VOSTFR"]
    assert release_accepted("Film MULTI", 5 * GIB, rules_for(_settings())) is True


def test_torrent_counts_read_both_clients():
    torrents = [{"state": "downloading"}, {"state": "stalledUP"}, {"state": "seeding"}, {"state": "pausedDL"}]
    assert torrent_counts(torrents) == {"downloading": 1, "seeding": 2, "total": 4}


class _Db:
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, _query):
        rows = self._rows

        class _R:
            def scalars(self):
                return self

            def first(self):
                return rows[0] if rows else None

            def all(self):
                return rows

        return _R()


@pytest.mark.asyncio
async def test_release_check_uses_the_saved_rules():
    body = ReleaseCheckBody(title="Dune.2024.VFF.CAM", size_gb=4, media_type="movie")
    result = await release_check(body, db=_Db([_settings()]))
    assert result["accepted"] is False
    assert [check["rule"] for check in result["checks"] if not check["ok"]] == ["forbidden"]


@pytest.mark.asyncio
async def test_client_status_reports_counts_or_the_failure(monkeypatch):
    async def up(*args):
        return True, "Connecté à qBittorrent v4.6.5"

    async def torrents(*args):
        return [{"state": "downloading"}, {"state": "uploading"}]

    async def down(*args):
        return False, "Échec d'authentification ou connexion impossible"

    client = SimpleNamespace(
        id=1, name="qBittorrent", client_type="qbittorrent", url="http://q", username="", password="", enabled=True
    )
    monkeypatch.setattr(acquisition_api.download_clients, "check_client_connection", up)
    monkeypatch.setattr(acquisition_api.download_clients, "list_client_torrents", torrents)
    line = await client_status(client)
    assert (line["state"], line["downloading"], line["seeding"]) == ("ok", 1, 1)

    monkeypatch.setattr(acquisition_api.download_clients, "check_client_connection", down)
    assert (await client_status(client))["state"] == "error"
    client.enabled = False
    assert (await client_status(client))["state"] == "off"


@pytest.mark.asyncio
async def test_clients_status_is_cached_unless_refreshed(monkeypatch):
    stored = {}
    calls = []

    async def get_json(key):
        return stored.get(key)

    async def set_json(key, value, ttl_seconds):
        stored[key] = value

    async def status(client):
        calls.append(client)
        return {"id": client.id, "state": "ok"}

    monkeypatch.setattr(acquisition_api.cache, "get_json", get_json)
    monkeypatch.setattr(acquisition_api.cache, "set_json", set_json)
    monkeypatch.setattr(acquisition_api, "client_status", status)
    db = _Db([SimpleNamespace(id=1)])
    first = await acquisition_api.download_clients_status(refresh=False, db=db)
    await acquisition_api.download_clients_status(refresh=False, db=db)
    await acquisition_api.download_clients_status(refresh=True, db=db)
    assert first["items"] == [{"id": 1, "state": "ok"}]
    assert len(calls) == 2
