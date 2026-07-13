from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.models.observation import ObservationType

AdvisoryStatus = Literal["green", "amber", "red"]

URGENT_ADVICE = (
    "If symptoms are severe or sudden, call 999. Otherwise contact the Heart Failure "
    "team urgently."
)
AMBER_ADVICE = "Consider contacting the Heart Failure team if this continues."


@dataclass(frozen=True)
class DailyWarningObservations:
    date: date
    values: dict[ObservationType, object]


@dataclass(frozen=True)
class AdvisoryResult:
    status: AdvisoryStatus
    messages: list[str]


class WarningService:
    def evaluate(
        self,
        today: dict[ObservationType, object],
        recent: list[DailyWarningObservations],
    ) -> AdvisoryResult:
        red_messages = self._red_messages(today, recent)
        if red_messages:
            return AdvisoryResult(status="red", messages=[*red_messages, URGENT_ADVICE])

        amber_messages = self._amber_messages(recent)
        if amber_messages:
            return AdvisoryResult(
                status="amber", messages=[*amber_messages, AMBER_ADVICE]
            )

        return AdvisoryResult(status="green", messages=[])

    def _red_messages(
        self,
        today: dict[ObservationType, object],
        recent: list[DailyWarningObservations],
    ) -> list[str]:
        messages: list[str] = []
        symptoms = today.get(ObservationType.SYMPTOMS)
        if isinstance(symptoms, list) and "chest_discomfort" in symptoms:
            messages.append("Chest discomfort was recorded today.")

        if today.get(ObservationType.NYHA) == 4:
            messages.append("NYHA class IV was recorded today.")

        if self._weight_gain(recent, max_days=2, threshold=3.0):
            messages.append("Your weight has increased 3 kg over 2 days.")

        return messages

    def _amber_messages(self, recent: list[DailyWarningObservations]) -> list[str]:
        messages: list[str] = []

        if self._weight_gain(recent, max_days=3, threshold=2.0):
            messages.append("Your weight has increased 2 kg over 3 days.")

        if self._pulse_average_rise(recent):
            messages.append(
                "Your resting pulse average has increased by more than 10 BPM over "
                "7 days."
            )

        if self._walk_distance_falling(recent):
            messages.append(
                "Your walk distance has fallen by more than 20% over 7 days."
            )

        if self._nyha_worsening(recent):
            messages.append("NYHA class has worsened for 3 consecutive days.")

        repeated_symptom = self._repeated_symptom(recent)
        if repeated_symptom:
            messages.append(
                f"{repeated_symptom.replace('_', ' ').title()} was recorded on 3 "
                "of the last 7 days."
            )

        return messages

    def _pulse_average_rise(self, recent: list[DailyWarningObservations]) -> bool:
        readings = [
            (day.date, value)
            for day in recent
            if isinstance(value := day.values.get(ObservationType.PULSE), int)
        ]
        readings.sort(key=lambda item: item[0])
        if len(readings) < 4:
            return False

        earliest = readings[:2]
        latest = readings[-2:]
        if len(earliest) < 2 or len(latest) < 2:
            return False

        earliest_average = sum(value for _, value in earliest) / len(earliest)
        latest_average = sum(value for _, value in latest) / len(latest)
        return latest_average - earliest_average > 10

    def _walk_distance_falling(self, recent: list[DailyWarningObservations]) -> bool:
        readings = [
            (day.date, value)
            for day in recent
            if isinstance(value := day.values.get(ObservationType.WALK_DISTANCE), int)
        ]
        readings.sort(key=lambda item: item[0])
        if len(readings) < 3:
            return False

        first_distance = readings[0][1]
        last_distance = readings[-1][1]
        if first_distance <= 0:
            return False
        return (first_distance - last_distance) / first_distance > 0.2

    def _nyha_worsening(self, recent: list[DailyWarningObservations]) -> bool:
        readings = [
            (day.date, value)
            for day in recent
            if isinstance(value := day.values.get(ObservationType.NYHA), int)
        ]
        readings.sort(key=lambda item: item[0])

        for index in range(len(readings) - 3):
            baseline_date, baseline = readings[index]
            window = readings[index + 1 : index + 4]
            if len(window) < 3:
                continue
            consecutive = all(
                (day - baseline_date).days in {1, 2, 3} for day, _ in window
            )
            worsened = all(value >= baseline + 1 for _, value in window)
            if consecutive and worsened:
                return True
        return False

    def _repeated_symptom(self, recent: list[DailyWarningObservations]) -> str | None:
        counts: dict[str, int] = {}
        for day in recent:
            symptoms = day.values.get(ObservationType.SYMPTOMS)
            if not isinstance(symptoms, list):
                continue
            for symptom in symptoms:
                if isinstance(symptom, str) and symptom != "good_day":
                    counts[symptom] = counts.get(symptom, 0) + 1

        repeated = sorted(symptom for symptom, count in counts.items() if count >= 3)
        return repeated[0] if repeated else None

    def _weight_gain(
        self,
        recent: list[DailyWarningObservations],
        max_days: int,
        threshold: float,
    ) -> bool:
        readings = [
            (day.date, value)
            for day in recent
            if isinstance(value := day.values.get(ObservationType.WEIGHT), int | float)
        ]
        readings.sort(key=lambda item: item[0])

        for start_date, start_weight in readings:
            for end_date, end_weight in readings:
                days = (end_date - start_date).days
                if 0 < days <= max_days and end_weight - start_weight >= threshold:
                    return True
        return False
