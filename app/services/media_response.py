"""Contrats OpenAPI des réponses média pendant la migration."""

from pydantic import BaseModel, ConfigDict

from .handling_problem import HandlingProblem, IssueResponse
from .media_availability import MediaAvailability
from .request_journey import RequestJourney


class AvailabilityRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    availability: MediaAvailability
    journey: RequestJourney | None = None
    problems: list[HandlingProblem] = []


class RequestJourneyRecord(AvailabilityRecord):
    journey: RequestJourney
    problems: list[HandlingProblem]


class MediaDetailResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    media: AvailabilityRecord
    requests: list[RequestJourneyRecord] = []
    issues: list[IssueResponse] = []


class AvailabilityPage(BaseModel):
    model_config = ConfigDict(extra="allow")
    items: list[RequestJourneyRecord]
