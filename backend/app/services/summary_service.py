import json
import math
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlmodel import Session, select

from app.models.observation import Observation, ObservationType
from app.schemas.summary import (
    SummaryActivity,
    SummaryBpPoint,
    SummaryFunctional,
    SummaryNoteEntry,
    SummaryPoint,
    SummaryRange,
    SummaryResponse,
    SummarySymptomsEntry,
    SummaryVitals,
    SummaryWalkPoint,
)

ALLOWED_SUMMARY_RANGES = {"7", "30"}


class SummaryRangeError(ValueError):
    pass


class SummaryService:
    def __init__(self, session: Session):
        self.session = session

    def build(
        self, user_id: uuid.UUID, days: str = "7", today: date | None = None
    ) -> SummaryResponse:
        if days not in ALLOWED_SUMMARY_RANGES:
            raise SummaryRangeError("days must be one of 7, 30")

        current_day = today or date.today()
        days_int = int(days)
        start_day = current_day - timedelta(days=days_int - 1)
        observations = self.session.exec(
            select(Observation)
            .where(Observation.user_id == user_id)
            .where(Observation.date >= start_day)
            .where(Observation.date <= current_day)
            .order_by(Observation.date)
        ).all()
        grouped = self._group(observations)

        return SummaryResponse(
            range=SummaryRange(
                days=days_int,
                start_date=start_day.isoformat(),
                end_date=current_day.isoformat(),
                generated_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            ),
            vitals=SummaryVitals(
                weight=self._metric(grouped, ObservationType.WEIGHT, prefer_int=False),
                pulse=self._metric(grouped, ObservationType.PULSE, prefer_int=True),
                bp=self._bp(grouped),
            ),
            activity=SummaryActivity(
                walk=self._walk(grouped),
                songs=self._metric(grouped, ObservationType.SONGS, prefer_int=True),
            ),
            functional=SummaryFunctional(
                nyha=self._metric(grouped, ObservationType.NYHA, prefer_int=True)
            ),
            symptoms=self._symptoms(grouped),
            notes=self._notes(grouped),
        )

    def _group(
        self, observations: list[Observation]
    ) -> dict[date, dict[ObservationType, Observation]]:
        grouped: dict[date, dict[ObservationType, Observation]] = {}
        for observation in observations:
            grouped.setdefault(observation.date, {})[observation.type] = observation
        return grouped

    def _metric(
        self,
        grouped: dict[date, dict[ObservationType, Observation]],
        observation_type: ObservationType,
        prefer_int: bool,
    ) -> list[SummaryPoint]:
        points: list[SummaryPoint] = []
        for day, values in sorted(grouped.items()):
            observation = values.get(observation_type)
            if observation is None:
                continue
            value = self._number(observation.value, prefer_int=prefer_int)
            if value is not None:
                points.append(SummaryPoint(date=day.isoformat(), value=value))
        return points

    def _bp(
        self, grouped: dict[date, dict[ObservationType, Observation]]
    ) -> list[SummaryBpPoint]:
        points: list[SummaryBpPoint] = []
        for day, values in sorted(grouped.items()):
            observation = values.get(ObservationType.BP)
            if observation is None:
                continue
            bp = self._parse_bp(observation.value)
            if bp is not None:
                systolic, diastolic = bp
                points.append(
                    SummaryBpPoint(
                        date=day.isoformat(), systolic=systolic, diastolic=diastolic
                    )
                )
        return points

    def _walk(
        self, grouped: dict[date, dict[ObservationType, Observation]]
    ) -> list[SummaryWalkPoint]:
        points: list[SummaryWalkPoint] = []
        for day, values in sorted(grouped.items()):
            observation = values.get(ObservationType.WALK_DISTANCE)
            if observation is None:
                continue
            distance = self._number(observation.value, prefer_int=True)
            if not isinstance(distance, int):
                continue
            metadata = observation.extra_metadata or {}
            time_seconds = self._optional_int(metadata.get("time_seconds"))
            stops = self._optional_int(metadata.get("stops"))
            if time_seconds is None:
                time_seconds = self._observation_int(
                    values.get(ObservationType.WALK_TIME)
                )
            if stops is None:
                stops = self._observation_int(values.get(ObservationType.WALK_STOPS))
            points.append(
                SummaryWalkPoint(
                    date=day.isoformat(),
                    distance=distance,
                    time_seconds=time_seconds,
                    stops=stops,
                )
            )
        return points

    def _symptoms(
        self, grouped: dict[date, dict[ObservationType, Observation]]
    ) -> list[SummarySymptomsEntry]:
        entries: list[SummarySymptomsEntry] = []
        for day, values in sorted(grouped.items()):
            observation = values.get(ObservationType.SYMPTOMS)
            if observation is None:
                continue
            try:
                symptoms = json.loads(observation.value)
            except json.JSONDecodeError:
                continue
            if isinstance(symptoms, list) and all(
                isinstance(item, str) for item in symptoms
            ):
                entries.append(
                    SummarySymptomsEntry(date=day.isoformat(), values=symptoms)
                )
        return entries

    def _notes(
        self, grouped: dict[date, dict[ObservationType, Observation]]
    ) -> list[SummaryNoteEntry]:
        entries: list[SummaryNoteEntry] = []
        for day, values in sorted(grouped.items()):
            observation = values.get(ObservationType.NOTES)
            if observation is not None:
                entries.append(
                    SummaryNoteEntry(date=day.isoformat(), text=observation.value)
                )
        return entries

    def _observation_int(self, observation: Observation | None) -> int | None:
        if observation is None:
            return None
        return self._optional_int(observation.value)

    def _optional_int(self, value: object) -> int | None:
        number = self._number(value, prefer_int=True)
        return number if isinstance(number, int) else None

    def _number(self, value: object, prefer_int: bool) -> float | int | None:
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

    def _parse_bp(self, value: str) -> tuple[int, int] | None:
        if "/" not in value:
            return None
        systolic_text, diastolic_text = value.split("/", 1)
        systolic = self._optional_int(systolic_text)
        diastolic = self._optional_int(diastolic_text)
        if systolic is None or diastolic is None:
            return None
        return systolic, diastolic
