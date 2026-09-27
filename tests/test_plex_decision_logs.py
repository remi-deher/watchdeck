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


# Episode reel (2026-09-27) : piste FR stereo ecoutee, VO japonaise et anglaise 5.1 dans le
# fichier, sous-titres ASS forces convertis en WebVTT pour un Chromecast.
FLIBUSTIERS_STREAMS = [
    {"id": "11", "streamType": "2", "codec": "aac", "channels": "2", "language": "Français", "selected": "1"},
    {"id": "12", "streamType": "2", "codec": "aac", "channels": "6", "language": "日本語"},
    {"id": "13", "streamType": "2", "codec": "aac", "channels": "6", "language": "English"},
    {"id": "21", "streamType": "3", "codec": "ass", "language": "Français", "title": "Fr Forced"},
]
FLIBUSTIERS_SESSION = """<MediaContainer size="1"><Video ratingKey="5198" sessionKey="9" title="Les flibustiers de la nuit"
 type="episode" viewOffset="0" duration="1000"><Media><Part decision="transcode">
<Stream id="11" streamType="2" codec="aac" channels="2" selected="1" decision="copy"/>
<Stream id="21" streamType="3" codec="webvtt" selected="1" decision="transcode" location="sidecar"/>
</Part></Media><User title="u"/><Player title="Chromecast" state="playing"/><Session id="s9" bandwidth="1" location="wan"/>
<TranscodeSession key="/transcode/sessions/1pi9" videoDecision="copy" audioDecision="copy" subtitleDecision="transcode"/>
</Video></MediaContainer>"""
FLIBUSTIERS_SHEET = {"container": "mkv", "streams": FLIBUSTIERS_STREAMS}
CHANNELS_TEXT = "This app cannot play this item. The reason is: audio.channels limitation applies: 6 > 2."


def test_subtitle_reason_names_the_source_format_when_known():
    (session,) = parse_plex_sessions(FLIBUSTIERS_SESSION, media_sheets={"5198": FLIBUSTIERS_SHEET})
    assert session["transcode_reason"] == "Sous-titres ASS → WebVTT (vidéo et audio copiés)"
    assert session["audio_channels"] == 2
    # Fiche du média illisible : on garde le format de sortie, sans inventer de source.
    (fallback,) = parse_plex_sessions(FLIBUSTIERS_SESSION)
    assert fallback["transcode_reason"] == "Sous-titres WebVTT convertis (vidéo et audio copiés)"


def test_decision_note_points_at_unselected_surround_tracks():
    note = playback_activity._decision_note(CHANNELS_TEXT, 2, FLIBUSTIERS_STREAMS)
    assert note.startswith("Porte sur des pistes non écoutées : 日本語 (AAC 5.1), English (AAC 5.1).")
    assert "La piste écoutée est en stéréo" in note
    # La piste écoutée est elle-même en 5.1 : la raison de Plex est littérale, pas de note.
    assert playback_activity._decision_note(CHANNELS_TEXT, 6, FLIBUSTIERS_STREAMS) is None
    assert playback_activity._decision_note(CHANNELS_TEXT, None, FLIBUSTIERS_STREAMS) is None
    assert playback_activity._decision_note("Direct play is disabled.", 2, FLIBUSTIERS_STREAMS) is None
    assert playback_activity._decision_note(CHANNELS_TEXT, 2, FLIBUSTIERS_STREAMS[:1]) is None


@pytest.mark.asyncio
async def test_enrichment_adds_the_unselected_track_note(async_db):
    now = datetime(2026, 9, 26, 22, 52)
    async_db.add(Settings(id=1, plex_url="http://plex.local:32400", plex_token="t"))
    row = PlaybackSession(
        source="plex",
        source_session_id="s9",
        title="Les flibustiers",
        rating_key="5192",
        playback_method="direct_stream",
        audio_channels=2,
        transcode_reason="Sous-titres ASS → WebVTT (vidéo et audio copiés)",
        started_at=datetime(2026, 9, 26, 22, 50),
        last_seen_at=now,
    )
    async_db.add(row)
    async_db.commit()
    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        patch.object(playback_activity, "now_utc_naive", return_value=now),
        patch.object(
            playback_activity.plex_decision_logs,
            "fetch_decisions",
            new=AsyncMock(return_value=(parse_decisions(LOG), datetime(2026, 9, 26, 20))),
        ),
        patch.object(playback_activity, "media_streams", new=AsyncMock(return_value=FLIBUSTIERS_STREAMS)),
        patch.object(playback_activity, "publish", new=AsyncMock()),
    ):
        await playback_activity.enrich_decisions_from_plex_logs(force=True)
    reason = playback_activity._serialize(row)["transcode_reason"]
    assert reason["text"].endswith("6 > 2.")
    assert reason["note"].startswith("Porte sur des pistes non écoutées")


@pytest.mark.asyncio
async def test_media_streams_reads_audio_and_subtitle_tracks_once():
    import httpx

    xml = (
        '<MediaContainer><Video><Media container="mkv"><Part container="mkv">'
        + "".join(
            f'<Stream id="{s["id"]}" streamType="{s["streamType"]}" codec="{s["codec"]}"/>' for s in FLIBUSTIERS_STREAMS
        )
        + '<Stream id="1" streamType="1" codec="hevc"/></Part></Media></Video></MediaContainer>'
    )
    calls = []

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200, text=xml)

    real_client = httpx.AsyncClient
    with (
        patch.object(
            playback_activity.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler))
        ),
        patch.dict(playback_activity._STREAMS_CACHE, clear=True),
    ):
        first = await playback_activity.media_streams("http://plex.local/", "t", True, "5198")
        again = await playback_activity.media_streams("http://plex.local/", "t", True, "5198")
        sheet = await playback_activity.media_sheet("http://plex.local/", "t", True, "5198")
    assert [s["id"] for s in first] == ["11", "12", "13", "21"]  # la vidéo n'est pas gardée
    assert sheet["container"] == "mkv"
    assert again is first
    assert calls == ["/library/metadata/5198"]


@pytest.mark.asyncio
async def test_collection_resolves_subtitle_source_from_media_sheet(async_db):
    import httpx

    async_db.add(Settings(id=1, live_activity_enabled=True, plex_url="http://plex.local:32400", plex_token="tok"))
    async_db.commit()
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(200, text=FLIBUSTIERS_SESSION))
    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        patch.object(playback_activity.httpx, "AsyncClient", lambda **kw: real_client(transport=transport)),
        patch.object(playback_activity, "media_sheet", new=AsyncMock(return_value=FLIBUSTIERS_SHEET)),
        patch.object(playback_activity, "lookup_ip_locations", new=AsyncMock(return_value={})),
        patch.object(playback_activity, "lookup_ip_location", new=AsyncMock(return_value={})),
        patch.object(playback_activity, "publish", new=AsyncMock()),
    ):
        await playback_activity._collect_plex_activity_unlocked()
    stored = async_db.query(PlaybackSession).filter_by(rating_key="5198").one()
    assert stored.transcode_reason == "Sous-titres ASS → WebVTT (vidéo et audio copiés)"
    assert stored.audio_channels == 2

    # Fiche du média injoignable : la collecte continue avec la déduction de base.
    async_db.query(PlaybackSession).delete()
    async_db.commit()
    with (
        patch.object(playback_activity, "AsyncSessionLocal", return_value=async_db),
        patch.object(playback_activity.httpx, "AsyncClient", lambda **kw: real_client(transport=transport)),
        patch.object(playback_activity, "media_sheet", new=AsyncMock(side_effect=httpx.ConnectError("down"))),
        patch.object(playback_activity, "lookup_ip_locations", new=AsyncMock(return_value={})),
        patch.object(playback_activity, "lookup_ip_location", new=AsyncMock(return_value={})),
        patch.object(playback_activity, "publish", new=AsyncMock()),
    ):
        await playback_activity._collect_plex_activity_unlocked()
    fallback = async_db.query(PlaybackSession).filter_by(rating_key="5198").one()
    assert fallback.transcode_reason == "Sous-titres WebVTT convertis (vidéo et audio copiés)"


REMUX_SESSION = """<MediaContainer size="1"><Video ratingKey="77" sessionKey="3" title="Remux" type="movie"
 viewOffset="0" duration="1000"><Media container="mp4"><Part decision="transcode" container="mp4" protocol="dash">
<Stream id="1" streamType="1" codec="hevc" height="1080" decision="copy"/>
<Stream id="2" streamType="2" codec="eac3" channels="6" selected="1" decision="copy" language="Français"/>
</Part></Media><User title="u"/><Player title="TV" state="playing"/><Session id="r3" bandwidth="1" location="lan"/>
<TranscodeSession key="/transcode/sessions/r3" videoDecision="copy" audioDecision="copy" protocol="dash"
 container="mp4" videoCodec="hevc" audioCodec="eac3" sourceVideoCodec="hevc" sourceAudioCodec="eac3" audioChannels="6"/>
</Video></MediaContainer>"""


def test_direct_stream_remux_is_described_in_blue_and_in_detail():
    import json

    (session,) = parse_plex_sessions(REMUX_SESSION, media_sheets={"77": {"container": "mkv", "streams": []}})
    # Rien de réencodé : pas de raison orange, seulement le réemballage.
    assert session["transcode_reason"] is None
    details = json.loads(session["transcode_details"])
    assert details["container"] == {"from": "mkv", "to": "mp4"}
    assert details["video"] == {"decision": "copy", "from": "hevc", "to": "hevc", "height": 1080}
    assert details["audio"]["channels"] == 6
    assert details["subtitles"] is None

    row = PlaybackSession(
        source="plex", source_session_id="r3", title="Remux", transcode_details=session["transcode_details"]
    )
    serialized = playback_activity._serialize(row)
    assert serialized["transcode_remux"] == "Conteneur MKV → MP4 (segments DASH)"
    assert serialized["transcode_details"]["protocol"] == "dash"


def test_remux_label_variants():
    label = playback_activity._remux_label
    assert label({"container": {"from": None, "to": "mp4"}, "protocol": "hls"}) == "Diffusé en MP4 (segments HLS)"
    assert label({"container": {"from": "mkv", "to": "mkv"}, "protocol": "http"}) is None
    assert label(None) is None
    assert playback_activity._json_or_none("{pas du json") is None


@pytest.mark.asyncio
async def test_session_detail_adds_banner_summary_and_library_link(async_db):
    from app.models import LibraryItem

    async_db.add(Settings(id=1, plex_url="http://plex.local:32400", plex_token="t"))
    async_db.add(LibraryItem(id=42, title="Samurai Champloo", media_type="show", plex_guid="plex://show/abc"))
    row = PlaybackSession(source="plex", source_session_id="s", title="Les flibustiers", rating_key="5198")
    async_db.add(row)
    async_db.commit()
    sheet = {
        "meta": {
            "summary": "Mugen embarque…",
            "art": "/library/metadata/5183/art/1",
            "guid": "plex://show/abc",
            "season": 1,
            "episode": 11,
        },
        "container": "mkv",
        "streams": [],
    }
    with patch.object(playback_activity, "media_sheet", new=AsyncMock(return_value=sheet)):
        detail = await playback_activity.playback_session_detail(row.id, async_db)
    assert detail["media"] == {
        "summary": "Mugen embarque…",
        "art_url": "/api/playback/thumb?path=%2Flibrary%2Fmetadata%2F5183%2Fart%2F1",
        "season": 1,
        "episode": 11,
        "library_item_id": 42,
    }
    with patch.object(playback_activity, "media_sheet", new=AsyncMock(side_effect=RuntimeError("plex"))):
        assert (await playback_activity.playback_session_detail(row.id, async_db))["media"] is None


def test_transcoder_state_is_kept_in_details():
    import json

    xml = REMUX_SESSION.replace('audioChannels="6"/>', 'audioChannels="6" complete="1" progress="100"/>')
    details = json.loads(parse_plex_sessions(xml)[0]["transcode_details"])
    assert details["transcoder"] == {"complete": True, "progress": 100.0}


def test_episode_numbers_come_from_the_session():
    xml = FLIBUSTIERS_SESSION.replace('type="episode"', 'type="episode" parentIndex="1" index="11"')
    session = parse_plex_sessions(xml)[0]
    assert (session["season_number"], session["episode_number"]) == (1, 11)
    movie = parse_plex_sessions(REMUX_SESSION.replace('type="movie"', 'type="movie" index="3"'))[0]
    assert (movie["season_number"], movie["episode_number"]) == (None, None)
    row = PlaybackSession(source="plex", source_session_id="x", title="T", season_number=1, episode_number=11)
    assert playback_activity._serialize(row)["episode_number"] == 11
