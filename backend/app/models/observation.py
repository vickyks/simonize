import uuid
from datetime import UTC, date as date_type, datetime
from enum import StrEnum

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


class ObservationType(StrEnum):
    WEIGHT = "weight"
    PULSE = "pulse"
    BP = "bp"
    WALK_DISTANCE = "walk_distance"
    WALK_TIME = "walk_time"
    WALK_STOPS = "walk_stops"
    SONGS = "songs"
    NYHA = "nyha"
    SYMPTOMS = "symptoms"
    NOTES = "notes"


class Observation(SQLModel, table=True):
    __tablename__ = "observations"
    __table_args__ = (
        UniqueConstraint("user_id", "date", "type", name="uq_observations_user_date_type"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True, nullable=False)
    date: date_type = Field(index=True, nullable=False)
    type: ObservationType = Field(index=True, nullable=False)
    value: str = Field(nullable=False)
    extra_metadata: dict | None = Field(
        default=None,
        sa_column=Column("metadata", JSON, nullable=True),
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)
