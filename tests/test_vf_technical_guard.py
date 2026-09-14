"""Tests des garde-fous techniques d'une amelioration VF.

Les quatre reglages `vf_upgrade_protect_resolution`, `vf_upgrade_preserve_hdr`,
`vf_upgrade_protect_custom_format_score` et `vf_upgrade_allow_technical_downgrade`
existaient dans l'interface sans qu'aucun code ne les lise : Watchdeck pouvait proposer
de remplacer un 2160p HDR par un 1080p MULTI sans rien signaler.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.models import ArrInstance, LibraryItem, Settings, VfUpgradeSuggestion
from app.routers.vf_upgrades_api import VfUpgradeGrabRequest, grab_vf_upgrade
from app.services.vf_technical_guard import (
    annotate,
    blocking_reasons,
    compare,
    current_file_profile,
    dynamic_range_from_text,
    release_profile,
    resolution_from_text,
)
from app.services.vf_upgrade_scanner import _search_task, _SearchTask
from app.utils import now_utc_naive
from tests.async_support import make_test_session


@pytest.fixture()
def db():
    session = make_test_session()
    yield session
    session.close()


# ---------------------------------------------------------------------------
# Lecture des profils techniques
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Some.Movie.2020.2160p.WEB-DL", 2160),
        ("Some.Movie.2020.1080p.BluRay", 1080),
        ("Bluray-2160p", 2160),
        ("WEBDL1080p", 1080),
        ("Some.Movie.2020.4K.UHD", 2160),
        ("Some.Movie.2020.720p", 720),
        # "2020" est une annee, pas une resolution.
        ("Some.Movie.2020.WEB-DL", None),
    ],
)
def test_resolution_reading(text, expected):
    assert resolution_from_text(text) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Some.Movie.2160p.HDR.x265", {"hdr"}),
        ("Some.Movie.2160p.HDR10+.DV.x265", {"hdr", "dv"}),
        ("Some.Movie.2160p.DoVi.x265", {"dv"}),
        ("Dolby Vision", {"dv"}),
        ("Some.Movie.1080p.x264", set()),
    ],
)
def test_dynamic_range_reading(text, expected):
    assert dynamic_range_from_text(text) == expected


def test_current_profile_keeps_the_best_file_of_the_scope():
    """Une recherche de season pack remplace plusieurs fichiers : c'est le plus haut de
    gamme d'entre eux qu'il ne faut pas degrader."""
    files = [
        {
            "sceneName": "Show.S01E01.1080p.WEB-DL",
            "quality": {"quality": {"name": "WEBDL-1080p", "resolution": 1080}},
            "customFormatScore": 10,
        },
        {
            "sceneName": "Show.S01E02.2160p.WEB-DL.HDR",
            "quality": {"quality": {"name": "WEBDL-2160p", "resolution": 2160}},
            "mediaInfo": {"videoDynamicRange": "HDR10"},
            "customFormatScore": 120,
        },
    ]

    profile = current_file_profile(files)

    assert profile["resolution"] == 2160
    assert profile["dynamic_range"] == {"hdr"}
    assert profile["custom_format_score"] == 120


def test_arr_width_resolutions_are_normalised_to_height():
    assert current_file_profile([{"quality": {"quality": {"name": "UHD", "resolution": 3840}}}])["resolution"] == 2160


# ---------------------------------------------------------------------------
# Detection des regressions
# ---------------------------------------------------------------------------


def test_resolution_downgrade_is_a_regression():
    current = current_file_profile([{"sceneName": "Movie.2160p.WEB-DL", "quality": {"quality": {"resolution": 2160}}}])
    comparison = compare(current, release_profile({"title": "Movie.MULTi.1080p.WEB-DL"}))

    assert "resolution" in comparison["regressions"]


def test_equal_resolution_is_not_a_regression():
    current = current_file_profile([{"sceneName": "Movie.1080p.WEB-DL"}])
    comparison = compare(current, release_profile({"title": "Movie.MULTi.1080p.WEB-DL"}))

    assert comparison["regressions"] == []


def test_hdr_loss_is_a_regression_only_when_the_title_describes_the_video():
    current = current_file_profile([{"sceneName": "Movie.2160p.HDR", "mediaInfo": {"videoDynamicRange": "HDR10"}}])

    # Le candidat decrit sa video (2160p) mais n'annonce aucun HDR : perte etablie.
    described = compare(current, release_profile({"title": "Movie.TRUEFRENCH.2160p.WEB-DL.x265"}))
    assert "hdr" in described["regressions"]
    assert described["lost_dynamic_range"] == ["hdr"]

    # Un titre sans aucun indice technique ne prouve rien : incertitude, pas regression.
    silent = compare(current, release_profile({"title": "Movie.TRUEFRENCH"}))
    assert silent["regressions"] == []
    assert "hdr" in silent["unknown"]


def test_missing_data_on_either_side_never_blocks():
    comparison = compare(current_file_profile([]), release_profile({"title": "Movie.MULTi.1080p"}))

    assert comparison["regressions"] == []
    assert blocking_reasons(Settings(), comparison) == []
    # La resolution du fichier en place est inconnue, donc incomparable. Le HDR, lui,
    # n'est pas signale comme incertain : `mediaInfo.videoDynamicRange` est vide aussi
    # pour un fichier SDR, si bien qu'une incertitude HDR serait affichee sur toute
    # bibliotheque sans HDR -- il n'y a rien a perdre, donc rien a dire.
    assert set(comparison["unknown"]) == {"resolution", "custom_format_score"}


def test_custom_format_score_downgrade_is_a_regression():
    current = current_file_profile([{"sceneName": "Movie.1080p", "customFormatScore": 200}])
    comparison = compare(current, release_profile({"title": "Movie.MULTi.1080p", "custom_format_score": 50}))

    assert "custom_format_score" in comparison["regressions"]


# ---------------------------------------------------------------------------
# Application des reglages
# ---------------------------------------------------------------------------


def _downgrade_comparison():
    current = current_file_profile(
        [
            {
                "sceneName": "Movie.2160p.HDR",
                "quality": {"quality": {"resolution": 2160}},
                "mediaInfo": {"videoDynamicRange": "HDR10"},
                "customFormatScore": 200,
            }
        ]
    )
    return compare(current, release_profile({"title": "Movie.MULTi.1080p.x264", "custom_format_score": 10}))


def test_each_protection_can_be_disabled_independently():
    comparison = _downgrade_comparison()

    assert len(blocking_reasons(Settings(), comparison)) == 3
    assert len(blocking_reasons(Settings(vf_upgrade_protect_resolution=False), comparison)) == 2
    assert len(blocking_reasons(Settings(vf_upgrade_preserve_hdr=False), comparison)) == 2
    assert len(blocking_reasons(Settings(vf_upgrade_protect_custom_format_score=False), comparison)) == 2


def test_allow_technical_downgrade_overrides_every_protection():
    comparison = _downgrade_comparison()

    assert blocking_reasons(Settings(vf_upgrade_allow_technical_downgrade=True), comparison) == []


def test_blocking_reasons_name_the_actual_values():
    reasons = " ; ".join(blocking_reasons(Settings(), _downgrade_comparison()))

    assert "2160 -> 1080" in reasons
    assert "HDR" in reasons
    assert "200 -> 10" in reasons


def test_annotate_always_attaches_the_comparison():
    """L'interface affiche le comparatif meme quand rien ne bloque."""
    current = current_file_profile([{"sceneName": "Movie.1080p"}])
    release = annotate({"title": "Movie.MULTi.1080p"}, current, Settings())

    assert release["vf_technical"]["current"]["resolution"] == 1080
    assert release["vf_technical_blocked"] is False
    assert release["vf_technical_reasons"] == []


# ---------------------------------------------------------------------------
# Integration dans la recherche
# ---------------------------------------------------------------------------


def _task() -> _SearchTask:
    inst = ArrInstance(name="Radarr", arr_type="radarr", url="http://radarr.local", api_key="key")
    return _SearchTask(
        source_type="library_item",
        source_id=1,
        scope="movie",
        arr_type="radarr",
        inst=inst,
        arr_id=99,
        title="Some Movie",
    )


@pytest.mark.asyncio
async def test_background_scan_drops_a_downgrading_release():
    """Un scan de fond ne propose que des ameliorations : une release qui degraderait la
    qualite n'en est pas une."""
    releases = [{"guid": "degrade", "title": "Some.Movie.MULTi.1080p.x264", "protocol": "usenet", "size": 8e9}]
    current_files = [
        {
            "sceneName": "Some.Movie.2160p.WEB-DL.HDR",
            "quality": {"quality": {"resolution": 2160}},
            "mediaInfo": {"videoDynamicRange": "HDR10"},
        }
    ]

    with (
        patch("app.services.vf_upgrade_scanner.radarr.get_releases", new=AsyncMock(return_value=releases)),
        patch(
            "app.services.vf_upgrade_scanner._current_files_in_scope",
            new=AsyncMock(return_value=current_files),
        ),
    ):
        kept = await _search_task(_task(), Settings(vf_upgrade_min_confidence=65))

    assert list(kept) == []


@pytest.mark.asyncio
async def test_manual_search_keeps_it_but_flags_it_last():
    """Une recherche manuelle doit montrer ce que les indexeurs ont : la release reste
    visible, marquee, et derriere les candidats sains."""
    releases = [
        {"guid": "degrade", "title": "Some.Movie.TRUEFRENCH.1080p.x264", "protocol": "usenet", "size": 8e9},
        {"guid": "sain", "title": "Some.Movie.MULTi.2160p.WEB-DL.HDR", "protocol": "usenet", "size": 30e9},
    ]
    current_files = [
        {
            "sceneName": "Some.Movie.2160p.WEB-DL.HDR",
            "quality": {"quality": {"resolution": 2160}},
            "mediaInfo": {"videoDynamicRange": "HDR10"},
        }
    ]

    with (
        patch("app.services.vf_upgrade_scanner.radarr.get_releases", new=AsyncMock(return_value=releases)),
        patch(
            "app.services.vf_upgrade_scanner._current_files_in_scope",
            new=AsyncMock(return_value=current_files),
        ),
    ):
        kept = await _search_task(_task(), Settings(vf_upgrade_min_confidence=65), filter_technical=False)

    assert [item["guid"] for item in kept] == ["sain", "degrade"]
    assert kept[0]["vf_technical_blocked"] is False
    # TRUEFRENCH est pourtant le meilleur marqueur VF : la regression technique passe
    # devant la preference de langue dans l'ordre d'affichage.
    assert kept[1]["vf_technical_blocked"] is True


# ---------------------------------------------------------------------------
# Garde-fou au moment du grab
# ---------------------------------------------------------------------------


def _suggestion_with_downgrade(db) -> VfUpgradeSuggestion:
    inst = ArrInstance(
        name="Radarr", arr_type="radarr", url="http://radarr.local", api_key="key", enabled=True, is_default=True
    )
    db.add(inst)
    db.commit()
    item = LibraryItem(title="Some Movie", media_type="movie", arr_id=99, has_vf=False, arr_instance_id=inst.id)
    db.add(item)
    db.add(Settings(vff_enabled=True))
    db.commit()
    db.refresh(item)
    current = current_file_profile(
        [{"sceneName": "Some.Movie.2160p.HDR", "quality": {"quality": {"resolution": 2160}}}]
    )
    release = annotate(
        {"guid": "degrade", "title": "Some.Movie.TRUEFRENCH.1080p", "indexer_id": 3}, current, Settings()
    )
    row = VfUpgradeSuggestion(
        source_type="library_item",
        source_id=item.id,
        scope="movie",
        status="pending",
        target_kind="vo",
        releases_json=json.dumps([release]),
        scanned_at=now_utc_naive(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@pytest.mark.asyncio
async def test_grab_refuses_a_technical_downgrade(db):
    suggestion = _suggestion_with_downgrade(db)

    with pytest.raises(HTTPException) as exc_info:
        await grab_vf_upgrade(suggestion.id, VfUpgradeGrabRequest(guid="degrade", indexer_id=3), db)

    assert exc_info.value.status_code == 409
    assert "Regression technique" in exc_info.value.detail
    assert "2160 -> 1080" in exc_info.value.detail


@pytest.mark.asyncio
async def test_grab_accepts_a_technical_downgrade_when_forced(db):
    """L'utilisateur garde le dernier mot, mais doit le dire explicitement."""
    suggestion = _suggestion_with_downgrade(db)

    with (
        patch("app.services.vf_upgrade_lifecycle.radarr.get_queue", new=AsyncMock(return_value=[])),
        patch("app.routers.vf_upgrades_api.radarr.get_queue", new=AsyncMock(return_value=[])),
        patch(
            "app.routers.vf_upgrades_api.radarr.grab_release",
            new=AsyncMock(return_value=(True, "accepte", False)),
        ),
    ):
        result = await grab_vf_upgrade(
            suggestion.id, VfUpgradeGrabRequest(guid="degrade", indexer_id=3, force=True), db
        )

    assert result["accepted"] is True
