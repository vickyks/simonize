import json
from datetime import UTC, date, datetime
from typing import Any

from sqlmodel import Session, select

from app.models.observation import Observation, ObservationType
from app.models.user import User


VALID_SYMPTOMS = {
    "breathless",
    "chest_discomfort",
    "palpitations",
    "swollen_ankles",
    "dizzy",
    "very_tired",
    "poor_sleep",
    "poor_appetite",
    "good_day",
}
NEGATIVE_SYMPTOMS = VALID_SYMPTOMS - {"good_day"}


class ValidationError(ValueError):
    pass


class ObservationService:
    def __init__(self, session: Session):
        self.session = session

    def get_for_date(self, user: User, day: date) -> dict[ObservationType, Observation]:
        observations = self.session.exec(
            select(Observation).where(
                Observation.user_id == user.id,
                Observation.date == day,
            )
        ).all()
        return {observation.type: observation for observation in observations}

    def upsert(
        self,
        user: User,
        day: date,
        observation_type: ObservationType,
        value: Any,
        metadata: dict[str, Any] | None = None,
    ) -> Observation:
        stored_value = self._serialize_value(observation_type, value)
        clean_metadata = self._validate_metadata(observation_type, metadata)
        observation = self.session.exec(
            select(Observation).where(
                Observation.user_id == user.id,
                Observation.date == day,
                Observation.type == observation_type,
            )
        ).first()
        now = datetime.now(UTC)
        if observation is None:
            observation = Observation(
                user_id=user.id,
                date=day,
                type=observation_type,
                value=stored_value,
                extra_metadata=clean_metadata,
                created_at=now,
                updated_at=now,
            )
        else:
            observation.value = stored_value
            observation.extra_metadata = clean_metadata
            observation.updated_at = now
        self.session.add(observation)
        self.session.commit()
        self.session.refresh(observation)
        return observation

    def to_view(self, observation: Observation) -> dict[str, Any]:
        return {
            "type": observation.type.value,
            "value": self._parse_value(observation.type, observation.value),
            "metadata": observation.extra_metadata,
            "updated_at": observation.updated_at.isoformat(),
        }

    def _serialize_value(self, observation_type: ObservationType, value: Any) -> str:
        if observation_type == ObservationType.WEIGHT:
            number = self._float(value, "Weight must be a number")
            if number < 30.0 or number > 300.0:
                raise ValidationError("Weight must be between 30 and 300 kg")
            return str(number).rstrip("0").rstrip(".") if "." in str(number) else str(number)
        if observation_type in {
            ObservationType.PULSE,
            ObservationType.WALK_DISTANCE,
            ObservationType.WALK_TIME,
            ObservationType.WALK_STOPS,
            ObservationType.SONGS,
            ObservationType.NYHA,
        }:
            number = self._int(value, f"{observation_type.value} must be an integer")
            ranges = {
                ObservationType.PULSE: (30, 250, "Pulse must be between 30 and 250 BPM"),
                ObservationType.WALK_DISTANCE: (
                    0,
                    50000,
                    "Walk distance must be between 0 and 50000 metres",
                ),
                ObservationType.WALK_TIME: (
                    0,
                    86400,
                    "Walk time must be between 0 and 86400 seconds",
                ),
                ObservationType.WALK_STOPS: (0, 100, "Walk stops must be between 0 and 100"),
                ObservationType.SONGS: (0, 100, "Songs must be between 0 and 100"),
                ObservationType.NYHA: (1, 4, "NYHA class must be between 1 and 4"),
            }
            low, high, message = ranges[observation_type]
            if number < low or number > high:
                raise ValidationError(message)
            return str(number)
        if observation_type == ObservationType.BP:
            systolic, diastolic = self._parse_bp(value)
            return f"{systolic}/{diastolic}"
        if observation_type == ObservationType.SYMPTOMS:
            symptoms = self._parse_symptoms(value)
            return json.dumps(symptoms)
        if observation_type == ObservationType.NOTES:
            text = str(value)
            if len(text) > 2000:
                raise ValidationError("Notes must be 2000 characters or fewer")
            return text
        raise ValidationError("Unknown observation type")

    def _parse_value(self, observation_type: ObservationType, value: str) -> Any:
        if observation_type == ObservationType.SYMPTOMS:
            return json.loads(value)
        return value

    def _validate_metadata(
        self, observation_type: ObservationType, metadata: dict[str, Any] | None
    ) -> dict[str, Any] | None:
        if metadata is None:
            return None
        if observation_type != ObservationType.WALK_DISTANCE:
            return metadata
        clean: dict[str, Any] = {}
        if "time_seconds" in metadata and metadata["time_seconds"] not in (None, ""):
            clean["time_seconds"] = self._int(
                metadata["time_seconds"], "Walk time must be an integer"
            )
        if "stops" in metadata and metadata["stops"] not in (None, ""):
            clean["stops"] = self._int(metadata["stops"], "Walk stops must be an integer")
        return clean or None

    def _float(self, value: Any, message: str) -> float:
        try:
            return float(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError(message) from exc

    def _int(self, value: Any, message: str) -> int:
        try:
            if isinstance(value, str) and value.strip() == "":
                raise ValueError
            number = int(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError(message) from exc
        return number

    def _parse_bp(self, value: Any) -> tuple[int, int]:
        if not isinstance(value, str) or "/" not in value:
            raise ValidationError("Blood pressure must use SYS/DIA format")
        systolic_text, diastolic_text = value.split("/", 1)
        systolic = self._int(systolic_text, "Systolic blood pressure must be an integer")
        diastolic = self._int(diastolic_text, "Diastolic blood pressure must be an integer")
        if systolic < 60 or systolic > 250:
            raise ValidationError("Systolic blood pressure must be between 60 and 250")
        if diastolic < 40 or diastolic > 150:
            raise ValidationError("Diastolic blood pressure must be between 40 and 150")
        if systolic <= diastolic:
            raise ValidationError("Systolic blood pressure must be higher than diastolic")
        return systolic, diastolic

    def _parse_symptoms(self, value: Any) -> list[str]:
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise ValidationError("Symptoms must be a list")
        unknown = set(value) - VALID_SYMPTOMS
        if unknown:
            raise ValidationError("Symptoms include an unknown option")
        if "good_day" in value and set(value) & NEGATIVE_SYMPTOMS:
            raise ValidationError("Good day cannot be selected with symptoms")
        return value
