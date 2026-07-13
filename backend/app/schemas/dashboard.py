from typing import Literal

from pydantic import BaseModel


class TrendPoint(BaseModel):
    date: str
    value: float | int

    def __eq__(self, other: object) -> bool:
        if isinstance(other, dict):
            return self.model_dump() == other
        return super().__eq__(other)


class DashboardToday(BaseModel):
    date: str
    weight: float | None
    pulse: int | None
    bp: str | None
    walk_distance: int | None
    songs: int | None
    nyha: int | None


class DashboardTrends(BaseModel):
    weight_7d: list[TrendPoint]
    pulse_7d: list[TrendPoint]
    walk_7d: list[TrendPoint]


class DashboardAdvisory(BaseModel):
    status: Literal["green", "amber", "red"]
    messages: list[str]


class DashboardResponse(BaseModel):
    today: DashboardToday
    trends: DashboardTrends
    advisory: DashboardAdvisory
