"""Génère le contrat de disponibilité à partir des schémas OpenAPI des routes."""

import argparse
import json
from pathlib import Path

from fastapi.openapi.utils import get_openapi

from app.routers.fileflows_api import router as encoding_router
from app.routers.fileflows_control_api import router as encoding_control_router
from app.routers.issues_api import router as issues_router
from app.routers.library_api import router
from app.routers.metrics_api import router as health_router
from app.routers.requests_api import router as requests_router
from app.routers.scheduled_tasks_api import router as tasks_router
from app.routers.vf_upgrades_api import router as audit_router
from app.routers.vff_api import router as scans_router

TARGET = Path("frontend/src/types/generated/mediaAvailability.ts")
NAMES = (
    "ServiceHealth",
    "HealthServiceRecord",
    "HealthResponse",
    "WorkProgress",
    "WorkRef",
    "WorkRecord",
    "EncodingStatusResponse",
    "EncodingFilesResponse",
    "EncodingDiskResponse",
    "EncodingOverviewResponse",
    "ProblemAction",
    "HandlingProblem",
    "ProblemMedia",
    "IssueResponse",
    "IssuesResponse",
    "AuditProblemRecord",
    "AuditProblemCounts",
    "AuditProblemsResponse",
    "EpisodeCoverage",
    "MediaLanguages",
    "MediaQuality",
    "MediaAvailability",
    "JourneyOrigin",
    "JourneyStep",
    "JourneyExpectation",
    "JourneyDownload",
    "JourneyTracking",
    "RequestJourney",
    "RequestJourneyRecord",
    "AvailabilityRecord",
    "MediaDetailResponse",
    "AvailabilityPage",
)


def ts_type(schema):
    if schema.get("type") == "object":
        return "Record<string, " + ts_type(schema["additionalProperties"]) + ">"
    if schema.get("type") == "array":
        return ts_type(schema["items"]) + "[]"
    if "$ref" in schema:
        return schema["$ref"].rsplit("/", 1)[-1]
    if "anyOf" in schema:
        return " | ".join(ts_type(part) for part in schema["anyOf"])
    if "enum" in schema:
        return " | ".join(json.dumps(value) for value in schema["enum"])
    if "const" in schema:
        return json.dumps(schema["const"])
    return {"string": "string", "integer": "number", "number": "number", "boolean": "boolean", "null": "null"}[
        schema["type"]
    ]


def generate():
    schemas = get_openapi(
        title="Watchdeck",
        version="1.0.0",
        routes=[
            *router.routes,
            *requests_router.routes,
            *issues_router.routes,
            *audit_router.routes,
            *encoding_router.routes,
            *encoding_control_router.routes,
            *health_router.routes,
            *tasks_router.routes,
            *scans_router.routes,
        ],
    )["components"]["schemas"]
    output = ["// Généré par python -m scripts.generate_availability_types ; ne pas modifier.\n"]
    for name in NAMES:
        schema = schemas[name]
        output.append(f"export interface {name} {{")
        for key, value in schema["properties"].items():
            optional = "" if key in schema.get("required", []) else "?"
            output.append(f"  {key}{optional}: {ts_type(value)};")
        if schema.get("additionalProperties") is True:
            output.append("  [key: string]: unknown;")
        output.append("}\n")
    return "\n".join(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = generate()
    if args.check:
        if not TARGET.exists() or TARGET.read_text(encoding="utf-8") != content:
            raise SystemExit("Contrat TypeScript obsolète : python -m scripts.generate_availability_types")
    else:
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_text(content, encoding="utf-8")
