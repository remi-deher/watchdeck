"""Rapprochement automatique d'un import bloqué — et surtout, quand s'en abstenir."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import import_reconciliation as reconciliation


def _record(**overrides) -> dict:
    base = {"tracked_state": "importPending", "status": "completed", "size": 100, "sizeleft": 0, "progress": 100}
    base.update(overrides)
    return base


def _observation(**overrides):
    base = {"title": "Un média", "download_id": "abc", "arr_media_id": 42}
    base.update(overrides)
    return SimpleNamespace(**base)


def test_a_stalled_download_is_never_reconciled():
    """Un torrent sans source n'est pas un import bloqué.

    La classification générale marque « blocage possible » dès qu'un élément terminé
    porte un diagnostic, quel qu'il soit — assez pour alerter un humain, pas pour agir.
    Tenter un import sur un téléchargement qui n'a jamais abouti ne peut rien donner.
    """
    stalled = _record(tracked_state="downloading", status="warning", sizeleft=50, progress=42)

    blocked, why = reconciliation.blocked_on_import(stalled)

    assert blocked is False
    assert "n'attend pas d'import" in why


def test_arr_has_the_last_word_on_the_nature_of_the_blockage():
    """« *arr fait foi » : hors des états d'import, on ne touche à rien.

    Une release refusée comme non-amélioration, une erreur de disque ou un import déjà
    fait sont terminés eux aussi — mais aucun ne se répare par un import forcé.
    """
    for state in ("completed", "imported", "failedPending", ""):
        blocked, _ = reconciliation.blocked_on_import(_record(tracked_state=state))
        assert blocked is False, state

    for state in ("importPending", "importBlocked", "importFailed"):
        blocked, _ = reconciliation.blocked_on_import(_record(tracked_state=state))
        assert blocked is True, state


def test_an_unfinished_download_is_refused_even_when_arr_awaits_an_import():
    """Les deux côtés doivent être d'accord : *arr en attente, et le fichier livré."""
    blocked, why = reconciliation.blocked_on_import(_record(status="downloading", sizeleft=2_000, progress=88))

    assert blocked is False
    assert "pas terminé" in why or "pas termine" in why


def test_the_media_overrides_the_global_default():
    """`None` sur le média n'est pas « désactivé » mais « pas de choix »."""
    globalement_actif = SimpleNamespace(auto_import_reconciliation=True)
    globalement_inactif = SimpleNamespace(auto_import_reconciliation=False)
    suit_le_global = SimpleNamespace(auto_import_reconciliation=None)
    force_manuel = SimpleNamespace(auto_import_reconciliation=False)
    force_auto = SimpleNamespace(auto_import_reconciliation=True)

    assert reconciliation.is_enabled(globalement_actif, suit_le_global) is True
    assert reconciliation.is_enabled(globalement_inactif, suit_le_global) is False
    assert reconciliation.is_enabled(globalement_actif, force_manuel) is False
    assert reconciliation.is_enabled(globalement_inactif, force_auto) is True
    assert reconciliation.is_enabled(None, None) is False


def test_several_candidate_files_are_left_to_a_human():
    """Attacher le mauvais fichier au mauvais média est une erreur silencieuse."""
    assert reconciliation.pick_unambiguous_candidate([{"path": "/a.mkv"}, {"path": "/b.mkv"}]) is None
    # Un fichier que *arr a lui-même rejeté ne compte pas comme candidat.
    rejete = {"path": "/a.mkv", "rejections": [{"reason": "Sample"}]}
    assert reconciliation.pick_unambiguous_candidate([rejete, {"path": "/b.mkv"}])["path"] == "/b.mkv"
    assert reconciliation.pick_unambiguous_candidate([rejete]) is None


def test_the_target_episode_must_be_unique():
    episodes = [
        {"id": 1, "seasonNumber": 2, "episodeNumber": 3},
        {"id": 2, "seasonNumber": 2, "episodeNumber": 4},
    ]

    # Sonarr reconnaît lui-même l'épisode : sa réponse prime.
    assert reconciliation.pick_unambiguous_episode({"episodes": [{"id": 7}]}, episodes) == 7
    # Sinon, saison + numéro devinés du nom de la release.
    assert reconciliation.pick_unambiguous_episode({"suggested_season": 2, "suggested_episode": 4}, episodes) == 2
    # Rien de sûr : on laisse la main.
    assert reconciliation.pick_unambiguous_episode({}, episodes) is None
    assert reconciliation.pick_unambiguous_episode({"episodes": [{"id": 1}, {"id": 2}]}, episodes) is None


@pytest.mark.asyncio
async def test_nothing_happens_when_the_setting_is_off(monkeypatch):
    """Le réglage éteint doit couper avant tout appel à *arr."""
    appel = AsyncMock()
    monkeypatch.setattr(reconciliation, "reconcile_movie", appel)

    done = await reconciliation.try_reconcile(
        product="radarr",
        instance=SimpleNamespace(url="http://radarr", api_key="k"),
        observation=_observation(),
        record=_record(),
        request=None,
        settings=SimpleNamespace(auto_import_reconciliation=False),
    )

    assert done is False
    appel.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_failing_arr_never_interrupts_the_monitoring(monkeypatch):
    """L'élément reste bloqué, exactement comme avant : l'alerte suit son cours."""
    monkeypatch.setattr(reconciliation, "reconcile_movie", AsyncMock(side_effect=RuntimeError("Radarr injoignable")))

    done = await reconciliation.try_reconcile(
        product="radarr",
        instance=SimpleNamespace(url="http://radarr", api_key="k"),
        observation=_observation(),
        record=_record(),
        request=None,
        settings=SimpleNamespace(auto_import_reconciliation=True),
    )

    assert done is False


@pytest.mark.asyncio
async def test_an_unambiguous_movie_is_imported(monkeypatch):
    monkeypatch.setattr(
        reconciliation.radarr,
        "get_manual_import_candidates",
        AsyncMock(return_value=[{"path": "/downloads/film.mkv", "folderName": "film"}]),
    )
    imported = AsyncMock(return_value=(True, "Import lancé"))
    monkeypatch.setattr(reconciliation.radarr, "manual_import_movie", imported)

    done = await reconciliation.try_reconcile(
        product="radarr",
        instance=SimpleNamespace(url="http://radarr", api_key="k"),
        observation=_observation(),
        record=_record(),
        request=None,
        settings=SimpleNamespace(auto_import_reconciliation=True),
    )

    assert done is True
    assert imported.await_args.kwargs["movie_id"] == 42
    assert imported.await_args.kwargs["path"] == "/downloads/film.mkv"
