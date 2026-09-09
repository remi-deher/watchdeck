"""Fusion multi-sources : aucune source n'écrase l'autre, chacune comble les trous."""

import json
from datetime import timedelta

import pytest

from app.models import PlaybackSession
from app.services.playback_merge import (
    MatchKey,
    apply_enrichment,
    find_existing_session,
    is_missing,
    merge_playback_records,
    source_rank,
)
from app.utils import now_utc_naive


def _session(**overrides) -> PlaybackSession:
    base = {
        "source": "plex",
        "source_session_id": "live-1",
        "user_name": "Lisa",
        "rating_key": "5001",
        "title": "Inception",
        "media_type": "movie",
        "started_at": now_utc_naive(),
    }
    base.update(overrides)
    return PlaybackSession(**base)


class TestMissingPredicates:
    def test_unknown_playback_method_counts_as_missing(self):
        """« unknown » est le trou qu'on veut combler, pas une décision de lecture."""
        assert is_missing("playback_method", "unknown") is True
        assert is_missing("playback_method", None) is True
        assert is_missing("playback_method", "direct_play") is False

    def test_zero_means_not_communicated_for_measurements(self):
        assert is_missing("bandwidth_kbps", 0) is True
        assert is_missing("bandwidth_kbps", 12800) is False
        assert is_missing("watched_ms", 0) is True

    def test_text_fields_fall_back_to_blankness(self):
        assert is_missing("video_decision", "   ") is True
        assert is_missing("video_decision", "copy") is False


class TestPrecedence:
    def test_direct_capture_outranks_importers(self):
        assert source_rank("plex") < source_rank("tracearr") < source_rank("tautulli")
        assert source_rank("tautulli") < source_rank("plex_history")

    def test_unknown_source_ranks_last(self):
        assert source_rank("mystere") > source_rank("plex_history")


class TestApplyEnrichment:
    def test_fills_the_hole_left_by_direct_capture(self):
        """Le cas qui motive tout : une lecture directe enregistrée « unknown »."""
        session = _session(playback_method="unknown", video_decision=None, audio_decision=None)

        changed = apply_enrichment(
            session,
            {"playback_method": "direct_play", "video_decision": "directplay", "audio_decision": "directplay"},
            "tracearr",
        )

        assert changed is True
        assert session.playback_method == "direct_play"
        assert session.video_decision == "directplay"
        assert json.loads(session.enrichment_sources)["playback_method"] == "tracearr"

    def test_never_overwrites_a_value_already_known(self):
        session = _session(playback_method="transcode", bandwidth_kbps=12800)

        apply_enrichment(session, {"playback_method": "direct_play", "bandwidth_kbps": 99}, "tautulli")

        assert session.playback_method == "transcode"
        assert session.bandwidth_kbps == 12800

    def test_an_empty_incoming_value_erases_nothing(self):
        """Une source qui ignore un champ ne doit pas effacer ce qu'une autre a su."""
        session = _session(playback_method="transcode", user_name="Lisa")

        apply_enrichment(session, {"playback_method": None, "user_name": "", "title": "Inception"}, "tautulli")

        assert session.playback_method == "transcode"
        assert session.user_name == "Lisa"

    def test_a_coverage_source_never_writes_watch_time(self):
        """L'historique Plex ne mesure aucune durée : zéro y serait un mensonge."""
        session = _session(watched_ms=None)

        apply_enrichment(session, {"watched_ms": 0, "title": "Inception"}, "plex_history")

        assert session.watched_ms is None

    def test_a_difference_of_form_is_not_a_disagreement(self):
        """Deux sources décrivent le même flux avec des conventions différentes.

        Sur un import réel de 390 lectures, `hevc`/`HEVC`, `windows`/`Windows` et
        `1080`/`1080p` représentaient l'essentiel des 583 « désaccords » remontés : du
        bruit qui noyait les vrais écarts de mesure.
        """
        from app.services.playback_merge import MergeOutcome

        session = _session(video_codec="hevc", platform="windows", quality="1080")
        outcome = MergeOutcome()

        apply_enrichment(
            session,
            {"video_codec": "HEVC", "platform": "Windows", "quality": "1080p"},
            "tracearr",
            outcome=outcome,
        )

        assert outcome.conflicts == []

    def test_identifiers_and_clocks_are_never_disagreements(self):
        """Chaque source a son identifiant et son horloge : l'écart est attendu."""
        from datetime import timedelta as _td

        from app.services.playback_merge import MergeOutcome

        session = _session(source_session_id="ya6y48url3", started_at=now_utc_naive())
        outcome = MergeOutcome()

        apply_enrichment(
            session,
            {"source_session_id": "3132958b-7870", "started_at": session.started_at + _td(seconds=2)},
            "tracearr",
            outcome=outcome,
        )

        assert outcome.conflicts == []
        assert session.source_session_id == "ya6y48url3"

    def test_disagreement_is_reported_not_silently_resolved(self):
        from app.services.playback_merge import MergeOutcome

        session = _session(playback_method="transcode")
        session.enrichment_sources = json.dumps({"playback_method": "tautulli"})
        outcome = MergeOutcome()

        apply_enrichment(session, {"playback_method": "direct_play"}, "tracearr", outcome=outcome)

        assert session.playback_method == "transcode"
        assert outcome.conflicts and "playback_method" in outcome.conflicts[0]


@pytest.mark.asyncio
class TestReconciliation:
    async def test_matches_across_sources_despite_clock_drift(self, async_db):
        """Les horloges des trois sources ne coïncident pas à la seconde."""
        start = now_utc_naive()
        async_db.add(_session(started_at=start))
        async_db.commit()

        found = await find_existing_session(
            async_db,
            MatchKey(user_name="Lisa", rating_key="5001", started_at=start + timedelta(minutes=2)),
        )

        assert found is not None

    async def test_does_not_match_beyond_the_tolerance(self):
        pass  # couvert par test_import_does_not_duplicate_the_same_play

    async def test_two_people_watching_the_same_media_stay_distinct(self, async_db):
        start = now_utc_naive()
        async_db.add(_session(user_name="Lisa", started_at=start))
        async_db.commit()

        found = await find_existing_session(
            async_db, MatchKey(user_name="Rémi", rating_key="5001", started_at=start)
        )

        assert found is None

    async def test_picks_the_closest_play_when_episodes_follow_each_other(self, async_db):
        start = now_utc_naive()
        async_db.add(_session(source_session_id="a", rating_key="9", started_at=start))
        async_db.add(_session(source_session_id="b", rating_key="9", started_at=start + timedelta(minutes=4)))
        async_db.commit()

        found = await find_existing_session(
            async_db,
            MatchKey(user_name="Lisa", rating_key="9", started_at=start + timedelta(minutes=4)),
        )

        assert found.source_session_id == "b"


@pytest.mark.asyncio
class TestOverlapBeatsProximity:
    """Deux lectures successives du même média ne doivent jamais fusionner."""

    async def test_two_consecutive_plays_stay_distinct(self, async_db):
        """Cas relevé sur un import réel : « Marcel, le Coquillage ».

        Une lecture de 11:33 à 13:05, une autre de 13:05 à 13:08. Leurs *fins* ne sont
        distantes que de trois minutes : toute règle de proximité les fusionne. Leurs
        intervalles, eux, sont disjoints.
        """
        base = now_utc_naive().replace(hour=11, minute=33, second=0, microsecond=0)
        first_end = base + timedelta(hours=1, minutes=32)
        async_db.add(_session(source_session_id="deuxieme", started_at=first_end + timedelta(seconds=17),
                              ended_at=first_end + timedelta(minutes=3)))
        async_db.commit()

        found = await find_existing_session(
            async_db, MatchKey(user_name="Lisa", rating_key="5001", started_at=base, ended_at=first_end)
        )

        assert found is None

    async def test_the_same_play_seen_by_two_sources_still_matches(self, async_db):
        """Le chevauchement doit rester permissif sur la dérive d'horloge."""
        start = now_utc_naive()
        end = start + timedelta(minutes=40)
        async_db.add(_session(started_at=start, ended_at=end))
        async_db.commit()

        found = await find_existing_session(
            async_db,
            MatchKey(
                user_name="Lisa",
                rating_key="5001",
                started_at=start + timedelta(seconds=12),
                ended_at=end - timedelta(seconds=3),
            ),
        )

        assert found is not None

    async def test_the_widest_overlap_wins(self, async_db):
        start = now_utc_naive()
        async_db.add(_session(source_session_id="court", started_at=start, ended_at=start + timedelta(minutes=2)))
        async_db.add(_session(source_session_id="long", started_at=start, ended_at=start + timedelta(minutes=50)))
        async_db.commit()

        found = await find_existing_session(
            async_db,
            MatchKey(user_name="Lisa", rating_key="5001", started_at=start, ended_at=start + timedelta(minutes=45)),
        )

        assert found.source_session_id == "long"


@pytest.mark.asyncio
class TestPlexHistoryAnchoring:
    """L'historique Plex date la fin de la lecture, pas son début."""

    async def test_matches_on_the_end_because_viewedat_is_the_end(self, async_db):
        """`viewedAt` vaut « marqué comme vu », donc la fin du visionnage.

        Mesuré sur 48 lectures de cette instance : face à `started_at`, l'écart médian
        est de 21 minutes et seules 11 sur 48 tiennent dans cinq minutes ; face à
        `ended_at`, la médiane tombe à 8 secondes et 46 sur 48 y tiennent. Ancrer sur le
        début aurait dupliqué trois lectures sur quatre.
        """
        start = now_utc_naive()
        end = start + timedelta(hours=2)
        async_db.add(_session(started_at=start, ended_at=end))
        async_db.commit()

        # Ancré sur la fin : rapproché.
        assert await find_existing_session(
            async_db, MatchKey(user_name="Lisa", rating_key="5001", ended_at=end + timedelta(seconds=30))
        ) is not None

        # Le même instant lu comme un début : hors fenêtre, donc pas de rapprochement.
        assert await find_existing_session(
            async_db, MatchKey(user_name="Lisa", rating_key="5001", started_at=end + timedelta(seconds=30))
        ) is None


@pytest.mark.asyncio
class TestChainGrain:
    """Tracearr expose des lectures (chaînes) là où nous stockons des sessions."""

    async def test_a_chain_total_never_lands_on_a_single_session(self, async_db):
        """Cinq lectures de Companion valent neuf sessions chez nous, cinq chaînes chez Tracearr."""
        start = now_utc_naive()
        async_db.add(_session(playback_method="unknown", watched_ms=600_000, started_at=start))
        async_db.commit()

        await merge_playback_records(
            async_db,
            [
                (
                    MatchKey(user_name="Lisa", rating_key="5001", started_at=start, segment_count=2),
                    {"playback_method": "transcode", "watched_ms": 2_409_776, "bandwidth_kbps": 1380},
                )
            ],
            "tracearr",
        )
        async_db.commit()

        row = async_db.query(PlaybackSession).one()
        # La décision et le débit décrivent le flux : valables pour chaque segment.
        assert row.playback_method == "transcode"
        assert row.bandwidth_kbps == 1380
        # Le temps regardé de la chaîne entière, lui, ne peut pas être attribué ici.
        assert row.watched_ms == 600_000

    async def test_a_chain_nobody_saw_keeps_its_segment_count(self, async_db):
        start = now_utc_naive()

        await merge_playback_records(
            async_db,
            [
                (
                    MatchKey(user_name="Rémi", rating_key="4242", started_at=start, segment_count=3),
                    {
                        "source_session_id": "trr-chain",
                        "user_name": "Rémi",
                        "rating_key": "4242",
                        "title": "Une reprise",
                        "started_at": start,
                        "playback_method": "direct_play",
                    },
                )
            ],
            "tracearr",
        )
        async_db.commit()

        row = async_db.query(PlaybackSession).one()
        assert row.group_count == 3


@pytest.mark.asyncio
class TestMergeRecords:
    async def test_import_does_not_duplicate_the_same_play(self, async_db):
        """Sans rapprochement, un import recréerait chaque lecture et doublerait les stats."""
        start = now_utc_naive()
        async_db.add(_session(playback_method="unknown", started_at=start))
        async_db.commit()

        outcome = await merge_playback_records(
            async_db,
            [
                (
                    MatchKey(user_name="Lisa", rating_key="5001", started_at=start + timedelta(seconds=30)),
                    {"playback_method": "direct_play", "bandwidth_kbps": 9000},
                )
            ],
            "tracearr",
        )
        async_db.commit()

        rows = async_db.query(PlaybackSession).all()
        assert outcome.created == 0
        assert outcome.enriched == 1
        assert len(rows) == 1
        assert rows[0].playback_method == "direct_play"
        assert rows[0].bandwidth_kbps == 9000

    async def test_a_play_nobody_captured_is_created(self, async_db):
        start = now_utc_naive()

        outcome = await merge_playback_records(
            async_db,
            [
                (
                    MatchKey(user_name="Rémi", rating_key="777", started_at=start),
                    {
                        "source_session_id": "trr-1",
                        "user_name": "Rémi",
                        "rating_key": "777",
                        "title": "Une vieille lecture",
                        "started_at": start,
                        "playback_method": "transcode",
                    },
                )
            ],
            "tracearr",
        )
        async_db.commit()

        rows = async_db.query(PlaybackSession).all()
        assert outcome.created == 1
        assert len(rows) == 1
        assert rows[0].source == "tracearr"
        assert json.loads(rows[0].enrichment_sources)["playback_method"] == "tracearr"

    async def test_a_coverage_import_leaves_watch_time_unknown(self, async_db):
        """3875 lignes à zéro seconde effondreraient la durée moyenne par session."""
        start = now_utc_naive()

        await merge_playback_records(
            async_db,
            [
                (
                    MatchKey(user_name="Rémi", rating_key="888", started_at=start),
                    {
                        "source_session_id": "plexhist-1",
                        "user_name": "Rémi",
                        "rating_key": "888",
                        "title": "Lecture ancienne",
                        "started_at": start,
                    },
                )
            ],
            "plex_history",
        )
        async_db.commit()

        row = async_db.query(PlaybackSession).one()
        assert row.watched_ms is None
        assert row.source == "plex_history"
