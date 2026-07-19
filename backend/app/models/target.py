import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class TargetType(StrEnum):
    WALK_DISTANCE = "walk_distance"
    SONGS = "songs"
    NYHA = "nyha"


class Target(SQLModel, table=True):
    __tablename__ = "targets"
    __table_args__ = (
        UniqueConstraint("user_id", "type", name="uq_targets_user_type"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    type: TargetType = Field(index=True, nullable=False)
    value: str = Field(nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), nullable=False
    )
