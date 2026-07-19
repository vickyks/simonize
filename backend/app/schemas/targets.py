from pydantic import BaseModel

from app.models.target import TargetType


class DumpableModel(BaseModel):
    def __eq__(self, other: object) -> bool:
        if isinstance(other, dict):
            return self.model_dump() == other
        return super().__eq__(other)


class TargetEntry(DumpableModel):
    type: TargetType
    label: str
    value: int
    unit: str


class TargetUpdateRequest(BaseModel):
    value: int | str


class MilestoneEntry(DumpableModel):
    type: str
    title: str
    date: str
    message: str
    value: str | None = None


class TargetsResponse(BaseModel):
    targets: list[TargetEntry]
    milestones: list[MilestoneEntry]
