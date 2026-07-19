# Slice 6 Targets & Milestones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted personal targets and derived milestones, surfaced on `/targets` and the dashboard.

**Architecture:** Persist only user-scoped target values. Calculate achievements and dashboard progress at query time in services. Keep API routes thin and return purpose-built view models so the frontend renders without deriving from raw observations.

**Tech Stack:** Python, FastAPI, SQLModel, Alembic, Pydantic, Pytest, React 18, TypeScript, Vite, Vitest, Testing Library.

## Global Constraints

- Persist editable targets for `walk_distance`, `songs`, and `nyha` only.
- `TargetType` is a backend enum that can be extended later.
- Default targets are `walk_distance = 500`, `songs = 5`, and `nyha = 2`.
- Targets are scoped by `current_user.id`.
- No derived achievements, milestones, or progress values are stored.
- `AchievementService` skips invalid stored observation values rather than crashing.
- Milestones feel encouraging and personal, not gamified.
- Dashboard shows target progress for walk, guitar, and NYHA.
- Dashboard shows only latest 3 milestones.
- `/targets` shows editable targets and all achieved milestones.
- Charts target lines are out of scope.
- Unknown target types and invalid target values return `422`.
- Unauthorized target requests return `401`.
- Frontend uses the backend target/milestone view models; it does not transform raw observations.
- Keep the existing page shell/card visual language.

---

## File Structure

- Create `backend/app/models/target.py`: `TargetType` enum and `Target` SQLModel table.
- Create `backend/alembic/versions/20260720_0003_create_targets.py`: targets table migration.
- Create `backend/app/schemas/targets.py`: target and milestone response/update schemas shared by targets and dashboard.
- Create `backend/app/services/target_service.py`: default creation, validation, update, and targets view assembly.
- Create `backend/app/services/achievement_service.py`: achievement calculation from observations.
- Create `backend/app/routers/targets.py`: protected targets routes.
- Modify `backend/app/main.py`: include targets router.
- Modify `backend/app/schemas/dashboard.py`: add dashboard targets and milestones fields.
- Modify `backend/app/services/dashboard_service.py`: add target progress and latest milestones.
- Create `backend/tests/test_target_service.py`: target service tests.
- Create `backend/tests/test_targets_routes.py`: targets route tests.
- Create `backend/tests/test_achievement_service.py`: achievement calculation tests.
- Modify `backend/tests/test_dashboard_service.py`: dashboard target/milestone tests.
- Create `frontend/src/api/targets.ts`: targets API types and fetch/update helpers.
- Create `frontend/src/pages/Targets.tsx`: targets editor and milestones list.
- Create `frontend/src/pages/Targets.test.tsx`: targets page tests.
- Modify `frontend/src/api/dashboard.ts`: dashboard target/milestone types.
- Modify `frontend/src/pages/Dashboard.tsx`: target progress and compact milestones card.
- Modify `frontend/src/pages/Dashboard.test.tsx`: dashboard UI tests.
- Modify `frontend/src/App.tsx`: authenticated `/targets` route and nav link.
- Modify `frontend/src/App.test.tsx`: targets route/nav tests.

---

### Task 1: Backend Targets Model, Service, and API

**Files:**
- Create: `backend/app/models/target.py`
- Create: `backend/alembic/versions/20260720_0003_create_targets.py`
- Create: `backend/app/schemas/targets.py`
- Create: `backend/app/services/target_service.py`
- Create: `backend/app/routers/targets.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_target_service.py`
- Test: `backend/tests/test_targets_routes.py`

**Interfaces:**
- Produces: `TargetType(StrEnum)` with `WALK_DISTANCE = "walk_distance"`, `SONGS = "songs"`, `NYHA = "nyha"`.
- Produces: `Target` SQLModel table with unique `(user_id, type)`.
- Produces: `TargetService(session: Session)` with `get_view(user_id: uuid.UUID) -> TargetsResponse` and `update(user_id: uuid.UUID, target_type: TargetType, value: str | int) -> TargetsResponse`.
- Produces: `TargetValidationError(ValueError)`.
- Produces: schemas `TargetEntry`, `TargetUpdateRequest`, `MilestoneEntry`, `TargetsResponse` in `backend/app/schemas/targets.py`.
- Produces: protected `GET /api/targets` and `PUT /api/targets/{type}`.
- Later tasks will populate real milestones by replacing the initial empty milestone list in `TargetService.get_view`.

- [ ] **Step 1: Write failing target service tests**

Create `backend/tests/test_target_service.py`:

```python
import pytest
from app.models.target import Target, TargetType
from app.models.user import User
from app.services.target_service import TargetService, TargetValidationError
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool


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


def test_target_service_creates_defaults_in_stable_order():
    with make_session() as session:
        user = make_user(session)

        response = TargetService(session).get_view(user_id=user.id)

        assert [target.type for target in response.targets] == [
            TargetType.WALK_DISTANCE,
            TargetType.SONGS,
            TargetType.NYHA,
        ]
        assert [target.value for target in response.targets] == [500, 5, 2]
        assert [target.unit for target in response.targets] == ["m", "songs", "class"]
        assert response.milestones == []


def test_target_update_persists_value_for_current_user_only():
    with make_session() as session:
        simon = make_user(session, "simon")
        vicky = make_user(session, "vicky")
        service = TargetService(session)

        service.update(user_id=simon.id, target_type=TargetType.WALK_DISTANCE, value="650")
        service.get_view(user_id=vicky.id)

        simon_target = session.exec(
            select(Target).where(Target.user_id == simon.id).where(Target.type == TargetType.WALK_DISTANCE)
        ).one()
        vicky_target = session.exec(
            select(Target).where(Target.user_id == vicky.id).where(Target.type == TargetType.WALK_DISTANCE)
        ).one()

        assert simon_target.value == "650"
        assert vicky_target.value == "500"


@pytest.mark.parametrize(
    ("target_type", "value"),
    [
        (TargetType.WALK_DISTANCE, "-1"),
        (TargetType.WALK_DISTANCE, "50001"),
        (TargetType.WALK_DISTANCE, "12.5"),
        (TargetType.SONGS, "-1"),
        (TargetType.SONGS, "101"),
        (TargetType.NYHA, "0"),
        (TargetType.NYHA, "5"),
        (TargetType.NYHA, "two"),
    ],
)
def test_target_update_rejects_invalid_values(target_type: TargetType, value: str):
    with make_session() as session:
        user = make_user(session)

        with pytest.raises(TargetValidationError):
            TargetService(session).update(user_id=user.id, target_type=target_type, value=value)
```

- [ ] **Step 2: Run target service tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_target_service.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.target'`.

- [ ] **Step 3: Create target model**

Create `backend/app/models/target.py`:

```python
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
```

- [ ] **Step 4: Create Alembic migration**

Create `backend/alembic/versions/20260720_0003_create_targets.py`:

```python
"""create targets

Revision ID: 20260720_0003
Revises: 20260712_0002
Create Date: 2026-07-20 00:03:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260720_0003"
down_revision: str | None = "20260712_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "targets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "type", name="uq_targets_user_type"),
    )
    op.create_index("ix_targets_user_id", "targets", ["user_id"])
    op.create_index("ix_targets_type", "targets", ["type"])


def downgrade() -> None:
    op.drop_index("ix_targets_type", table_name="targets")
    op.drop_index("ix_targets_user_id", table_name="targets")
    op.drop_table("targets")
```

- [ ] **Step 5: Create target schemas**

Create `backend/app/schemas/targets.py`:

```python
from pydantic import BaseModel

from app.models.target import TargetType


class DumpableModel(BaseModel):
    def __eq__(self, other: object) -> bool:
        if isinstance(other, dict):
            return self.model_dump() == other
        return super().__eq__(other)


class TargetEntry(DumpableModel):
    type: TargetType
    label: str
    value: int
    unit: str


class TargetUpdateRequest(BaseModel):
    value: int | str


class MilestoneEntry(DumpableModel):
    type: str
    title: str
    date: str
    message: str
    value: str | None = None


class TargetsResponse(BaseModel):
    targets: list[TargetEntry]
    milestones: list[MilestoneEntry]
```

- [ ] **Step 6: Implement target service**

Create `backend/app/services/target_service.py`:

```python
import uuid
from datetime import UTC, datetime

from sqlmodel import Session, select

from app.models.target import Target, TargetType
from app.schemas.targets import TargetEntry, TargetsResponse

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
            milestones=[],
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
```

- [ ] **Step 7: Run target service tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_target_service.py -v`

Expected: PASS.

- [ ] **Step 8: Write failing target route tests**

Create `backend/tests/test_targets_routes.py`:

```python
from app.database import get_session
from app.main import app
from app.models.target import TargetType
from app.models.user import User
from app.services.auth_service import AuthService
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool


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
    user = User(
        username=username,
        hashed_password=AuthService(session).hash_password("secret-password"),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def token_for(session: Session, user: User) -> str:
    return AuthService(session).create_access_token(user)


def test_targets_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/targets")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_get_targets_returns_defaults():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/targets", headers=headers)
            assert response.status_code == 200
            assert response.json()["targets"] == [
                {"type": "walk_distance", "label": "Walk distance target", "value": 500, "unit": "m"},
                {"type": "songs", "label": "Guitar songs target", "value": 5, "unit": "songs"},
                {"type": "nyha", "label": "NYHA target", "value": 2, "unit": "class"},
            ]
        finally:
            clear_overrides()


def test_put_target_updates_current_users_value():
    with make_session() as session:
        simon = seed_user(session, "simon")
        vicky = seed_user(session, "vicky")
        client = make_client(session)
        simon_headers = {"Authorization": f"Bearer {token_for(session, simon)}"}
        vicky_headers = {"Authorization": f"Bearer {token_for(session, vicky)}"}
        try:
            response = client.put(
                f"/api/targets/{TargetType.WALK_DISTANCE}",
                headers=simon_headers,
                json={"value": 650},
            )
            assert response.status_code == 200
            assert response.json()["targets"][0]["value"] == 650
            other_response = client.get("/api/targets", headers=vicky_headers)
            assert other_response.json()["targets"][0]["value"] == 500
        finally:
            clear_overrides()


def test_invalid_target_type_and_value_return_422():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            bad_type = client.put("/api/targets/weight", headers=headers, json={"value": 10})
            bad_value = client.put("/api/targets/nyha", headers=headers, json={"value": 9})
            assert bad_type.status_code == 422
            assert bad_value.status_code == 422
        finally:
            clear_overrides()
```

- [ ] **Step 9: Run target route tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_targets_routes.py -v`

Expected: FAIL with authenticated requests returning `404 Not Found`.

- [ ] **Step 10: Implement targets router**

Create `backend/app/routers/targets.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.database import get_session
from app.models.target import TargetType
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.targets import TargetUpdateRequest, TargetsResponse
from app.services.target_service import TargetService, TargetValidationError

router = APIRouter(prefix="/api/targets", tags=["targets"])


@router.get("", response_model=TargetsResponse)
async def get_targets(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> TargetsResponse:
    return TargetService(session).get_view(user_id=user.id)


@router.put("/{target_type}", response_model=TargetsResponse)
async def update_target(
    target_type: TargetType,
    payload: TargetUpdateRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> TargetsResponse:
    try:
        return TargetService(session).update(
            user_id=user.id,
            target_type=target_type,
            value=payload.value,
        )
    except TargetValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
```

Modify `backend/app/main.py`:

```python
from app.routers.targets import router as targets_router
```

Include it after the existing routers:

```python
app.include_router(targets_router)
```

- [ ] **Step 11: Run target route tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_target_service.py tests/test_targets_routes.py -v`

Expected: PASS.

- [ ] **Step 12: Run backend checks for changed files**

Run: `cd backend && ruff check app/models/target.py app/schemas/targets.py app/services/target_service.py app/routers/targets.py app/main.py tests/test_target_service.py tests/test_targets_routes.py alembic/versions/20260720_0003_create_targets.py`

Expected: PASS.

- [ ] **Step 13: Commit backend targets API**

Run:

```bash
git add backend/app/models/target.py backend/alembic/versions/20260720_0003_create_targets.py backend/app/schemas/targets.py backend/app/services/target_service.py backend/app/routers/targets.py backend/app/main.py backend/tests/test_target_service.py backend/tests/test_targets_routes.py
git commit -m "Add targets API"
```

---

### Task 2: Achievement Service and Dashboard View Model

**Files:**
- Create: `backend/app/services/achievement_service.py`
- Modify: `backend/app/services/target_service.py`
- Modify: `backend/app/schemas/dashboard.py`
- Modify: `backend/app/services/dashboard_service.py`
- Test: `backend/tests/test_achievement_service.py`
- Modify: `backend/tests/test_target_service.py`
- Modify: `backend/tests/test_dashboard_service.py`

**Interfaces:**
- Consumes: `TargetService(session).get_view(user_id)` from Task 1.
- Produces: `AchievementService(session).list(user_id: uuid.UUID) -> list[MilestoneEntry]`.
- Produces: `DashboardTargetProgress` and `DashboardTargets` schemas in `backend/app/schemas/dashboard.py`.
- Produces: `DashboardResponse.targets` and `DashboardResponse.milestones`.

- [ ] **Step 1: Write failing achievement service tests**

Create `backend/tests/test_achievement_service.py`:

```python
from datetime import UTC, date, datetime, timedelta

from app.models.observation import Observation, ObservationType
from app.models.user import User
from app.services.achievement_service import AchievementService
from app.services.observation_service import ObservationService
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool


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


def milestone_by_type(milestones, milestone_type: str):
    return next(milestone for milestone in milestones if milestone.type == milestone_type)


def test_achievement_service_calculates_best_value_and_first_time_milestones():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 7, 10), ObservationType.WALK_DISTANCE, "325")
        service.upsert(user, date(2026, 7, 11), ObservationType.WALK_DISTANCE, "400")
        service.upsert(user, date(2026, 7, 12), ObservationType.WALK_DISTANCE, "400")
        service.upsert(user, date(2026, 7, 10), ObservationType.SONGS, "2")
        service.upsert(user, date(2026, 7, 11), ObservationType.SONGS, "4")
        service.upsert(user, date(2026, 7, 10), ObservationType.PULSE, "72")
        service.upsert(user, date(2026, 7, 11), ObservationType.PULSE, "68")
        service.upsert(user, date(2026, 7, 10), ObservationType.NYHA, "3")
        service.upsert(user, date(2026, 7, 12), ObservationType.NYHA, "2")
        service.upsert(user, date(2026, 7, 13), ObservationType.SYMPTOMS, ["good_day"])

        milestones = AchievementService(session).list(user_id=user.id)

        assert milestone_by_type(milestones, "longest_walk") == {
            "type": "longest_walk",
            "title": "Longest walk",
            "date": "2026-07-11",
            "message": "You walked 400 metres - your furthest yet.",
            "value": "400 m",
        }
        assert milestone_by_type(milestones, "most_songs").value == "4 songs"
        assert milestone_by_type(milestones, "lowest_resting_pulse").value == "68 bpm"
        assert milestone_by_type(milestones, "first_nyha_iii").date == "2026-07-10"
        assert milestone_by_type(milestones, "first_nyha_ii").date == "2026-07-12"
        assert milestone_by_type(milestones, "first_symptom_free_day").date == "2026-07-13"


def test_achievement_service_calculates_weight_stability_and_recording_milestones():
    with make_session() as session:
        user = make_user(session)
        start = date(2026, 6, 1)
        for index in range(30):
            day = start + timedelta(days=index)
            session.add(
                Observation(
                    user_id=user.id,
                    date=day,
                    type=ObservationType.NOTES,
                    value=f"Day {index}",
                    created_at=datetime(2026, 6, 1, 9, index, tzinfo=UTC),
                    updated_at=datetime(2026, 6, 1, 9, index, tzinfo=UTC),
                )
            )
        for index in range(70):
            session.add(
                Observation(
                    user_id=user.id,
                    date=date(2026, 7, 1) + timedelta(days=index),
                    type=ObservationType.PULSE,
                    value=str(70 + index),
                    created_at=datetime(2026, 7, 1, 9, tzinfo=UTC) + timedelta(minutes=index),
                    updated_at=datetime(2026, 7, 1, 9, tzinfo=UTC) + timedelta(minutes=index),
                )
            )
        session.add(Observation(user_id=user.id, date=date(2026, 7, 1), type=ObservationType.WEIGHT, value="92.0"))
        session.add(Observation(user_id=user.id, date=date(2026, 7, 7), type=ObservationType.WEIGHT, value="92.8"))
        session.add(Observation(user_id=user.id, date=date(2026, 7, 30), type=ObservationType.WEIGHT, value="92.7"))
        session.commit()

        milestones = AchievementService(session).list(user_id=user.id)

        assert milestone_by_type(milestones, "weight_stable_7_days").date == "2026-07-07"
        assert milestone_by_type(milestones, "weight_stable_30_days").date == "2026-07-30"
        assert milestone_by_type(milestones, "one_hundred_observations").date == "2026-09-08"
        assert milestone_by_type(milestones, "thirty_consecutive_days").date == "2026-06-30"


def test_achievement_service_is_user_scoped_and_skips_invalid_values():
    with make_session() as session:
        simon = make_user(session, "simon")
        vicky = make_user(session, "vicky")
        session.add(Observation(user_id=simon.id, date=date(2026, 7, 10), type=ObservationType.WALK_DISTANCE, value="oops"))
        session.add(Observation(user_id=vicky.id, date=date(2026, 7, 10), type=ObservationType.WALK_DISTANCE, value="999"))
        session.commit()

        milestones = AchievementService(session).list(user_id=simon.id)

        assert [milestone.type for milestone in milestones] == []
```

- [ ] **Step 2: Run achievement tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_achievement_service.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.achievement_service'`.

- [ ] **Step 3: Implement achievement service**

Create `backend/app/services/achievement_service.py` with these exact public names and helper behavior:

```python
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


class AchievementService:
    def __init__(self, session: Session):
        self.session = session

    def list(self, user_id: uuid.UUID) -> list[MilestoneEntry]:
        observations = self.session.exec(
            select(Observation)
            .where(Observation.user_id == user_id)
            .order_by(Observation.date, Observation.created_at)
        ).all()
        grouped = self._group(observations)
        milestones = [
            self._best_int(grouped, ObservationType.WALK_DISTANCE, "longest_walk", "Longest walk", "m", "You walked {value} metres - your furthest yet."),
            self._best_int(grouped, ObservationType.SONGS, "most_songs", "Most guitar", "songs", "You played {value} songs - your most yet."),
            self._lowest_int(grouped, ObservationType.PULSE),
            self._weight_stable(grouped, days=7),
            self._weight_stable(grouped, days=30),
            self._first_nyha(grouped, value=3),
            self._first_nyha(grouped, value=2),
            self._first_symptom_free(grouped),
            self._hundred_observations(observations),
            self._thirty_consecutive_days(grouped),
        ]
        achieved = [milestone for milestone in milestones if milestone is not None]
        order = {milestone_type: index for index, milestone_type in enumerate(MILESTONE_ORDER)}
        return sorted(achieved, key=lambda item: (item.date, -order[item.type]), reverse=True)

    def _group(self, observations: list[Observation]) -> dict[date, list[Observation]]:
        grouped: dict[date, list[Observation]] = defaultdict(list)
        for observation in observations:
            grouped[observation.date].append(observation)
        return dict(grouped)

    def _observations_of_type(self, grouped: dict[date, list[Observation]], observation_type: ObservationType) -> list[tuple[date, Observation]]:
        rows: list[tuple[date, Observation]] = []
        for day in sorted(grouped):
            for observation in grouped[day]:
                if observation.type == observation_type:
                    rows.append((day, observation))
        return rows

    def _best_int(self, grouped: dict[date, list[Observation]], observation_type: ObservationType, milestone_type: str, title: str, unit: str, message: str) -> MilestoneEntry | None:
        best: tuple[date, int] | None = None
        for day, observation in self._observations_of_type(grouped, observation_type):
            value = self._int(observation.value)
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

    def _lowest_int(self, grouped: dict[date, list[Observation]]) -> MilestoneEntry | None:
        best: tuple[date, int] | None = None
        for day, observation in self._observations_of_type(grouped, ObservationType.PULSE):
            value = self._int(observation.value)
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

    def _weight_stable(self, grouped: dict[date, list[Observation]], days: int) -> MilestoneEntry | None:
        weights = [(day, self._latest_float(rows, ObservationType.WEIGHT)) for day, rows in sorted(grouped.items())]
        weights = [(day, value) for day, value in weights if value is not None]
        for end_day, end_weight in reversed(weights):
            start_day = end_day - timedelta(days=days - 1)
            start_weight = next((value for day, value in weights if day == start_day), None)
            if start_weight is not None and abs(end_weight - start_weight) <= 1.0:
                return MilestoneEntry(
                    type=f"weight_stable_{days}_days",
                    title=f"Weight stable {days} days",
                    date=end_day.isoformat(),
                    message=f"{days} days of stable weight. That's really encouraging.",
                    value=f"{days} days",
                )
        return None

    def _first_nyha(self, grouped: dict[date, list[Observation]], value: int) -> MilestoneEntry | None:
        for day, observation in self._observations_of_type(grouped, ObservationType.NYHA):
            if self._int(observation.value) == value:
                return MilestoneEntry(
                    type=f"first_nyha_{'iii' if value == 3 else 'ii'}",
                    title=f"First NYHA {value}",
                    date=day.isoformat(),
                    message=f"You recorded NYHA class {value} for the first time.",
                    value=f"Class {value}",
                )
        return None

    def _first_symptom_free(self, grouped: dict[date, list[Observation]]) -> MilestoneEntry | None:
        for day, observation in self._observations_of_type(grouped, ObservationType.SYMPTOMS):
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

    def _hundred_observations(self, observations: list[Observation]) -> MilestoneEntry | None:
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

    def _thirty_consecutive_days(self, grouped: dict[date, list[Observation]]) -> MilestoneEntry | None:
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
                    message="Thirty consecutive days recorded. That's a clear picture of recovery.",
                    value="30 days",
                )
            previous = day
        return None

    def _latest_float(self, observations: list[Observation], observation_type: ObservationType) -> float | None:
        for observation in reversed(observations):
            if observation.type == observation_type:
                return self._float(observation.value)
        return None

    def _int(self, value: object) -> int | None:
        if isinstance(value, bool):
            return None
        try:
            number = int(value)
        except (TypeError, ValueError):
            return None
        return number

    def _float(self, value: object) -> float | None:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number if math.isfinite(number) else None
```

- [ ] **Step 4: Run achievement service tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_achievement_service.py -v`

Expected: PASS.

- [ ] **Step 5: Wire achievements into targets response**

Modify `backend/app/services/target_service.py`:

```python
from app.services.achievement_service import AchievementService
```

Change `get_view` to:

```python
    def get_view(self, user_id: uuid.UUID) -> TargetsResponse:
        targets = self._ensure_defaults(user_id)
        return TargetsResponse(
            targets=[self._entry(targets[target_type]) for target_type in TARGET_ORDER],
            milestones=AchievementService(self.session).list(user_id=user_id),
        )
```

Add this test to `backend/tests/test_target_service.py`:

```python
def test_target_view_includes_achievements():
    with make_session() as session:
        user = make_user(session)
        from app.models.observation import ObservationType
        from app.services.observation_service import ObservationService
        from datetime import date

        ObservationService(session).upsert(user, date(2026, 7, 13), ObservationType.WALK_DISTANCE, "325")

        response = TargetService(session).get_view(user_id=user.id)

        assert response.milestones[0].type == "longest_walk"
```

- [ ] **Step 6: Write failing dashboard service tests for targets and milestones**

Modify `backend/tests/test_dashboard_service.py` by adding assertions to `test_dashboard_builds_today_values_and_trends` after the existing today assertions:

```python
        assert dashboard.targets.walk_distance == {
            "current": 325,
            "target": 500,
            "met": False,
            "label": "325 m of 500 m",
        }
        assert dashboard.targets.songs == {
            "current": 3,
            "target": 5,
            "met": False,
            "label": "3 of 5 songs",
        }
        assert dashboard.targets.nyha == {
            "current": 3,
            "target": 2,
            "met": False,
            "label": "Class 3, target Class 2",
        }
        assert dashboard.milestones[0].type == "longest_walk"
        assert len(dashboard.milestones) <= 3
```

Add this test:

```python
def test_dashboard_uses_latest_nyha_when_today_missing():
    with make_session() as session:
        user = make_user(session)
        ObservationService(session).upsert(user, date(2026, 7, 10), ObservationType.NYHA, "2")

        dashboard = DashboardService(session).build(
            user_id=user.id, today=date(2026, 7, 13)
        )

        assert dashboard.targets.nyha == {
            "current": 2,
            "target": 2,
            "met": True,
            "label": "Class 2, target Class 2",
        }
```

- [ ] **Step 7: Run dashboard service tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_dashboard_service.py -v`

Expected: FAIL with missing `targets` or `milestones` fields.

- [ ] **Step 8: Extend dashboard schemas**

Modify `backend/app/schemas/dashboard.py`:

```python
from app.schemas.targets import MilestoneEntry
```

Add before `DashboardResponse`:

```python
class DashboardTargetProgress(BaseModel):
    current: int | None
    target: int
    met: bool
    label: str

    def __eq__(self, other: object) -> bool:
        if isinstance(other, dict):
            return self.model_dump() == other
        return super().__eq__(other)


class DashboardTargets(BaseModel):
    walk_distance: DashboardTargetProgress
    songs: DashboardTargetProgress
    nyha: DashboardTargetProgress
```

Extend `DashboardResponse`:

```python
class DashboardResponse(BaseModel):
    today: DashboardToday
    trends: DashboardTrends
    advisory: DashboardAdvisory
    targets: DashboardTargets
    milestones: list[MilestoneEntry]
```

- [ ] **Step 9: Extend dashboard service**

Modify imports in `backend/app/services/dashboard_service.py`:

```python
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
```

Change the observation query start date to include all observations needed for latest NYHA and achievements:

```python
        observations = self.session.exec(
            select(Observation)
            .where(Observation.user_id == user_id)
            .where(Observation.date <= current_day)
            .order_by(Observation.date)
        ).all()
```

Keep recent warning data limited to the last 7 days:

```python
        recent = [
            DailyWarningObservations(date=day, values=values)
            for day, values in sorted(grouped.items())
            if day >= start_day
        ]
```

Add to the returned `DashboardResponse`:

```python
            targets=self._targets(user_id, today_values, grouped),
            milestones=AchievementService(self.session).list(user_id=user_id)[:3],
```

Add helpers to `DashboardService`:

```python
    def _targets(
        self,
        user_id: uuid.UUID,
        today_values: dict[ObservationType, object],
        grouped: dict[date, dict[ObservationType, object]],
    ) -> DashboardTargets:
        target_entries = {
            target.type: target for target in TargetService(self.session).get_view(user_id).targets
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

    def _walk_progress(self, current: int | None, target: int) -> DashboardTargetProgress:
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

    def _songs_progress(self, current: int | None, target: int) -> DashboardTargetProgress:
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

    def _nyha_progress(self, current: int | None, target: int) -> DashboardTargetProgress:
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
```

- [ ] **Step 10: Run backend service tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_target_service.py tests/test_achievement_service.py tests/test_dashboard_service.py -v`

Expected: PASS.

- [ ] **Step 11: Run route regression tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_targets_routes.py tests/test_dashboard_routes.py -v`

Expected: PASS.

- [ ] **Step 12: Run backend lint for changed files**

Run: `cd backend && ruff check app/services/achievement_service.py app/services/target_service.py app/services/dashboard_service.py app/schemas/dashboard.py tests/test_achievement_service.py tests/test_target_service.py tests/test_dashboard_service.py`

Expected: PASS.

- [ ] **Step 13: Commit achievements and dashboard backend**

Run:

```bash
git add backend/app/services/achievement_service.py backend/app/services/target_service.py backend/app/schemas/dashboard.py backend/app/services/dashboard_service.py backend/tests/test_achievement_service.py backend/tests/test_target_service.py backend/tests/test_dashboard_service.py
git commit -m "Add milestone calculations to dashboard"
```

---

### Task 3: Frontend Targets Page

**Files:**
- Create: `frontend/src/api/targets.ts`
- Create: `frontend/src/pages/Targets.tsx`
- Test: `frontend/src/pages/Targets.test.tsx`

**Interfaces:**
- Consumes: `GET /api/targets` and `PUT /api/targets/{type}` from Task 1 and milestones from Task 2.
- Produces: `getTargets(accessToken: string) -> Promise<TargetsResponse>`.
- Produces: `updateTarget(accessToken: string, type: TargetType, value: number | string) -> Promise<TargetsResponse>`.
- Produces: `Targets({ accessToken }: { accessToken: string })` page component.

- [ ] **Step 1: Create targets API wrapper**

Create `frontend/src/api/targets.ts`:

```typescript
import { handleUnauthorized } from './auth'

export type TargetType = 'walk_distance' | 'songs' | 'nyha'

export type TargetEntry = {
  type: TargetType
  label: string
  value: number
  unit: string
}

export type MilestoneEntry = {
  type: string
  title: string
  date: string
  message: string
  value: string | null
}

export type TargetsResponse = {
  targets: TargetEntry[]
  milestones: MilestoneEntry[]
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized()
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

export async function getTargets(accessToken: string): Promise<TargetsResponse> {
  const response = await fetch('/api/targets', {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<TargetsResponse>(response)
}

export async function updateTarget(
  accessToken: string,
  type: TargetType,
  value: number | string,
): Promise<TargetsResponse> {
  const response = await fetch(`/api/targets/${type}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ value }),
  })
  return parseJson<TargetsResponse>(response)
}
```

- [ ] **Step 2: Write failing targets page tests**

Create `frontend/src/pages/Targets.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Targets } from './Targets'

const response = {
  targets: [
    { type: 'walk_distance', label: 'Walk distance target', value: 500, unit: 'm' },
    { type: 'songs', label: 'Guitar songs target', value: 5, unit: 'songs' },
    { type: 'nyha', label: 'NYHA target', value: 2, unit: 'class' },
  ],
  milestones: [
    {
      type: 'longest_walk',
      title: 'Longest walk',
      date: '2026-07-13',
      message: 'You walked 325 metres - your furthest yet.',
      value: '325 m',
    },
  ],
}

function mockFetchOnce(body: unknown = response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }))
}

describe('Targets', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads targets and milestones', async () => {
    mockFetchOnce()

    render(<Targets accessToken="token" />)

    expect(await screen.findByRole('heading', { name: 'Targets & Milestones' })).toBeInTheDocument()
    expect(screen.getByLabelText('Walk distance target')).toHaveValue(500)
    expect(screen.getByLabelText('Guitar songs target')).toHaveValue(5)
    expect(screen.getByLabelText('NYHA target')).toHaveValue(2)
    expect(screen.getByText('Longest walk')).toBeInTheDocument()
    expect(screen.getByText('You walked 325 metres - your furthest yet.')).toBeInTheDocument()
    expect(screen.getByText('325 m')).toBeInTheDocument()
  })

  it('saves all changed targets and shows saved feedback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: true, json: async () => response })
    vi.stubGlobal('fetch', fetchMock)

    render(<Targets accessToken="token" />)
    fireEvent.change(await screen.findByLabelText('Walk distance target'), { target: { value: '650' } })
    fireEvent.change(screen.getByLabelText('Guitar songs target'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('NYHA target'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save targets' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/targets/walk_distance', expect.objectContaining({ method: 'PUT' }))
      expect(fetchMock).toHaveBeenCalledWith('/api/targets/songs', expect.objectContaining({ method: 'PUT' }))
      expect(fetchMock).toHaveBeenCalledWith('/api/targets/nyha', expect.objectContaining({ method: 'PUT' }))
    })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('keeps typed values visible when save fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: false, status: 422 })
    vi.stubGlobal('fetch', fetchMock)

    render(<Targets accessToken="token" />)
    fireEvent.change(await screen.findByLabelText('Walk distance target'), { target: { value: '650' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save targets' }))

    expect(await screen.findByText('Could not save targets - please try again.')).toBeInTheDocument()
    expect(screen.getByLabelText('Walk distance target')).toHaveValue(650)
  })

  it('renders an empty milestone state', async () => {
    mockFetchOnce({ ...response, milestones: [] })

    render(<Targets accessToken="token" />)

    expect(await screen.findByText("Keep recording - milestones will appear here as Simon's recovery builds.")).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run targets page tests to verify they fail**

Run: `cd frontend && npm test -- src/pages/Targets.test.tsx`

Expected: FAIL with `Failed to resolve import "./Targets"`.

- [ ] **Step 4: Implement targets page**

Create `frontend/src/pages/Targets.tsx`:

```typescript
import { FormEvent, useEffect, useState } from 'react'

import * as targetsApi from '../api/targets'
import type { MilestoneEntry, TargetEntry, TargetType, TargetsResponse } from '../api/targets'
import { PageHeader, PageShell, SectionCard } from '../components/ui/PageShell'

type TargetsProps = { accessToken: string }
const EMPTY_MILESTONES = "Keep recording - milestones will appear here as Simon's recovery builds."

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function targetInputMode(type: TargetType) {
  return type === 'nyha' ? 'numeric' : 'numeric'
}

function MilestoneList({ milestones }: { milestones: MilestoneEntry[] }) {
  if (milestones.length === 0) return <p>{EMPTY_MILESTONES}</p>
  return (
    <div className="grid gap-3">
      {milestones.map((milestone) => (
        <article className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4" key={milestone.type}>
          <p className="text-sm font-semibold text-slate-500">{formatDate(milestone.date)}</p>
          <h3 className="text-xl font-bold text-clinical-ink">{milestone.title}</h3>
          <p>{milestone.message}</p>
          {milestone.value ? <p className="font-semibold text-clinical-primaryDark">{milestone.value}</p> : null}
        </article>
      ))}
    </div>
  )
}

function targetValue(targets: TargetEntry[], type: TargetType) {
  return String(targets.find((target) => target.type === type)?.value ?? '')
}

export function Targets({ accessToken }: TargetsProps) {
  const [response, setResponse] = useState<TargetsResponse | null>(null)
  const [values, setValues] = useState<Record<TargetType, string>>({ walk_distance: '', songs: '', nyha: '' })
  const [loadError, setLoadError] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    targetsApi.getTargets(accessToken).then((data) => {
      setResponse(data)
      setValues({
        walk_distance: targetValue(data.targets, 'walk_distance'),
        songs: targetValue(data.targets, 'songs'),
        nyha: targetValue(data.targets, 'nyha'),
      })
      setLoadError(false)
    }).catch((error: Error) => {
      if (error.message !== '401') setLoadError(true)
    })
  }, [accessToken])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveError(false)
    setSaved(false)
    try {
      let latest = response
      for (const type of ['walk_distance', 'songs', 'nyha'] as TargetType[]) {
        const original = response?.targets.find((target) => target.type === type)
        if (original && values[type] !== String(original.value)) {
          latest = await targetsApi.updateTarget(accessToken, type, values[type])
        }
      }
      if (latest) {
        setResponse(latest)
        setValues({
          walk_distance: targetValue(latest.targets, 'walk_distance'),
          songs: targetValue(latest.targets, 'songs'),
          nyha: targetValue(latest.targets, 'nyha'),
        })
      }
      setSaved(true)
    } catch {
      setSaveError(true)
    }
  }

  if (loadError) return <PageShell><PageHeader title="Could not load targets"><p>Please try again.</p></PageHeader></PageShell>
  if (!response) return <PageShell><SectionCard><p>Loading...</p></SectionCard></PageShell>

  return (
    <PageShell>
      <PageHeader title="Targets & Milestones">
        <p>Set Simon's next recovery targets and see the progress already achieved.</p>
      </PageHeader>
      <SectionCard>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {response.targets.map((target) => (
            <label className="grid gap-1 font-semibold text-clinical-ink" key={target.type}>
              {target.label}
              <input
                className="rounded-xl border border-slate-300 px-3 py-2"
                inputMode={targetInputMode(target.type)}
                type="number"
                value={values[target.type]}
                onChange={(event) => setValues((current) => ({ ...current, [target.type]: event.target.value }))}
              />
              <span className="text-sm text-slate-500">{target.unit}</span>
            </label>
          ))}
          {saveError ? <p role="alert">Could not save targets - please try again.</p> : null}
          {saved ? <p>Saved</p> : null}
          <button className="btn-primary justify-self-start" type="submit">Save targets</button>
        </form>
      </SectionCard>
      <SectionCard>
        <h2 className="text-2xl font-bold text-clinical-ink">Milestones</h2>
        <MilestoneList milestones={response.milestones} />
      </SectionCard>
    </PageShell>
  )
}
```

- [ ] **Step 5: Run targets page tests**

Run: `cd frontend && npm test -- src/pages/Targets.test.tsx`

Expected: PASS.

- [ ] **Step 6: Run frontend lint and typecheck for new page**

Run: `cd frontend && npm run lint && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit targets page**

Run:

```bash
git add frontend/src/api/targets.ts frontend/src/pages/Targets.tsx frontend/src/pages/Targets.test.tsx
git commit -m "Add targets page"
```

---

### Task 4: Targets Routing, Dashboard UI, and Final Checks

**Files:**
- Modify: `frontend/src/api/dashboard.ts`
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/pages/Dashboard.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `Targets({ accessToken })` from Task 3.
- Consumes: `DashboardResponse.targets` and `DashboardResponse.milestones` from Task 2.
- Produces: authenticated `/targets` route, `Targets` nav link, dashboard target progress copy, and latest 3 milestone card.

- [ ] **Step 1: Extend dashboard API types**

Modify `frontend/src/api/dashboard.ts`:

```typescript
export type DashboardTargetProgress = {
  current: number | null
  target: number
  met: boolean
  label: string
}

export type DashboardMilestone = {
  type: string
  title: string
  date: string
  message: string
  value: string | null
}
```

Add to `DashboardResponse`:

```typescript
  targets: {
    walk_distance: DashboardTargetProgress
    songs: DashboardTargetProgress
    nyha: DashboardTargetProgress
  }
  milestones: DashboardMilestone[]
```

- [ ] **Step 2: Update Dashboard tests first**

Modify the dashboard test fixture in `frontend/src/pages/Dashboard.test.tsx` to include:

```typescript
  targets: {
    walk_distance: { current: 325, target: 500, met: false, label: '325 m of 500 m' },
    songs: { current: 3, target: 5, met: false, label: '3 of 5 songs' },
    nyha: { current: 3, target: 2, met: false, label: 'Class 3, target Class 2' },
  },
  milestones: [
    {
      type: 'longest_walk',
      title: 'Longest walk',
      date: '2026-07-13',
      message: 'You walked 325 metres - your furthest yet.',
      value: '325 m',
    },
  ],
```

Add assertions to the main dashboard render test:

```typescript
    expect(screen.getByText('325 m of 500 m')).toBeInTheDocument()
    expect(screen.getByText('3 of 5 songs')).toBeInTheDocument()
    expect(screen.getByText('Class 3, target Class 2')).toBeInTheDocument()
    expect(screen.getByText('Longest walk')).toBeInTheDocument()
    expect(screen.getByText('You walked 325 metres - your furthest yet.')).toBeInTheDocument()
```

Add an empty milestone state test:

```typescript
  it('shows an encouraging milestone empty state', async () => {
    mockDashboardFetch({ ...dashboard, milestones: [] })

    render(<Dashboard accessToken="token" />)

    expect(await screen.findByText("Keep recording - milestones will appear here as Simon's recovery builds.")).toBeInTheDocument()
  })
```

- [ ] **Step 3: Run dashboard frontend tests to verify they fail**

Run: `cd frontend && npm test -- src/pages/Dashboard.test.tsx`

Expected: FAIL because progress and milestones are not rendered.

- [ ] **Step 4: Implement dashboard UI**

Modify `frontend/src/pages/Dashboard.tsx` `SummaryCard` props:

```typescript
function SummaryCard({
  title,
  value,
  empty,
  trend,
  progress,
}: {
  title: string
  value: string | null
  empty: string
  trend?: TrendPoint[]
  progress?: string
}) {
  return (
    <article className="section-card grid min-h-40 gap-3">
      <h2 className="text-base font-semibold text-slate-500">{title}</h2>
      <p className={classes('text-3xl font-bold tracking-tight', value ? 'text-clinical-ink' : 'text-slate-400')}>{value ?? empty}</p>
      {progress ? <p className="text-sm font-semibold text-clinical-primaryDark">{progress}</p> : null}
      {trend ? <Sparkline points={trend} /> : null}
    </article>
  )
}
```

Add a milestone card helper:

```typescript
function MilestonesCard({ dashboard }: { dashboard: DashboardResponse }) {
  return (
    <SectionCard>
      <h2 className="text-2xl font-bold text-clinical-ink">Milestones</h2>
      {dashboard.milestones.length === 0 ? (
        <p>Keep recording - milestones will appear here as Simon's recovery builds.</p>
      ) : (
        <div className="grid gap-3">
          {dashboard.milestones.map((milestone) => (
            <article key={milestone.type}>
              <h3 className="font-bold text-clinical-ink">{milestone.title}</h3>
              <p>{milestone.message}</p>
              {milestone.value ? <p className="text-sm font-semibold text-clinical-primaryDark">{milestone.value}</p> : null}
            </article>
          ))}
        </div>
      )}
      <p><a className="btn-secondary no-underline" href="/targets">View all targets and milestones</a></p>
    </SectionCard>
  )
}
```

Pass progress to the relevant cards:

```tsx
<SummaryCard title="Today's Walk" value={dashboard.today.walk_distance === null ? null : `${dashboard.today.walk_distance} m`} empty="No walk recorded today yet" trend={dashboard.trends.walk_7d} progress={dashboard.targets.walk_distance.label} />
<SummaryCard title="Guitar" value={dashboard.today.songs === null ? null : `${dashboard.today.songs} songs`} empty="No guitar recorded today yet" progress={dashboard.targets.songs.label} />
<SummaryCard title="Current NYHA" value={dashboard.today.nyha === null ? null : `Class ${dashboard.today.nyha}`} empty="No NYHA recorded today yet" progress={dashboard.targets.nyha.label} />
```

Render `<MilestonesCard dashboard={dashboard} />` after the summary card grid and before the record observations link.

- [ ] **Step 5: Run dashboard frontend tests**

Run: `cd frontend && npm test -- src/pages/Dashboard.test.tsx`

Expected: PASS.

- [ ] **Step 6: Update App tests first**

Modify `frontend/src/App.test.tsx` to add the Targets mock:

```typescript
vi.mock('./pages/Targets', () => ({
  Targets: () => <main><h1>Targets route</h1></main>,
}))
```

Add route/nav tests:

```typescript
  it('renders targets at /targets', () => {
    window.history.replaceState(null, '', '/targets')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Targets route' })).toBeInTheDocument()
  })

  it('shows a Targets navigation link', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('link', { name: 'Targets' })).toHaveAttribute('href', '/targets')
  })
```

- [ ] **Step 7: Run App tests to verify they fail**

Run: `cd frontend && npm test -- src/App.test.tsx`

Expected: FAIL because `/targets` renders Daily and the Targets link is absent.

- [ ] **Step 8: Implement Targets routing and nav**

Modify `frontend/src/App.tsx` imports:

```typescript
import { Targets } from './pages/Targets'
```

Add route selection:

```typescript
  const showTargets = pathname === '/targets'
```

Update `navItems`:

```typescript
    { href: '/targets', label: 'Targets', active: showTargets },
```

Update Today active condition to include `!showTargets`.

Update rendering:

```tsx
      {showTargets ? <Targets accessToken={auth.accessToken ?? ''} /> : null}
      {!showDashboard && !showCharts && !showDoctor && !showTargets ? <Daily /> : null}
```

- [ ] **Step 9: Run App tests**

Run: `cd frontend && npm test -- src/App.test.tsx`

Expected: PASS.

- [ ] **Step 10: Run frontend verification**

Run: `cd frontend && npm test && npm run lint && npm run typecheck && npm run build`

Expected: PASS. Vite may emit the existing large chunk warning; the command must exit successfully.

- [ ] **Step 11: Rebuild images and run full project verification**

Run: `DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose build backend frontend && just check`

Expected: PASS for backend Ruff, backend Pytest, frontend ESLint, frontend typecheck, and frontend build.

- [ ] **Step 12: Manual acceptance check**

Run: `just up`

When a browser is available, complete these checks:

- Log in and open `/targets`.
- Confirm `Dashboard`, `Today`, `Charts`, `Doctor`, and `Targets` nav links appear.
- Confirm all three targets display default values.
- Edit all three target fields and click `Save targets`.
- Refresh `/targets` and confirm values persisted.
- Confirm milestones list renders encouraging copy when observations support achievements.
- Open `/dashboard` and confirm walk, guitar, and NYHA cards show target progress.
- Confirm dashboard shows only the latest 3 milestones.

If browser tooling is unavailable, record the manual acceptance blocker in the task report and rely on automated verification.

- [ ] **Step 13: Commit routing and dashboard UI**

Run:

```bash
git add frontend/src/api/dashboard.ts frontend/src/pages/Dashboard.tsx frontend/src/pages/Dashboard.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "Show targets and milestones on dashboard"
```

---

## Final Review Checklist

- `GET /api/targets` is protected.
- `PUT /api/targets/{type}` is protected.
- Targets are scoped to `current_user.id`.
- Defaults are created for `walk_distance`, `songs`, and `nyha`.
- Unknown target type returns `422`.
- Invalid target values return `422`.
- Targets persist after update.
- `AchievementService` stores no derived data.
- `AchievementService` skips invalid stored values.
- All ten Slice 6 milestones are calculated correctly.
- Dashboard includes target progress for walk, guitar, and NYHA.
- Dashboard includes latest 3 milestones only.
- `/targets` renders editable targets and all milestones.
- Frontend save uses one `Save targets` button.
- Milestone copy is encouraging and not gamified.
- Charts target lines are not added.
- `just check` passes after rebuilding images.
