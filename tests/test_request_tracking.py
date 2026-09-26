"""Motifs de suivi de la page Demandes (app/services/request_tracking.py)."""

from datetime import datetime, timedelta
from types import SimpleNamespace

from app.services import request_tracking

NOW = datetime(2026, 9, 26, 12, 0)


def _row(**values):
    base = {
        "status": "sent_to_arr",
        "fulfillment_status": "submitted",
        "next_release_at": None,
        "next_release_label": None,
        "fulfillment_updated_at": NOW - timedelta(days=90),
        "requested_at": NOW - timedelta(days=95),
        "torrent_completed_at": None,
        "arr_processed_at": NOW - timedelta(days=90),
        "available_at": None,
        "has_vf": None,
        "vf_tracking_disabled": False,
        "media_type": "show",
    }
    base.update(values)
    return SimpleNamespace(**base)


def test_suivie_par_arr_sans_sortie_a_venir_est_introuvable():
    state = request_tracking.tracking_state(_row(), NOW)
    assert state["kind"] == "not_found"
    assert state["label"] == "Sortie, mais aucune version trouvée"


def test_une_sortie_a_venir_nest_pas_un_blocage():
    row = _row(next_release_at=NOW + timedelta(days=6), next_release_label="S04E07 le 2 oct.")
    state = request_tracking.tracking_state(row, NOW)
    assert state["kind"] == "unreleased"
    assert state["label"] == "Pas encore sorti · S04E07 le 2 oct."


def test_la_file_de_telechargement_prime_et_donne_la_progression():
    state = request_tracking.tracking_state(
        _row(), NOW, {"status": "downloading", "progress": 64.2, "timeleft": "00:12:00"}
    )
    assert state["kind"] == "downloading"
    assert state["download"] == {"progress": 64.2, "timeleft": "00:12:00"}
    assert request_tracking.tracking_state(_row(), NOW, {"status": "queued", "progress": 0})["kind"] == "queued"


def test_import_approbation_echec_et_disponible():
    assert request_tracking.tracking_state(_row(fulfillment_status="awaiting_plex"), NOW)["kind"] == "importing"
    assert (
        request_tracking.tracking_state(_row(status="pending_approval", fulfillment_status="not_submitted"), NOW)[
            "kind"
        ]
        == "approval"
    )
    assert request_tracking.tracking_state(_row(fulfillment_status="failed"), NOW)["kind"] == "failed"
    assert request_tracking.tracking_state(_row(status="available", fulfillment_status="completed"), NOW) is None


def test_serie_partielle_sans_episode_a_venir():
    row = _row(status="partially_available", fulfillment_status="partially_available")
    assert request_tracking.tracking_state(row, NOW)["kind"] == "missing_episodes"


def test_fil_de_vie_en_quatre_etapes():
    steps = request_tracking.lifecycle(_row(fulfillment_status="importing", torrent_completed_at=NOW))
    assert [(s["key"], s["done"]) for s in steps] == [
        ("requested", True),
        ("sent", True),
        ("downloaded", True),
        ("available", False),
    ]
    waiting = request_tracking.lifecycle(
        _row(status="pending_approval", fulfillment_status="not_submitted", arr_processed_at=None)
    )
    assert [s["done"] for s in waiting] == [True, False, False, False]


def test_vf_manquante():
    assert request_tracking.vf_missing(_row(status="available", has_vf=False)) is True
    assert request_tracking.vf_missing(_row(status="available", has_vf=True)) is False
    assert request_tracking.vf_missing(_row(status="available", has_vf=False, vf_tracking_disabled=True)) is False
    assert request_tracking.vf_missing(_row(status="sent_to_arr", has_vf=False)) is False


def test_file_indexee_par_demande_garde_la_plus_avancee():
    index = request_tracking.queue_by_request(
        [
            {"linked_request_id": 7, "progress": 10},
            {"linked_request_id": 7, "progress": 80},
            {"linked_request_id": None, "progress": 99},
        ]
    )
    assert index == {7: {"linked_request_id": 7, "progress": 80}}
