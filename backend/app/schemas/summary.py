from pydantic import BaseModel


class DumpableModel(BaseModel):
    def __eq__(self, other: object) -> bool:
        if isinstance(other, dict):
            return self.model_dump() == other
        return super().__eq__(other)


class SummaryPoint(DumpableModel):
    date: str
    value: float | int


class SummaryBpPoint(DumpableModel):
    date: str
    systolic: int
    diastolic: int


class SummaryWalkPoint(DumpableModel):
    date: str
    distance: int
    time_seconds: int | None = None
    stops: int | None = None


class SummarySymptomsEntry(DumpableModel):
    date: str
    values: list[str]


class SummaryNoteEntry(DumpableModel):
    date: str
    text: str


class SummaryRange(BaseModel):
    days: int
    start_date: str
    end_date: str
    generated_at: str


class SummaryVitals(BaseModel):
    weight: list[SummaryPoint]
    pulse: list[SummaryPoint]
    bp: list[SummaryBpPoint]


class SummaryActivity(BaseModel):
    walk: list[SummaryWalkPoint]
    songs: list[SummaryPoint]


class SummaryFunctional(BaseModel):
    nyha: list[SummaryPoint]


class SummaryResponse(BaseModel):
    range: SummaryRange
    vitals: SummaryVitals
    activity: SummaryActivity
    functional: SummaryFunctional
    symptoms: list[SummarySymptomsEntry]
    notes: list[SummaryNoteEntry]
