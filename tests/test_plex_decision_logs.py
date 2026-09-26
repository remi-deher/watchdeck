from datetime import datetime, timedelta

from app.services.playback_activity import parse_plex_sessions
from app.services.plex_decision_logs import _utc_offset, match_decision, parse_decisions

# Extrait reel (2026-09-26) : Plex Web force a 720 kb/s, puis une lecture 5.1 sur un
# lecteur stereo. Seules les lignes utiles au parseur sont gardees, plus du bruit.
LOG = """\
Sep 26, 2026 22:48:26.451 [140562] DEBUG - Request: [10.0.0.2:62048 (Allowed Network (Subnet))] GET /video/:/transcode/universal/decision?hasMDE=1&path=%2Flibrary%2Fmetadata%2F40859&directPlay=0&directStream=1&location=lan&session=e0u2xhmoixv6v6vvbea8jbt9 (27 live) #48355 TLS GZIP Signed-in Token (remi) / Accept => application/json
Sep 26, 2026 22:48:26.457 [140562] DEBUG - [Req#48355/Transcode] MDE: Selected protocol dash; container: mp4
Sep 26, 2026 22:48:26.457 [140562] DEBUG - [Req#48355/Transcode] MDE: analyzing media item 60863
Sep 26, 2026 22:48:26.457 [140562] DEBUG - [Req#48355/Transcode] MDE: E1 - Épisode 1: Direct Play is disabled
Sep 26, 2026 22:48:26.457 [140562] DEBUG - [Req#48355/Transcode] MDE: E1 - Épisode 1: no direct play video profile exists for http/mkv/hevc/aac
Sep 26, 2026 22:48:26.457 [140562] DEBUG - [Req#48355/Transcode] MDE: E1 - Épisode 1: no direct play video profile exists for http/mkv/hevc/aac
Sep 26, 2026 22:48:26.457 [140562] DEBUG - [Req#48355/Transcode] Streaming Resource: Reached Decision id=40859 codes=(General=1001,Direct play not available; Conversion OK. Direct Play=3000,App cannot direct play this item. Direct play is disabled. Transcode=1001,Direct play not available; Conversion OK.) media=(id=60863 part=(id=60863 decision=transcode))
Sep 26, 2026 22:48:27.111 [140562] DEBUG - Content-Length of /transcode/init-stream1.m4s is 745 (of total: 745).
Sep 26, 2026 22:49:57.977 [140562] DEBUG - [Req#48b49/Transcode] Streaming Resource: Reached Decision id=5192 codes=(General=1001,Direct play not available; Conversion OK. Direct Play=3000,This app cannot play this item. The reason is: audio.channels limitation applies: 6 > 2. Transcode=1001,Direct play not available; Conversion OK.) media=(id=18378)
"""


def test_parse_decisions_reads_codes_details_and_client_params():
    first, second = parse_decisions(LOG)

    assert first.rating_key == "40859"
    assert first.session == "e0u2xhmoixv6v6vvbea8jbt9"
    assert first.at == datetime(2026, 9, 26, 22, 48, 26, 457000)
    assert (first.general_code, first.direct_play_code, first.transcode_code) == (1001, 3000, 1001)
    assert first.direct_play_text == "App cannot direct play this item. Direct play is disabled."
    # Titre retire, doublons et lignes de routine ecartes.
    assert first.details == ["Direct Play is disabled", "no direct play video profile exists for http/mkv/hevc/aac"]
    assert first.client == {"location": "lan", "directPlay": "0", "directStream": "1"}

    assert second.rating_key == "5192"
    assert second.session is None
    assert second.direct_play_text.endswith("audio.channels limitation applies: 6 > 2.")


def test_mde_code_is_a_reason_only_when_direct_play_is_refused():
    line = (
        "Sep 26, 2026 23:01:28.870 [1] DEBUG - [Req#4d6ea/Transcode] Streaming Resource: Reached Decision"
        " id=2444 codes=(MDE={code},{text}) media=(id=17180)"
    )
    (ok,) = parse_decisions(line.format(code=1000, text="Direct play OK."))
    assert (ok.mde_code, ok.mde_text) == (1000, "Direct play OK.")
    assert ok.reason == (None, None)
    (refused,) = parse_decisions(line.format(code=3001, text="Not enough bandwidth for direct play of this item."))
    assert refused.reason == (3001, "Not enough bandwidth for direct play of this item.")
    (first, _) = parse_decisions(LOG)
    assert first.reason == (3000, "App cannot direct play this item. Direct play is disabled.")


def test_parse_decisions_converts_local_time_to_utc():
    (first, _) = parse_decisions(LOG, utc_offset=timedelta(hours=2))
    assert first.at == datetime(2026, 9, 26, 20, 48, 26, 457000)


def test_utc_offset_rounds_to_quarter_hour():
    assert _utc_offset(LOG, datetime(2026, 9, 26, 20, 49, 58)) == timedelta(hours=2)
    assert _utc_offset(LOG, None) == timedelta(0)


def test_match_decision_prefers_transcoder_session_and_latest_in_window():
    decisions = parse_decisions(LOG)
    started = datetime(2026, 9, 26, 22, 48, 27)

    assert match_decision(decisions, rating_key="40859", started_at=started, ended_at=None).direct_play_code == 3000
    assert (
        match_decision(
            decisions, rating_key="40859", started_at=started, ended_at=None, session_ids={"e0u2xhmoixv6v6vvbea8jbt9"}
        ).session
        == "e0u2xhmoixv6v6vvbea8jbt9"
    )
    # Decision prise bien avant la lecture : c'en est une autre.
    assert match_decision(decisions, rating_key="40859", started_at=started + timedelta(hours=1), ended_at=None) is None
    assert match_decision(decisions, rating_key=None, started_at=started, ended_at=None) is None


def _sessions_xml(transcode: str, video_stream: str = "", subtitle: str = "") -> str:
    return f"""<MediaContainer size="1"><Video ratingKey="1" title="T" type="movie" viewOffset="0" duration="1000">
<Media videoResolution="1080"><Part decision="transcode">{video_stream}{subtitle}</Part></Media>
<User title="u"/><Player title="p" state="playing"/><Session id="s1" bandwidth="1" location="lan"/>
{transcode}</Video></MediaContainer>"""


def test_deduced_reason_names_what_plex_converts():
    xml = _sessions_xml(
        '<TranscodeSession key="/transcode/sessions/abc" videoDecision="transcode" audioDecision="transcode"'
        ' sourceVideoCodec="hevc" videoCodec="h264" sourceAudioCodec="truehd" audioCodec="aac"'
        ' transcodeHwEncodingTitle="Intel (VA API)"/>'
    )
    (session,) = parse_plex_sessions(xml)
    assert session["transcode_reason"] == "Vidéo HEVC → H.264 · Audio TrueHD → AAC"
    assert session["transcode_hw"] == "Intel (VA API)"
    assert session["transcode_session"] == "abc"


def test_deduced_reason_quality_change_and_subtitles_only():
    quality = _sessions_xml(
        '<TranscodeSession videoDecision="transcode" audioDecision="copy" sourceVideoCodec="hevc" videoCodec="hevc"/>',
        video_stream='<Stream streamType="1" height="404" decision="transcode"/>',
    )
    assert parse_plex_sessions(quality)[0]["transcode_reason"] == "Vidéo réencodée en 404p (qualité ou débit)"
    assert parse_plex_sessions(quality)[0]["transcode_hw"] == "Processeur"

    subtitles = _sessions_xml(
        '<TranscodeSession videoDecision="copy" audioDecision="copy" subtitleDecision="transcode"/>',
        subtitle='<Stream streamType="3" codec="webvtt" selected="1" decision="transcode"/>',
    )
    assert (
        parse_plex_sessions(subtitles)[0]["transcode_reason"] == "Sous-titres WebVTT convertis (vidéo et audio copiés)"
    )


def test_direct_play_has_no_reason():
    (session,) = parse_plex_sessions(_sessions_xml(""))
    assert session["transcode_reason"] is None
    assert session["transcode_hw"] is None


from unittest.mock import AsyncMock, patch  # noqa: E402

import pytest  # noqa: E402

from app.models import PlaybackSession, Settings  # noqa: E402
from app.services import playback_activity  # noqa: E402


@pytest.mark.asyncio
async def test_enrichment_attaches_plex_decision_and_serializes_green_then_orange(async_db):
    now = datetime(2026, 9, 26, 22, 50)
    async_db.add(Settings(id=1, plex_url="http://plex.local:32400", plex_token="t"))
    transcoded = PlaybackSession(
        source="plex",
        source_session_id="a",
        title="T",
        rating_key="40859",
        playback_method="transcode",
        video_decision="transcode",
        transcode_reason="Vidéo réencodée en 404p (qualité ou débit)",
        started_at=datetime(2026, 9, 26, 22, 48, 27),
        last_seen_at=now,
    )
    unmatched = PlaybackSession(
        source="plex",
        source_session_id="b",
        title="U",
        rating_key="999",
        playback_method="transcode",
        audio_decision="transcode",
        started_at=datetime(2026, 9, 26, 22, 40),
        last_seen_at=now,
    )
    async_db.add_all([transcoded, unmatched])
    async_db.commit()

    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        patch.object(playback_activity, "now_utc_naive", return_value=now),
        patch.object(
            playback_activity.plex_decision_logs,
            "fetch_decisions",
            new=AsyncMock(return_value=(parse_decisions(LOG), datetime(2026, 9, 26, 20))),
        ),
        patch.object(playback_activity, "publish", new=AsyncMock()),
    ):
        result = await playback_activity.enrich_decisions_from_plex_logs(force=True)

    assert result["matched"] == 1
    reason = playback_activity._serialize(transcoded)["transcode_reason"]
    assert reason["source"] == "plex"
    assert reason["code"] == 3000
    assert reason["text"] == "App cannot direct play this item. Direct play is disabled."
    assert reason["deduced"] == "Vidéo réencodée en 404p (qualité ou débit)"
    assert reason["client"]["location"] == "lan"
    # Ancienne lecture sans décision retrouvée : raison déduite de ses seules décisions.
    assert playback_activity._serialize(unmatched)["transcode_reason"] == {
        "source": "deduced",
        "text": "Audio converti",
    }


@pytest.mark.asyncio
async def test_enrichment_skips_download_without_candidates(async_db):
    async_db.add(Settings(id=1, plex_url="http://plex.local:32400", plex_token="t"))
    async_db.commit()
    fetch = AsyncMock()
    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        patch.object(playback_activity.plex_decision_logs, "fetch_decisions", new=fetch),
    ):
        result = await playback_activity.enrich_decisions_from_plex_logs(force=True)
    assert result["status"] == "nothing_to_match"
    fetch.assert_not_called()


def test_nan_transcoder_speed_is_dropped():
    xml = _sessions_xml(
        '<TranscodeSession speed="nan" maxOffsetAvailable="10" videoDecision="copy" audioDecision="copy"/>'
    )
    assert parse_plex_sessions(xml)[0]["transcode_speed"] is None
    row = PlaybackSession(source="plex", source_session_id="x", title="T", transcode_speed=float("nan"))
    assert playback_activity._serialize(row)["transcode_speed"] is None


def _plex_transport(debug: bool, archive_files: dict[str, str], date: str = "Sat, 26 Sep 2026 20:50:00 GMT"):
    """Faux serveur Plex : préférences et zip des journaux."""
    import io
    import zipfile

    import httpx

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in archive_files.items():
            archive.writestr(name, content)
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/:/prefs":
            settings = [{"id": "logDebug", "value": debug}, {"id": "LogVerbose", "value": False}]
            return httpx.Response(200, json={"MediaContainer": {"Setting": settings}})
        return httpx.Response(200, content=buffer.getvalue(), headers={"date": date})

    return httpx.MockTransport(handler), calls


@pytest.mark.asyncio
async def test_fetch_decisions_reads_every_rotated_log_in_utc():
    import httpx

    from app.services import plex_decision_logs

    older = LOG.splitlines()[0] + "\n" + LOG.splitlines()[6] + "\n"  # la décision 40859, dans le .1
    newer = "\n".join(LOG.splitlines()[8:]) + "\n"  # la décision 5192, dans le fichier courant
    transport, calls = _plex_transport(True, {"Plex Media Server.log": newer, "Plex Media Server.1.log": older})
    real_client = httpx.AsyncClient
    with patch.object(plex_decision_logs.httpx, "AsyncClient", lambda **kw: real_client(transport=transport)):
        decisions, oldest = await plex_decision_logs.fetch_decisions("http://plex.local/", "t")

    assert calls == ["/:/prefs", "/diagnostics/logs"]
    # Plex en UTC+2 : l'en-tête Date le révèle, toutes les heures sont ramenées en UTC.
    assert [d.rating_key for d in decisions] == ["40859", "5192"]
    assert decisions[0].at == datetime(2026, 9, 26, 20, 48, 26, 457000)
    assert oldest == datetime(2026, 9, 26, 20, 48, 26, 451000)


@pytest.mark.asyncio
async def test_fetch_decisions_downloads_nothing_without_debug_logs():
    import httpx

    from app.services import plex_decision_logs

    transport, calls = _plex_transport(False, {"Plex Media Server.log": LOG})
    real_client = httpx.AsyncClient
    with patch.object(plex_decision_logs.httpx, "AsyncClient", lambda **kw: real_client(transport=transport)):
        assert await plex_decision_logs.fetch_decisions("http://plex.local", "t") == ([], None)
    assert calls == ["/:/prefs"]


@pytest.mark.asyncio
async def test_fetch_decisions_tolerates_missing_date_and_logs():
    import httpx

    from app.services import plex_decision_logs

    transport, _ = _plex_transport(True, {"Plex Media Scanner.log": "x"}, date="")
    real_client = httpx.AsyncClient
    with patch.object(plex_decision_logs.httpx, "AsyncClient", lambda **kw: real_client(transport=transport)):
        assert await plex_decision_logs.fetch_decisions("http://plex.local", "t") == ([], None)


def test_utc_offset_without_parsable_line_is_zero():
    assert _utc_offset("garbage\n", datetime(2026, 9, 26)) == timedelta(0)


@pytest.mark.asyncio
async def test_enrichment_is_throttled_and_backs_off_when_debug_logs_are_off(async_db):
    now = datetime(2026, 9, 26, 22, 50)
    async_db.add(Settings(id=1, plex_url="http://plex.local:32400", plex_token="t"))
    async_db.add(
        PlaybackSession(
            source="plex",
            source_session_id="a",
            title="T",
            rating_key="1",
            playback_method="transcode",
            started_at=now - timedelta(minutes=5),
            last_seen_at=now,
        )
    )
    async_db.commit()
    fetch = AsyncMock(return_value=([], None))
    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        patch.object(playback_activity, "now_utc_naive", return_value=now),
        patch.object(playback_activity.plex_decision_logs, "fetch_decisions", new=fetch),
        patch.object(playback_activity, "_decision_next_attempt", None),
    ):
        assert (await playback_activity.enrich_decisions_from_plex_logs())["status"] == "debug_logs_disabled"
        # Débogage coupé : on ne redemande pas à chaque collecte.
        assert (await playback_activity.enrich_decisions_from_plex_logs())["status"] == "throttled"
        assert playback_activity._decision_next_attempt == now + playback_activity._DECISION_RETRY_DISABLED
    assert fetch.await_count == 1


@pytest.mark.asyncio
async def test_enrichment_without_plex_settings_is_disabled(async_db):
    with patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db):
        assert (await playback_activity.enrich_decisions_from_plex_logs(force=True))["status"] == "disabled"


@pytest.mark.asyncio
async def test_collection_survives_unreadable_plex_logs():
    with (
        patch.object(
            playback_activity, "_collect_plex_activity_unlocked", new=AsyncMock(return_value={"status": "complete"})
        ),
        patch.object(playback_activity, "acquire_distributed_lock", new=AsyncMock(return_value="tok")),
        patch.object(playback_activity, "release_distributed_lock", new=AsyncMock()),
        patch.object(
            playback_activity, "enrich_decisions_from_plex_logs", new=AsyncMock(side_effect=RuntimeError("zip"))
        ),
    ):
        assert await playback_activity.collect_plex_activity() == {"status": "complete"}
