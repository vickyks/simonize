from typing import Any

from pydantic import BaseModel


class ObservationUpsertRequest(BaseModel):
    value: Any
    metadata: dict[str, Any] | None = None


class ObservationResponse(BaseModel):
    type: str
    value: Any
    metadata: dict[str, Any] | None = None
    updated_at: str


class ChecklistItem(BaseModel):
    type: str
    label: str
    recorded: bool


class DailyObservationsResponse(BaseModel):
    date: str
    observations: dict[str, ObservationResponse]
    checklist: list[ChecklistItem]
