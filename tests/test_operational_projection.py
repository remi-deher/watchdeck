from datetime import datetime
from types import SimpleNamespace

from app.models import FulfillmentStatus
from app.services.operational_projection import (
    build_media_history,
    plex_library_projection,
    request_operational_projection,
    request_origin,
)


def test_arr_origin_does_not_invent_user_request():
    projection = request_operational_projection(SimpleNamespace(
        source="arr_sync",
        fulfillment_status=FulfillmentStatus.downloading,
        fulfillment_error=None,
    ))

    assert projection["origin_kind"] == "arr"
    assert projection["origin_label"] == "Ajoute directement dans *ARR"
    assert projection["operational_status_label"] == "Telechargement en cours"
    assert projection["workflow_timeline"][0]["key"] == "submitted"
    assert "requested" not in {step["key"] for step in projection["workflow_timeline"]}
    assert next(step for step in projection["workflow_timeline"] if step["key"] == "downloading")["state"] == "current"


def test_request_origin_preserves_external_request_channel():
    assert request_origin("seer") == {
        "kind": "request",
        "label": "Demande via Seerr",
    }
    assert request_origin("rss")["label"] == "Demande utilisateur"


def test_plex_only_projection_is_immediately_available():
    projection = plex_library_projection()

    assert projection["origin_kind"] == "plex"
    assert projection["operational_status"] == "completed"
    assert projection["waiting_reason"] is None
    assert projection["workflow_timeline"] == [{
        "key": "completed",
        "label": "Deja present dans Plex",
        "state": "completed",
        "occurred_at": None,
    }]


def test_pending_approval_timeline_has_only_one_current_step():
    projection = request_operational_projection(SimpleNamespace(
        source="rss",
        fulfillment_status=FulfillmentStatus.not_submitted,
        fulfillment_error=None,
        requested_at=None,
        approved_at=None,
    ))

    current = [step["key"] for step in projection["workflow_timeline"] if step["state"] == "current"]
    assert current == ["approval"]
    assert projection["workflow_timeline"][0]["key"] == "requested"


def test_occurred_at_carries_explicit_utc_offset():
    """Les colonnes DB sont stockees en naif-UTC (now_utc_naive) : sans indication de
    fuseau, `new Date()` cote navigateur interprete la valeur comme l'heure locale au lieu
    d'UTC, decalant l'affichage de l'ecart local (2h en France l'ete) -- voir
    app.serializers.format_datetime, deja utilise ailleurs pour ce meme motif."""
    naive_utc = datetime(2026, 8, 9, 22, 41, 32)
    projection = request_operational_projection(SimpleNamespace(
        source="rss",
        fulfillment_status=FulfillmentStatus.not_submitted,
        fulfillment_error=None,
        requested_at=naive_utc,
        approved_at=None,
    ))

    requested_step = next(step for step in projection["workflow_timeline"] if step["key"] == "requested")
    assert requested_step["occurred_at"] == "2026-08-09T22:41:32+00:00"


def test_build_media_history_vf_upgrade_grabbed_and_verified():
    suggestion = SimpleNamespace(
        accepted_at=datetime(2026, 8, 1, 10, 0, 0),
        completed_at=datetime(2026, 8, 1, 10, 30, 0),
        failed_at=None,
    )
    events = build_media_history([suggestion], [], [])
    labels = [event["label"] for event in events]
    assert labels == ["VF verifiee", "Upgrade VF envoye a *ARR"]
    assert all(event["kind"] == "vf_upgrade" for event in events)
    assert all(event["state"] == "completed" for event in events)


def test_build_media_history_vf_upgrade_verification_failed():
    suggestion = SimpleNamespace(
        accepted_at=datetime(2026, 8, 1, 10, 0, 0),
        completed_at=None,
        failed_at=datetime(2026, 8, 1, 11, 0, 0),
    )
    events = build_media_history([suggestion], [], [])
    failed_event = next(event for event in events if event["label"] == "Verification VF echouee")
    assert failed_event["state"] == "error"


def test_build_media_history_ignores_first_diagnostic_event_per_request():
    """Le premier `availability_detected` par demande correspond a l'etape "Disponible dans
    Plex" deja affichee dans la pipeline fixe -- seuls les suivants (upgrades/reimports par
    *ARR) doivent apparaitre dans l'historique."""
    events_in = [
        SimpleNamespace(request_id=1, created_at=datetime(2026, 7, 1, 9, 0, 0)),
        SimpleNamespace(request_id=1, created_at=datetime(2026, 8, 1, 9, 0, 0)),
        SimpleNamespace(request_id=1, created_at=datetime(2026, 9, 1, 9, 0, 0)),
    ]
    events = build_media_history([], events_in, [])
    assert len(events) == 2
    assert all(event["kind"] == "file_replaced" for event in events)
    assert all(event["label"] == "Fichier mis a jour par *ARR" for event in events)


def test_build_media_history_open_issue_has_no_resolved_event():
    issue = SimpleNamespace(
        issue_type="audio", created_at=datetime(2026, 8, 1, 9, 0, 0),
        status="open", updated_at=datetime(2026, 8, 1, 9, 0, 0),
    )
    events = build_media_history([], [], [issue])
    assert len(events) == 1
    assert events[0]["label"] == "Signalement ouvert : audio"
    assert events[0]["state"] == "error"


def test_build_media_history_closed_issue_has_two_events():
    issue = SimpleNamespace(
        issue_type="audio", created_at=datetime(2026, 8, 1, 9, 0, 0),
        status="closed", updated_at=datetime(2026, 8, 2, 9, 0, 0),
    )
    events = build_media_history([], [], [issue])
    assert [event["label"] for event in events] == ["Signalement resolu", "Signalement ouvert : audio"]
    assert events[0]["state"] == "completed"


def test_build_media_history_sorts_all_sources_by_date_descending():
    suggestion = SimpleNamespace(
        accepted_at=datetime(2026, 8, 5), completed_at=None, failed_at=None,
    )
    diag = SimpleNamespace(request_id=1, created_at=datetime(2026, 8, 10))
    seen_first = SimpleNamespace(request_id=1, created_at=datetime(2026, 7, 1))
    issue = SimpleNamespace(
        issue_type="video", created_at=datetime(2026, 8, 1), status="open", updated_at=datetime(2026, 8, 1),
    )
    events = build_media_history([suggestion], [seen_first, diag], [issue])

    dates = [event["occurred_at"] for event in events]
    assert dates == sorted(dates, reverse=True)
