# Slice 4 Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build chart endpoints and a `/charts` page so long-term recovery trends are obvious from real observation data.

**Architecture:** The backend adds a thin `/api/charts` router, Pydantic chart schemas, and a `ChartService` that derives chart-ready arrays from user-scoped observations. The frontend adds a charts API wrapper, Recharts-based metric cards, a custom NYHA calendar grid, and authenticated navigation to `/charts`.

**Tech Stack:** Python, FastAPI, SQLModel, Pydantic, Pytest, React 18, TypeScript, Vite, Vitest, Testing Library, Recharts.

## Global Constraints

- Protected chart endpoints under `/api/charts`.
- `ChartService` builds chart-ready view models from user-scoped observations.
- Standard range support is exactly `7`, `30`, `90`, and `all`.
- Missing `days` defaults to `30` for standard chart endpoints.
- Invalid `days` returns `422`.
- Standard finite ranges include observations from `today - (days - 1)` through today.
- `days=all` includes all available observations for that metric.
- NYHA always returns all available NYHA observations.
- Dates are returned as stored local date strings in `YYYY-MM-DD` format with no timezone conversion.
- All chart arrays are ordered by date ascending.
- Missing observations are omitted rather than represented as zero.
- Invalid stored values are skipped rather than crashing chart output.
- Recharts is used for weight, pulse, blood pressure, walk distance, and guitar songs.
- NYHA calendar is a custom CSS grid using `#22c55e`, `#eab308`, `#f97316`, `#ef4444`, and `#e5e7eb`.
- Empty chart states use `No data yet — start recording to see your progress`.
- Frontend must not calculate trends, warnings, or improvement status.
- Scope excludes target lines, milestone annotations, regression lines, clinical interpretation, doctor-view printable snapshots, and persisted chart summaries.

---

## File Structure

- Create `backend/app/schemas/charts.py`: chart response models for simple points and blood pressure points.
- Create `backend/app/services/chart_service.py`: range parsing, user-scoped observation queries, safe parsing, and chart point construction.
- Create `backend/app/routers/charts.py`: protected thin chart endpoints.
- Modify `backend/app/main.py`: include the charts router.
- Create `backend/tests/test_chart_service.py`: unit tests for range filtering, parsing, all-time behavior, invalid stored values, and BP splitting.
- Create `backend/tests/test_chart_routes.py`: route tests for auth, scoping, response shapes, default range, and invalid `days`.
- Modify `frontend/package.json`: add `recharts` dependency.
- Modify `frontend/package-lock.json`: update via `npm install recharts` from `frontend/`.
- Create `frontend/src/api/charts.ts`: chart API types and fetchers.
- Create `frontend/src/pages/Charts.tsx`: charts page, range toggle, Recharts cards, and NYHA calendar.
- Create `frontend/src/pages/Charts.test.tsx`: frontend tests for loading, range changes, empty states, BP series, and NYHA labels/colours.
- Modify `frontend/src/App.tsx`: route `/charts` and add `Charts` navigation link.
- Modify `frontend/src/App.test.tsx`: verify `/charts` routing and navigation link.

---

### Task 1: Backend Chart Service

**Files:**
- Create: `backend/app/schemas/charts.py`
- Create: `backend/app/services/chart_service.py`
- Test: `backend/tests/test_chart_service.py`

**Interfaces:**
- Produces: `ChartService(session: Session).metric_points(user_id: uuid.UUID, observation_type: ObservationType, days: str = "30", today: date | None = None) -> list[ChartPoint]`.
- Produces: `ChartService(session: Session).bp_points(user_id: uuid.UUID, days: str = "30", today: date | None = None) -> list[BloodPressureChartPoint]`.
- Produces: `ChartService(session: Session).nyha_points(user_id: uuid.UUID) -> list[ChartPoint]`.
- Produces: `ChartPoint(date: str, value: float | int)`.
- Produces: `BloodPressureChartPoint(date: str, systolic: int, diastolic: int)`.
- Raises: `ChartRangeError` for invalid `days` values.

- [ ] **Step 1: Write failing chart service tests**

Create `backend/tests/test_chart_service.py`:

```python
from datetime import date

import pytest
from app.models.observation import Observation, ObservationType
from app.models.user import User
from app.services.chart_service import ChartRangeError, ChartService
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


def test_metric_points_filter_range_and_order_by_date():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 7, 1), ObservationType.WEIGHT, "91.0")
        service.upsert(user, date(2026, 7, 7), ObservationType.WEIGHT, "92.1")
        service.upsert(user, date(2026, 7, 13), ObservationType.WEIGHT, "92.3")

        points = ChartService(session).metric_points(
            user_id=user.id,
            observation_type=ObservationType.WEIGHT,
            days="7",
            today=date(2026, 7, 13),
        )

        assert [point.model_dump() for point in points] == [
            {"date": "2026-07-07", "value": 92.1},
            {"date": "2026-07-13", "value": 92.3},
        ]


def test_metric_points_all_returns_all_available_values():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 6, 1), ObservationType.SONGS, "1")
        service.upsert(user, date(2026, 7, 13), ObservationType.SONGS, "4")
        service.upsert(user, date(2026, 8, 1), ObservationType.SONGS, "6")

        points = ChartService(session).metric_points(
            user_id=user.id,
            observation_type=ObservationType.SONGS,
            days="all",
            today=date(2026, 7, 13),
        )

        assert [point.model_dump() for point in points] == [
            {"date": "2026-06-01", "value": 1},
            {"date": "2026-07-13", "value": 4},
            {"date": "2026-08-01", "value": 6},
        ]


def test_metric_points_skip_invalid_stored_values():
    with make_session() as session:
        user = make_user(session)
        session.add(
            Observation(
                user_id=user.id,
                date=date(2026, 7, 13),
                type=ObservationType.PULSE,
                value="not-a-number",
            )
        )
        ObservationService(session).upsert(user, date(2026, 7, 12), ObservationType.PULSE, "71")
        session.commit()

        points = ChartService(session).metric_points(
            user_id=user.id,
            observation_type=ObservationType.PULSE,
            days="30",
            today=date(2026, 7, 13),
        )

        assert [point.model_dump() for point in points] == [
            {"date": "2026-07-12", "value": 71}
        ]


def test_bp_points_split_systolic_and_diastolic():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 7, 13), ObservationType.BP, "121/78")

        points = ChartService(session).bp_points(
            user_id=user.id,
            days="30",
            today=date(2026, 7, 13),
        )

        assert [point.model_dump() for point in points] == [
            {"date": "2026-07-13", "systolic": 121, "diastolic": 78}
        ]


def test_nyha_points_return_all_time_values():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 5, 1), ObservationType.NYHA, "4")
        service.upsert(user, date(2026, 7, 13), ObservationType.NYHA, "2")

        points = ChartService(session).nyha_points(user_id=user.id)

        assert [point.model_dump() for point in points] == [
            {"date": "2026-05-01", "value": 4},
            {"date": "2026-07-13", "value": 2},
        ]


def test_chart_data_is_scoped_to_user():
    with make_session() as session:
        simon = make_user(session, "simon")
        vicky = make_user(session, "vicky")
        service = ObservationService(session)
        service.upsert(simon, date(2026, 7, 13), ObservationType.WALK_DISTANCE, "325")
        service.upsert(vicky, date(2026, 7, 13), ObservationType.WALK_DISTANCE, "999")

        points = ChartService(session).metric_points(
            user_id=simon.id,
            observation_type=ObservationType.WALK_DISTANCE,
            days="30",
            today=date(2026, 7, 13),
        )

        assert [point.model_dump() for point in points] == [
            {"date": "2026-07-13", "value": 325}
        ]


def test_invalid_range_raises_chart_range_error():
    with make_session() as session:
        user = make_user(session)

        with pytest.raises(ChartRangeError):
            ChartService(session).metric_points(
                user_id=user.id,
                observation_type=ObservationType.WEIGHT,
                days="14",
                today=date(2026, 7, 13),
            )
```

- [ ] **Step 2: Run chart service tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_chart_service.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.chart_service'`.

- [ ] **Step 3: Create chart schemas**

Create `backend/app/schemas/charts.py`:

```python
from pydantic import BaseModel


class ChartPoint(BaseModel):
    date: str
    value: float | int


class BloodPressureChartPoint(BaseModel):
    date: str
    systolic: int
    diastolic: int
```

- [ ] **Step 4: Implement chart service**

Create `backend/app/services/chart_service.py`:

```python
import math
import uuid
from datetime import date, timedelta

from sqlmodel import Session, select

from app.models.observation import Observation, ObservationType
from app.schemas.charts import BloodPressureChartPoint, ChartPoint

ALLOWED_RANGES = {"7", "30", "90", "all"}


class ChartRangeError(ValueError):
    pass


class ChartService:
    def __init__(self, session: Session):
        self.session = session

    def metric_points(
        self,
        user_id: uuid.UUID,
        observation_type: ObservationType,
        days: str = "30",
        today: date | None = None,
    ) -> list[ChartPoint]:
        current_day = today or date.today()
        observations = self._observations(user_id, observation_type, days, current_day)
        points: list[ChartPoint] = []
        for observation in observations:
            value = self._number(observation.value, prefer_int=observation_type != ObservationType.WEIGHT)
            if value is not None:
                points.append(ChartPoint(date=observation.date.isoformat(), value=value))
        return points

    def bp_points(
        self,
        user_id: uuid.UUID,
        days: str = "30",
        today: date | None = None,
    ) -> list[BloodPressureChartPoint]:
        current_day = today or date.today()
        observations = self._observations(user_id, ObservationType.BP, days, current_day)
        points: list[BloodPressureChartPoint] = []
        for observation in observations:
            bp = self._bp(observation.value)
            if bp is not None:
                systolic, diastolic = bp
                points.append(
                    BloodPressureChartPoint(
                        date=observation.date.isoformat(),
                        systolic=systolic,
                        diastolic=diastolic,
                    )
                )
        return points

    def nyha_points(self, user_id: uuid.UUID) -> list[ChartPoint]:
        observations = self.session.exec(
            select(Observation)
            .where(Observation.user_id == user_id)
            .where(Observation.type == ObservationType.NYHA)
            .order_by(Observation.date)
        ).all()
        points: list[ChartPoint] = []
        for observation in observations:
            value = self._number(observation.value, prefer_int=True)
            if isinstance(value, int) and 1 <= value <= 4:
                points.append(ChartPoint(date=observation.date.isoformat(), value=value))
        return points

    def _observations(
        self,
        user_id: uuid.UUID,
        observation_type: ObservationType,
        days: str,
        today: date,
    ) -> list[Observation]:
        if days not in ALLOWED_RANGES:
            raise ChartRangeError("days must be one of 7, 30, 90, all")

        statement = (
            select(Observation)
            .where(Observation.user_id == user_id)
            .where(Observation.type == observation_type)
            .order_by(Observation.date)
        )
        if days != "all":
            start_day = today - timedelta(days=int(days) - 1)
            statement = statement.where(Observation.date >= start_day).where(
                Observation.date <= today
            )
        return list(self.session.exec(statement).all())

    def _number(self, value: str, prefer_int: bool) -> float | int | None:
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

    def _bp(self, value: str) -> tuple[int, int] | None:
        if "/" not in value:
            return None
        systolic_text, diastolic_text = value.split("/", 1)
        systolic = self._number(systolic_text, prefer_int=True)
        diastolic = self._number(diastolic_text, prefer_int=True)
        if isinstance(systolic, int) and isinstance(diastolic, int):
            return systolic, diastolic
        return None
```

- [ ] **Step 5: Run chart service tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_chart_service.py -v`

Expected: PASS.

- [ ] **Step 6: Run backend lint for changed files**

Run: `cd backend && ruff check app/schemas/charts.py app/services/chart_service.py tests/test_chart_service.py`

Expected: PASS.

- [ ] **Step 7: Commit chart service**

Run:

```bash
git add backend/app/schemas/charts.py backend/app/services/chart_service.py backend/tests/test_chart_service.py
git commit -m "Add chart service"
```

---

### Task 2: Backend Chart Routes

**Files:**
- Create: `backend/app/routers/charts.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_chart_routes.py`

**Interfaces:**
- Consumes: `ChartService.metric_points(user_id, observation_type, days="30")` from Task 1.
- Consumes: `ChartService.bp_points(user_id, days="30")` from Task 1.
- Consumes: `ChartService.nyha_points(user_id)` from Task 1.
- Produces: protected `GET /api/charts/{metric}` endpoints.

- [ ] **Step 1: Write failing chart route tests**

Create `backend/tests/test_chart_routes.py`:

```python
from datetime import date

from app.database import get_session
from app.main import app
from app.models.observation import ObservationType
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.observation_service import ObservationService
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


def test_chart_endpoint_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/charts/weight")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_weight_chart_defaults_to_30_days_and_is_scoped_to_current_user():
    with make_session() as session:
        simon = seed_user(session, "simon")
        vicky = seed_user(session, "vicky")
        service = ObservationService(session)
        service.upsert(simon, date.today(), ObservationType.WEIGHT, "92.3")
        service.upsert(vicky, date.today(), ObservationType.WEIGHT, "99.9")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, simon)}"}
        try:
            response = client.get("/api/charts/weight", headers=headers)
            assert response.status_code == 200
            assert response.json() == [{"date": date.today().isoformat(), "value": 92.3}]
        finally:
            clear_overrides()


def test_invalid_days_returns_422():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/charts/pulse?days=14", headers=headers)
            assert response.status_code == 422
            assert "detail" in response.json()
        finally:
            clear_overrides()


def test_bp_chart_returns_systolic_and_diastolic():
    with make_session() as session:
        user = seed_user(session)
        ObservationService(session).upsert(user, date.today(), ObservationType.BP, "121/78")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/charts/bp?days=30", headers=headers)
            assert response.status_code == 200
            assert response.json() == [
                {"date": date.today().isoformat(), "systolic": 121, "diastolic": 78}
            ]
        finally:
            clear_overrides()


def test_nyha_chart_returns_all_time_data():
    with make_session() as session:
        user = seed_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 5, 1), ObservationType.NYHA, "4")
        service.upsert(user, date.today(), ObservationType.NYHA, "2")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/charts/nyha", headers=headers)
            assert response.status_code == 200
            assert response.json() == [
                {"date": "2026-05-01", "value": 4},
                {"date": date.today().isoformat(), "value": 2},
            ]
        finally:
            clear_overrides()
```

- [ ] **Step 2: Run chart route tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_chart_routes.py -v`

Expected: FAIL with `404 Not Found` for authenticated chart requests.

- [ ] **Step 3: Implement chart router**

Create `backend/app/routers/charts.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.database import get_session
from app.models.observation import ObservationType
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.charts import BloodPressureChartPoint, ChartPoint
from app.services.chart_service import ChartRangeError, ChartService

router = APIRouter(prefix="/api/charts", tags=["charts"])
DaysQuery = Annotated[str, Query(pattern="^(7|30|90|all)$")]


def _chart_service(session: Session) -> ChartService:
    return ChartService(session)


def _range_error(exc: ChartRangeError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=str(exc),
    )


@router.get("/weight", response_model=list[ChartPoint])
async def get_weight_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "30",
) -> list[ChartPoint]:
    try:
        return _chart_service(session).metric_points(user.id, ObservationType.WEIGHT, days)
    except ChartRangeError as exc:
        raise _range_error(exc) from exc


@router.get("/pulse", response_model=list[ChartPoint])
async def get_pulse_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "30",
) -> list[ChartPoint]:
    try:
        return _chart_service(session).metric_points(user.id, ObservationType.PULSE, days)
    except ChartRangeError as exc:
        raise _range_error(exc) from exc


@router.get("/bp", response_model=list[BloodPressureChartPoint])
async def get_bp_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "30",
) -> list[BloodPressureChartPoint]:
    try:
        return _chart_service(session).bp_points(user.id, days)
    except ChartRangeError as exc:
        raise _range_error(exc) from exc


@router.get("/walk", response_model=list[ChartPoint])
async def get_walk_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "30",
) -> list[ChartPoint]:
    try:
        return _chart_service(session).metric_points(
            user.id, ObservationType.WALK_DISTANCE, days
        )
    except ChartRangeError as exc:
        raise _range_error(exc) from exc


@router.get("/songs", response_model=list[ChartPoint])
async def get_songs_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "30",
) -> list[ChartPoint]:
    try:
        return _chart_service(session).metric_points(user.id, ObservationType.SONGS, days)
    except ChartRangeError as exc:
        raise _range_error(exc) from exc


@router.get("/nyha", response_model=list[ChartPoint])
async def get_nyha_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> list[ChartPoint]:
    return _chart_service(session).nyha_points(user.id)
```

- [ ] **Step 4: Include charts router**

Modify `backend/app/main.py`:

```python
from app.routers.charts import router as charts_router
```

Then include it with the other routers:

```python
app.include_router(charts_router)
```

- [ ] **Step 5: Run chart route tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_chart_routes.py -v`

Expected: PASS.

- [ ] **Step 6: Run backend checks for chart files**

Run: `cd backend && ruff check app/routers/charts.py app/main.py tests/test_chart_routes.py && PYTHONPATH=. pytest tests/test_chart_service.py tests/test_chart_routes.py -v`

Expected: PASS.

- [ ] **Step 7: Commit chart routes**

Run:

```bash
git add backend/app/routers/charts.py backend/app/main.py backend/tests/test_chart_routes.py
git commit -m "Add chart API routes"
```

---

### Task 3: Frontend Charts API and Page

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/api/charts.ts`
- Create: `frontend/src/pages/Charts.tsx`
- Test: `frontend/src/pages/Charts.test.tsx`

**Interfaces:**
- Consumes: protected `/api/charts/*` endpoints from Task 2.
- Produces: `getCharts(accessToken: string, range: ChartRange) -> Promise<ChartsData>`.
- Produces: `Charts({ accessToken }: { accessToken: string })` page component.
- Produces: `NyhaCalendar({ points }: { points: ChartPoint[] })` exported for tests.

- [ ] **Step 1: Install Recharts dependency**

Run: `cd frontend && npm install recharts`

Expected: `frontend/package.json` includes `recharts` in dependencies and `frontend/package-lock.json` is updated.

- [ ] **Step 2: Create charts API wrapper**

Create `frontend/src/api/charts.ts`:

```typescript
import { handleUnauthorized } from './auth'

export type ChartRange = '7' | '30' | '90' | 'all'

export type ChartPoint = {
  date: string
  value: number
}

export type BloodPressurePoint = {
  date: string
  systolic: number
  diastolic: number
}

export type ChartsData = {
  weight: ChartPoint[]
  pulse: ChartPoint[]
  bp: BloodPressurePoint[]
  walk: ChartPoint[]
  songs: ChartPoint[]
  nyha: ChartPoint[]
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized()
    }
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

async function get<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<T>(response)
}

export async function getCharts(
  accessToken: string,
  range: ChartRange,
): Promise<ChartsData> {
  const query = `days=${range}`
  const [weight, pulse, bp, walk, songs, nyha] = await Promise.all([
    get<ChartPoint[]>(`/api/charts/weight?${query}`, accessToken),
    get<ChartPoint[]>(`/api/charts/pulse?${query}`, accessToken),
    get<BloodPressurePoint[]>(`/api/charts/bp?${query}`, accessToken),
    get<ChartPoint[]>(`/api/charts/walk?${query}`, accessToken),
    get<ChartPoint[]>(`/api/charts/songs?${query}`, accessToken),
    get<ChartPoint[]>('/api/charts/nyha', accessToken),
  ])

  return { weight, pulse, bp, walk, songs, nyha }
}
```

- [ ] **Step 3: Write failing charts page tests**

Create `frontend/src/pages/Charts.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Charts, NyhaCalendar } from './Charts'

const emptyPayloads: Record<string, unknown> = {
  '/api/charts/weight?days=30': [],
  '/api/charts/pulse?days=30': [],
  '/api/charts/bp?days=30': [],
  '/api/charts/walk?days=30': [],
  '/api/charts/songs?days=30': [],
  '/api/charts/nyha': [],
}

function mockChartFetch(payloads: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input)
    const body = payloads[path] ?? []
    return Promise.resolve({ ok: true, json: async () => body })
  }))
}

describe('Charts', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads chart data with the default 30 day range', async () => {
    mockChartFetch({
      ...emptyPayloads,
      '/api/charts/weight?days=30': [{ date: '2026-07-13', value: 92.3 }],
      '/api/charts/bp?days=30': [{ date: '2026-07-13', systolic: 121, diastolic: 78 }],
    })

    render(<Charts accessToken="token" />)

    expect(await screen.findByRole('heading', { name: 'Charts' })).toBeInTheDocument()
    expect(screen.getByText('Weight')).toBeInTheDocument()
    expect(screen.getByText('Blood Pressure')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/charts/weight?days=30', expect.any(Object))
    expect(fetch).toHaveBeenCalledWith('/api/charts/nyha', expect.any(Object))
  })

  it('changes the standard chart range', async () => {
    mockChartFetch({
      ...emptyPayloads,
      '/api/charts/weight?days=7': [],
      '/api/charts/pulse?days=7': [],
      '/api/charts/bp?days=7': [],
      '/api/charts/walk?days=7': [],
      '/api/charts/songs?days=7': [],
    })

    render(<Charts accessToken="token" />)
    await screen.findByRole('heading', { name: 'Charts' })
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/charts/weight?days=7', expect.any(Object))
    })
  })

  it('renders empty states without crashing', async () => {
    mockChartFetch(emptyPayloads)

    render(<Charts accessToken="token" />)

    expect(await screen.findAllByText('No data yet — start recording to see your progress')).not.toHaveLength(0)
  })

  it('renders blood pressure series labels', async () => {
    mockChartFetch({
      ...emptyPayloads,
      '/api/charts/bp?days=30': [{ date: '2026-07-13', systolic: 121, diastolic: 78 }],
    })

    render(<Charts accessToken="token" />)

    expect(await screen.findByText('Systolic')).toBeInTheDocument()
    expect(screen.getByText('Diastolic')).toBeInTheDocument()
  })
})

describe('NyhaCalendar', () => {
  afterEach(() => cleanup())

  it('maps NYHA values to documented colours and labels', () => {
    render(<NyhaCalendar points={[{ date: '2026-07-13', value: 3 }]} today="2026-07-13" />)

    const recordedCell = screen.getByLabelText('13 July 2026: NYHA class III')
    expect(recordedCell).toHaveStyle({ backgroundColor: '#f97316' })
    expect(screen.getByLabelText('12 July 2026: no NYHA recorded')).toHaveStyle({ backgroundColor: '#e5e7eb' })
  })
})
```

- [ ] **Step 4: Run charts page tests to verify they fail**

Run: `cd frontend && npm test -- src/pages/Charts.test.tsx`

Expected: FAIL with `Failed to resolve import "./Charts"`.

- [ ] **Step 5: Implement charts page**

Create `frontend/src/pages/Charts.tsx`:

```typescript
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import * as chartsApi from '../api/charts'
import type { BloodPressurePoint, ChartPoint, ChartRange, ChartsData } from '../api/charts'

type ChartsProps = {
  accessToken: string
}

const EMPTY_TEXT = 'No data yet — start recording to see your progress'
const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
]

const NYHA_COLOURS: Record<number, string> = {
  1: '#22c55e',
  2: '#eab308',
  3: '#f97316',
  4: '#ef4444',
}
const NO_DATA_COLOUR = '#e5e7eb'

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function isoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function todayIso() {
  return isoDate(new Date())
}

function nyhaLabel(value: number) {
  return { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }[value] ?? String(value)
}

function ChartCard({ title, children, empty }: { title: string; children: ReactNode; empty: boolean }) {
  return (
    <section style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '1rem', padding: '1rem', minHeight: '18rem' }}>
      <h2>{title}</h2>
      {empty ? <p>{EMPTY_TEXT}</p> : children}
    </section>
  )
}

function MetricLineChart({ data, unit }: { data: ChartPoint[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip formatter={(value) => [`${value} ${unit}`, unit]} />
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  )
}

function MetricBarChart({ data, unit }: { data: ChartPoint[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip formatter={(value) => [`${value} ${unit}`, unit]} />
        <Bar dataKey="value" fill="#16a34a" />
      </BarChart>
    </ResponsiveContainer>
  )
}

function BloodPressureChart({ data }: { data: BloodPressurePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line name="Systolic" type="monotone" dataKey="systolic" stroke="#dc2626" strokeWidth={2} dot />
        <Line name="Diastolic" type="monotone" dataKey="diastolic" stroke="#2563eb" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function NyhaCalendar({ points, today = todayIso() }: { points: ChartPoint[]; today?: string }) {
  const pointMap = new Map(points.map((point) => [point.date, point.value]))
  const todayDate = new Date(`${today}T00:00:00`)
  const earliestData = points.length > 0 ? new Date(`${points[0].date}T00:00:00`) : todayDate
  const minimumStart = new Date(todayDate)
  minimumStart.setDate(todayDate.getDate() - (12 * 7 - 1))
  const start = earliestData < minimumStart ? earliestData : minimumStart
  start.setDate(start.getDate() - start.getDay())

  const days: Date[] = []
  for (const day = new Date(start); day <= todayDate; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day))
  }

  return (
    <section style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '1rem', padding: '1rem' }}>
      <h2>NYHA Calendar</h2>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 1rem)', gap: '0.25rem', overflowX: 'auto' }}>
        {days.map((day) => {
          const key = isoDate(day)
          const value = pointMap.get(key)
          const label = value === undefined
            ? `${formatDate(key)}: no NYHA recorded`
            : `${formatDate(key)}: NYHA class ${nyhaLabel(value)}`
          return (
            <div
              aria-label={label}
              key={key}
              role="img"
              style={{ width: '1rem', height: '1rem', borderRadius: '0.2rem', backgroundColor: value === undefined ? NO_DATA_COLOUR : NYHA_COLOURS[value] }}
              title={label}
            />
          )
        })}
      </div>
    </section>
  )
}

export function Charts({ accessToken }: ChartsProps) {
  const [range, setRange] = useState<ChartRange>('30')
  const [charts, setCharts] = useState<ChartsData | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    chartsApi.getCharts(accessToken, range)
      .then((data) => {
        setCharts(data)
        setLoadError(false)
      })
      .catch((error: Error) => {
        if (error.message !== '401') setLoadError(true)
      })
  }, [accessToken, range])

  if (loadError) return <main><h1>Could not load charts</h1><p>Please try again.</p></main>
  if (!charts) return <p>Loading...</p>

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem', display: 'grid', gap: '1.5rem' }}>
      <section>
        <h1>Charts</h1>
        <p>Long-term recovery trends from Simon's recorded observations.</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {RANGE_OPTIONS.map((option) => (
            <button
              aria-pressed={range === option.value}
              key={option.value}
              onClick={() => setRange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: '1rem' }}>
        <ChartCard title="Weight" empty={charts.weight.length === 0}><MetricLineChart data={charts.weight} unit="kg" /></ChartCard>
        <ChartCard title="Pulse" empty={charts.pulse.length === 0}><MetricLineChart data={charts.pulse} unit="bpm" /></ChartCard>
        <ChartCard title="Blood Pressure" empty={charts.bp.length === 0}><BloodPressureChart data={charts.bp} /></ChartCard>
        <ChartCard title="Walk Distance" empty={charts.walk.length === 0}><MetricBarChart data={charts.walk} unit="m" /></ChartCard>
        <ChartCard title="Guitar" empty={charts.songs.length === 0}><MetricBarChart data={charts.songs} unit="songs" /></ChartCard>
      </section>
      <NyhaCalendar points={charts.nyha} />
    </main>
  )
}
```

- [ ] **Step 6: Run charts page tests**

Run: `cd frontend && npm test -- src/pages/Charts.test.tsx`

Expected: PASS.

- [ ] **Step 7: Run frontend lint and typecheck**

Run: `cd frontend && npm run lint && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit charts page**

Run:

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/api/charts.ts frontend/src/pages/Charts.tsx frontend/src/pages/Charts.test.tsx
git commit -m "Add charts page"
```

---

### Task 4: Charts Routing and Final Verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `Charts({ accessToken })` from Task 3.
- Produces: authenticated `/charts` route and `Charts` navigation link.

- [ ] **Step 1: Update App route tests first**

Modify `frontend/src/App.test.tsx` to add the Charts mock and tests:

```typescript
vi.mock('./pages/Charts', () => ({
  Charts: () => <main><h1>Charts route</h1></main>,
}))
```

Add these tests inside `describe('App routing', () => { ... })`:

```typescript
  it('renders charts at /charts', () => {
    window.history.replaceState(null, '', '/charts')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Charts route' })).toBeInTheDocument()
  })

  it('shows a Charts navigation link', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('link', { name: 'Charts' })).toHaveAttribute('href', '/charts')
  })
```

- [ ] **Step 2: Run App tests to verify they fail**

Run: `cd frontend && npm test -- src/App.test.tsx`

Expected: FAIL because `/charts` still renders daily observations and the `Charts` link is absent.

- [ ] **Step 3: Implement charts routing and nav**

Modify `frontend/src/App.tsx` imports:

```typescript
import { Charts } from './pages/Charts'
```

Replace route selection and navigation with:

```typescript
  const pathname = window.location.pathname
  const showDashboard = pathname === '/dashboard'
  const showCharts = pathname === '/charts'
```

Add the navigation link:

```tsx
          <a href="/charts">Charts</a>
```

Replace the page rendering expression with:

```tsx
      {showDashboard ? <Dashboard accessToken={auth.accessToken ?? ''} /> : null}
      {showCharts ? <Charts accessToken={auth.accessToken ?? ''} /> : null}
      {!showDashboard && !showCharts ? <Daily /> : null}
```

- [ ] **Step 4: Run App tests**

Run: `cd frontend && npm test -- src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run frontend tests and build checks**

Run: `cd frontend && npm test && npm run lint && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 6: Run full project verification**

Run: `just check`

Expected: PASS for backend Ruff, backend Pytest, frontend ESLint, frontend typecheck, and frontend build.

- [ ] **Step 7: Manual acceptance check**

Run: `just up`

Then complete these checks in the browser when a browser is available:

- Log in and open `/charts`.
- Confirm the header includes `Dashboard`, `Today`, and `Charts`.
- Confirm all six chart sections render.
- Confirm empty datasets show `No data yet — start recording to see your progress`.
- Enter observations across several dates and confirm the standard charts show real data.
- Confirm changing `7`, `30`, `90`, and `all` changes the standard chart requests/data.
- Confirm NYHA colours match `docs/ux.md`.
- Confirm the charts page is readable on mobile and desktop.

- [ ] **Step 8: Commit routing and verification changes**

Run:

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "Route authenticated users to charts"
```

---

## Final Review Checklist

- `GET /api/charts/weight`, `/pulse`, `/bp`, `/walk`, `/songs`, and `/nyha` are protected.
- Chart backend data is scoped to `current_user.id`.
- Standard endpoints accept only `7`, `30`, `90`, and `all`.
- Standard endpoints default to `30`.
- Invalid `days` returns `422`.
- Chart arrays are ordered ascending and omit missing observations.
- Invalid stored values are skipped.
- Blood pressure response splits systolic and diastolic.
- NYHA returns all-time data.
- `/charts` renders Recharts standard charts and a custom NYHA grid.
- The frontend does not derive trends, warnings, or improvement status.
- Empty chart states use the exact approved text.
- `just check` passes.
