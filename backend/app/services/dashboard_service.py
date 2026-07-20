import json
import math
import uuid
from datetime import date, timedelta

from sqlmodel import Session, select

from app.models.observation import Observation, ObservationType
from app.models.target import TargetType
from app.schemas.dashboard import (
    DashboardAdvisory,
    DashboardResponse,
    DashboardTargetProgress,
    DashboardTargets,
    DashboardToday,
    DashboardTrends,
    TrendPoint,
)
from app.services.achievement_service import AchievementService
from app.services.target_service import TargetService
from app.services.warning_service import DailyWarningObservations, WarningService


class DashboardService:
    def __init__(self, session: Session):
        self.session = session

    def build(self, user_id: uuid.UUID, today: date | None = None) -> DashboardResponse:
        current_day = today or date.today()
        start_day = current_day - timedelta(days=6)
        observations = self.session.exec(
            select(Observation)
            .where(Observation.user_id == user_id)
            .where(Observation.date <= current_day)
            .order_by(Observation.date)
        ).all()

        grouped = self._group_by_date(observations)
        today_values = grouped.get(current_day, {})
        recent = [
            DailyWarningObservations(date=day, values=values)
            for day, values in sorted(grouped.items())
            if day >= start_day
        ]
        advisory = WarningService().evaluate(today=today_values, recent=recent)

        return DashboardResponse(
            today=DashboardToday(
                date=current_day.isoformat(),
                weight=self._float(today_values.get(ObservationType.WEIGHT)),
                pulse=self._int(today_values.get(ObservationType.PULSE)),
                bp=self._str(today_values.get(ObservationType.BP)),
                walk_distance=self._int(
                    today_values.get(ObservationType.WALK_DISTANCE)
                ),
                songs=self._int(today_values.get(ObservationType.SONGS)),
                nyha=self._int(today_values.get(ObservationType.NYHA)),
            ),
            trends=DashboardTrends(
                weight_7d=self._trend(grouped, ObservationType.WEIGHT, "float"),
                pulse_7d=self._trend(grouped, ObservationType.PULSE, "int"),
                walk_7d=self._trend(grouped, ObservationType.WALK_DISTANCE, "int"),
            ),
            advisory=DashboardAdvisory(
                status=advisory.status,
                messages=advisory.messages,
            ),
            targets=self._targets(user_id, today_values, grouped),
            milestones=AchievementService(self.session).list(user_id=user_id)[:3],
        )

    def _group_by_date(
        self, observations: list[Observation]
    ) -> dict[date, dict[ObservationType, object]]:
        grouped: dict[date, dict[ObservationType, object]] = {}
        for observation in observations:
            value = self._parse_observation(observation)
            if value is None:
                continue
            grouped.setdefault(observation.date, {})[observation.type] = value
        return grouped

    def _parse_observation(self, observation: Observation) -> object | None:
        if observation.type == ObservationType.WEIGHT:
            return self._float(observation.value)
        if observation.type in {
            ObservationType.PULSE,
            ObservationType.WALK_DISTANCE,
            ObservationType.SONGS,
            ObservationType.NYHA,
        }:
            return self._int(observation.value)
        if observation.type == ObservationType.BP:
            return observation.value if "/" in observation.value else None
        if observation.type == ObservationType.SYMPTOMS:
            try:
                symptoms = json.loads(observation.value)
            except json.JSONDecodeError:
                return None
            return symptoms if isinstance(symptoms, list) else None
        return observation.value

    def _trend(
        self,
        grouped: dict[date, dict[ObservationType, object]],
        observation_type: ObservationType,
        value_type: str,
    ) -> list[TrendPoint]:
        points: list[TrendPoint] = []
        for day, values in sorted(grouped.items()):
            value = values.get(observation_type)
            parsed = self._float(value) if value_type == "float" else self._int(value)
            if parsed is not None:
                points.append(TrendPoint(date=day.isoformat(), value=parsed))
        return points

    def _targets(
        self,
        user_id: uuid.UUID,
        today_values: dict[ObservationType, object],
        grouped: dict[date, dict[ObservationType, object]],
    ) -> DashboardTargets:
        target_entries = {
            target.type: target
            for target in TargetService(self.session).get_view(user_id).targets
        }
        walk_target = target_entries[TargetType.WALK_DISTANCE].value
        songs_target = target_entries[TargetType.SONGS].value
        nyha_target = target_entries[TargetType.NYHA].value
        walk_current = self._int(today_values.get(ObservationType.WALK_DISTANCE))
        songs_current = self._int(today_values.get(ObservationType.SONGS))
        nyha_current = self._int(today_values.get(ObservationType.NYHA))
        if nyha_current is None:
            nyha_current = self._latest_int(grouped, ObservationType.NYHA)
        return DashboardTargets(
            walk_distance=self._walk_progress(walk_current, walk_target),
            songs=self._songs_progress(songs_current, songs_target),
            nyha=self._nyha_progress(nyha_current, nyha_target),
        )

    def _walk_progress(
        self, current: int | None, target: int
    ) -> DashboardTargetProgress:
        if current is None:
            return DashboardTargetProgress(
                current=None,
                target=target,
                met=False,
                label=f"No walk recorded today yet - target {target} m",
            )
        return DashboardTargetProgress(
            current=current,
            target=target,
            met=current >= target,
            label=f"{current} m of {target} m",
        )

    def _songs_progress(
        self, current: int | None, target: int
    ) -> DashboardTargetProgress:
        if current is None:
            return DashboardTargetProgress(
                current=None,
                target=target,
                met=False,
                label=f"No guitar recorded today yet - target {target} songs",
            )
        return DashboardTargetProgress(
            current=current,
            target=target,
            met=current >= target,
            label=f"{current} of {target} songs",
        )

    def _nyha_progress(
        self, current: int | None, target: int
    ) -> DashboardTargetProgress:
        if current is None:
            return DashboardTargetProgress(
                current=None,
                target=target,
                met=False,
                label=f"No NYHA recorded yet - target Class {target}",
            )
        return DashboardTargetProgress(
            current=current,
            target=target,
            met=current <= target,
            label=f"Class {current}, target Class {target}",
        )

    def _latest_int(
        self,
        grouped: dict[date, dict[ObservationType, object]],
        observation_type: ObservationType,
    ) -> int | None:
        for day in sorted(grouped, reverse=True):
            value = self._int(grouped[day].get(observation_type))
            if value is not None:
                return value
        return None

    def _float(self, value: object) -> float | None:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number if math.isfinite(number) else None

    def _int(self, value: object) -> int | None:
        if isinstance(value, bool):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _str(self, value: object) -> str | None:
        return value if isinstance(value, str) else None
