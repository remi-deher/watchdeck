"""Connecteur Tracearr : projection, rapprochement et import non destructif.

Les charges utiles reproduisent la forme réelle renvoyée par l'API publique v2 d'une
instance en service, y compris les particularités qui piègent : une chaîne de reprises
dont `duration_ms` couvre plusieurs segments, et une lecture abandonnée que l'historique
Plex n'aurait jamais enregistrée.
"""

from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.models import PlaybackSession
from app.services.tracearr import (
    _playback_method,
    import_tracearr_history,
    to_match_key,
    to_playback_values,
)

# Importe sous un alias : pytest collecterait `test_tracearr` comme un test et se
# plaindrait de ne pas trouver de fixture `url`. Le nom du service suit celui de
# `test_tautulli`, il ne change pas pour autant.
from app.services.tracearr import test_tracearr as check_tracearr
from app.utils import now_utc_naive

# Lecture réellement renvoyée par une instance Tracearr, allégée des champs non exploités.
COMPANION_PLAY = {
    "id": "3132958b-7870-4f99-88de-218cce718528",
    "media_type": "movie",
    "media_title": "Companion",
    "show_title": None,
    "year": 2025,
    "rating_key": "44911",
    "started_at": "2026-09-08T22:52:08.383Z",
    "stopped_at": "2026-09-08T23:16:50.418Z",
    "state": "stopped",
    "duration_ms": 1482035,
    "total_duration_ms": 5824864,
    "progress_ms": 4892000,
    "percent_complete": 84,
    "watched": False,
    "segment_count": 1,
    "device": "Chromecast",
    "player": "Chromecast",
    "product": "Plex Cast",
    "platform": "Chromecast",
    "is_transcode": True,
    "video_decision": "transcode",
    "audio_decision": "transcode",
    "bitrate": 20379,
    "resolution": "1080p",
    "source_video_codec": "HEVC",
    "stream_video_codec": "H264",
    "stream_audio_codec": "AAC",
    "user": {"id": "0eb", "server_user_id": "863", "username": "frdriquecottin"},
}


class TestProjection:
    def test_translates_tracearr_decisions_into_our_vocabulary(self):
        assert _playback_method({"video_decision": "directplay", "audio_decision": "directplay"}) == "direct_play"
        assert _playback_method({"video_decision": "copy", "audio_decision": "copy"}) == "direct_stream"

    def test_a_converted_track_makes_the_whole_play_a_transcode(self):
        """Une vidéo copiée sous un audio converti reste un transcodage."""
        assert _playback_method({"video_decision": "copy", "audio_decision": "transcode"}) == "transcode"

    def test_falls_back_on_is_transcode_rather_than_giving_up(self):
        assert _playback_method({"is_transcode": True}) == "transcode"
        assert _playback_method({"is_transcode": False}) is None

    def test_projects_a_real_play_onto_our_columns(self):
        values = to_playback_values(COMPANION_PLAY)

        assert values["playback_method"] == "transcode"
        assert values["bandwidth_kbps"] == 20379
        assert values["user_name"] == "frdriquecottin"
        assert values["rating_key"] == "44911"
        assert values["quality"] == "1080p"
        # L'API date en ISO UTC ; nous stockons du naïf UTC.
        assert values["started_at"].tzinfo is None
        assert values["started_at"].hour == 22

    def test_coerces_the_int64_fields_the_api_serialises_as_strings(self):
        """Trouvé sur l'instance réelle : `progress_ms` arrive parfois entre guillemets.

        Le schéma les annonce numériques, mais un grand entier passé en JSON garde
        volontiers ses guillemets. Tels quels, ils faisaient échouer l'insertion sur une
        colonne BIGINT et interrompaient tout l'import.
        """
        values = to_playback_values(
            {**COMPANION_PLAY, "progress_ms": "3029460", "total_duration_ms": "3067862", "duration_ms": "3028460"}
        )

        assert values["progress_ms"] == 3029460
        assert values["duration_ms"] == 3067862
        assert values["watched_ms"] == 3028460

    def test_the_match_key_carries_both_anchors_and_the_segment_count(self):
        key = to_match_key({**COMPANION_PLAY, "segment_count": 2})

        assert key.user_name == "frdriquecottin"
        assert key.rating_key == "44911"
        assert key.started_at is not None and key.ended_at is not None
        assert key.segment_count == 2


@pytest.mark.asyncio
class TestImport:
    async def test_fills_the_unknown_decision_without_duplicating_the_play(self, async_db):
        """Le cas qui motive tout le connecteur.

        Une lecture directe capturée par Watchdeck avant le correctif du parseur porte
        `playback_method = "unknown"`. Tracearr connaît la même lecture et sa décision.
        L'import doit compléter la ligne, pas en créer une seconde.
        """
        started = now_utc_naive().replace(microsecond=0)
        async_db.add(
            PlaybackSession(
                source="plex",
                source_session_id="live-1",
                user_name="frdriquecottin",
                rating_key="44911",
                title="Companion",
                media_type="movie",
                playback_method="unknown",
                watched_ms=1_400_000,
                started_at=started,
            )
        )
        async_db.commit()

        page = {
            "data": [
                {
                    **COMPANION_PLAY,
                    # Douze secondes d'écart, comme entre l'horloge de Tracearr et la nôtre.
                    "started_at": (started + timedelta(seconds=12)).isoformat() + "Z",
                    "stopped_at": (started + timedelta(minutes=24)).isoformat() + "Z",
                }
            ],
            "meta": {"nextCursor": None},
        }
        with patch("app.services.tracearr.fetch_history_page", new=AsyncMock(return_value=(page["data"], None))):
            result = await import_tracearr_history(async_db, url="https://tracearr.test", api_key="trr_pub_x")

        rows = async_db.query(PlaybackSession).all()
        assert len(rows) == 1
        assert result["created"] == 0
        assert result["enriched"] == 1
        assert rows[0].playback_method == "transcode"
        assert rows[0].bandwidth_kbps == 20379
        # Le temps regardé mesuré en direct reste celui de la capture directe.
        assert rows[0].watched_ms == 1_400_000

    async def test_imports_an_abandoned_play_plex_never_recorded(self, async_db):
        """25 % des lectures Tracearr ne sont jamais terminées : Plex les ignore toutes."""
        started = now_utc_naive() - timedelta(days=120)
        page = [
            {
                **COMPANION_PLAY,
                "id": "vieille-lecture",
                "started_at": started.isoformat() + "Z",
                "stopped_at": (started + timedelta(minutes=20)).isoformat() + "Z",
                "watched": False,
                "percent_complete": 22.4,
            }
        ]
        with patch("app.services.tracearr.fetch_history_page", new=AsyncMock(return_value=(page, None))):
            result = await import_tracearr_history(async_db, url="https://tracearr.test", api_key="trr_pub_x")

        row = async_db.query(PlaybackSession).one()
        assert result["created"] == 1
        assert row.source == "tracearr"
        assert row.playback_method == "transcode"
        assert row.watched_status == 0.0

    async def test_a_repeated_cursor_stops_the_pagination(self, async_db):
        """Un curseur qui ne progresse plus réimporterait la même page jusqu'au plafond."""
        page = [{**COMPANION_PLAY, "id": "boucle"}]
        with patch(
            "app.services.tracearr.fetch_history_page",
            new=AsyncMock(return_value=(page, "curseur-fige")),
        ) as fetch:
            result = await import_tracearr_history(async_db, url="https://tracearr.test", api_key="trr_pub_x")

        assert fetch.await_count == 2
        assert result["received"] == 2


@pytest.mark.asyncio
class TestConnectionTest:
    async def test_reports_a_rejected_key_in_plain_language(self):
        class _Response:
            status_code = 401

        class _Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def get(self, *args, **kwargs):
                return _Response()

        with patch("app.services.tracearr.httpx.AsyncClient", return_value=_Client()):
            ok, message = await check_tracearr("https://tracearr.test", "trr_pub_mauvaise")

        assert ok is False
        assert "401" in message

    async def test_requires_both_url_and_key(self):
        ok, message = await check_tracearr("", "trr_pub_x")
        assert ok is False
        assert "requises" in message
