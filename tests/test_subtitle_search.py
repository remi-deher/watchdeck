"""Recherche de sous-titres francais : Plex a la demande, Bazarr, et passage par lots."""

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import ArrInstance, LibraryItem, Settings
from app.services import bazarr, subtitle_search
from app.utils import now_utc_naive
from tests.async_support import make_test_session


def _stream(code: str, forced: bool = False):
    return SimpleNamespace(languageCode=code, language=code, title=None, displayTitle=code, forced=forced)


class FakeVideo:
    def __init__(self, title="Film", audio=("eng",), subs=(), results=("best",), fail_search=False, rating_key=1):
        self.title = title
        self.ratingKey = rating_key
        self.type = "movie"
        self._audio = [_stream(code) for code in audio]
        self._subs = [_stream(code, forced) for code, forced in subs]
        self._results = list(results)
        self._fail_search = fail_search
        self.downloaded = []

    # plexapi : media -> parts -> streams
    @property
    def media(self):
        part = SimpleNamespace(
            audioStreams=lambda: self._audio,
            subtitleStreams=lambda: self._subs,
        )
        return [SimpleNamespace(parts=[part])]

    def reload(self):
        return self

    def searchSubtitles(self, language="en", hearingImpaired=0, forced=0):
        if self._fail_search:
            raise RuntimeError("plex down")
        return self._results

    def downloadSubtitles(self, stream):
        self.downloaded.append(stream)
        return self


def test_wants_subtitle_only_without_french_audio_or_full_subtitle():
    assert subtitle_search._wants_subtitle(FakeVideo(audio=("eng",), subs=(("eng", False),)))
    assert subtitle_search._wants_subtitle(FakeVideo(audio=("eng",), subs=(("fre", True),)))  # force seul
    assert not subtitle_search._wants_subtitle(FakeVideo(audio=("eng",), subs=(("fre", False),)))
    assert not subtitle_search._wants_subtitle(FakeVideo(audio=("fre",)))


def test_download_best_outcomes():
    video = FakeVideo()
    assert subtitle_search._download_best(video, "fr") == "downloaded"
    assert video.downloaded == ["best"]
    assert subtitle_search._download_best(FakeVideo(results=()), "fr") == "not_found"
    assert subtitle_search._download_best(FakeVideo(fail_search=True), "fr") == "error"


def test_plex_search_for_show_targets_only_episodes_without_french():
    show = MagicMock()
    show.type = "show"
    missing = FakeVideo(title="E1", rating_key=1)
    covered = FakeVideo(title="E2", subs=(("fre", False),), rating_key=2)
    show.episodes.return_value = [missing, covered]
    with (
        patch("app.services.plex_finder.connect", return_value=MagicMock()),
        patch("app.services.plex_finder.find_item_in_libraries", return_value=show),
        patch("app.services.audio_analyzer.bulk_reload_episodes", return_value={1: missing}),
    ):
        result = subtitle_search.search_plex_subtitles_blocking("http://plex", "t", [], title="Serie", media_type="show")
    assert result == {
        "success": True,
        "provider": "plex",
        "targets": 1,
        "searched": 1,
        "downloaded": 1,
        "not_found": 0,
        "error": 0,
    }
    assert missing.downloaded and not covered.downloaded


def test_plex_search_reports_missing_media_and_connection_errors():
    with patch("app.services.plex_finder.connect", side_effect=RuntimeError("refused")):
        assert "Connexion Plex impossible" in subtitle_search.search_plex_subtitles_blocking("u", "t", [], title="X")["error"]
    with (
        patch("app.services.plex_finder.connect", return_value=MagicMock()),
        patch("app.services.plex_finder.find_item_in_libraries", return_value=None),
    ):
        assert "introuvable" in subtitle_search.search_plex_subtitles_blocking("u", "t", [], title="X")["error"]


def test_plex_search_for_movie():
    movie = FakeVideo()
    with (
        patch("app.services.plex_finder.connect", return_value=MagicMock()),
        patch("app.services.plex_finder.find_item_in_libraries", return_value=movie),
    ):
        result = subtitle_search.search_plex_subtitles_blocking("u", "t", [], title="Film")
    assert result["downloaded"] == 1 and result["targets"] == 1


def _item(db, **extra):
    values = {"title": "Film", "media_type": "movie", "sub_fr_status": "absent", "has_vf": False}
    values.update(extra)
    item = LibraryItem(**values)
    db.add(item)
    db.commit()
    return item


@pytest.mark.asyncio
async def test_auto_provider_uses_bazarr_when_it_knows_the_media():
    db = make_test_session()
    try:
        radarr = ArrInstance(name="Radarr", arr_type="radarr", url="http://radarr", api_key="k")
        baz = ArrInstance(name="Bazarr", arr_type="bazarr", url="http://bazarr", api_key="b")
        db.add_all([radarr, baz])
        db.commit()
        item = _item(db, arr_instance_id=radarr.id, arr_id=42)

        with patch(
            "app.services.bazarr.search_missing", new=AsyncMock(return_value=(True, "Recherche lancée dans Bazarr"))
        ) as search:
            result = await subtitle_search.search_for_item(db, item, Settings())
        search.assert_awaited_once_with("http://bazarr", "b", "movie", 42)
        assert result["provider"] == "bazarr"
        assert result["outcome"] == "requested"
        assert item.subtitle_searched_at is not None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_auto_provider_falls_back_to_plex_without_arr_link():
    db = make_test_session()
    try:
        db.add(ArrInstance(name="Bazarr", arr_type="bazarr", url="http://bazarr", api_key="b"))
        db.commit()
        item = _item(db)
        conn = SimpleNamespace(url="http://plex", token="t", libraries=[{"name": "Films"}])
        plex_result = {"success": True, "provider": "plex", "targets": 1, "downloaded": 0, "not_found": 1, "error": 0}
        with (
            patch("app.services.plex_servers.connection_for_item", new=AsyncMock(return_value=conn)),
            patch.object(subtitle_search, "search_plex_subtitles_blocking", return_value=plex_result) as plex,
        ):
            result = await subtitle_search.search_for_item(db, item, Settings(subtitle_search_provider="auto"))
        assert plex.call_args.args[2] == ["Films"]
        assert result["outcome"] == "not_found"
        assert "Aucun sous-titre" in result["message"]
    finally:
        db.close()


@pytest.mark.asyncio
async def test_bazarr_provider_requires_an_instance_and_an_arr_link():
    db = make_test_session()
    try:
        item = _item(db)
        result = await subtitle_search.search_for_item(db, item, Settings(), provider="bazarr")
        assert result["success"] is False and "Aucune instance Bazarr" in result["message"]

        db.add(ArrInstance(name="Bazarr", arr_type="bazarr", url="http://bazarr", api_key="b"))
        db.commit()
        result = await subtitle_search.search_for_item(db, item, Settings(), provider="bazarr")
        assert "pas rattaché" in result["message"]
        assert item.subtitle_search_result == "error"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_plex_provider_without_server_configured():
    db = make_test_session()
    try:
        item = _item(db)
        with patch("app.services.plex_servers.connection_for_item", new=AsyncMock(return_value=None)):
            result = await subtitle_search.search_for_item(db, item, Settings(), provider="plex")
        assert result["message"] == "Plex non configuré"
    finally:
        db.close()


def test_summary_and_outcome_messages():
    assert subtitle_search._outcome({"success": True, "provider": "plex", "targets": 0}) == "nothing_to_do"
    assert "Rien à chercher" in subtitle_search._summary({"success": True, "provider": "plex", "targets": 0})
    downloaded = {"success": True, "provider": "plex", "targets": 2, "downloaded": 2}
    assert subtitle_search._outcome(downloaded) == "requested"
    assert "2 sous-titre(s)" in subtitle_search._summary(downloaded)
    errored = {"success": True, "provider": "plex", "targets": 1, "downloaded": 0, "not_found": 0, "error": 1}
    assert subtitle_search._outcome(errored) == "error"
    assert "n'a pas pu" in subtitle_search._summary(errored)


@pytest.mark.asyncio
async def test_missing_batch_skips_recent_attempts_and_counts():
    db = make_test_session()
    try:
        db.add(Settings(subtitle_search_batch_size=5))
        fresh = _item(db, title="Jamais cherche")
        _item(db, title="Cherche hier", subtitle_searched_at=now_utc_naive() - timedelta(days=1))
        _item(db, title="Deja VF", has_vf=True)
        _item(db, title="ST ok", sub_fr_status="ok")
        assert await subtitle_search.count_missing(db) == {"missing": 2, "due": 1}

        async def fake_search(session, item, settings=None, provider=None):
            if item.id != fresh.id:
                raise AssertionError("seul le media jamais cherche est du")
            return {"outcome": "requested"}

        with (
            patch.object(subtitle_search, "AsyncSessionLocal", return_value=db),
            patch.object(subtitle_search, "search_for_item", new=fake_search),
        ):
            result = await subtitle_search.search_missing_batch()
        assert result == {"processed": 1, "outcomes": {"requested": 1}}

        async def failing(session, item, settings=None, provider=None):
            raise RuntimeError("boom")

        with (
            patch.object(subtitle_search, "AsyncSessionLocal", return_value=db),
            patch.object(subtitle_search, "search_for_item", new=failing),
        ):
            result = await subtitle_search.search_missing_batch()
        assert result["outcomes"] == {"error": 1}
    finally:
        db.close()


@pytest.mark.asyncio
async def test_bazarr_client_calls():
    ok_status = MagicMock(status_code=200)
    ok_status.json.return_value = {"data": {"bazarr_version": "1.5.1"}}
    with patch("app.services.bazarr.ArrClient.get", new=AsyncMock(return_value=ok_status)):
        assert await bazarr.check_connection("http://bazarr", "k") == (True, "Bazarr connecté (v1.5.1)")
    with patch("app.services.bazarr.ArrClient.get", new=AsyncMock(return_value=MagicMock(status_code=401))):
        assert (await bazarr.check_connection("http://bazarr", "k"))[0] is False
    with patch("app.services.bazarr.ArrClient.get", new=AsyncMock(side_effect=RuntimeError("down"))):
        assert "injoignable" in (await bazarr.check_connection("http://bazarr", "k"))[1]

    with patch("app.services.bazarr.ArrClient._request", new=AsyncMock(return_value=MagicMock(status_code=204))) as req:
        assert (await bazarr.search_missing("http://bazarr", "k", "show", 7))[0] is True
    assert req.call_args.args == ("PATCH", "/api/series")
    assert req.call_args.kwargs["params"] == {"seriesid": 7, "action": "search-missing"}
    with patch("app.services.bazarr.ArrClient._request", new=AsyncMock(return_value=MagicMock(status_code=404))):
        assert "ne connaît pas" in (await bazarr.search_missing("http://bazarr", "k", "movie", 7))[1]

    wanted = MagicMock(status_code=200)
    wanted.json.return_value = {"total": 12, "data": []}
    with patch("app.services.bazarr.ArrClient.get", new=AsyncMock(return_value=wanted)):
        assert await bazarr.wanted_counts("http://bazarr", "k") == {"connected": True, "movies": 12, "episodes": 12}
