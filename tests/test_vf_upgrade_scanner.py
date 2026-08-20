"""Tests unitaires pour app/services/vf_upgrade_scanner.py et release_matching.py."""

import json
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.cache import cache
from app.models import (
    ArrInstance,
    Base,
    LibraryItem,
    MediaRequest,
    RequestStatus,
    Settings,
    VfEpisodeStatus,
    VfUpgradeSuggestion,
)
from app.routers.vf_upgrades_api import (
    VfUpgradeGrabRequest,
    _media_payload,
    _refresh_lifecycle,
    grab_vf_upgrade,
    vf_upgrade_audit,
    vf_upgrade_dashboard,
)
from app.services.release_matching import (
    french_release_evidence,
    parse_release_season_episode,
    release_is_french,
    release_matches_target,
)
from app.services.vf_upgrade_scanner import (
    _build_movie_tasks,
    _build_show_tasks,
    _last_episodes,
    _no_result_backoff_active,
    _order_tasks,
    _persist_result,
    _recent_episodes,
    _recent_scan_keys,
    _record_search_outcome,
    _search_task,
    _SearchTask,
    _series_is_ended,
    _skip_statuses,
    _sonarr_season_tasks,
    scan_single_target,
)
from app.utils import now_utc, now_utc_naive
from tests.async_support import TestSession

# ---------------------------------------------------------------------------
# release_is_french & release_matches_target
# ---------------------------------------------------------------------------


def test_parse_release_season_episode_formats():
    info1 = parse_release_season_episode("Some.Show.S01E03.1080p.MULTI.WEB-DL")
    assert info1.is_series is True
    assert info1.seasons == {1}
    assert info1.episodes == {3}
    assert info1.is_season_pack is False

    info2 = parse_release_season_episode("Other.Show.S02E01-E04.720p")
    assert info2.is_series is True
    assert info2.seasons == {2}
    assert info2.episodes == {1, 2, 3, 4}

    info3 = parse_release_season_episode("Third.Show.S03.MULTI.1080p")
    assert info3.is_series is True
    assert info3.seasons == {3}
    assert info3.episodes == set()
    assert info3.is_season_pack is True

    info4 = parse_release_season_episode("Fourth.Show.1x05.720p")
    assert info4.is_series is True
    assert info4.seasons == {1}
    assert info4.episodes == {5}

    info5 = parse_release_season_episode("Fifth.Show.S01-S03.INTEGRALE")
    assert info5.is_series is True
    assert info5.seasons == {1, 2, 3}
    assert info5.is_multi_season is True


def test_release_matches_target_episode_scope():
    # Target S01E03
    ok1, reason1 = release_matches_target("Some.Show.S01E03.MULTI", "episode", 1, 3)
    assert ok1 is True
    assert reason1 is None

    # Target S01E03 vs release S01E05 -> Mismatch
    ok2, reason2 = release_matches_target("Some.Show.S01E05.MULTI", "episode", 1, 3)
    assert ok2 is False
    assert "Épisode" in reason2

    # Target S01E03 vs release S02E03 -> Mismatch season
    ok3, reason3 = release_matches_target("Some.Show.S02E03.MULTI", "episode", 1, 3)
    assert ok3 is False
    assert "Saison" in reason3

    # Target S01E03 vs release S01 Pack -> Compatible (contains S01E03)
    ok4, _ = release_matches_target("Some.Show.S01.MULTI", "episode", 1, 3)
    assert ok4 is True


def test_release_matches_target_season_scope():
    # Target Season 2
    ok1, _ = release_matches_target("Some.Show.S02.MULTI.1080p", "season", 2)
    assert ok1 is True

    # Target Season 2 vs release Season 1 -> Mismatch
    ok2, reason2 = release_matches_target("Some.Show.S01.MULTI.1080p", "season", 2)
    assert ok2 is False
    assert "Saison" in reason2


@pytest.mark.parametrize(
    "title",
    [
        "Some.Show.S01E04.MULTI.1080p.WEB-DL",
        "Movie.2020.FRENCH.1080p.WEB",
        "Movie.2020.TRUEFRENCH.720p",
        "Movie.2020.VFF.1080p",
        "Movie.2020.VFF2.1080p",
        "Movie.2020.VFI.1080p",
    ],
)
def test_release_is_french_matches_known_tags(title):
    assert release_is_french({"title": title, "languages": []}) is True


def test_release_is_french_via_declared_language():
    assert release_is_french({"title": "Some.Show.S01E01.720p", "languages": ["French"]}) is True


def test_explicit_multi_marker_is_sufficient_despite_japanese_declared_language():
    release = {
        "title": "Hana.Kimi.S02E04.MULTi.1080p.WEB-DL.AAC.2.0.x264-Tsundere-Raws",
        "languages": ["Japanese"],
    }

    assert release_is_french(release) is True
    assert french_release_evidence(release)["vf_confidence"] == 100


def test_declared_french_language_is_sufficient_without_title_marker():
    evidence = french_release_evidence({"title": "Some.Show.S01E01.720p.WEB-DL", "languages": ["French"]})

    assert evidence["vf_confidence"] == 100


@pytest.mark.parametrize(
    "title",
    [
        "Some.Show.S01E01.ENGLISH.1080p",
        "Multiverse.Saga.2020.1080p",  # "multi" pas isole (multiverse), ne doit pas matcher
    ],
)
def test_release_is_french_rejects_unrelated_titles(title):
    assert release_is_french({"title": title, "languages": []}) is False


@pytest.mark.asyncio
async def test_search_task_drops_zero_seed_torrents_but_keeps_usenet():
    """Un torrent a 0 seed ne demarrera jamais (personne pour l'uploader) : exclu de la
    liste proposee. Le usenet n'a pas cette notion de seeds, jamais exclu pour ce motif."""
    inst = ArrInstance(name="Radarr", arr_type="radarr", url="http://radarr.local", api_key="key")
    task = _SearchTask(
        source_type="library_item",
        source_id=1,
        scope="movie",
        arr_type="radarr",
        inst=inst,
        arr_id=99,
        title="Some Movie",
    )
    releases = [
        {
            "guid": "dead-torrent",
            "title": "Some.Movie.MULTI.1080p",
            "protocol": "torrent",
            "seeders": 0,
            "languages": [],
        },
        {
            "guid": "alive-torrent",
            "title": "Some.Movie.MULTI.720p",
            "protocol": "torrent",
            "seeders": 3,
            "languages": [],
        },
        {
            "guid": "usenet-no-seeds",
            "title": "Some.Movie.MULTI.2160p",
            "protocol": "usenet",
            "seeders": 0,
            "languages": [],
        },
    ]
    with (
        patch("app.services.vf_upgrade_scanner.radarr.get_releases", new=AsyncMock(return_value=releases)),
        patch("app.services.vf_upgrade_scanner.radarr.get_movie_files", new=AsyncMock(return_value=[])),
    ):
        matched = await _search_task(task, settings=None)

    guids = {release["guid"] for release in matched}
    assert guids == {"alive-torrent", "usenet-no-seeds"}


@pytest.mark.asyncio
async def test_search_task_keeps_multi_release_at_default_confidence_threshold():
    inst = ArrInstance(name="Sonarr", arr_type="sonarr", url="http://sonarr.local", api_key="key")
    task = _SearchTask(
        source_type="library_item",
        source_id=928,
        scope="season",
        arr_type="sonarr",
        inst=inst,
        arr_id=1156,
        season_number=2,
        title="Hana-Kimi - Saison 2",
    )
    release = {
        "guid": "hana-kimi-s02e04-multi",
        "title": "Hana.Kimi.S02E04.MULTi.1080p.WEB-DL.AAC.2.0.x264-Tsundere-Raws",
        "protocol": "torrent",
        "seeders": 23,
        "languages": ["Japanese"],
    }
    settings = Settings(vf_upgrade_min_confidence=65)

    with (
        patch("app.services.vf_upgrade_scanner.sonarr.get_releases", new=AsyncMock(return_value=[release])),
        patch("app.services.vf_upgrade_scanner.sonarr.get_episode_files", new=AsyncMock(return_value=[])),
    ):
        matched = await _search_task(task, settings=settings)

    assert [item["guid"] for item in matched] == [release["guid"]]
    assert matched[0]["vf_confidence"] == 100


# ---------------------------------------------------------------------------
# Fixtures DB in-memory
# ---------------------------------------------------------------------------


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = TestSession(Session())
    yield session
    session.close()


def _sonarr_instance(db, **kwargs):
    defaults = dict(
        name="Sonarr", arr_type="sonarr", url="http://sonarr.local", api_key="key", enabled=True, is_default=True
    )
    defaults.update(kwargs)
    inst = ArrInstance(**defaults)
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


def _radarr_instance(db, **kwargs):
    defaults = dict(
        name="Radarr", arr_type="radarr", url="http://radarr.local", api_key="key", enabled=True, is_default=True
    )
    defaults.update(kwargs)
    inst = ArrInstance(**defaults)
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


def _show_item(db, **kwargs) -> LibraryItem:
    defaults = dict(title="Some Show", media_type="show", arr_id=42, has_vf=False)
    defaults.update(kwargs)
    item = LibraryItem(**defaults)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _movie_item(db, **kwargs) -> LibraryItem:
    defaults = dict(title="Some Movie", media_type="movie", arr_id=99, has_vf=False)
    defaults.update(kwargs)
    item = LibraryItem(**defaults)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@pytest.mark.parametrize(
    ("source_type", "proxy_kind"),
    [("library_item", "library"), ("request", "request")],
)
def test_vf_dashboard_uses_an_opaque_poster_url(db, source_type, proxy_kind):
    model = LibraryItem if source_type == "library_item" else MediaRequest
    values = {
        "title": "Film Plex",
        "media_type": "movie",
        "poster_url": "https://plex.local/library/metadata/42/thumb?X-Plex-Token=secret",
    }
    if model is MediaRequest:
        values.update(plex_user_id="user-1", plex_user="Moi", status=RequestStatus.pending)
    media = model(**values)
    db.add(media)
    db.commit()
    db.refresh(media)

    poster_url = _media_payload(media, source_type)["poster_url"]

    assert poster_url.startswith(f"/api/image-proxy/{proxy_kind}/{media.id}?")
    assert "plex.local" not in poster_url
    assert "X-Plex-Token" not in poster_url


@pytest.mark.asyncio
@pytest.mark.parametrize(("scope", "arr_type"), [("movie", "radarr"), ("season", "sonarr")])
async def test_manual_grab_can_force_arr_rejected_release_for_movie_and_season(db, scope, arr_type):
    """Le bouton admin reste utilisable même lorsque toutes les releases sont rejetées par le profil *arr."""
    inst = _radarr_instance(db) if arr_type == "radarr" else _sonarr_instance(db)
    item = _movie_item(db, arr_instance_id=inst.id) if scope == "movie" else _show_item(db, arr_instance_id=inst.id)
    db.add(Settings(vff_enabled=True, vf_upgrade_block_arr_rejected=True))
    suggestion = VfUpgradeSuggestion(
        source_type="library_item",
        source_id=item.id,
        scope=scope,
        season_number=1 if scope == "season" else None,
        releases_json=json.dumps(
            [
                {
                    "guid": "manual-guid",
                    "indexer_id": 7,
                    "title": "Release MULTI",
                    "rejected": True,
                    "rejections": ["Quality for existing file on disk is of equal or higher preference"],
                }
            ]
        ),
        status="pending",
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)

    service = "radarr" if scope == "movie" else "sonarr"
    with (
        patch(f"app.routers.vf_upgrades_api.{service}.get_queue", new=AsyncMock(return_value=[])),
        patch(
            f"app.routers.vf_upgrades_api.{service}.grab_release", new=AsyncMock(return_value=(True, "accepted", False))
        ) as grab,
    ):
        result = await grab_vf_upgrade(
            suggestion.id,
            VfUpgradeGrabRequest(guid="manual-guid", indexer_id=7, force=True),
            db,
        )

    assert result["accepted"] is True
    grab.assert_awaited_once_with(inst.url, inst.api_key, "manual-guid", 7)


@pytest.mark.asyncio
async def test_grab_retries_once_after_relaunching_a_stale_search(db):
    """Un 404 sur le grab (resultat de recherche expire cote *arr) doit declencher une
    relance automatique de la recherche, puis un seul retry du grab -- pas d'echec
    immediat renvoye a l'utilisateur pour un cas qu'on peut resoudre nous-memes."""
    inst = _radarr_instance(db)
    item = _movie_item(db, arr_instance_id=inst.id)
    db.add(Settings(vff_enabled=True))
    suggestion = VfUpgradeSuggestion(
        source_type="library_item",
        source_id=item.id,
        scope="movie",
        releases_json=json.dumps([{"guid": "stale-guid", "indexer_id": 7, "title": "Release MULTI"}]),
        status="pending",
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)

    stale_then_ok = AsyncMock(
        side_effect=[
            (False, "expire", True),
            (True, "accepted", False),
        ]
    )
    with (
        patch("app.routers.vf_upgrades_api.radarr.get_queue", new=AsyncMock(return_value=[])),
        patch("app.routers.vf_upgrades_api.radarr.grab_release", new=stale_then_ok),
        patch("app.routers.vf_upgrades_api.scan_single_target", new=AsyncMock(return_value=[])) as rescan,
    ):
        result = await grab_vf_upgrade(
            suggestion.id,
            VfUpgradeGrabRequest(guid="stale-guid", indexer_id=7, force=True),
            db,
        )

    assert result["accepted"] is True
    assert stale_then_ok.await_count == 2
    rescan.assert_awaited_once_with(db, "library_item", item.id, "movie", None, None)


@pytest.mark.asyncio
async def test_grab_fails_when_retry_after_stale_search_still_fails(db):
    """Si le retry echoue aussi, l'erreur finale (pas la premiere) doit remonter."""
    inst = _radarr_instance(db)
    item = _movie_item(db, arr_instance_id=inst.id)
    db.add(Settings(vff_enabled=True))
    suggestion = VfUpgradeSuggestion(
        source_type="library_item",
        source_id=item.id,
        scope="movie",
        releases_json=json.dumps([{"guid": "stale-guid", "indexer_id": 7, "title": "Release MULTI"}]),
        status="pending",
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)

    always_stale = AsyncMock(return_value=(False, "toujours indisponible", True))
    with (
        patch("app.routers.vf_upgrades_api.radarr.get_queue", new=AsyncMock(return_value=[])),
        patch("app.routers.vf_upgrades_api.radarr.grab_release", new=always_stale),
        patch("app.routers.vf_upgrades_api.scan_single_target", new=AsyncMock(return_value=[])),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await grab_vf_upgrade(
                suggestion.id,
                VfUpgradeGrabRequest(guid="stale-guid", indexer_id=7, force=True),
                db,
            )

    assert exc_info.value.status_code == 500
    assert "toujours indisponible" in exc_info.value.detail
    assert always_stale.await_count == 2


@pytest.mark.asyncio
async def test_download_completion_triggers_one_plex_refresh(db):
    inst = _radarr_instance(db)
    item = _movie_item(db, arr_instance_id=inst.id)
    db.add(
        Settings(
            vff_enabled=True,
            vf_upgrade_verify_after_import=True,
            vf_upgrade_trigger_plex_scan=True,
        )
    )
    suggestion = VfUpgradeSuggestion(
        source_type="library_item",
        source_id=item.id,
        scope="movie",
        status="downloading",
        accepted_at=now_utc_naive(),
    )
    db.add(suggestion)
    db.commit()

    with (
        patch("app.routers.vf_upgrades_api.radarr.get_queue", new=AsyncMock(return_value=[])),
        patch(
            "app.services.vff_scanner.trigger_plex_library_refresh",
            new=AsyncMock(),
        ) as refresh,
    ):
        await _refresh_lifecycle(db, suggestion, item)
        await _refresh_lifecycle(db, suggestion, item)

    assert suggestion.status == "awaiting_verification"
    refresh.assert_awaited_once_with(
        db.query(Settings).first(),
        "movie",
        arr_type="radarr",
        arr_url=inst.url,
        arr_api_key=inst.api_key,
        cache_key=f"radarr:{inst.id}",
    )


# ---------------------------------------------------------------------------
# _build_movie_tasks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_build_movie_tasks_creates_task_for_vo_movie(db):
    _radarr_instance(db)
    _movie_item(db)

    tasks = await _build_movie_tasks(db, force=False, skip=set(), recent=set())

    assert len(tasks) == 1
    assert tasks[0].scope == "movie"
    assert tasks[0].arr_type == "radarr"
    assert tasks[0].arr_id == 99


@pytest.mark.asyncio
async def test_build_movie_tasks_skips_already_vf(db):
    _radarr_instance(db)
    _movie_item(db, has_vf=True)

    tasks = await _build_movie_tasks(db, force=False, skip=set(), recent=set())

    assert tasks == []


@pytest.mark.asyncio
async def test_build_movie_tasks_protects_existing_vf_even_when_scope_enabled(db):
    _radarr_instance(db)
    _movie_item(db, has_vf=True)
    settings = Settings(vf_upgrade_include_vf=True, vf_upgrade_protect_existing_vf=True)

    tasks = await _build_movie_tasks(db, force=False, skip=set(), recent=set(), settings=settings)

    assert tasks == []


def test_order_tasks_applies_configured_target_priority():
    tasks = [
        _SearchTask("library_item", 1, "movie", "radarr", None, target_kind="vo"),
        _SearchTask("library_item", 2, "season", "sonarr", None, target_kind="mixed"),
        _SearchTask("library_item", 3, "movie", "radarr", None, target_kind="vf"),
    ]
    settings = Settings(vf_upgrade_priority="vf,vo,mixed")

    ordered = _order_tasks(tasks, settings)

    assert [task.target_kind for task in ordered] == ["vf", "vo", "mixed"]


@pytest.mark.asyncio
async def test_failed_target_uses_retry_delay_instead_of_regular_cooldown(db):
    scanned_at = now_utc_naive() - timedelta(hours=8)
    row = VfUpgradeSuggestion(
        source_type="library_item",
        source_id=12,
        scope="movie",
        status="failed",
        retry_count=1,
        scanned_at=scanned_at,
    )
    db.add(row)
    db.commit()
    settings = Settings(vf_upgrade_cooldown_hours=24, vf_upgrade_retry_hours=6)

    recent = await _recent_scan_keys(db, settings)

    assert ("library_item", 12, "movie", None, None) not in recent


@pytest.mark.asyncio
async def test_failed_target_is_skipped_after_max_retries(db):
    row = VfUpgradeSuggestion(
        source_type="library_item",
        source_id=13,
        scope="movie",
        status="failed",
        retry_count=3,
    )
    db.add(row)
    db.commit()

    skipped = await _skip_statuses(db, Settings(vf_upgrade_max_retries=3))

    assert ("library_item", 13, "movie", None, None) in skipped


@pytest.mark.asyncio
async def test_build_movie_tasks_skips_seer_requests(db):
    """Une demande Seer porte l'ID interne Seer dans arr_id, pas celui de Radarr --
    meme regle que _trigger_vf_search (vff_scanner.py)."""
    _radarr_instance(db)
    req = MediaRequest(
        plex_user_id="alice",
        plex_user="Alice",
        title="Seer Movie",
        media_type="movie",
        status=RequestStatus.available,
        has_vf=False,
        arr_id=7,
        source="seer",
    )
    db.add(req)
    db.commit()

    tasks = await _build_movie_tasks(db, force=False, skip=set(), recent=set())

    assert tasks == []


@pytest.mark.asyncio
async def test_build_movie_tasks_skips_requests_already_linked_to_a_library_item(db):
    """Une demande liee a un LibraryItem (voir vff_scanner._link_request_to_library_item)
    fait doublon avec lui : meme film/arr_id, mais un titre fige au moment de la demande
    (jamais resynchronise si l'utilisateur renomme ensuite le fichier dans Plex). Sans ce
    garde-fou, les deux lignes produisent chacune leur propre tache de recherche pour le
    meme film -- reproduit un bug reel observe en production (deux cartes "Toy Story 5")."""
    _radarr_instance(db)
    item = _movie_item(db, title="Toy Story 5 (VOSTFR)")
    req = MediaRequest(
        plex_user_id="alice",
        plex_user="Alice",
        title="Toy Story 5",
        media_type="movie",
        status=RequestStatus.available,
        has_vf=False,
        arr_id=item.arr_id,
        library_item_id=item.id,
    )
    db.add(req)
    db.commit()

    tasks = await _build_movie_tasks(db, force=False, skip=set(), recent=set())

    assert len(tasks) == 1
    assert tasks[0].source_type == "library_item"
    assert tasks[0].source_id == item.id


@pytest.mark.asyncio
async def test_build_movie_tasks_respects_recent_cooldown(db):
    _radarr_instance(db)
    item = _movie_item(db)
    recent = {("library_item", item.id, "movie", None, None)}

    tasks = await _build_movie_tasks(db, force=False, skip=set(), recent=recent)

    assert tasks == []


@pytest.mark.asyncio
async def test_build_movie_tasks_force_bypasses_cooldown_and_skip(db):
    _radarr_instance(db)
    item = _movie_item(db)
    key = ("library_item", item.id, "movie", None, None)

    tasks = await _build_movie_tasks(db, force=True, skip={key}, recent={key})

    assert len(tasks) == 1


# ---------------------------------------------------------------------------
# _build_show_tasks : granularite adaptative (saison VO vs saison mixte)
# ---------------------------------------------------------------------------


def _episode_status(db, source_id, season, episode, has_vf):
    db.add(
        VfEpisodeStatus(
            source_type="library_item",
            source_id=source_id,
            season_number=season,
            episode_number=episode,
            has_vf=has_vf,
            is_known_episode=True,
        )
    )


@pytest.mark.asyncio
async def test_build_show_tasks_fully_vo_season_no_fallback(db):
    """Saison entierement VO sans fallback episodique -> une seule tache season pack, pas d'appel episodes."""
    _sonarr_instance(db)
    item = _show_item(db)
    for ep in (1, 2, 3):
        _episode_status(db, item.id, season=1, episode=ep, has_vf=False)
    db.commit()

    settings = Settings(vff_enabled=True, vf_upgrade_episodic_fallback=False)
    with patch("app.services.vf_upgrade_scanner.sonarr.get_episodes", new=AsyncMock()) as mock_get_episodes:
        tasks = await _build_show_tasks(db, force=False, skip=set(), recent=set(), settings=settings)

    mock_get_episodes.assert_not_awaited()
    assert len(tasks) == 1
    assert tasks[0].scope == "season"
    assert tasks[0].season_number == 1
    assert tasks[0].episode_number is None


@pytest.mark.asyncio
async def test_build_show_tasks_fully_vo_season_with_episodic_fallback(db):
    """Saison entierement VO avec fallback episodique -> season pack + taches par episode."""
    _sonarr_instance(db)
    item = _show_item(db)
    for ep in (1, 2, 3):
        _episode_status(db, item.id, season=1, episode=ep, has_vf=False)
    db.commit()

    recent_air = now_utc().isoformat().replace("+00:00", "Z")
    fake_episodes = [
        {"id": 10 + ep, "seasonNumber": 1, "episodeNumber": ep, "hasFile": True, "airDateUtc": recent_air}
        for ep in (1, 2, 3)
    ]
    settings = Settings(vff_enabled=True, vf_upgrade_episodic_fallback=True)
    with (
        patch("app.services.vf_upgrade_scanner.sonarr.lookup_series", new=AsyncMock(return_value=None)),
        patch("app.services.vf_upgrade_scanner.sonarr.get_episodes", new=AsyncMock(return_value=fake_episodes)),
    ):
        tasks = await _build_show_tasks(db, force=False, skip=set(), recent=set(), settings=settings)

    # 1 season pack + 3 épisodes individuels
    scopes = [t.scope for t in tasks]
    assert scopes.count("season") == 1
    assert scopes.count("episode") == 3
    season_task = next(t for t in tasks if t.scope == "season")
    assert season_task.season_number == 1


@pytest.mark.asyncio
async def test_build_show_tasks_mixed_season_searches_only_missing_episodes(db):
    """Saison mixte -> recherche uniquement les episodes encore VO, jamais toute la
    saison ni les episodes deja VF."""
    _sonarr_instance(db)
    item = _show_item(db)
    _episode_status(db, item.id, season=1, episode=1, has_vf=True)
    _episode_status(db, item.id, season=1, episode=2, has_vf=True)
    _episode_status(db, item.id, season=1, episode=3, has_vf=False)
    _episode_status(db, item.id, season=1, episode=4, has_vf=False)
    db.commit()

    sonarr_episodes = [
        {"id": 100, "seasonNumber": 1, "episodeNumber": 1},
        {"id": 101, "seasonNumber": 1, "episodeNumber": 2},
        {"id": 102, "seasonNumber": 1, "episodeNumber": 3},
        {"id": 103, "seasonNumber": 1, "episodeNumber": 4},
    ]
    with patch(
        "app.services.vf_upgrade_scanner.sonarr.get_episodes",
        new=AsyncMock(return_value=sonarr_episodes),
    ):
        tasks = await _build_show_tasks(db, force=False, skip=set(), recent=set())

    assert len(tasks) == 2
    assert {t.scope for t in tasks} == {"episode"}
    assert {t.episode_number for t in tasks} == {3, 4}
    assert {t.episode_id for t in tasks} == {102, 103}


@pytest.mark.asyncio
async def test_protection_forces_missing_episode_search_even_if_pack_mode_is_selected(db):
    _sonarr_instance(db)
    item = _show_item(db)
    _episode_status(db, item.id, season=1, episode=1, has_vf=True)
    _episode_status(db, item.id, season=1, episode=2, has_vf=False)
    db.commit()
    settings = Settings(vf_upgrade_mixed_mode="season", vf_upgrade_protect_existing_vf=True)

    with patch(
        "app.services.vf_upgrade_scanner.sonarr.get_episodes",
        new=AsyncMock(
            return_value=[
                {"id": 10, "seasonNumber": 1, "episodeNumber": 1},
                {"id": 11, "seasonNumber": 1, "episodeNumber": 2},
            ]
        ),
    ):
        tasks = await _build_show_tasks(db, False, set(), set(), settings)

    assert len(tasks) == 1
    assert tasks[0].scope == "episode"
    assert tasks[0].episode_number == 2


@pytest.mark.asyncio
async def test_build_show_tasks_skips_fully_vf_season(db):
    _sonarr_instance(db)
    item = _show_item(db)
    _episode_status(db, item.id, season=1, episode=1, has_vf=True)
    _episode_status(db, item.id, season=1, episode=2, has_vf=True)
    db.commit()

    tasks = await _build_show_tasks(db, force=False, skip=set(), recent=set())

    assert tasks == []


@pytest.mark.asyncio
async def test_build_show_tasks_skips_requests_already_linked_to_a_library_item(db):
    """Meme garde-fou que pour les films (voir
    test_build_movie_tasks_skips_requests_already_linked_to_a_library_item)."""
    _sonarr_instance(db)
    item = _show_item(db, title="Some Show (VOSTFR)")
    _episode_status(db, item.id, season=1, episode=1, has_vf=False)
    req = MediaRequest(
        plex_user_id="alice",
        plex_user="Alice",
        title="Some Show",
        media_type="show",
        status=RequestStatus.available,
        has_vf=False,
        arr_id=item.arr_id,
        library_item_id=item.id,
    )
    db.add(req)
    db.commit()

    tasks = await _build_show_tasks(db, force=False, skip=set(), recent=set())

    assert len(tasks) == 1
    assert tasks[0].source_type == "library_item"
    assert tasks[0].source_id == item.id


@pytest.mark.asyncio
async def test_manual_mixed_season_search_uses_one_full_season_pack(db):
    """Le bouton saison reste un season pack même si l'analyse VF est mixte."""
    _sonarr_instance(db)
    item = _show_item(db)
    _episode_status(db, item.id, season=2, episode=1, has_vf=True)
    _episode_status(db, item.id, season=2, episode=2, has_vf=False)
    db.commit()

    releases = [{"guid": "pack", "title": "Some.Show.S02.MULTI.1080p"}]
    with (
        patch(
            "app.services.vf_upgrade_scanner.sonarr.get_releases",
            new=AsyncMock(return_value=releases),
        ) as get_releases,
        patch(
            "app.services.vf_upgrade_scanner.sonarr.get_episode_files",
            new=AsyncMock(
                return_value=[
                    {
                        "seasonNumber": 2,
                        "sceneName": "Some.Show.S02.VO.2160p.WEB-DL.HDR.x265",
                    }
                ]
            ),
        ),
    ):
        found = await scan_single_target(db, "library_item", item.id, "season", season_number=2)

    assert found[0]["guid"] == releases[0]["guid"]
    assert found[0]["vf_confidence"] > 0
    persisted = db.query(VfUpgradeSuggestion).filter_by(source_id=item.id, scope="season").first()
    assert json.loads(persisted.current_release_titles_json) == ["Some.Show.S02.VO.2160p.WEB-DL.HDR.x265"]
    assert persisted.origin == "manual"
    assert persisted.target_kind == "mixed"
    get_releases.assert_awaited_once_with("http://sonarr.local", "key", series_id=42, season_number=2)


@pytest.mark.asyncio
async def test_manual_search_allows_movie_already_in_vf(db):
    """Le statut VF ne bloque jamais une recherche explicitement demandée."""
    _radarr_instance(db)
    item = _movie_item(db, has_vf=True)
    releases = [{"guid": "better-vf", "title": "Some.Movie.TRUEFRENCH.2160p"}]

    with (
        patch(
            "app.services.vf_upgrade_scanner.radarr.get_releases",
            new=AsyncMock(return_value=releases),
        ) as get_releases,
        patch(
            "app.services.vf_upgrade_scanner.radarr.get_movie_files",
            new=AsyncMock(
                return_value=[
                    {
                        "relativePath": "Some.Movie.VO.1080p.WEB-DL.x264.mkv",
                    }
                ]
            ),
        ),
    ):
        found = await scan_single_target(db, "library_item", item.id, "movie")

    assert found[0]["guid"] == releases[0]["guid"]
    assert found[0]["vf_confidence"] > 0
    # La modale reste utilisable, mais ce resultat n'est pas une amelioration VO -> VF
    # et ne doit donc pas polluer le dashboard global.
    persisted = db.query(VfUpgradeSuggestion).filter_by(source_id=item.id, scope="movie").first()
    assert persisted is None
    get_releases.assert_awaited_once_with("http://radarr.local", "key", 99)


@pytest.mark.asyncio
async def test_manual_vo_movie_search_is_persisted_as_relevant_upgrade(db):
    _radarr_instance(db)
    item = _movie_item(db, has_vf=False)
    releases = [{"guid": "vf", "title": "Some.Movie.TRUEFRENCH.2160p"}]

    with (
        patch(
            "app.services.vf_upgrade_scanner.radarr.get_releases",
            new=AsyncMock(return_value=releases),
        ),
        patch(
            "app.services.vf_upgrade_scanner.radarr.get_movie_files",
            new=AsyncMock(return_value=[]),
        ),
    ):
        await scan_single_target(db, "library_item", item.id, "movie")

    persisted = db.query(VfUpgradeSuggestion).filter_by(source_id=item.id).one()
    assert persisted.origin == "manual"
    assert persisted.target_kind == "vo"


@pytest.mark.asyncio
async def test_dashboard_hides_irrelevant_legacy_pending_but_keeps_auto_results(db):
    legacy_media = _movie_item(db, title="Ancienne recherche manuelle", has_vf=True)
    auto_media = _movie_item(db, title="Scan automatique", has_vf=True, arr_id=100)
    db.add_all(
        [
            VfUpgradeSuggestion(
                source_type="library_item",
                source_id=legacy_media.id,
                scope="movie",
                releases_json='[{"guid":"legacy"}]',
                status="pending",
                origin="legacy",
            ),
            VfUpgradeSuggestion(
                source_type="library_item",
                source_id=auto_media.id,
                scope="movie",
                releases_json='[{"guid":"auto"}]',
                status="pending",
                origin="auto",
                target_kind="vf",
            ),
        ]
    )
    db.commit()

    payload = await vf_upgrade_dashboard(db=db)

    assert [item["media"]["title"] for item in payload["items"]] == ["Scan automatique"]
    assert payload["items"][0]["origin"] == "auto"


@pytest.mark.asyncio
async def test_dashboard_hides_request_suggestion_already_linked_to_a_library_item(db):
    """Deux suggestions preexistantes (une par "request", une par "library_item") pour le
    meme film une fois la demande liee a son LibraryItem : seule celle du LibraryItem
    (titre a jour, synchronise avec Plex) doit apparaitre au dashboard. Couvre les
    suggestions deja en base avant le correctif, pas seulement les futurs scans."""
    item = _movie_item(db, title="Toy Story 5 (VOSTFR)", has_vf=False)
    req = MediaRequest(
        plex_user_id="alice",
        plex_user="Alice",
        title="Toy Story 5",
        media_type="movie",
        status=RequestStatus.available,
        has_vf=False,
        arr_id=item.arr_id,
        library_item_id=item.id,
    )
    db.add(req)
    db.commit()
    db.add_all(
        [
            VfUpgradeSuggestion(
                source_type="request",
                source_id=req.id,
                scope="movie",
                releases_json='[{"guid":"from-request"}]',
                status="pending",
                origin="auto",
                target_kind="vo",
            ),
            VfUpgradeSuggestion(
                source_type="library_item",
                source_id=item.id,
                scope="movie",
                releases_json='[{"guid":"from-library"}]',
                status="pending",
                origin="auto",
                target_kind="vo",
            ),
        ]
    )
    db.commit()

    payload = await vf_upgrade_dashboard(db=db)

    assert [item["media"]["title"] for item in payload["items"]] == ["Toy Story 5 (VOSTFR)"]


@pytest.mark.asyncio
async def test_build_show_tasks_ignores_phantom_episodes(db):
    """Un episode non reconnu par Sonarr/TheTVDB (is_known_episode=False, voir le
    correctif Konosuba de cette meme session) ne doit jamais generer de recherche --
    aucune release Sonarr ne peut de toute facon exister pour un episode qu'il ignore."""
    _sonarr_instance(db)
    item = _show_item(db)
    db.add(
        VfEpisodeStatus(
            source_type="library_item",
            source_id=item.id,
            season_number=1,
            episode_number=11,
            has_vf=False,
            is_known_episode=False,
        )
    )
    db.commit()

    tasks = await _build_show_tasks(db, force=False, skip=set(), recent=set())

    assert tasks == []


# ---------------------------------------------------------------------------
# _persist_result
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_persist_result_creates_pending_suggestion(db):
    task = _SearchTask(source_type="library_item", source_id=1, scope="movie", arr_type="radarr", inst=None, title="X")
    releases = [{"guid": "abc", "title": "X.FRENCH.1080p"}]

    found = await _persist_result(db, task, releases, now_utc_naive())
    db.commit()

    assert found is True
    row = db.query(VfUpgradeSuggestion).filter_by(source_type="library_item", source_id=1, scope="movie").first()
    assert row.status == "pending"
    assert row.origin == "auto"
    assert row.target_kind == "vo"
    assert "abc" in row.releases_json


@pytest.mark.asyncio
async def test_persist_result_removes_stale_pending_when_nothing_found(db):
    task = _SearchTask(source_type="library_item", source_id=1, scope="movie", arr_type="radarr", inst=None, title="X")
    await _persist_result(db, task, [{"guid": "abc", "title": "X.FRENCH"}], now_utc_naive())
    db.commit()

    found = await _persist_result(db, task, [], now_utc_naive())
    db.commit()

    assert found is False
    row = db.query(VfUpgradeSuggestion).filter_by(source_type="library_item", source_id=1, scope="movie").first()
    assert row is None


@pytest.mark.asyncio
async def test_empty_manual_search_does_not_remove_an_automatic_suggestion(db):
    task = _SearchTask(
        source_type="library_item",
        source_id=1,
        scope="movie",
        arr_type="radarr",
        inst=None,
        title="X",
    )
    await _persist_result(
        db,
        task,
        [{"guid": "abc", "title": "X.FRENCH"}],
        now_utc_naive(),
        origin="auto",
    )
    db.commit()

    found = await _persist_result(db, task, [], now_utc_naive(), origin="manual")
    db.commit()

    assert found is False
    assert db.query(VfUpgradeSuggestion).filter_by(source_id=1).one().origin == "auto"


@pytest.mark.asyncio
async def test_persist_result_never_touches_dismissed_status(db):
    """Un re-scan (bouton "Chercher" force) qui ne trouve plus rien ne doit pas
    supprimer une suggestion deja ignoree par l'utilisateur -- seul le pending perime
    est nettoye (voir _skip_statuses, qui exclut deja grabbed/dismissed du scan de fond)."""
    row = VfUpgradeSuggestion(
        source_type="library_item",
        source_id=1,
        scope="movie",
        releases_json='[{"guid": "abc"}]',
        status="dismissed",
        scanned_at=now_utc_naive(),
    )
    db.add(row)
    db.commit()

    task = _SearchTask(source_type="library_item", source_id=1, scope="movie", arr_type="radarr", inst=None, title="X")
    found = await _persist_result(db, task, [], now_utc_naive())
    db.commit()

    assert found is False
    persisted = db.query(VfUpgradeSuggestion).filter_by(source_type="library_item", source_id=1, scope="movie").first()
    assert persisted is not None
    assert persisted.status == "dismissed"


@pytest.mark.asyncio
async def test_vf_upgrade_audit_detects_anomalies(db):
    """L'audit VF (Mode PASTA) doit catégoriser les anomalies de flux configurables sur Plex."""
    # 1. Film avec VF mais secondaire
    item_sec = _movie_item(db, title="Film VF Secondaire", has_vf=True, fr_is_default=False)
    # 2. Film VO avec sous-titres FR inactifs (actionnable sur Plex)
    item_vo_sub = _movie_item(db, title="Film VO ST Inactif", has_vf=False, sub_fr_status="not_default")
    # 3. Film VF avec sous-titre forcé inactif
    _movie_item(db, title="Film VF ST Forcé Inactif", has_vf=True, fr_is_default=True, forced_fr_status="not_default")
    # 4. Série avec VF partielle
    show_partial = _show_item(db, title="Série Mixte", has_vf=False, vf_granularity="season_partial")
    # 5. Film VO 100% sans aucun flux FR (va dans Releases & Téléchargements, pas dans l'audit PASTA)
    item_vo_pure = _movie_item(db, title="Film VO Pur", has_vf=False, sub_fr_status="absent")
    # 6. Film parfait (VF par défaut, aucun problème)
    _movie_item(db, title="Film Parfait", has_vf=True, fr_is_default=True, forced_fr_status="ok")
    db.commit()

    result = await vf_upgrade_audit(db=db)

    counts = result["counts"]
    assert counts["total"] == 4  # item_ok et item_vo_pure n'ont pas d'anomalie de flux Plex
    assert counts["audio_secondary"] == 1
    assert counts["sub_fr_not_default"] == 1
    assert counts["forced_sub_not_default"] == 1
    assert counts["partial_vf"] == 1

    # Test filtre par issue_type
    filtered_sec = await vf_upgrade_audit(issue_type="audio_secondary", db=db)
    assert len(filtered_sec["items"]) == 1
    assert filtered_sec["items"][0]["id"] == item_sec.id
    assert "audio_secondary" in filtered_sec["items"][0]["issues"]

    filtered_sub = await vf_upgrade_audit(issue_type="sub_fr_not_default", db=db)
    assert len(filtered_sub["items"]) == 1
    assert filtered_sub["items"][0]["id"] == item_vo_sub.id

    # Test dashboard : item_vo_pure doit apparaître en waiting_release dans les Téléchargements
    from app.routers.vf_upgrades_api import vf_upgrade_dashboard

    dash = await vf_upgrade_dashboard(db=db)
    waiting_items = [it for it in dash["items"] if it.get("status") == "waiting_release"]
    waiting_ids = [it["source_id"] for it in waiting_items]
    assert item_vo_pure.id in waiting_ids
    assert show_partial.id in waiting_ids


def test_compute_subtitle_status_edge_cases():
    """Vérifie la détection de sous-titres FR complets, forcés seuls sur VO, inactifs ou absents."""
    from app.services.vff_scanner import _compute_subtitle_status

    # 1. Média VO avec une seule piste FR marquée forcé et active (cas de 3%)
    vo_tracks = [{"lang": "por", "is_fr": False, "is_default": True}]
    single_forced_active = [
        {"lang": "fra", "is_fr": True, "is_forced": True, "is_default": True},
        {"lang": "eng", "is_fr": False, "is_forced": False, "is_default": False},
    ]
    sub_fr, forced_fr = _compute_subtitle_status("movie", vo_tracks, single_forced_active)
    assert sub_fr == "forced_default"
    assert forced_fr is None

    # 2. Média VO avec une seule piste FR marquée forcé et inactive
    single_forced_inactive = [
        {"lang": "fra", "is_fr": True, "is_forced": True, "is_default": False},
        {"lang": "eng", "is_fr": False, "is_forced": False, "is_default": True},
    ]
    sub_fr, forced_fr = _compute_subtitle_status("movie", vo_tracks, single_forced_inactive)
    assert sub_fr == "forced_not_default"
    assert forced_fr is None

    # 3. Média VO avec piste complète FR active
    full_active = [
        {"lang": "fra", "is_fr": True, "is_forced": False, "is_default": True},
    ]
    sub_fr, forced_fr = _compute_subtitle_status("movie", vo_tracks, full_active)
    assert sub_fr == "ok"
    assert forced_fr is None

    # 4. Média VO sans aucun sous-titre FR (uniquement anglais)
    only_en_subs = [
        {"lang": "eng", "is_fr": False, "is_forced": False, "is_default": True},
    ]
    sub_fr, forced_fr = _compute_subtitle_status("movie", vo_tracks, only_en_subs)
    assert sub_fr == "absent"
    assert forced_fr is None

    # 5. Média VF avec sous-titre forcé actif
    vf_tracks = [{"lang": "fra", "is_fr": True, "is_default": True}]
    vf_subs = [{"lang": "fra", "is_fr": True, "is_forced": True, "is_default": True}]
    sub_fr, forced_fr = _compute_subtitle_status("movie", vf_tracks, vf_subs)
    assert sub_fr is None
    assert forced_fr == "ok"


def test_choose_best_subtitle_stream_vo_single_forced():
    """Sur un média VO, si la seule piste FR disponible est marquée 'forced', on la sélectionne."""
    from app.services.plex_stream_aligner import choose_best_subtitle_stream

    class MockStream:
        def __init__(self, id, lang, language_code, title="", forced=False, selected=False):
            self.id = id
            self.language = lang
            self.languageCode = language_code
            self.title = title
            self.forced = forced
            self.selected = selected
            self.codec = "srt"

    sub_fr_forced = MockStream(44777, "Français", "fra", title="Français Forcé", forced=True, selected=True)
    sub_en = MockStream(44778, "English", "eng", title="English", forced=False, selected=False)

    # Audio VO -> doit sélectionner sub_fr_forced plutôt que None
    target_sub, should_apply = choose_best_subtitle_stream([sub_fr_forced, sub_en], is_french_audio=False)
    assert target_sub is not None
    assert target_sub.id == 44777
    assert should_apply is True


@pytest.mark.asyncio
async def test_arr_grab_synchronizes_vf_upgrade_suggestion(async_db):
    from app.routers.arr_releases_api import ArrGrabRequest, arr_grab_release

    inst = ArrInstance(
        id=10,
        name="Radarr Test",
        arr_type="radarr",
        url="http://radarr.local",
        api_key="radkey",
        enabled=True,
        is_default=True,
    )
    async_db.add(inst)
    item = LibraryItem(id=50, title="Film Test", media_type="movie", arr_id=99, arr_instance_id=10, has_vf=False)
    async_db.add(item)
    suggestion = VfUpgradeSuggestion(
        source_type="library_item",
        source_id=50,
        scope="movie",
        status="pending",
        releases_json='[{"guid":"rel-123","indexer_id":1}]',
    )
    async_db.add(suggestion)
    async_db.commit()

    with patch("app.services.radarr.grab_release", new=AsyncMock(return_value=(True, "Release acceptée", False))):
        body = ArrGrabRequest(
            media_type="movie",
            guid="rel-123",
            indexer_id=1,
            source_type="library_item",
            source_id=50,
            scope="movie",
        )
        res = await arr_grab_release(body, async_db)

    assert res["success"] is True
    assert suggestion.status == "accepted"
    assert suggestion.grabbed_release_guid == "rel-123"
    assert suggestion.accepted_at is not None


# ---------------------------------------------------------------------------
# _sonarr_season_tasks : fallback Fix #1 (série sans VfEpisodeStatus)
# ---------------------------------------------------------------------------


def _fake_series_data(season_numbers_with_files: list[int]) -> dict:
    """Simule le dict retourné par sonarr.lookup_series."""
    return {
        "id": 42,
        "title": "Some Show",
        "statistics": {},
        "seasons": [
            {
                "seasonNumber": sn,
                "monitored": True,
                "statistics": {"episodeFileCount": 2, "episodeCount": 2, "totalEpisodeCount": 2},
            }
            for sn in season_numbers_with_files
        ],
    }


@pytest.mark.asyncio
async def test_sonarr_season_tasks_season_pack_only(db):
    """Sans fallback episodique : une tache season-pack par saison avec fichiers."""
    inst = _sonarr_instance(db)
    item = _show_item(db)

    settings = Settings(vf_upgrade_episodic_fallback=False)
    fake_data = _fake_series_data([1, 2])

    with patch("app.services.vf_upgrade_scanner.sonarr.lookup_series", new=AsyncMock(return_value=fake_data)):
        tasks = await _sonarr_season_tasks(item, inst, "library_item", False, set(), set(), settings)

    assert len(tasks) == 2
    assert all(t.scope == "season" for t in tasks)
    assert {t.season_number for t in tasks} == {1, 2}
    assert all(t.target_kind == "vo" for t in tasks)


@pytest.mark.asyncio
async def test_sonarr_season_tasks_with_episodic_fallback(db):
    """Avec fallback episodique : season-pack + épisodes individuels."""
    inst = _sonarr_instance(db)
    item = _show_item(db)

    settings = Settings(vf_upgrade_episodic_fallback=True)
    fake_data = _fake_series_data([1])
    recent_air = now_utc().isoformat().replace("+00:00", "Z")
    fake_episodes = [
        {"id": 10, "seasonNumber": 1, "episodeNumber": 1, "hasFile": True, "airDateUtc": recent_air},
        {"id": 11, "seasonNumber": 1, "episodeNumber": 2, "hasFile": True, "airDateUtc": recent_air},
        {
            "id": 12,
            "seasonNumber": 1,
            "episodeNumber": 3,
            "hasFile": False,
            "airDateUtc": recent_air,
        },  # pas de fichier -> ignoré
    ]

    with (
        patch("app.services.vf_upgrade_scanner.sonarr.lookup_series", new=AsyncMock(return_value=fake_data)),
        patch("app.services.vf_upgrade_scanner.sonarr.get_episodes", new=AsyncMock(return_value=fake_episodes)),
    ):
        tasks = await _sonarr_season_tasks(item, inst, "library_item", False, set(), set(), settings)

    scopes = [t.scope for t in tasks]
    assert scopes.count("season") == 1
    assert scopes.count("episode") == 2  # seulement les épisodes avec hasFile=True
    ep_tasks = [t for t in tasks if t.scope == "episode"]
    assert {t.episode_number for t in ep_tasks} == {1, 2}
    assert all(t.episode_id in {10, 11} for t in ep_tasks)


@pytest.mark.asyncio
async def test_sonarr_season_tasks_no_series_data(db):
    """sonarr.lookup_series retourne None -> liste vide."""
    inst = _sonarr_instance(db)
    item = _show_item(db)

    with patch("app.services.vf_upgrade_scanner.sonarr.lookup_series", new=AsyncMock(return_value=None)):
        tasks = await _sonarr_season_tasks(item, inst, "library_item", False, set(), set())

    assert tasks == []


@pytest.mark.asyncio
async def test_sonarr_season_tasks_lookup_exception(db):
    """sonarr.lookup_series lève une exception -> liste vide sans crash."""
    inst = _sonarr_instance(db)
    item = _show_item(db)

    with patch("app.services.vf_upgrade_scanner.sonarr.lookup_series", new=AsyncMock(side_effect=Exception("network"))):
        tasks = await _sonarr_season_tasks(item, inst, "library_item", False, set(), set())

    assert tasks == []


@pytest.mark.asyncio
async def test_build_show_tasks_fallback_when_no_vf_episode_status(db):
    """Série sans VfEpisodeStatus -> _sonarr_season_tasks appelé -> taches créées."""
    _sonarr_instance(db)
    _show_item(db)
    db.commit()

    fake_data = _fake_series_data([1])
    settings = Settings(vff_enabled=True, vf_upgrade_episodic_fallback=False)

    with (
        patch("app.services.vf_upgrade_scanner.sonarr.lookup_series", new=AsyncMock(return_value=fake_data)),
        patch("app.services.vf_upgrade_scanner.sonarr.get_episodes", new=AsyncMock(return_value=[])),
    ):
        tasks = await _build_show_tasks(db, force=False, skip=set(), recent=set(), settings=settings)

    assert len(tasks) == 1
    assert tasks[0].scope == "season"
    assert tasks[0].season_number == 1
    assert tasks[0].target_kind == "vo"


@pytest.mark.asyncio
async def test_search_task_logs_when_no_match(db):
    """_search_task avec zéro release VF retournée : pas d'exception, matched=[]."""
    inst = _sonarr_instance(db)
    item = _show_item(db)

    task = _SearchTask(
        source_type="library_item",
        source_id=item.id,
        scope="season",
        arr_type="sonarr",
        inst=inst,
        arr_id=item.arr_id,
        season_number=1,
        title="Some Show - Saison 1",
    )
    vo_only_releases = [
        {"title": "Some.Show.S01.1080p.BluRay.x264-GROUP", "protocol": "torrent", "seeders": 10, "size": 5e9}
    ]
    settings = Settings(vff_enabled=True)

    with (
        patch("app.services.vf_upgrade_scanner.sonarr.get_releases", new=AsyncMock(return_value=vo_only_releases)),
        patch("app.services.vf_upgrade_scanner._current_release_titles", new=AsyncMock(return_value=[])),
    ):
        result = await _search_task(task, settings)

    assert list(result) == []
    assert result.raw_count == 1  # 1 release indexeur, 0 VF


@pytest.mark.asyncio
async def test_search_task_rejects_wrong_season(db):
    """Release pour S02 rejetée quand la tache cible S01."""
    inst = _sonarr_instance(db)
    item = _show_item(db)
    task = _SearchTask(
        source_type="library_item",
        source_id=item.id,
        scope="season",
        arr_type="sonarr",
        inst=inst,
        arr_id=item.arr_id,
        season_number=1,
        title="Some Show - Saison 1",
    )
    releases = [{"title": "Some.Show.S02.MULTI.1080p.BluRay", "protocol": "usenet", "size": 3e9, "seeders": 0}]

    with (
        patch("app.services.vf_upgrade_scanner.sonarr.get_releases", new=AsyncMock(return_value=releases)),
        patch("app.services.vf_upgrade_scanner._current_release_titles", new=AsyncMock(return_value=[])),
    ):
        result = await _search_task(task)

    assert list(result) == []
    assert result.raw_count == 1


@pytest.mark.asyncio
async def test_search_task_rejects_no_marker_no_language(db):
    """Release FRENCH sans marker dans titre et sans langue declaree -> rejetée."""
    inst = _sonarr_instance(db)
    item = _show_item(db)
    task = _SearchTask(
        source_type="library_item",
        source_id=item.id,
        scope="season",
        arr_type="sonarr",
        inst=inst,
        arr_id=item.arr_id,
        season_number=1,
        title="Some Show - Saison 1",
    )
    # Titre contient "french" (reconnu par release_is_french) mais markers= ne contient
    # pas "french" -> rejeté par le filtre marker.
    settings = Settings(vf_upgrade_markers="truefrench,vff,multi")
    releases = [{"title": "Some.Show.S01.FRENCH.1080p.BluRay", "protocol": "usenet", "size": 3e9}]

    with (
        patch("app.services.vf_upgrade_scanner.sonarr.get_releases", new=AsyncMock(return_value=releases)),
        patch("app.services.vf_upgrade_scanner._current_release_titles", new=AsyncMock(return_value=[])),
    ):
        result = await _search_task(task, settings)

    assert list(result) == []


@pytest.mark.asyncio
async def test_search_task_rejects_low_confidence(db):
    """Release avec vf_confidence < min_confidence -> rejetée."""
    inst = _sonarr_instance(db)
    item = _show_item(db)
    task = _SearchTask(
        source_type="library_item",
        source_id=item.id,
        scope="season",
        arr_type="sonarr",
        inst=inst,
        arr_id=item.arr_id,
        season_number=1,
        title="Some Show - Saison 1",
    )
    settings = Settings(vf_upgrade_min_confidence=100)  # exige 100
    # vf_confidence sera 100 (marqueur titre) mais on simule un cas 0 via languages=[]
    # En pratique on teste juste que le filtre confidence fonctionne :
    # une release sans marqueur ET sans langue -> confidence=0 < 100
    releases = [{"title": "Some.Show.S01.1080p.BluRay", "languages": [], "protocol": "usenet", "size": 3e9}]

    with (
        patch("app.services.vf_upgrade_scanner.sonarr.get_releases", new=AsyncMock(return_value=releases)),
        patch("app.services.vf_upgrade_scanner._current_release_titles", new=AsyncMock(return_value=[])),
    ):
        result = await _search_task(task, settings)

    assert list(result) == []


@pytest.mark.asyncio
async def test_search_task_rejects_by_size_bounds(db):
    """Release hors bornes de taille -> rejetée (min_size et max_size)."""
    inst = _sonarr_instance(db)
    item = _show_item(db)
    task = _SearchTask(
        source_type="library_item",
        source_id=item.id,
        scope="movie",
        arr_type="radarr",
        inst=inst,
        arr_id=item.arr_id,
        title="Some Movie",
    )
    settings_min = Settings(vf_upgrade_min_size_gb=10.0)
    settings_max = Settings(vf_upgrade_max_size_gb=1.0)
    releases = [{"title": "Some.Movie.MULTI.1080p.BluRay", "protocol": "usenet", "size": int(5e9)}]

    for s in (settings_min, settings_max):
        with (
            patch("app.services.vf_upgrade_scanner.radarr.get_releases", new=AsyncMock(return_value=releases)),
            patch("app.services.vf_upgrade_scanner._current_release_titles", new=AsyncMock(return_value=[])),
        ):
            result = await _search_task(task, s)
        assert list(result) == [], f"Attendu rejet avec {s}"


# ---------------------------------------------------------------------------
# Priorisation ended/continuing (fallback episodique)
# ---------------------------------------------------------------------------


def test_series_is_ended_from_status_field():
    assert _series_is_ended({"status": "ended"}) is True
    assert _series_is_ended({"status": "continuing"}) is False
    assert _series_is_ended({"status": "continuing", "ended": True}) is True
    assert _series_is_ended({}) is False


def test_recent_episodes_filters_by_age_and_caps_to_limit():
    now = now_utc()
    episodes = [
        {"id": 1, "episodeNumber": 1, "hasFile": True, "airDateUtc": (now - timedelta(days=45)).isoformat()},
        {"id": 2, "episodeNumber": 2, "hasFile": True, "airDateUtc": (now - timedelta(days=5)).isoformat()},
        {"id": 3, "episodeNumber": 3, "hasFile": True, "airDateUtc": (now - timedelta(days=2)).isoformat()},
        {"id": 4, "episodeNumber": 4, "hasFile": False, "airDateUtc": (now - timedelta(days=1)).isoformat()},
        {"id": 5, "episodeNumber": 5, "hasFile": True, "airDateUtc": None},
    ]
    chosen = _recent_episodes(episodes, max_age_days=30, limit=5)
    # Episode 1 (45j) hors fenetre, 4 (pas de fichier) et 5 (pas de date) exclus.
    assert [ep["id"] for ep in chosen] == [3, 2]

    capped = _recent_episodes(episodes, max_age_days=30, limit=1)
    assert [ep["id"] for ep in capped] == [3]


def test_last_episodes_orders_by_number_and_caps_to_limit():
    episodes = [
        {"id": 1, "episodeNumber": 1, "hasFile": True},
        {"id": 2, "episodeNumber": 2, "hasFile": True},
        {"id": 3, "episodeNumber": 3, "hasFile": False},  # pas de fichier -> exclu
        {"id": 4, "episodeNumber": 4, "hasFile": True},
    ]
    assert [ep["id"] for ep in _last_episodes(episodes, limit=2)] == [4, 2]
    assert [ep["id"] for ep in _last_episodes(episodes, limit=10)] == [4, 2, 1]


@pytest.mark.asyncio
async def test_sonarr_season_tasks_ended_series_prioritizes_season_pack(db):
    """Serie terminee : season pack en priority_tier=1, fallback episodique en filet de
    securite seulement (derniers episodes, pas les plus recemment diffuses)."""
    inst = _sonarr_instance(db)
    item = _show_item(db)
    fake_data = _fake_series_data([1])
    fake_data["status"] = "ended"
    fake_episodes = [
        {"id": 10 + ep, "seasonNumber": 1, "episodeNumber": ep, "hasFile": True, "airDateUtc": None}
        for ep in range(1, 9)
    ]
    settings = Settings(vf_upgrade_episodic_fallback=True, vf_upgrade_episodic_fallback_limit=3)

    with (
        patch("app.services.vf_upgrade_scanner.sonarr.lookup_series", new=AsyncMock(return_value=fake_data)),
        patch("app.services.vf_upgrade_scanner.sonarr.get_episodes", new=AsyncMock(return_value=fake_episodes)),
    ):
        tasks = await _sonarr_season_tasks(item, inst, "library_item", False, set(), set(), settings)

    season_task = next(t for t in tasks if t.scope == "season")
    assert season_task.priority_tier == 1

    episode_tasks = [t for t in tasks if t.scope == "episode"]
    assert len(episode_tasks) == 3
    assert {t.episode_number for t in episode_tasks} == {6, 7, 8}
    assert all(t.priority_tier == 3 for t in episode_tasks)


@pytest.mark.asyncio
async def test_sonarr_season_tasks_continuing_series_uses_recent_episodes_only(db):
    """Serie en cours de diffusion : season pack reste tier=3 (rarement disponible en
    MULTI), fallback episodique restreint aux episodes recemment diffuses."""
    inst = _sonarr_instance(db)
    item = _show_item(db)
    fake_data = _fake_series_data([1])
    fake_data["status"] = "continuing"
    now = now_utc()
    fake_episodes = [
        {
            "id": 20,
            "seasonNumber": 1,
            "episodeNumber": 1,
            "hasFile": True,
            "airDateUtc": (now - timedelta(days=90)).isoformat(),
        },
        {
            "id": 21,
            "seasonNumber": 1,
            "episodeNumber": 2,
            "hasFile": True,
            "airDateUtc": (now - timedelta(days=2)).isoformat(),
        },
    ]
    settings = Settings(vf_upgrade_episodic_fallback=True, vf_upgrade_episodic_fallback_days=30)

    with (
        patch("app.services.vf_upgrade_scanner.sonarr.lookup_series", new=AsyncMock(return_value=fake_data)),
        patch("app.services.vf_upgrade_scanner.sonarr.get_episodes", new=AsyncMock(return_value=fake_episodes)),
    ):
        tasks = await _sonarr_season_tasks(item, inst, "library_item", False, set(), set(), settings)

    season_task = next(t for t in tasks if t.scope == "season")
    assert season_task.priority_tier == 3

    episode_tasks = [t for t in tasks if t.scope == "episode"]
    assert {t.episode_number for t in episode_tasks} == {2}
    assert episode_tasks[0].priority_tier == 2


@pytest.mark.asyncio
async def test_sonarr_season_tasks_fallback_limit_zero_skips_episodes(db):
    """vf_upgrade_episodic_fallback_limit=0 -> aucune tache episodique, meme avec le
    fallback active, et evite l'appel Sonarr get_episodes."""
    inst = _sonarr_instance(db)
    item = _show_item(db)
    fake_data = _fake_series_data([1])
    settings = Settings(vf_upgrade_episodic_fallback=True, vf_upgrade_episodic_fallback_limit=0)

    with (
        patch("app.services.vf_upgrade_scanner.sonarr.lookup_series", new=AsyncMock(return_value=fake_data)),
        patch("app.services.vf_upgrade_scanner.sonarr.get_episodes", new=AsyncMock(return_value=[])) as get_eps,
    ):
        tasks = await _sonarr_season_tasks(item, inst, "library_item", False, set(), set(), settings)

    assert [t.scope for t in tasks] == ["season"]
    get_eps.assert_not_called()


def test_order_tasks_ranks_ended_season_pack_before_continuing_fallback():
    inst = ArrInstance(name="Sonarr", arr_type="sonarr", url="http://sonarr.local", api_key="key")
    ended_pack = _SearchTask(
        source_type="library_item",
        source_id=1,
        scope="season",
        arr_type="sonarr",
        inst=inst,
        arr_id=1,
        season_number=1,
        title="Ended Show - Saison 1",
        target_kind="vo",
        priority_tier=1,
    )
    continuing_episode = _SearchTask(
        source_type="library_item",
        source_id=2,
        scope="episode",
        arr_type="sonarr",
        inst=inst,
        arr_id=2,
        season_number=1,
        episode_number=5,
        title="Continuing Show - S01E05",
        target_kind="vo",
        priority_tier=2,
    )
    ordered = _order_tasks([continuing_episode, ended_pack], settings=None)
    assert ordered == [ended_pack, continuing_episode]


# ---------------------------------------------------------------------------
# Backoff progressif sur recherches restees bredouilles
# ---------------------------------------------------------------------------


def _backoff_task(source_id: int, episode_number: int | None = None) -> _SearchTask:
    inst = ArrInstance(name="Sonarr", arr_type="sonarr", url="http://sonarr.local", api_key="key")
    return _SearchTask(
        source_type="library_item",
        source_id=source_id,
        scope="episode" if episode_number else "movie",
        arr_type="sonarr" if episode_number else "radarr",
        inst=inst,
        arr_id=1,
        season_number=1 if episode_number else None,
        episode_number=episode_number,
        title="Backoff Test Target",
    )


@pytest.mark.asyncio
async def test_no_result_backoff_inactive_when_never_searched():
    task = _backoff_task(source_id=910001, episode_number=1)
    assert await _no_result_backoff_active(task) is False


@pytest.mark.asyncio
async def test_record_search_outcome_doubles_cooldown_until_capped():
    """Chaque echec consecutif double le cooldown (base -> base*2 -> base*4 ...),
    plafonne a vf_upgrade_no_result_backoff_max_hours."""
    task = _backoff_task(source_id=910002, episode_number=1)
    settings = Settings(vf_upgrade_no_result_backoff_base_hours=6, vf_upgrade_no_result_backoff_max_hours=48)

    await _record_search_outcome(task, found=False, settings=settings)
    assert (await cache.get_json("watchdeck:vf_upgrade:no_result:library_item:910002:episode:1:1"))[
        "cooldown_hours"
    ] == 6
    assert await _no_result_backoff_active(task) is True

    await _record_search_outcome(task, found=False, settings=settings)
    assert (await cache.get_json("watchdeck:vf_upgrade:no_result:library_item:910002:episode:1:1"))[
        "cooldown_hours"
    ] == 12

    await _record_search_outcome(task, found=False, settings=settings)
    assert (await cache.get_json("watchdeck:vf_upgrade:no_result:library_item:910002:episode:1:1"))[
        "cooldown_hours"
    ] == 24

    await _record_search_outcome(task, found=False, settings=settings)
    assert (await cache.get_json("watchdeck:vf_upgrade:no_result:library_item:910002:episode:1:1"))[
        "cooldown_hours"
    ] == 48  # plafonne, aurait ete 48*2=96 sans le cap

    await _record_search_outcome(task, found=False, settings=settings)
    assert (await cache.get_json("watchdeck:vf_upgrade:no_result:library_item:910002:episode:1:1"))[
        "cooldown_hours"
    ] == 48


@pytest.mark.asyncio
async def test_record_search_outcome_found_resets_backoff():
    """Une release trouvee (ex: upload tardif quelques heures apres la VO) efface le
    compteur d'echecs -- la cible redevient immediatement recherchable."""
    task = _backoff_task(source_id=910003, episode_number=1)
    settings = Settings(vf_upgrade_no_result_backoff_base_hours=6, vf_upgrade_no_result_backoff_max_hours=48)

    await _record_search_outcome(task, found=False, settings=settings)
    assert await _no_result_backoff_active(task) is True

    await _record_search_outcome(task, found=True, settings=settings)
    assert await _no_result_backoff_active(task) is False


@pytest.mark.asyncio
async def test_no_result_backoff_movie_scope_uses_distinct_key_from_episode():
    """Meme source_id mais scope different (film vs episode) -> cles independantes."""
    movie_task = _backoff_task(source_id=910004, episode_number=None)
    episode_task = _backoff_task(source_id=910004, episode_number=1)
    settings = Settings(vf_upgrade_no_result_backoff_base_hours=6, vf_upgrade_no_result_backoff_max_hours=48)

    await _record_search_outcome(movie_task, found=False, settings=settings)

    assert await _no_result_backoff_active(movie_task) is True
    assert await _no_result_backoff_active(episode_task) is False
