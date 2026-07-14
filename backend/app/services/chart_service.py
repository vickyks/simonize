import math
import uuid
from datetime import date, timedelta

from sqlmodel import Session, select

from app.models.observation import Observation, ObservationType
from app.schemas.charts import BloodPressureChartPoint, ChartPoint

ALLOWED_RANGES = {"7", "30", "90", "all"}


class ChartRangeError(ValueError):
    pass


class ChartService:
    def __init__(self, session: Session):
        self.session = session

    def metric_points(
        self,
        user_id: uuid.UUID,
        observation_type: ObservationType,
        days: str = "30",
        today: date | None = None,
    ) -> list[ChartPoint]:
        current_day = today or date.today()
        observations = self._observations(user_id, observation_type, days, current_day)
        points: list[ChartPoint] = []
        for observation in observations:
            value = self._number(
                observation.value, prefer_int=observation_type != ObservationType.WEIGHT
            )
            if value is not None:
                points.append(
                    ChartPoint(date=observation.date.isoformat(), value=value)
                )
        return points

    def bp_points(
        self,
        user_id: uuid.UUID,
        days: str = "30",
        today: date | None = None,
    ) -> list[BloodPressureChartPoint]:
        current_day = today or date.today()
        observations = self._observations(
            user_id, ObservationType.BP, days, current_day
        )
        points: list[BloodPressureChartPoint] = []
        for observation in observations:
            bp = self._bp(observation.value)
            if bp is not None:
                systolic, diastolic = bp
                points.append(
                    BloodPressureChartPoint(
                        date=observation.date.isoformat(),
                        systolic=systolic,
                        diastolic=diastolic,
                    )
                )
        return points

    def nyha_points(self, user_id: uuid.UUID) -> list[ChartPoint]:
        observations = self.session.exec(
            select(Observation)
            .where(Observation.user_id == user_id)
            .where(Observation.type == ObservationType.NYHA)
            .order_by(Observation.date)
        ).all()
        points: list[ChartPoint] = []
        for observation in observations:
            value = self._number(observation.value, prefer_int=True)
            if isinstance(value, int) and 1 <= value <= 4:
                points.append(
                    ChartPoint(date=observation.date.isoformat(), value=value)
                )
        return points

    def _observations(
        self,
        user_id: uuid.UUID,
        observation_type: ObservationType,
        days: str,
        today: date,
    ) -> list[Observation]:
        if days not in ALLOWED_RANGES:
            raise ChartRangeError("days must be one of 7, 30, 90, all")

        statement = (
            select(Observation)
            .where(Observation.user_id == user_id)
            .where(Observation.type == observation_type)
            .order_by(Observation.date)
        )
        if days != "all":
            start_day = today - timedelta(days=int(days) - 1)
            statement = statement.where(Observation.date >= start_day).where(
                Observation.date <= today
            )
        return list(self.session.exec(statement).all())

    def _number(self, value: str, prefer_int: bool) -> float | int | None:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(number):
            return None
        if prefer_int:
            if not number.is_integer():
                return None
            return int(number)
        return number

    def _bp(self, value: str) -> tuple[int, int] | None:
        if "/" not in value:
            return None
        systolic_text, diastolic_text = value.split("/", 1)
        systolic = self._number(systolic_text, prefer_int=True)
        diastolic = self._number(diastolic_text, prefer_int=True)
        if isinstance(systolic, int) and isinstance(diastolic, int):
            return systolic, diastolic
        return None
