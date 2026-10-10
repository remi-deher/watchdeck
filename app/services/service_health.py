"""Santé observée : une configuration seule ne prouve pas la connectivité."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class ServiceHealth(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    state: Literal["operational", "configured", "warning", "unreachable", "disabled", "not_configured", "unknown"]
    label: str
    reason: str | None


class HealthServiceRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    health: ServiceHealth


class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded", "down"]
    checked_at: str
    services: dict[str, HealthServiceRecord]


def service_health(key: str, row: dict) -> dict:
    raw = row.get("state")
    if raw == "ok":
        state = "operational" if row.get("response_ms") is not None else "configured"
        if row.get("issues") or row.get("issue_count", 0):
            state = "warning"
    else:
        state = {"error": "unreachable", "disabled": "disabled", "non_configured": "not_configured"}.get(raw, "unknown")
    labels = {
        "operational": "Opérationnel",
        "configured": "Configuré",
        "warning": "À surveiller",
        "unreachable": "Injoignable",
        "disabled": "Désactivé",
        "not_configured": "Non configuré",
        "unknown": "État inconnu",
    }
    reason = row.get("message") if state in {"unreachable", "unknown"} else None
    return ServiceHealth(key=key, state=state, label=labels[state], reason=reason).model_dump()


def health_payload(payload: dict) -> dict:
    services = {key: {**row, "health": service_health(key, row)} for key, row in payload["services"].items()}
    status = payload["status"]
    if status == "healthy" and any(row["health"]["state"] in {"warning", "unknown"} for row in services.values()):
        status = "degraded"
    return {**payload, "services": services, "status": status}
