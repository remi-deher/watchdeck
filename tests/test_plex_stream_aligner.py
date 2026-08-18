"""Tests pour le service d'alignement des flux audio/sous-titres Plex (mode PASTA)."""

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, LibraryItem, Settings
from app.routers.vf_upgrades_api import FixStreamsRequest, vf_upgrade_audit_fix_streams, vf_upgrade_audit_fix_streams_batch
from app.services.plex_stream_aligner import (
    apply_streams_to_part,
    choose_best_audio_stream,
    choose_best_subtitle_stream,
    find_matching_audio_stream,
    find_matching_subtitle_stream,
    is_commentary_or_ad,
    is_forced_subtitle,
    is_sdh_subtitle,
)
from tests.async_support import TestSession


class MockStream:
    def __init__(
        self,
        id,
        languageCode=None,
        language=None,
        title=None,
        displayTitle=None,
        channels=2,
        forced=False,
        selected=False,
        codec="eac3",
    ):
        self.id = id
        self.languageCode = languageCode
        self.language = language
        self.title = title
        self.displayTitle = displayTitle
        self.channels = channels
        self.forced = forced
        self.selected = selected
        self.codec = codec


class MockPart:
    def __init__(self, audio_streams=None, sub_streams=None):
        self.id = 101
        self._audio = audio_streams or []
        self._subs = sub_streams or []
        self.selected_audio = next((s for s in self._audio if s.selected), None)
        self.selected_sub = next((s for s in self._subs if s.selected), None)

    def audioStreams(self):
        return self._audio

    def subtitleStreams(self):
        return self._subs

    def setSelectedAudioStream(self, s):
        for a in self._audio:
            a.selected = a.id == s.id
        self.selected_audio = s

    def setSelectedSubtitleStream(self, s):
        for sub in self._subs:
            sub.selected = bool(s and sub.id == s.id)
        self.selected_sub = s


def test_is_forced_subtitle():
    s1 = MockStream(1, forced=True)
    assert is_forced_subtitle(s1) is True

    s2 = MockStream(2, title="VFF Forced SRT")
    assert is_forced_subtitle(s2) is True

    s3 = MockStream(3, displayTitle="Français Forcé")
    assert is_forced_subtitle(s3) is True

    s4 = MockStream(4, displayTitle="Français Complet")
    assert is_forced_subtitle(s4) is False


def test_is_commentary_or_ad():
    s1 = MockStream(1, title="Commentaire du réalisateur")
    assert is_commentary_or_ad(s1) is True

    s2 = MockStream(2, displayTitle="Français (Audiodescription)")
    assert is_commentary_or_ad(s2) is True

    s3 = MockStream(3, title="VF-AD 2.0")
    assert is_commentary_or_ad(s3) is True

    s4 = MockStream(4, title="VFF EAC3 5.1")
    assert is_commentary_or_ad(s4) is False


def test_is_sdh_subtitle():
    s1 = MockStream(1, title="Français (SDH)")
    assert is_sdh_subtitle(s1) is True

    s2 = MockStream(2, displayTitle="Français (Sourds et malentendants)")
    assert is_sdh_subtitle(s2) is True

    s3 = MockStream(3, displayTitle="Français")
    assert is_sdh_subtitle(s3) is False


def test_choose_best_audio_stream_excludes_commentary_and_ad():
    s_comm = MockStream(1, languageCode="fre", title="Commentaire du réalisateur", channels=2)
    s_ad = MockStream(2, languageCode="fre", title="Français Audiodescription", channels=2)
    s_fr = MockStream(3, languageCode="fre", title="VFF EAC3 5.1", channels=6)
    s_vo = MockStream(4, languageCode="jpn", title="VO EAC3 2.0", channels=2, selected=True)

    # Doit ignorer le commentaire et l'AD pour choisir le film en 5.1
    best, is_fr = choose_best_audio_stream([s_comm, s_ad, s_fr, s_vo])
    assert is_fr is True
    assert best.id == 3


def test_choose_best_subtitle_stream():
    sub_forced = MockStream(10, languageCode="fre", forced=True, codec="srt")
    sub_full = MockStream(11, languageCode="fre", forced=False, codec="srt")
    sub_sdh = MockStream(12, languageCode="fre", forced=False, title="Français SDH", codec="srt")
    sub_pgs = MockStream(13, languageCode="fre", forced=False, codec="pgs")

    # 1. Si audio FR -> choisit le sous-titre forcé
    chosen_for_fr, apply_fr = choose_best_subtitle_stream([sub_forced, sub_full], is_french_audio=True)
    assert apply_fr is True
    assert chosen_for_fr.id == 10

    # 2. Si audio FR mais aucun sous-titre forcé disponible -> None (désactive les sous-titres)
    chosen_none, apply_none = choose_best_subtitle_stream([sub_full], is_french_audio=True)
    assert apply_none is True
    assert chosen_none is None

    # 3. Si audio VO -> choisit le sous-titre complet SRT non-SDH
    chosen_for_vo, apply_vo = choose_best_subtitle_stream([sub_sdh, sub_pgs, sub_full], is_french_audio=False)
    assert apply_vo is True
    assert chosen_for_vo.id == 11

    # 4. Si audio VO mais AUCUN sous-titre FR -> Ne touche à rien (should_apply=False)
    sub_eng = MockStream(20, languageCode="eng")
    chosen_doubt, apply_doubt = choose_best_subtitle_stream(
        [sub_eng], is_french_audio=False, current_selected_sub=sub_eng
    )
    assert apply_doubt is False
    assert chosen_doubt.id == 20


def test_apply_streams_to_part():
    s_fr = MockStream(1, languageCode="fre", selected=False)
    s_vo = MockStream(2, languageCode="jpn", selected=True)
    sub_forced = MockStream(10, languageCode="fre", forced=True, selected=False)

    part = MockPart(audio_streams=[s_vo, s_fr], sub_streams=[sub_forced])

    audio_ch, sub_ch = apply_streams_to_part(part, s_fr, sub_forced, should_apply_subtitle=True)
    assert audio_ch is True
    assert sub_ch is True
    assert part.selected_audio.id == 1
    assert part.selected_sub.id == 10

    # Deuxième appel sans changement
    audio_ch2, sub_ch2 = apply_streams_to_part(part, s_fr, sub_forced, should_apply_subtitle=True)
    assert audio_ch2 is False
    assert sub_ch2 is False


@pytest.mark.asyncio
async def test_vf_upgrade_audit_fix_streams_endpoint(async_db):
    """L'endpoint fix-streams doit appeler le service et mettre à jour le LibraryItem."""
    item = LibraryItem(
        title="L'Attaque des Titans",
        year=2013,
        media_type="show",
        has_vf=True,
        fr_is_default=False,
        forced_fr_status="not_default",
    )
    settings = Settings(
        id=1,
        plex_url="http://plex:32400",
        plex_token="secret",
        vff_libraries='[{"name": "Séries TV", "kind": "show"}]',
    )
    async_db.add_all([item, settings])
    async_db.commit()

    mock_align_result = {
        "success": True,
        "title": "L'Attaque des Titans",
        "is_show": True,
        "parts_processed": 25,
        "users_count": 2,
        "users": ["Admin", "Invité"],
        "audio_changed": 25,
        "subtitles_changed": 25,
    }

    with patch("app.services.plex_stream_aligner.align_media_item_streams_blocking", return_value=mock_align_result):
        res = await vf_upgrade_audit_fix_streams(library_item_id=item.id, db=async_db)

    assert res["success"] is True
    assert res["audio_changed"] == 25
    assert item.fr_is_default is True
    assert item.forced_fr_status == "ok"


@pytest.mark.asyncio
async def test_vf_upgrade_audit_fix_streams_batch_endpoint(async_db):
    """L'endpoint fix-streams-batch doit traiter tous les éléments éligibles."""
    item1 = LibraryItem(
        title="Film 1",
        year=2020,
        media_type="movie",
        has_vf=True,
        fr_is_default=False,
    )
    item2 = LibraryItem(
        title="Film 2",
        year=2021,
        media_type="movie",
        has_vf=True,
        fr_is_default=True,
        forced_fr_status="not_default",
    )
    settings = Settings(
        id=1,
        plex_url="http://plex:32400",
        plex_token="secret",
        vff_libraries='[{"name": "Films", "kind": "movie"}]',
    )
    async_db.add_all([item1, item2, settings])
    async_db.commit()

    mock_align_result = {
        "success": True,
        "title": "Mock",
        "audio_changed": 1,
        "subtitles_changed": 1,
    }

    with patch("app.services.plex_stream_aligner.align_media_item_streams_blocking", return_value=mock_align_result):
        res = await vf_upgrade_audit_fix_streams_batch(db=async_db)

    assert res["success"] is True
    assert res["processed_items"] == 2
    assert res["audio_changed"] == 2
    assert res["subtitles_changed"] == 2
    assert item1.fr_is_default is True
    assert item2.forced_fr_status == "ok"


def test_find_matching_audio_stream():
    s1 = MockStream(1, language="en", languageCode="eng", title="English 5.1")
    s2 = MockStream(2, language="fr", languageCode="fra", title="French VFF 5.1")
    s3 = MockStream(3, language="ja", languageCode="jpn", title="Japanese FLAC")
    streams = [s1, s2, s3]

    # Exact id
    assert find_matching_audio_stream(streams, target_id=3).id == 3
    # By language code
    assert find_matching_audio_stream(streams, target_id=999, target_language="fr").id == 2
    # By language name in title
    assert find_matching_audio_stream(streams, target_id=999, target_language="japanese").id == 3
    # Fallback to first
    assert find_matching_audio_stream(streams, target_id=999, target_language="unknown").id == 1


def test_find_matching_subtitle_stream():
    sub1 = MockStream(10, language="fr", languageCode="fra", title="French Forced", forced=True)
    sub2 = MockStream(11, language="fr", languageCode="fra", title="French Full", forced=False)
    sub3 = MockStream(12, language="en", languageCode="eng", title="English Full", forced=False)
    streams = [sub1, sub2, sub3]

    # Disabled (0)
    assert find_matching_subtitle_stream(streams, target_id=0) is None
    # Exact id
    assert find_matching_subtitle_stream(streams, target_id=12).id == 12
    # By language and forced flag
    assert find_matching_subtitle_stream(streams, target_id=999, target_language="fr", target_forced=True).id == 10
    assert find_matching_subtitle_stream(streams, target_id=999, target_language="fr", target_forced=False).id == 11


@pytest.mark.asyncio
async def test_vf_upgrade_audit_fix_streams_custom_mode(async_db):
    """L'endpoint fix-streams doit transmettre les paramètres custom."""
    item = LibraryItem(
        title="Film Custom",
        year=2023,
        media_type="movie",
    )
    settings = Settings(
        id=1,
        plex_url="http://plex:32400",
        plex_token="secret",
    )
    async_db.add_all([item, settings])
    async_db.commit()

    captured_kwargs = {}

    def mock_align(**kwargs):
        captured_kwargs.update(kwargs)
        return {"success": True, "title": "Film Custom", "audio_changed": 1, "subtitles_changed": 1}

    with patch("app.services.plex_stream_aligner.align_media_item_streams_blocking", side_effect=mock_align):
        req = FixStreamsRequest(
            mode="custom",
            audio_stream_id=5,
            audio_language="ja",
            subtitle_stream_id=10,
            subtitle_language="fr",
            subtitle_forced=False,
            users=["Admin"],
        )
        res = await vf_upgrade_audit_fix_streams(library_item_id=item.id, body=req, db=async_db)

    assert res["success"] is True
    assert captured_kwargs["mode"] == "custom"
    assert captured_kwargs["audio_stream_id"] == 5
    assert captured_kwargs["audio_language"] == "ja"
    assert captured_kwargs["subtitle_stream_id"] == 10
    assert captured_kwargs["subtitle_language"] == "fr"
    assert captured_kwargs["subtitle_forced"] is False
    assert captured_kwargs["selected_users"] == ["Admin"]

