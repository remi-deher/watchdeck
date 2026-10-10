"""Contrats OpenAPI des réponses média pendant la migration."""

from pydantic import BaseModel, ConfigDict

from .media_availability import MediaAvailability
from .request_journey import RequestJourney


class AvailabilityRecord(BaseModel):
    model_config = ConfigDict(extra="allow")
    availability: MediaAvailability
    journey: RequestJourney | None = None


class RequestJourneyRecord(AvailabilityRecord):
    journey: RequestJourney


class MediaDetailResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    media: AvailabilityRecord
    requests: list[RequestJourneyRecord] = []


class AvailabilityPage(BaseModel):
    model_config = ConfigDict(extra="allow")
    items: list[RequestJourneyRecord]
