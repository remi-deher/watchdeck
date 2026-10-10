from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.services.handling_problem import HandlingProblem, audit_problems, report_problem, request_problems


def report(**values):
    return SimpleNamespace(id=8, issue_type="audio", status=values.get("status", "open"))


def test_report_does_not_claim_a_diagnosis_or_automatic_correction():
    problem = report_problem(report())
    assert problem["key"] == "report:8"
    assert not problem["fixable"]
    assert problem["urgency"] == "medium"
    assert "cause reste à vérifier" in problem["consequence"]
    retry = next(action for action in problem["actions"] if action["key"] == "retry")
    assert retry["disabled"] and retry["title"]


def test_closed_report_only_offers_reopening():
    problem = report_problem(report(status="closed"), can_retry=True)
    assert [action["key"] for action in problem["actions"]] == ["open"]
    assert problem["proposal"] is None


@pytest.mark.parametrize("status", ["submitted", "queued", "downloading", "importing", "awaiting_plex", "completed", "rejected", "awaiting_submission"])
def test_normal_waiting_and_terminal_decisions_are_not_problems(status):
    assert request_problems(SimpleNamespace(id=2, status="pending"), {"status": status}) == []


def test_request_failure_uses_the_observed_journey():
    problem = request_problems(SimpleNamespace(id=2), {
        "status": "failed", "label": "En échec",
        "blocker": {"label": "Radarr ne répond pas"}, "next_step": {"label": "Corriger puis relancer"},
    })[0]
    assert problem["urgency"] == "high"
    assert problem["consequence"] == "Radarr ne répond pas"
    assert not problem["fixable"]


def test_audit_distinguishes_alignment_from_missing_tracks():
    problems = audit_problems(SimpleNamespace(id=3), ["audio_secondary", "partial_vf"])
    assert [problem["fixable"] for problem in problems] == [True, False]
    assert [problem["actions"][0]["key"] for problem in problems] == ["align", "search_vf"]


def test_required_consequence_cannot_be_omitted():
    problem = report_problem(report())
    del problem["consequence"]
    with pytest.raises(ValidationError):
        HandlingProblem.model_validate(problem)


def test_approval_is_a_decision_not_an_automatic_fix():
    from app.models import RequestStatus
    problem = request_problems(SimpleNamespace(id=2, status=RequestStatus.pending_approval), {
        "status": "not_submitted", "label": "À approuver", "blocker": None,
        "next_step": {"label": "Approuver la demande"},
    })[0]
    assert problem["proposal"] == "Approuver la demande"
    assert not problem["fixable"]
