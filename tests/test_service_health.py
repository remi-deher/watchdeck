from app.services.service_health import HealthResponse, health_payload, service_health


def test_configuration_is_not_connectivity():
    assert service_health("smtp", {"state": "ok"})["state"] == "configured"
    assert service_health("plex", {"state": "ok", "response_ms": 0})["state"] == "operational"
    assert service_health("plex", {})["state"] == "unknown"


def test_alerts_degrade_healthy_payload_even_when_details_are_truncated():
    payload = health_payload({
        "status": "healthy", "checked_at": "2026-10-10T00:00:00Z",
        "services": {"sonarr": {"state": "ok", "response_ms": 12, "issue_count": 3}},
    })
    assert payload["status"] == "degraded"
    assert payload["services"]["sonarr"]["health"]["state"] == "warning"
    HealthResponse.model_validate(payload)
