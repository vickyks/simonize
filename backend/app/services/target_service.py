import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.models.target import Target, TargetType
from app.schemas.targets import TargetEntry, TargetsResponse
from app.services.achievement_service import AchievementService

TARGET_ORDER = [TargetType.WALK_DISTANCE, TargetType.SONGS, TargetType.NYHA]
TARGET_DEFAULTS = {
    TargetType.WALK_DISTANCE: "500",
    TargetType.SONGS: "5",
    TargetType.NYHA: "2",
}
TARGET_LABELS = {
    TargetType.WALK_DISTANCE: "Walk distance target",
    TargetType.SONGS: "Guitar songs target",
    TargetType.NYHA: "NYHA target",
}
TARGET_UNITS = {
    TargetType.WALK_DISTANCE: "m",
    TargetType.SONGS: "songs",
    TargetType.NYHA: "class",
}


class TargetValidationError(ValueError):
    pass


class TargetService:
    def __init__(self, session: Session):
        self.session = session

    def get_view(self, user_id: uuid.UUID) -> TargetsResponse:
        targets = self._ensure_defaults(user_id)
        return TargetsResponse(
            targets=[self._entry(targets[target_type]) for target_type in TARGET_ORDER],
            milestones=AchievementService(self.session).list(user_id=user_id),
        )

    def update(
        self, user_id: uuid.UUID, target_type: TargetType, value: str | int
    ) -> TargetsResponse:
        normalized = self._validate(target_type, value)
        targets = self._ensure_defaults(user_id)
        target = targets[target_type]
        target.value = str(normalized)
        target.updated_at = datetime.now(UTC)
        self.session.add(target)
        self.session.commit()
        return self.get_view(user_id=user_id)

    def _ensure_defaults(self, user_id: uuid.UUID) -> dict[TargetType, Target]:
        existing = self.session.exec(
            select(Target).where(Target.user_id == user_id)
        ).all()
        by_type = {target.type: target for target in existing}
        changed = False
        for target_type in TARGET_ORDER:
            if target_type not in by_type:
                target = Target(
                    user_id=user_id,
                    type=target_type,
                    value=TARGET_DEFAULTS[target_type],
                )
                self.session.add(target)
                by_type[target_type] = target
                changed = True
        if changed:
            self.session.commit()
            for target in by_type.values():
                self.session.refresh(target)
        return by_type

    def _entry(self, target: Target) -> TargetEntry:
        return TargetEntry(
            type=target.type,
            label=TARGET_LABELS[target.type],
            value=int(target.value),
            unit=TARGET_UNITS[target.type],
        )

    def _validate(self, target_type: TargetType, value: str | int) -> int:
        try:
            number = int(value)
        except (TypeError, ValueError) as exc:
            raise TargetValidationError("target value must be an integer") from exc
        if str(value).strip() != str(number):
            raise TargetValidationError("target value must be an integer")
        if target_type == TargetType.WALK_DISTANCE and 0 <= number <= 50000:
            return number
        if target_type == TargetType.SONGS and 0 <= number <= 100:
            return number
        if target_type == TargetType.NYHA and 1 <= number <= 4:
            return number
        raise TargetValidationError("target value is outside the allowed range")
