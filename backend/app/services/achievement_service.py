from __future__ import annotations

import json
import math
import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlmodel import Session, select

from app.models.observation import Observation, ObservationType
from app.schemas.targets import MilestoneEntry

MILESTONE_ORDER = [
    "longest_walk",
    "most_songs",
    "lowest_resting_pulse",
    "weight_stable_7_days",
    "weight_stable_30_days",
    "first_nyha_iii",
    "first_nyha_ii",
    "first_symptom_free_day",
    "one_hundred_observations",
    "thirty_consecutive_days",
]

INT_RANGES = {
    ObservationType.PULSE: (30, 250),
    ObservationType.WALK_DISTANCE: (0, 50000),
    ObservationType.SONGS: (0, 100),
    ObservationType.NYHA: (1, 4),
}
FLOAT_RANGES = {
    ObservationType.WEIGHT: (30.0, 300.0),
}


class AchievementService:
    def __init__(self, session: Session):
        self.session = session

    def list(
        self, user_id: uuid.UUID, as_of: date | None = None
    ) -> list[MilestoneEntry]:
        query = select(Observation).where(Observation.user_id == user_id)
        if as_of is not None:
            query = query.where(Observation.date <= as_of)
        observations = self.session.exec(
            query.order_by(Observation.date, Observation.created_at)
        ).all()
        grouped = self._group(observations)
        milestones = [
            self._best_int(
                grouped,
                ObservationType.WALK_DISTANCE,
                "longest_walk",
                "Longest walk",
                "m",
                "You walked {value} metres - your furthest yet.",
            ),
            self._best_int(
                grouped,
                ObservationType.SONGS,
                "most_songs",
                "Most guitar",
                "songs",
                "You played {value} songs - your most yet.",
            ),
            self._lowest_int(grouped),
            self._weight_stable(grouped, days=7),
            self._weight_stable(grouped, days=30),
            self._first_nyha(grouped, value=3),
            self._first_nyha(grouped, value=2),
            self._first_symptom_free(grouped),
            self._hundred_observations(observations),
            self._thirty_consecutive_days(grouped),
        ]
        achieved = [milestone for milestone in milestones if milestone is not None]
        order = {
            milestone_type: index
            for index, milestone_type in enumerate(MILESTONE_ORDER)
        }
        return sorted(
            achieved, key=lambda item: (item.date, -order[item.type]), reverse=True
        )

    def _group(self, observations: list[Observation]) -> dict[date, list[Observation]]:
        grouped: dict[date, list[Observation]] = defaultdict(list)
        for observation in observations:
            grouped[observation.date].append(observation)
        return dict(grouped)

    def _observations_of_type(
        self,
        grouped: dict[date, list[Observation]],
        observation_type: ObservationType,
    ) -> list[tuple[date, Observation]]:
        rows: list[tuple[date, Observation]] = []
        for day in sorted(grouped):
            for observation in grouped[day]:
                if observation.type == observation_type:
                    rows.append((day, observation))
        return rows

    def _best_int(
        self,
        grouped: dict[date, list[Observation]],
        observation_type: ObservationType,
        milestone_type: str,
        title: str,
        unit: str,
        message: str,
    ) -> MilestoneEntry | None:
        best: tuple[date, int] | None = None
        for day, observation in self._observations_of_type(grouped, observation_type):
            value = self._int(observation.value, observation_type)
            if value is None:
                continue
            if best is None or value > best[1]:
                best = (day, value)
        if best is None:
            return None
        day, value = best
        return MilestoneEntry(
            type=milestone_type,
            title=title,
            date=day.isoformat(),
            message=message.format(value=value),
            value=f"{value} {unit}",
        )

    def _lowest_int(
        self, grouped: dict[date, list[Observation]]
    ) -> MilestoneEntry | None:
        best: tuple[date, int] | None = None
        for day, observation in self._observations_of_type(
            grouped, ObservationType.PULSE
        ):
            value = self._int(observation.value, ObservationType.PULSE)
            if value is None:
                continue
            if best is None or value < best[1]:
                best = (day, value)
        if best is None:
            return None
        day, value = best
        return MilestoneEntry(
            type="lowest_resting_pulse",
            title="Lowest resting pulse",
            date=day.isoformat(),
            message=f"Your resting pulse reached {value} bpm.",
            value=f"{value} bpm",
        )

    def _weight_stable(
        self, grouped: dict[date, list[Observation]], days: int
    ) -> MilestoneEntry | None:
        weights = [
            (day, self._latest_float(rows, ObservationType.WEIGHT))
            for day, rows in sorted(grouped.items())
        ]
        weights = [(day, value) for day, value in weights if value is not None]
        for end_day, end_weight in reversed(weights):
            start_day = end_day - timedelta(days=days - 1)
            start_weight = next(
                (value for day, value in weights if day == start_day), None
            )
            if start_weight is not None and abs(end_weight - start_weight) <= 1.0:
                return MilestoneEntry(
                    type=f"weight_stable_{days}_days",
                    title=f"Weight stable {days} days",
                    date=end_day.isoformat(),
                    message=f"{days} days of stable weight. That's really encouraging.",
                    value=f"{days} days",
                )
        return None

    def _first_nyha(
        self, grouped: dict[date, list[Observation]], value: int
    ) -> MilestoneEntry | None:
        for day, observation in self._observations_of_type(
            grouped, ObservationType.NYHA
        ):
            if self._int(observation.value, ObservationType.NYHA) == value:
                return MilestoneEntry(
                    type=f"first_nyha_{'iii' if value == 3 else 'ii'}",
                    title=f"First NYHA {value}",
                    date=day.isoformat(),
                    message=f"You recorded NYHA class {value} for the first time.",
                    value=f"Class {value}",
                )
        return None

    def _first_symptom_free(
        self, grouped: dict[date, list[Observation]]
    ) -> MilestoneEntry | None:
        for day, observation in self._observations_of_type(
            grouped, ObservationType.SYMPTOMS
        ):
            try:
                symptoms = json.loads(observation.value)
            except json.JSONDecodeError:
                continue
            if symptoms == [] or symptoms == ["good_day"]:
                return MilestoneEntry(
                    type="first_symptom_free_day",
                    title="First symptom-free day",
                    date=day.isoformat(),
                    message="You've had your first symptom-free day.",
                    value="Good day",
                )
        return None

    def _hundred_observations(
        self, observations: list[Observation]
    ) -> MilestoneEntry | None:
        ordered = sorted(observations, key=lambda observation: observation.created_at)
        if len(ordered) < 100:
            return None
        observation = ordered[99]
        return MilestoneEntry(
            type="one_hundred_observations",
            title="100 observations recorded",
            date=observation.date.isoformat(),
            message="You've recorded 100 observations - a strong recovery record.",
            value="100 observations",
        )

    def _thirty_consecutive_days(
        self, grouped: dict[date, list[Observation]]
    ) -> MilestoneEntry | None:
        streak = 0
        previous: date | None = None
        for day in sorted(grouped):
            if previous is None or day == previous + timedelta(days=1):
                streak += 1
            else:
                streak = 1
            if streak == 30:
                return MilestoneEntry(
                    type="thirty_consecutive_days",
                    title="30 consecutive days",
                    date=day.isoformat(),
                    message=(
                        "Thirty consecutive days recorded. "
                        "That's a clear picture of recovery."
                    ),
                    value="30 days",
                )
            previous = day
        return None

    def _latest_float(
        self, observations: list[Observation], observation_type: ObservationType
    ) -> float | None:
        for observation in reversed(observations):
            if observation.type == observation_type:
                return self._float(observation.value, observation_type)
        return None

    def _int(
        self, value: object, observation_type: ObservationType | None = None
    ) -> int | None:
        if isinstance(value, bool):
            return None
        try:
            number = int(value)
        except (TypeError, ValueError):
            return None
        if observation_type in INT_RANGES:
            low, high = INT_RANGES[observation_type]
            if number < low or number > high:
                return None
        return number

    def _float(
        self, value: object, observation_type: ObservationType | None = None
    ) -> float | None:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(number):
            return None
        if observation_type in FLOAT_RANGES:
            low, high = FLOAT_RANGES[observation_type]
            if number < low or number > high:
                return None
        return number
