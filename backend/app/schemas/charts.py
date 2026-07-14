from pydantic import BaseModel


class ChartPoint(BaseModel):
    date: str
    value: float | int


class BloodPressureChartPoint(BaseModel):
    date: str
    systolic: int
    diastolic: int
