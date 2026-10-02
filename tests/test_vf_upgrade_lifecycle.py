"""Tests du cycle de vie des ameliorations VF, de ses notifications, et de la lecture
de la configuration langue des instances *arr.

Couvre les correctifs de l'audit VF : reconciliation en tache de fond (le cycle de vie
n'avancait que si quelqu'un ouvrait la page), relance automatique + blocklist *arr apres
echec, notifications enfin branchees sur les cinq reglages `vf_upgrade_notify_*`, et
confirmation immediate a l'import.
"""

import json
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.models import (
    ArrInstance,
    LibraryItem,
    NotificationLog,
    Settings,
    VfEpisodeStatus,
    VfUpgradeSuggestion,
)
from app.services.arr_language_config import (
    _custom_format_is_french,
    inspect_language_config,
    recommended_custom_format,
)
from app.services.vf_upgrade_lifecycle import (
    QueueCache,
    confirm_from_arr_import,
    next_candidate,
    reconcile_all,
    refresh_lifecycle,
)
from app.services.vf_upgrade_notifications import notify_vf_upgrade
from app.utils import now_utc_naive
from tests.async_support import make_test_session


@pytest.fixture()
def db():
    session = make_test_session()
    yield session
    session.close()


def _radarr(db, **kwargs) -> ArrInstance:
    defaults = dict(
        name="Radarr", arr_type="radarr", url="http://radarr.local", api_key="key", enabled=True, is_default=True
    )
    defaults.update(kwargs)
    inst = ArrInstance(**defaults)
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


def _movie(db, **kwargs) -> LibraryItem:
    defaults = dict(title="Some Movie", media_type="movie", arr_id=99, has_vf=False)
    defaults.update(kwargs)
    item = LibraryItem(**defaults)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _suggestion(db, item, **kwargs) -> VfUpgradeSuggestion:
    defaults = dict(
        source_type="library_item",
        source_id=item.id,
        scope="movie",
        status="accepted",
        target_kind="vo",
        accepted_at=now_utc_naive(),
    )
    defaults.update(kwargs)
    row = VfUpgradeSuggestion(**defaults)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Reconciliation en tache de fond (le cycle de vie n'attend plus une visite)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reconcile_all_advances_without_anyone_opening_the_page(db):
    """Sans ce passage de fond, un grab restait « accepted » indefiniment : les
    transitions etaient declenchees par les GET du dashboard."""
    inst = _radarr(db)
    item = _movie(db, arr_instance_id=inst.id)
    db.add(Settings(vff_enabled=True, vf_upgrade_verify_after_import=True, vf_upgrade_trigger_plex_scan=False))
    suggestion = _suggestion(db, item, status="downloading")
    db.commit()

    with patch("app.services.vf_upgrade_lifecycle.radarr.get_queue", new=AsyncMock(return_value=[])):
        result = await reconcile_all(db)

    assert result == {"checked": 1, "advanced": 1}
    db.refresh(suggestion)
    assert suggestion.status == "awaiting_verification"


@pytest.mark.asyncio
async def test_reconcile_all_reads_each_arr_queue_once(db):
    """Le dashboard lisait la file complete une fois par suggestion active."""
    inst = _radarr(db)
    first = _movie(db, title="Film A", arr_id=1, arr_instance_id=inst.id)
    second = _movie(db, title="Film B", arr_id=2, arr_instance_id=inst.id)
    db.add(Settings(vff_enabled=True, vf_upgrade_trigger_plex_scan=False))
    _suggestion(db, first, status="downloading")
    _suggestion(db, second, status="downloading")
    db.commit()

    with patch("app.services.vf_upgrade_lifecycle.radarr.get_queue", new=AsyncMock(return_value=[])) as get_queue:
        await reconcile_all(db)

    assert get_queue.await_count == 1


@pytest.mark.asyncio
async def test_verification_timeout_fires_from_the_background_pass(db):
    """Le delai de validation ne se declenchait jamais sans visite de la page."""
    inst = _radarr(db)
    item = _movie(db, arr_instance_id=inst.id)
    db.add(
        Settings(
            vff_enabled=True,
            vf_upgrade_verify_after_import=True,
            vf_upgrade_verification_timeout_minutes=60,
            vf_upgrade_notify_failed=False,
        )
    )
    suggestion = _suggestion(
        db,
        item,
        status="awaiting_verification",
        accepted_at=now_utc_naive() - timedelta(hours=3),
        releases_json=json.dumps([{"guid": "only-one", "title": "Some.Movie.MULTi.1080p"}]),
        grabbed_release_guid="only-one",
    )
    db.commit()

    with patch("app.services.vf_upgrade_lifecycle.radarr.get_queue", new=AsyncMock(return_value=[])):
        await reconcile_all(db)

    db.refresh(suggestion)
    assert suggestion.status == "failed"
    assert suggestion.retry_count == 1
    assert suggestion.failed_at is not None


# ---------------------------------------------------------------------------
# Relance automatique et blocklist *arr
# ---------------------------------------------------------------------------


def test_next_candidate_skips_attempted_and_profile_rejected_releases(db):
    item = _movie(db)
    suggestion = _suggestion(
        db,
        item,
        releases_json=json.dumps(
            [
                {"guid": "deja-tente", "title": "A.TRUEFRENCH"},
                {"guid": "refuse", "title": "B.VFF", "rejected": True, "rejections": ["Quality not wanted"]},
                {"guid": "bon", "title": "C.VFF"},
            ]
        ),
        attempted_guids_json=json.dumps(["deja-tente"]),
    )

    assert next_candidate(suggestion, Settings(vf_upgrade_block_arr_rejected=True))["guid"] == "bon"


@pytest.mark.asyncio
async def test_failed_verification_retries_the_next_candidate(db):
    """La suggestion contient deja une liste triee : re-cliquer manuellement
    n'apportait aucune decision, l'utilisateur reprenait simplement le suivant."""
    inst = _radarr(db)
    item = _movie(db, arr_instance_id=inst.id)
    settings = Settings(
        vff_enabled=True,
        vf_upgrade_verify_after_import=True,
        vf_upgrade_verification_timeout_minutes=60,
        vf_upgrade_max_retries=3,
    )
    db.add(settings)
    suggestion = _suggestion(
        db,
        item,
        status="awaiting_verification",
        accepted_at=now_utc_naive() - timedelta(hours=3),
        grabbed_release_guid="premier",
        releases_json=json.dumps(
            [
                {"guid": "premier", "title": "Some.Movie.MULTi.1080p", "indexer_id": 3},
                {"guid": "second", "title": "Some.Movie.TRUEFRENCH.1080p", "indexer_id": 3},
            ]
        ),
    )
    db.commit()

    grab = AsyncMock(return_value=(True, "accepte", False))
    with (
        patch("app.services.vf_upgrade_lifecycle.radarr.get_queue", new=AsyncMock(return_value=[])),
        patch("app.services.vf_upgrade_lifecycle.radarr.grab_release", new=grab),
    ):
        await refresh_lifecycle(db, suggestion, item, settings=settings, queues=QueueCache(), notify=False)

    grab.assert_awaited_once()
    assert grab.await_args.args[2] == "second"
    assert suggestion.status == "accepted"
    assert suggestion.grabbed_release_guid == "second"
    assert set(json.loads(suggestion.attempted_guids_json)) == {"premier", "second"}


@pytest.mark.asyncio
async def test_stalled_download_is_blocklisted_in_arr(db):
    """`vf_upgrade_blacklist_failed` ne filtrait le guid que localement : *arr pouvait
    re-proposer ou reimporter la meme release."""
    inst = _radarr(db)
    item = _movie(db, arr_instance_id=inst.id)
    settings = Settings(vff_enabled=True, vf_upgrade_blacklist_failed=True, vf_upgrade_max_retries=3)
    db.add(settings)
    suggestion = _suggestion(
        db,
        item,
        status="downloading",
        grabbed_release_guid="pourrie",
        releases_json=json.dumps([{"guid": "pourrie", "title": "A.MULTi"}, {"guid": "suivante", "title": "B.VFF"}]),
    )
    db.commit()

    queue = [{"arr_media_id": item.arr_id, "queue_id": 77, "status": "warning", "progress": 0}]
    delete = AsyncMock(return_value=(True, "supprime"))
    grab = AsyncMock(return_value=(True, "accepte", False))
    with (
        patch("app.services.vf_upgrade_lifecycle.radarr.get_queue", new=AsyncMock(return_value=queue)),
        patch("app.services.vf_upgrade_lifecycle.radarr.delete_queue_item", new=delete),
        patch("app.services.vf_upgrade_lifecycle.radarr.grab_release", new=grab),
    ):
        await refresh_lifecycle(db, suggestion, item, settings=settings, queues=QueueCache(), notify=False)

    delete.assert_awaited_once()
    assert delete.await_args.kwargs["blocklist"] is True
    # search=False : la relance choisit explicitement le candidat suivant de notre
    # propre liste, plutot que de laisser *arr repartir sur une recherche generique.
    assert delete.await_args.kwargs["search"] is False
    assert suggestion.grabbed_release_guid == "suivante"


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_notify_vf_upgrade_respects_its_setting(db):
    settings = Settings(vf_upgrade_notify_verified=False, discord_enabled=True, discord_webhook_url="http://d/hook")

    with patch("app.services.notifications._post_discord_embed", new=AsyncMock()) as post:
        assert await notify_vf_upgrade(db, settings, "verified", media_title="Film") is False
        post.assert_not_awaited()

    settings.vf_upgrade_notify_verified = True
    with patch("app.services.notifications._post_discord_embed", new=AsyncMock()) as post:
        assert await notify_vf_upgrade(db, settings, "verified", media_title="Film") is True
        post.assert_awaited_once()

    db.commit()
    log = db.query(NotificationLog).filter(NotificationLog.event == "vf_upgrade").one()
    assert log.channel == "discord"
    assert log.is_admin is True
    assert log.success is True


@pytest.mark.asyncio
async def test_lifecycle_notifies_verified_transition(db):
    inst = _radarr(db)
    item = _movie(
        db,
        arr_instance_id=inst.id,
        has_vf=True,
        fr_is_default=True,
        vf_checked_at=now_utc_naive(),
    )
    settings = Settings(
        vff_enabled=True,
        vf_upgrade_notify_verified=True,
        ntfy_enabled=True,
        ntfy_url="http://ntfy.local/watchdeck",
    )
    db.add(settings)
    suggestion = _suggestion(
        db, item, status="awaiting_verification", accepted_at=now_utc_naive() - timedelta(minutes=5)
    )
    db.commit()

    with patch("app.services.notifications.send_ntfy", new=AsyncMock()) as send:
        await refresh_lifecycle(db, suggestion, item, settings=settings, queues=QueueCache())

    assert suggestion.status == "verified"
    send.assert_awaited_once()
    # send_ntfy(url, token, title, body) : le titre porte le media et l'evenement.
    url, _token, title, body = send.await_args.args
    assert url == "http://ntfy.local/watchdeck"
    assert "Some Movie" in title
    assert "VF confirmee" in title
    assert "pistes audio" in body


# ---------------------------------------------------------------------------
# Confirmation immediate a l'import *arr
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_import_confirms_movie_upgrade_without_waiting_for_plex(db):
    inst = _radarr(db)
    item = _movie(db, arr_instance_id=inst.id)
    db.add(Settings(vff_enabled=True, vf_upgrade_notify_verified=False))
    suggestion = _suggestion(db, item, status="awaiting_verification")
    db.commit()

    assert await confirm_from_arr_import(db, "radarr", item.arr_id, instance_id=inst.id) == 1
    db.commit()
    db.refresh(suggestion)
    assert suggestion.status == "verified"
    assert "import" in (suggestion.arr_message or "")


@pytest.mark.asyncio
async def test_import_of_one_episode_never_closes_a_season_suggestion(db):
    """L'arrivee d'un episode VF ne prouve rien sur le reste de la saison : Plex reste
    l'autorite pour une portee « saison »."""
    inst = ArrInstance(
        name="Sonarr", arr_type="sonarr", url="http://sonarr.local", api_key="key", enabled=True, is_default=True
    )
    db.add(inst)
    db.commit()
    show = LibraryItem(title="Some Show", media_type="show", arr_id=1156, has_vf=False, arr_instance_id=inst.id)
    db.add(show)
    db.add(Settings(vff_enabled=True))
    db.commit()
    db.refresh(show)
    season = _suggestion(db, show, scope="season", season_number=2, status="awaiting_verification")
    episode = _suggestion(db, show, scope="episode", season_number=2, episode_number=4, status="awaiting_verification")
    db.commit()

    confirmed = await confirm_from_arr_import(
        db, "sonarr", show.arr_id, instance_id=inst.id, season_number=2, episode_number=4
    )
    db.commit()

    assert confirmed == 1
    db.refresh(season)
    db.refresh(episode)
    assert season.status == "awaiting_verification"
    assert episode.status == "verified"


# ---------------------------------------------------------------------------
# Lecture de la configuration langue *arr
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("custom_format", "expected"),
    [
        (
            {
                "name": "Langue FR",
                "specifications": [
                    {"implementation": "LanguageSpecification", "fields": [{"name": "value", "value": 2}]}
                ],
            },
            "specification de langue",
        ),
        (
            {
                "name": "Scene FR",
                "specifications": [
                    {
                        "implementation": "ReleaseTitleSpecification",
                        "fields": [{"name": "value", "value": r"\b(TRUEFRENCH|VFF)\b"}],
                    }
                ],
            },
            "regex de titre",
        ),
        (
            {"name": "VF Pack", "specifications": [{"implementation": "SizeSpecification", "fields": []}]},
            "nom du custom format",
        ),
        # VOSTFR/SUBFRENCH designent un SOUS-TITRAGE : la release reste en langue
        # originale. "SUBFRENCH" contient litteralement "french", d'ou le faux positif
        # que ce cas verrouille.
        (
            {
                "name": "VOSTFR",
                "specifications": [
                    {
                        "implementation": "ReleaseTitleSpecification",
                        "fields": [{"name": "value", "value": r"(VOSTFR|SUBFRENCH)"}],
                    }
                ],
            },
            None,
        ),
        (
            {
                "name": "TRUEFRENCH ou sous-titre",
                "specifications": [
                    {
                        "implementation": "ReleaseTitleSpecification",
                        "fields": [{"name": "value", "value": r"(TRUEFRENCH|SUBFRENCH)"}],
                    }
                ],
            },
            "regex de titre",
        ),
        (
            {
                "name": "German",
                "specifications": [
                    {"implementation": "LanguageSpecification", "fields": [{"name": "value", "value": 4}]}
                ],
            },
            None,
        ),
    ],
)
def test_custom_format_french_detection(custom_format, expected):
    assert _custom_format_is_french(custom_format, 2) == expected


@pytest.mark.asyncio
async def test_inspect_language_config_diagnoses_each_profile():
    """« native » exige les trois conditions reunies : un CF francais valorise,
    l'upgrade autorise, et un seuil de score a atteindre -- sans cutoffFormatScore,
    *arr n'upgrade jamais pour un gain de score."""
    custom_formats = [
        {
            "id": 10,
            "name": "French",
            "specifications": [{"implementation": "LanguageSpecification", "fields": [{"name": "value", "value": 2}]}],
        },
        {"id": 11, "name": "x265", "specifications": [{"implementation": "ReleaseTitleSpecification", "fields": []}]},
    ]
    profiles = [
        {
            "id": 1,
            "name": "HD VF",
            "upgradeAllowed": True,
            "cutoffFormatScore": 100,
            "formatItems": [{"format": 10, "name": "French", "score": 500}],
        },
        {
            "id": 2,
            "name": "HD sans upgrade",
            "upgradeAllowed": False,
            "cutoffFormatScore": 0,
            "formatItems": [{"format": 10, "name": "French", "score": 500}],
        },
        {
            "id": 3,
            "name": "HD brut",
            "upgradeAllowed": True,
            "cutoffFormatScore": 100,
            "formatItems": [{"format": 11, "name": "x265", "score": 10}],
        },
    ]

    async def _fake_get(url, api_key, path, **kwargs):
        if path.endswith("/language"):
            return [{"id": 1, "name": "English"}, {"id": 2, "name": "French"}]
        if path.endswith("/customformat"):
            return custom_formats
        return profiles

    with patch("app.services.arr_language_config._get_json", new=_fake_get):
        report = await inspect_language_config("http://radarr.local", "key")

    assert report["french_language_id"] == 2
    assert [entry["id"] for entry in report["french_formats"]] == [10]
    verdicts = {entry["name"]: entry["verdict"] for entry in report["profiles"]}
    assert verdicts == {"HD VF": "native", "HD sans upgrade": "partial", "HD brut": "absent"}
    assert report["verdict"] == "native"


def test_recommended_custom_format_targets_language_and_scene_markers():
    payload = recommended_custom_format(2)
    implementations = {spec["implementation"] for spec in payload["specifications"]}

    assert implementations == {"LanguageSpecification", "ReleaseTitleSpecification"}
    # `required: false` sur les deux : la langue declaree OU le marqueur de titre suffit.
    assert all(spec["required"] is False for spec in payload["specifications"])


# ---------------------------------------------------------------------------
# Portee serie : la verification reste episode par episode
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_season_scope_requires_every_known_episode_to_be_vf(db):
    inst = ArrInstance(
        name="Sonarr", arr_type="sonarr", url="http://sonarr.local", api_key="key", enabled=True, is_default=True
    )
    db.add(inst)
    db.commit()
    show = LibraryItem(title="Some Show", media_type="show", arr_id=1156, has_vf=False, arr_instance_id=inst.id)
    db.add(show)
    settings = Settings(vff_enabled=True, vf_upgrade_trigger_plex_scan=False)
    db.add(settings)
    db.commit()
    db.refresh(show)
    accepted_at = now_utc_naive() - timedelta(minutes=10)
    suggestion = _suggestion(
        db, show, scope="season", season_number=1, status="awaiting_verification", accepted_at=accepted_at
    )
    for episode_number, has_vf in ((1, True), (2, False)):
        db.add(
            VfEpisodeStatus(
                source_type="library_item",
                source_id=show.id,
                season_number=1,
                episode_number=episode_number,
                has_vf=has_vf,
                is_known_episode=True,
                checked_at=now_utc_naive(),
            )
        )
    db.commit()

    with patch("app.services.vf_upgrade_lifecycle.sonarr.get_queue", new=AsyncMock(return_value=[])):
        await refresh_lifecycle(db, suggestion, show, settings=settings, queues=QueueCache(), notify=False)
    assert suggestion.status != "verified"

    db.query(VfEpisodeStatus).filter(VfEpisodeStatus.episode_number == 2).one().has_vf = True
    db.commit()
    with patch("app.services.vf_upgrade_lifecycle.sonarr.get_queue", new=AsyncMock(return_value=[])):
        await refresh_lifecycle(db, suggestion, show, settings=settings, queues=QueueCache(), notify=False)
    assert suggestion.status == "verified"


@pytest.mark.asyncio
async def test_language_diagnostic_ignores_non_arr_instances(db):
    """Prowlarr est une instance declaree comme les autres mais n'expose pas
    /api/v3/customformat : l'interroger remontait un diagnostic « illisible » qui n'a
    aucun sens pour elle."""
    from app.routers.vf_upgrades_api import vf_upgrade_arr_language_config

    for name, arr_type in (("Radarr", "radarr"), ("Sonarr", "sonarr"), ("Prowlarr", "prowlarr")):
        db.add(
            ArrInstance(
                name=name,
                arr_type=arr_type,
                url=f"http://{arr_type}.local",
                api_key="key",
                enabled=True,
            )
        )
    db.commit()

    inspect = AsyncMock(return_value={"verdict": "absent", "french_formats": [], "profiles": []})
    with patch("app.routers.vf_upgrades_api.inspect_language_config", new=inspect):
        payload = await vf_upgrade_arr_language_config(db=db)

    assert sorted(entry["name"] for entry in payload["instances"]) == ["Radarr", "Sonarr"]
    assert inspect.await_count == 2
