# Slice 2 Daily Observations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the daily observations data layer and complete grouped daily entry page with autosave, checklist, and historical editing.

**Architecture:** Store one observation per authenticated user, date, and type in a generic `observations` table. Backend validation and serialization live in `ObservationService`; routers stay thin and protected by `current_user`. The frontend renders a grouped daily form backed by generic observation API calls, saving typed fields on blur and selectors immediately.

**Tech Stack:** FastAPI, SQLModel, Alembic, PostgreSQL, pytest, React, TypeScript, Vite, Docker Compose.

## Global Constraints

- The app is observation-first: store individual observations, never daily records.
- The daily page is a view over observations for one date.
- All observation routes must require `current_user` and filter by `current_user.id`.
- The `observations` uniqueness rule is one observation per `user_id`, `date`, and `type`.
- Values are stored as strings; `ObservationService` parses, validates, and serializes per type.
- Slice 2 implements no dashboard trends, advisory logic, charts, doctor summary, targets, milestones, imports, fixtures, or demo observations.
- Typed fields save on blur only; NYHA and symptoms save immediately.
- No Save button exists anywhere on the daily page.
- The frontend must never use `localStorage` or `sessionStorage`.
- Checklist label for `songs` is `Guitar`.
- If `good_day` is selected, no negative symptoms may be selected at the same time.

---

## File Structure

- Create `backend/app/models/observation.py`: `Observation` SQLModel and `ObservationType` enum.
- Modify `backend/app/models/__init__.py`: import `Observation`, `ObservationType`, and `User` for SQLModel/Alembic metadata.
- Create `backend/alembic/versions/20260712_0002_create_observations.py`: observations migration.
- Create `backend/app/schemas/observations.py`: request/response models for daily views and observation upserts.
- Create `backend/app/services/observation_service.py`: validation, serialization, scoped reads, and upsert logic.
- Create `backend/app/routers/observations.py`: protected GET/PUT routes.
- Modify `backend/app/main.py`: include observations router.
- Create `backend/tests/test_observation_service.py`: service-level validation, serialization, upsert, and user-scope tests.
- Create `backend/tests/test_observation_routes.py`: route protection, auth, checklist, route validation, and user-scope tests.
- Create `frontend/src/api/observations.ts`: typed API wrapper for daily observations.
- Create `frontend/src/pages/Daily.tsx`: route/date parsing, data loading, grouped form state, autosave handlers.
- Create `frontend/src/components/inputs/DailyChecklist.tsx`: checklist rendering and scroll targets.
- Create `frontend/src/components/inputs/SaveStatus.tsx`: local save state display.
- Create `frontend/src/components/inputs/WeightInput.tsx`, `PulseInput.tsx`, `BloodPressureInput.tsx`, `WalkInput.tsx`, `SongsInput.tsx`, `NyhaSelector.tsx`, `SymptomsSelector.tsx`, `NotesInput.tsx`: focused daily input components.
- Modify `frontend/src/App.tsx`: render `Daily` for authenticated `/` and `/{date}` routes.
- Modify `README.md`: note Slice 2 current state and daily observation route.

---

### Task 1: Observation Model, Migration, And Service Core

**Files:**
- Create: `backend/app/models/observation.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/20260712_0002_create_observations.py`
- Create: `backend/app/services/observation_service.py`
- Test: `backend/tests/test_observation_service.py`

**Interfaces:**
- Consumes: `User` from `backend/app/models/user.py`.
- Produces: `ObservationType`, `Observation`, `ObservationService`, `ValidationError`.
- Later tasks call:
  - `ObservationService(session).get_for_date(user: User, day: date) -> dict[ObservationType, Observation]`
  - `ObservationService(session).upsert(user: User, day: date, observation_type: ObservationType, value: object, metadata: dict[str, object] | None = None) -> Observation`
  - `ObservationService(session).to_view(observation: Observation) -> dict[str, object]`

- [ ] **Step 1: Write failing service tests**

Create `backend/tests/test_observation_service.py`:

```python
from datetime import date

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.models.observation import Observation, ObservationType
from app.models.user import User
from app.services.observation_service import ObservationService, ValidationError


def make_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def make_user(session: Session, username: str = "simon") -> User:
    user = User(username=username, hashed_password="hash")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_upsert_creates_and_updates_without_duplicates():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        day = date(2026, 6, 27)

        created = service.upsert(user, day, ObservationType.WEIGHT, "92.3")
        updated = service.upsert(user, day, ObservationType.WEIGHT, "92.1")
        rows = session.exec(select(Observation)).all()

        assert updated.id == created.id
        assert updated.value == "92.1"
        assert len(rows) == 1


def test_get_for_date_is_scoped_to_user():
    with make_session() as session:
        simon = make_user(session, "simon")
        vicky = make_user(session, "vicky")
        service = ObservationService(session)
        day = date(2026, 6, 27)

        service.upsert(simon, day, ObservationType.PULSE, "70")
        service.upsert(vicky, day, ObservationType.PULSE, "88")

        simon_observations = service.get_for_date(simon, day)

        assert simon_observations[ObservationType.PULSE].value == "70"


@pytest.mark.parametrize(
    ("observation_type", "value", "stored"),
    [
        (ObservationType.WEIGHT, "92.3", "92.3"),
        (ObservationType.PULSE, "71", "71"),
        (ObservationType.BP, "121/78", "121/78"),
        (ObservationType.WALK_DISTANCE, "325", "325"),
        (ObservationType.WALK_TIME, "840", "840"),
        (ObservationType.WALK_STOPS, "2", "2"),
        (ObservationType.SONGS, "3", "3"),
        (ObservationType.NYHA, "3", "3"),
        (ObservationType.SYMPTOMS, ["good_day"], '["good_day"]'),
        (ObservationType.NOTES, "Felt stronger today", "Felt stronger today"),
    ],
)
def test_valid_values_are_stored(observation_type, value, stored):
    with make_session() as session:
        user = make_user(session)
        observation = ObservationService(session).upsert(
            user, date(2026, 6, 27), observation_type, value
        )

        assert observation.value == stored


@pytest.mark.parametrize(
    ("observation_type", "value"),
    [
        (ObservationType.WEIGHT, "20"),
        (ObservationType.PULSE, "251"),
        (ObservationType.BP, "78/121"),
        (ObservationType.WALK_DISTANCE, "50001"),
        (ObservationType.WALK_TIME, "86401"),
        (ObservationType.WALK_STOPS, "101"),
        (ObservationType.SONGS, "101"),
        (ObservationType.NYHA, "5"),
        (ObservationType.SYMPTOMS, ["good_day", "breathless"]),
        (ObservationType.SYMPTOMS, ["unknown"]),
        (ObservationType.NOTES, "x" * 2001),
    ],
)
def test_invalid_values_raise_validation_error(observation_type, value):
    with make_session() as session:
        user = make_user(session)

        with pytest.raises(ValidationError):
            ObservationService(session).upsert(
                user, date(2026, 6, 27), observation_type, value
            )


def test_walk_distance_metadata_is_preserved():
    with make_session() as session:
        user = make_user(session)
        observation = ObservationService(session).upsert(
            user,
            date(2026, 6, 27),
            ObservationType.WALK_DISTANCE,
            "325",
            metadata={"time_seconds": 840, "stops": 2},
        )

        assert observation.extra_metadata == {"time_seconds": 840, "stops": 2}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose build backend
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && PYTHONPATH=. pytest tests/test_observation_service.py -v"
```

Expected: FAIL with `ModuleNotFoundError` for `app.models.observation` or `app.services.observation_service`.

- [ ] **Step 3: Create observation model**

Create `backend/app/models/observation.py`:

```python
import uuid
from datetime import UTC, date, datetime
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
    date: date = Field(index=True, nullable=False)
    type: ObservationType = Field(index=True, nullable=False)
    value: str = Field(nullable=False)
    extra_metadata: dict | None = Field(
        default=None,
        sa_column=Column("metadata", JSON, nullable=True),
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)
```

Modify `backend/app/models/__init__.py`:

```python
from app.models.observation import Observation, ObservationType
from app.models.user import User

__all__ = ["Observation", "ObservationType", "User"]
```

The SQLModel uses SQLAlchemy `JSON` so in-memory SQLite tests can compile metadata. The Alembic migration uses PostgreSQL `JSONB` for production.

- [ ] **Step 4: Add migration**

Create `backend/alembic/versions/20260712_0002_create_observations.py`:

```python
"""create observations

Revision ID: 20260712_0002
Revises: 20260704_0001
Create Date: 2026-07-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260712_0002"
down_revision: Union[str, None] = "20260704_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "observations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", "type", name="uq_observations_user_date_type"),
    )
    op.create_index("ix_observations_user_id", "observations", ["user_id"])
    op.create_index("ix_observations_date", "observations", ["date"])
    op.create_index("ix_observations_type", "observations", ["type"])


def downgrade() -> None:
    op.drop_index("ix_observations_type", table_name="observations")
    op.drop_index("ix_observations_date", table_name="observations")
    op.drop_index("ix_observations_user_id", table_name="observations")
    op.drop_table("observations")
```

- [ ] **Step 5: Create observation service**

Create `backend/app/services/observation_service.py`:

```python
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
                ObservationType.WALK_DISTANCE: (0, 50000, "Walk distance must be between 0 and 50000 metres"),
                ObservationType.WALK_TIME: (0, 86400, "Walk time must be between 0 and 86400 seconds"),
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
            clean["time_seconds"] = self._int(metadata["time_seconds"], "Walk time must be an integer")
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
```

- [ ] **Step 6: Run service tests**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose build backend
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && PYTHONPATH=. pytest tests/test_observation_service.py -v"
```

Expected: all observation service tests pass.

- [ ] **Step 7: Run backend checks**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && ruff check . && PYTHONPATH=. pytest"
```

Expected: Ruff passes and all backend tests pass.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add backend/app/models backend/app/services/observation_service.py backend/alembic/versions/20260712_0002_create_observations.py backend/tests/test_observation_service.py
git commit -m "Add observation service"
```

---

### Task 2: Observation API Routes And Daily View Model

**Files:**
- Create: `backend/app/schemas/observations.py`
- Create: `backend/app/routers/observations.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_observation_routes.py`

**Interfaces:**
- Consumes: `ObservationService`, `ObservationType`, `current_user`, `get_session`.
- Produces: protected `GET /api/observations/{date}` and `PUT /api/observations/{date}/{type}`.

- [ ] **Step 1: Write failing route tests**

Create `backend/tests/test_observation_routes.py`:

```python
from datetime import date

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.config import settings
from app.database import get_session
from app.main import app
from app.models.user import User
from app.services.auth_service import AuthService
from app.models.observation import ObservationType
from app.services.observation_service import ObservationService


def make_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def make_client(session: Session):
    def override_session():
        yield session

    app.dependency_overrides[get_session] = override_session
    return TestClient(app)


def clear_overrides():
    app.dependency_overrides.clear()


def seed_user(session: Session, username: str = "simon") -> User:
    user = User(username=username, hashed_password=AuthService(session).hash_password("secret-password"))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def token_for(session: Session, user: User) -> str:
    return AuthService(session).create_access_token(user)


def test_get_observations_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/observations/2026-06-27")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_put_observation_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.put("/api/observations/2026-06-27/weight", json={"value": "92.3"})
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_put_and_get_weight_updates_checklist():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            saved = client.put(
                "/api/observations/2026-06-27/weight",
                headers=headers,
                json={"value": "92.3"},
            )
            loaded = client.get("/api/observations/2026-06-27", headers=headers)

            assert saved.status_code == 200
            assert saved.json()["value"] == "92.3"
            assert loaded.status_code == 200
            assert loaded.json()["observations"]["weight"]["value"] == "92.3"
            checklist = {item["type"]: item for item in loaded.json()["checklist"]}
            assert checklist["weight"]["recorded"] is True
            assert checklist["songs"]["label"] == "Guitar"
            assert checklist["songs"]["recorded"] is False
        finally:
            clear_overrides()


def test_routes_are_scoped_to_current_user():
    with make_session() as session:
        simon = seed_user(session, "simon")
        vicky = seed_user(session, "vicky")
        ObservationService(session).upsert(simon, date(2026, 6, 27), ObservationType.WEIGHT, "92.3")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, vicky)}"}
        try:
            response = client.get("/api/observations/2026-06-27", headers=headers)
            assert response.status_code == 200
            assert "weight" not in response.json()["observations"]
        finally:
            clear_overrides()


def test_invalid_value_returns_422():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.put(
                "/api/observations/2026-06-27/bp",
                headers=headers,
                json={"value": "78/121"},
            )
            assert response.status_code == 422
            assert "detail" in response.json()
        finally:
            clear_overrides()


def test_historical_date_returns_only_that_date():
    with make_session() as session:
        user = seed_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 6, 27), ObservationType.WEIGHT, "92.3")
        service.upsert(user, date(2026, 6, 28), ObservationType.WEIGHT, "92.1")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/observations/2026-06-28", headers=headers)
            assert response.status_code == 200
            assert response.json()["observations"]["weight"]["value"] == "92.1"
        finally:
            clear_overrides()
```

- [ ] **Step 2: Run route tests to verify they fail**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose build backend
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && PYTHONPATH=. pytest tests/test_observation_routes.py -v"
```

Expected: FAIL because observations router and schemas do not exist or are not mounted.

- [ ] **Step 3: Add observation schemas**

Create `backend/app/schemas/observations.py`:

```python
from typing import Any

from pydantic import BaseModel


class ObservationUpsertRequest(BaseModel):
    value: Any
    metadata: dict[str, Any] | None = None


class ObservationResponse(BaseModel):
    type: str
    value: Any
    metadata: dict[str, Any] | None = None
    updated_at: str


class ChecklistItem(BaseModel):
    type: str
    label: str
    recorded: bool


class DailyObservationsResponse(BaseModel):
    date: str
    observations: dict[str, ObservationResponse]
    checklist: list[ChecklistItem]
```

- [ ] **Step 4: Add observations router**

Create `backend/app/routers/observations.py`:

```python
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.database import get_session
from app.models.observation import ObservationType
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.observations import (
    ChecklistItem,
    DailyObservationsResponse,
    ObservationResponse,
    ObservationUpsertRequest,
)
from app.services.observation_service import ObservationService, ValidationError

router = APIRouter(prefix="/api/observations", tags=["observations"])

CHECKLIST = [
    (ObservationType.WEIGHT, "Weight"),
    (ObservationType.PULSE, "Pulse"),
    (ObservationType.BP, "Blood Pressure"),
    (ObservationType.WALK_DISTANCE, "Walk"),
    (ObservationType.SONGS, "Guitar"),
    (ObservationType.NYHA, "NYHA"),
    (ObservationType.SYMPTOMS, "Symptoms"),
    (ObservationType.NOTES, "Notes"),
]


@router.get("/{day}", response_model=DailyObservationsResponse)
async def get_observations(
    day: date,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> DailyObservationsResponse:
    service = ObservationService(session)
    observations = service.get_for_date(user, day)
    response_observations = {
        observation_type.value: ObservationResponse(**service.to_view(observation))
        for observation_type, observation in observations.items()
    }
    checklist = [
        ChecklistItem(
            type=observation_type.value,
            label=label,
            recorded=observation_type in observations,
        )
        for observation_type, label in CHECKLIST
    ]
    return DailyObservationsResponse(
        date=day.isoformat(),
        observations=response_observations,
        checklist=checklist,
    )


@router.put("/{day}/{observation_type}", response_model=ObservationResponse)
async def put_observation(
    day: date,
    observation_type: ObservationType,
    request: ObservationUpsertRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> ObservationResponse:
    try:
        observation = ObservationService(session).upsert(
            user=user,
            day=day,
            observation_type=observation_type,
            value=request.value,
            metadata=request.metadata,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return ObservationResponse(**ObservationService(session).to_view(observation))
```

- [ ] **Step 5: Mount observations router**

Modify `backend/app/main.py`:

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import get_session
from app.routers.auth import router as auth_router
from app.routers.observations import router as observations_router
from app.services.auth_service import AuthService


def seed_admin_user() -> None:
    for session in get_session():
        AuthService(session).seed_admin_user()
        break


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_admin_user()
    yield


app = FastAPI(title="Simonizer API", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(observations_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Run route tests**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose build backend
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && PYTHONPATH=. pytest tests/test_observation_routes.py -v"
```

Expected: all observation route tests pass.

- [ ] **Step 7: Run full backend checks**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && ruff check . && PYTHONPATH=. pytest"
```

Expected: Ruff passes and all backend tests pass.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add backend/app/main.py backend/app/routers/observations.py backend/app/schemas/observations.py backend/tests/test_observation_routes.py
git commit -m "Add observation API routes"
```

---

### Task 3: Frontend Daily Observations Page

**Files:**
- Create: `frontend/src/api/observations.ts`
- Create: `frontend/src/pages/Daily.tsx`
- Create: `frontend/src/components/inputs/DailyChecklist.tsx`
- Create: `frontend/src/components/inputs/SaveStatus.tsx`
- Create: `frontend/src/components/inputs/WeightInput.tsx`
- Create: `frontend/src/components/inputs/PulseInput.tsx`
- Create: `frontend/src/components/inputs/BloodPressureInput.tsx`
- Create: `frontend/src/components/inputs/WalkInput.tsx`
- Create: `frontend/src/components/inputs/SongsInput.tsx`
- Create: `frontend/src/components/inputs/NyhaSelector.tsx`
- Create: `frontend/src/components/inputs/SymptomsSelector.tsx`
- Create: `frontend/src/components/inputs/NotesInput.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: backend `GET /api/observations/{date}` and `PUT /api/observations/{date}/{type}`.
- Consumes: `useAuth()` access token from `frontend/src/auth/AuthContext.tsx`.
- Produces: authenticated daily page for `/` and `/{date}`.

- [ ] **Step 1: Add observations API wrapper**

Create `frontend/src/api/observations.ts`:

```typescript
export type ObservationType =
  | 'weight'
  | 'pulse'
  | 'bp'
  | 'walk_distance'
  | 'walk_time'
  | 'walk_stops'
  | 'songs'
  | 'nyha'
  | 'symptoms'
  | 'notes'

export type ObservationValue = string | string[]

export type Observation = {
  type: ObservationType
  value: ObservationValue
  metadata: Record<string, unknown> | null
  updated_at: string
}

export type ChecklistItem = {
  type: ObservationType
  label: string
  recorded: boolean
}

export type DailyObservations = {
  date: string
  observations: Partial<Record<ObservationType, Observation>>
  checklist: ChecklistItem[]
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      window.history.replaceState(null, '', '/login')
    }
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

export async function getDailyObservations(
  date: string,
  accessToken: string,
): Promise<DailyObservations> {
  const response = await fetch(`/api/observations/${date}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<DailyObservations>(response)
}

export async function saveObservation(
  date: string,
  type: ObservationType,
  value: ObservationValue,
  accessToken: string,
  metadata: Record<string, unknown> | null = null,
): Promise<Observation> {
  const response = await fetch(`/api/observations/${date}/${type}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ value, metadata }),
  })
  return parseJson<Observation>(response)
}
```

- [ ] **Step 2: Add shared save status component**

Create `frontend/src/components/inputs/SaveStatus.tsx`:

```tsx
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function SaveStatus({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  const message = {
    saving: 'Saving...',
    saved: 'Saved ✓',
    error: 'Could not save - try again',
  }[state]
  return (
    <span style={{ color: state === 'error' ? '#b45309' : '#166534', fontSize: '0.875rem' }}>
      {message}
    </span>
  )
}
```

- [ ] **Step 3: Add checklist component**

Create `frontend/src/components/inputs/DailyChecklist.tsx`:

```tsx
import type { ChecklistItem } from '../../api/observations'

export function DailyChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <nav aria-label="Daily checklist" style={{ display: 'grid', gap: '0.5rem' }}>
      {items.map((item) => (
        <button
          key={item.type}
          type="button"
          onClick={() => document.getElementById(`section-${item.type}`)?.scrollIntoView({ behavior: 'smooth' })}
          style={{ textAlign: 'left', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.75rem' }}
        >
          {item.recorded ? '✓' : '☐'} {item.label}
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 4: Add input components**

Create `frontend/src/components/inputs/WeightInput.tsx`:

```tsx
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function WeightInput({ value, onChange, onBlur, saveState }: { value: string; onChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return <label>Weight (kg)<input value={value} inputMode="decimal" onChange={(event) => onChange(event.target.value)} onBlur={onBlur} /><SaveStatus state={saveState} /></label>
}
```

Create `frontend/src/components/inputs/PulseInput.tsx`:

```tsx
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function PulseInput({ value, onChange, onBlur, saveState }: { value: string; onChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return <label>Pulse (BPM)<input value={value} inputMode="numeric" onChange={(event) => onChange(event.target.value)} onBlur={onBlur} /><SaveStatus state={saveState} /></label>
}
```

Create `frontend/src/components/inputs/SongsInput.tsx`:

```tsx
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function SongsInput({ value, onChange, onBlur, saveState }: { value: string; onChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return <label>Guitar songs<input value={value} inputMode="numeric" onChange={(event) => onChange(event.target.value)} onBlur={onBlur} /><SaveStatus state={saveState} /></label>
}
```

Create `frontend/src/components/inputs/NotesInput.tsx`:

```tsx
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function NotesInput({ value, onChange, onBlur, saveState }: { value: string; onChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return <label>Notes<textarea value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} rows={5} /><SaveStatus state={saveState} /></label>
}
```

Create `frontend/src/components/inputs/BloodPressureInput.tsx`:

```tsx
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function BloodPressureInput({ systolic, diastolic, onSystolicChange, onDiastolicChange, onBlur, saveState }: { systolic: string; diastolic: string; onSystolicChange: (value: string) => void; onDiastolicChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return (
    <fieldset>
      <legend>Blood pressure</legend>
      <label>SYS<input value={systolic} inputMode="numeric" onChange={(event) => onSystolicChange(event.target.value)} onBlur={onBlur} /></label>
      <label>DIA<input value={diastolic} inputMode="numeric" onChange={(event) => onDiastolicChange(event.target.value)} onBlur={onBlur} /></label>
      <SaveStatus state={saveState} />
    </fieldset>
  )
}
```

Create `frontend/src/components/inputs/WalkInput.tsx`:

```tsx
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function WalkInput({ distance, timeSeconds, stops, onDistanceChange, onTimeSecondsChange, onStopsChange, onDistanceBlur, onTimeSecondsBlur, onStopsBlur, saveState }: { distance: string; timeSeconds: string; stops: string; onDistanceChange: (value: string) => void; onTimeSecondsChange: (value: string) => void; onStopsChange: (value: string) => void; onDistanceBlur: () => void; onTimeSecondsBlur: () => void; onStopsBlur: () => void; saveState: SaveState }) {
  return (
    <fieldset>
      <legend>Walk</legend>
      <label>Distance (m)<input value={distance} inputMode="numeric" onChange={(event) => onDistanceChange(event.target.value)} onBlur={onDistanceBlur} /></label>
      <label>Time (seconds)<input value={timeSeconds} inputMode="numeric" onChange={(event) => onTimeSecondsChange(event.target.value)} onBlur={onTimeSecondsBlur} /></label>
      <label>Stops<input value={stops} inputMode="numeric" onChange={(event) => onStopsChange(event.target.value)} onBlur={onStopsBlur} /></label>
      <SaveStatus state={saveState} />
    </fieldset>
  )
}
```

Create `frontend/src/components/inputs/NyhaSelector.tsx`:

```tsx
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

const OPTIONS = [
  { value: '1', label: 'I - No symptoms during ordinary activity', color: '#22c55e' },
  { value: '2', label: 'II - Mild limitation', color: '#eab308' },
  { value: '3', label: 'III - Marked limitation', color: '#f97316' },
  { value: '4', label: 'IV - Symptoms at rest', color: '#ef4444' },
]

export function NyhaSelector({ value, onSelect, saveState }: { value: string; onSelect: (value: string) => void; saveState: SaveState }) {
  return (
    <fieldset>
      <legend>NYHA class</legend>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {OPTIONS.map((option) => (
          <button key={option.value} type="button" onClick={() => onSelect(option.value)} style={{ border: `2px solid ${option.color}`, background: value === option.value ? option.color : 'white', padding: '0.75rem' }}>
            {option.label}
          </button>
        ))}
      </div>
      <SaveStatus state={saveState} />
    </fieldset>
  )
}
```

Create `frontend/src/components/inputs/SymptomsSelector.tsx`:

```tsx
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

const SYMPTOMS = [
  { key: 'breathless', label: 'Breathless' },
  { key: 'chest_discomfort', label: 'Chest discomfort' },
  { key: 'palpitations', label: 'Palpitations' },
  { key: 'swollen_ankles', label: 'Swollen ankles' },
  { key: 'dizzy', label: 'Dizzy' },
  { key: 'very_tired', label: 'Very tired' },
  { key: 'poor_sleep', label: 'Poor sleep' },
  { key: 'poor_appetite', label: 'Poor appetite' },
  { key: 'good_day', label: 'Good day' },
]

export function SymptomsSelector({ value, onChange, saveState }: { value: string[]; onChange: (value: string[]) => void; saveState: SaveState }) {
  function toggle(key: string) {
    if (key === 'good_day') {
      onChange(value.includes('good_day') ? [] : ['good_day'])
      return
    }
    const withoutGoodDay = value.filter((item) => item !== 'good_day')
    onChange(withoutGoodDay.includes(key) ? withoutGoodDay.filter((item) => item !== key) : [...withoutGoodDay, key])
  }

  return (
    <fieldset>
      <legend>Symptoms</legend>
      {SYMPTOMS.map((symptom) => (
        <label key={symptom.key} style={{ display: 'block' }}>
          <input type="checkbox" checked={value.includes(symptom.key)} onChange={() => toggle(symptom.key)} /> {symptom.label}
        </label>
      ))}
      <SaveStatus state={saveState} />
    </fieldset>
  )
}
```

- [ ] **Step 5: Add Daily page**

Create `frontend/src/pages/Daily.tsx` with these responsibilities:

```tsx
import { useEffect, useState } from 'react'

import * as observationsApi from '../api/observations'
import type { DailyObservations, ObservationType } from '../api/observations'
import { useAuth } from '../auth/AuthContext'
import { DailyChecklist } from '../components/inputs/DailyChecklist'
import type { SaveState } from '../components/inputs/SaveStatus'
import { WeightInput } from '../components/inputs/WeightInput'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`))
}

function routeDate() {
  const path = window.location.pathname.replace(/^\//, '')
  return path === '' ? todayIso() : path
}

export function Daily() {
  const auth = useAuth()
  const date = routeDate()
  const [daily, setDaily] = useState<DailyObservations | null>(null)
  const [values, setValues] = useState<Record<string, string | string[]>>({})
  const [saveStates, setSaveStates] = useState<Partial<Record<ObservationType, SaveState>>>({})

  useEffect(() => {
    if (!auth.accessToken || !isIsoDate(date)) return
    observationsApi.getDailyObservations(date, auth.accessToken).then((data) => {
      setDaily(data)
      setValues(Object.fromEntries(Object.entries(data.observations).map(([key, observation]) => [key, observation.value])))
    })
  }, [auth.accessToken, date])

  async function save(type: ObservationType, value: string | string[], metadata: Record<string, unknown> | null = null) {
    if (!auth.accessToken) return
    setSaveStates((current) => ({ ...current, [type]: 'saving' }))
    try {
      await observationsApi.saveObservation(date, type, value, auth.accessToken, metadata)
      const refreshed = await observationsApi.getDailyObservations(date, auth.accessToken)
      setDaily(refreshed)
      setSaveStates((current) => ({ ...current, [type]: 'saved' }))
    } catch {
      setSaveStates((current) => ({ ...current, [type]: 'error' }))
    }
  }

  if (!isIsoDate(date)) return <main><h1>That date does not look right</h1><a href="/">Go to today</a></main>
  if (!daily) return <p>Loading...</p>

  const historical = date !== todayIso()
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem', display: 'grid', gap: '1.5rem' }}>
      {historical ? <aside style={{ background: '#fef3c7', padding: '1rem', borderRadius: '0.75rem' }}>You are editing {date}. <a href="/">Go to today</a></aside> : null}
      <h1>Today's Recovery</h1>
      <DailyChecklist items={daily.checklist} />
      <section id="section-weight"><h2>Vitals</h2><WeightInput value={String(values.weight ?? '')} onChange={(value) => setValues((current) => ({ ...current, weight: value }))} onBlur={() => save('weight', String(values.weight ?? ''))} saveState={saveStates.weight ?? 'idle'} /></section>
    </main>
  )
}
```

The first implementation of `Daily.tsx` must render every input component above, wire blur saves for `weight`, `pulse`, `bp`, `walk_distance`, `walk_time`, `walk_stops`, `songs`, and `notes`, and wire immediate saves for `nyha` and `symptoms`. Keep state local and simple; do not introduce React Query in this slice.

- [ ] **Step 6: Route authenticated app to Daily**

Modify `frontend/src/App.tsx` so authenticated users render `<Daily />` instead of only the shell header. Keep logout in the header.

```tsx
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Daily } from './pages/Daily'
import { Login } from './pages/Login'

function AppContent() {
  const auth = useAuth()

  if (auth.status === 'loading') return <p>Loading...</p>
  if (auth.status === 'anonymous') return <Login />
  if (window.location.pathname === '/login') window.history.replaceState(null, '', '/')

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', margin: '1rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
        <strong>Simonizer</strong>
        <button type="button" onClick={() => void auth.logout()}>Log out</button>
      </header>
      <Daily />
    </>
  )
}

function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}

export default App
```

- [ ] **Step 7: Verify no browser storage token usage**

Run:

```bash
grep -R "localStorage\|sessionStorage" frontend/src || true
```

Expected: no output.

- [ ] **Step 8: Run frontend checks**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose build frontend
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm frontend npm run lint
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm frontend npm run typecheck
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm frontend npm run build
```

Expected: all pass.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add frontend/src
git commit -m "Add daily observations page"
```

---

### Task 4: End-To-End Verification And Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes all backend and frontend work from Tasks 1-3.
- Produces operational docs and verification evidence for Slice 2.

- [ ] **Step 1: Update README current state**

Modify `README.md` to mention:

- Slice 2 daily observations are implemented.
- The daily page is available after login at `/`.
- Historical editing uses `/{date}` with ISO dates such as `/2026-06-27`.
- Observations are scoped to the authenticated user.

- [ ] **Step 2: Run migration on a clean temporary stack**

Run:

```bash
COMPOSE_PROJECT_NAME=simonize_slice2_verify DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=8085 docker-compose up -d db
COMPOSE_PROJECT_NAME=simonize_slice2_verify DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=8085 docker-compose run --rm backend sh -c "PYTHONPATH=. alembic upgrade head"
```

Expected: Alembic applies `20260704_0001` and `20260712_0002` successfully.

- [ ] **Step 3: Run full local checks**

Run:

```bash
just check
```

Expected: backend Ruff, backend pytest, frontend ESLint, frontend typecheck, and frontend build pass.

- [ ] **Step 4: Smoke test API through nginx**

Run:

```bash
COMPOSE_PROJECT_NAME=simonize_slice2_verify DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=8085 docker-compose up -d --build
for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://localhost:8085/api/health && break || sleep 1; done
curl -fsS -c /tmp/simonizer-slice2-cookies.txt -H 'Content-Type: application/json' -d '{"username":"simon","password":"change-me-in-production"}' http://localhost:8085/api/auth/login > /tmp/simonizer-slice2-login.json
ACCESS_TOKEN=$(python -c 'import json; print(json.load(open("/tmp/simonizer-slice2-login.json"))["access_token"])')
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"value":"92.3"}' http://localhost:8085/api/observations/2026-06-27/weight -X PUT
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"value":"121/78"}' http://localhost:8085/api/observations/2026-06-27/bp -X PUT
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"value":"325","metadata":{"time_seconds":840,"stops":2}}' http://localhost:8085/api/observations/2026-06-27/walk_distance -X PUT
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"value":"3"}' http://localhost:8085/api/observations/2026-06-27/songs -X PUT
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"value":"3"}' http://localhost:8085/api/observations/2026-06-27/nyha -X PUT
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"value":["good_day"]}' http://localhost:8085/api/observations/2026-06-27/symptoms -X PUT
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' -d '{"value":"Felt stronger today"}' http://localhost:8085/api/observations/2026-06-27/notes -X PUT
curl -fsS -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:8085/api/observations/2026-06-27
```

Expected: final GET returns saved observations and checklist entries with recorded `true` for saved items.

- [ ] **Step 5: Confirm daily page has no Save button**

Run:

```bash
grep -R ">Save<\|Save button\|type=\"submit\"" frontend/src || true
```

Expected: no daily-page Save button. Existing login submit button is acceptable if it appears as `Log in`, not `Save`.

- [ ] **Step 6: Clean temporary verification stack**

Run:

```bash
COMPOSE_PROJECT_NAME=simonize_slice2_verify DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=8085 docker-compose down -v
```

Expected: temporary containers, network, and volume are removed.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add README.md docs/deployment.md
git commit -m "Document daily observations operations"
```

Update `docs/deployment.md` with one sentence noting that deployments must run Alembic before app startup because Slice 2 adds the `observations` table.

- [ ] **Step 8: Final branch status**

Run:

```bash
git status --short
git log --oneline -10
```

Expected: worktree clean and Slice 2 commits visible.
