# Slice 5 Doctor View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a protected doctor summary endpoint and printable `/doctor` page with compact charts plus tabular detail for appointments.

**Architecture:** The backend adds `SummaryService`, Pydantic summary schemas, and a thin `/api/summary` router. The frontend adds a summary API wrapper, a Recharts-based `Doctor` page with print CSS, and authenticated routing/navigation.

**Tech Stack:** Python, FastAPI, SQLModel, Pydantic, Pytest, React 18, TypeScript, Vite, Vitest, Testing Library, Recharts.

## Global Constraints

- Protected `GET /api/summary?days=7|30` endpoint.
- Missing `days` defaults to `7`.
- Invalid `days` returns `422`.
- `SummaryService` builds a doctor-view model from user-scoped observations.
- Finite ranges include observations from `today - (days - 1)` through today.
- Dates are returned as stored local date strings in `YYYY-MM-DD` format.
- Section arrays are ordered by date ascending.
- Missing observations are omitted rather than represented as zero.
- Invalid stored values are skipped rather than crashing the report.
- Walk entries use `walk_distance` as the primary observation and include `time_seconds` and `stops` from metadata when present.
- If walk metadata is missing, `SummaryService` uses same-day `walk_time` and `walk_stops` observations as fallbacks when they are present and valid.
- Symptoms are returned as stored symptom keys; the frontend maps keys to readable labels.
- Notes are returned as plain text with their observation date.
- No derived summary data is stored.
- Doctor view includes compact charts and tabular detail.
- Print stylesheet hides navigation, logout button, period selector, print button, and non-print UI.
- Scope excludes server-side PDF generation, medication or appointment details, clinical interpretation, dashboard advisory status, targets, milestones, and achievements.

---

## File Structure

- Create `backend/app/schemas/summary.py`: doctor summary response models.
- Create `backend/app/services/summary_service.py`: range parsing, user-scoped observation queries, safe parsing, walk fallback assembly, symptoms/notes extraction.
- Create `backend/app/routers/summary.py`: protected `GET /api/summary` route.
- Modify `backend/app/main.py`: include summary router.
- Create `backend/tests/test_summary_service.py`: service unit tests.
- Create `backend/tests/test_summary_routes.py`: route auth/scoping/range tests.
- Create `frontend/src/api/summary.ts`: summary API types and fetcher.
- Create `frontend/src/pages/Doctor.tsx`: doctor summary page, charts, tables/lists, print CSS.
- Create `frontend/src/pages/Doctor.test.tsx`: frontend page tests.
- Modify `frontend/src/App.tsx`: route `/doctor`, add `Doctor` nav link.
- Modify `frontend/src/App.test.tsx`: doctor routing/nav tests.

---

### Task 1: Backend Summary Service

**Files:**
- Create: `backend/app/schemas/summary.py`
- Create: `backend/app/services/summary_service.py`
- Test: `backend/tests/test_summary_service.py`

**Interfaces:**
- Produces: `SummaryService(session: Session).build(user_id: uuid.UUID, days: str = "7", today: date | None = None) -> SummaryResponse`.
- Produces: `SummaryRangeError` for invalid `days`.
- Produces schema classes in `backend/app/schemas/summary.py`: `SummaryResponse`, `SummaryRange`, `SummaryVitals`, `SummaryActivity`, `SummaryFunctional`, `SummaryPoint`, `SummaryBpPoint`, `SummaryWalkPoint`, `SummarySymptomsEntry`, `SummaryNoteEntry`.

- [ ] **Step 1: Write failing summary service tests**

Create `backend/tests/test_summary_service.py`:

```python
from datetime import date

import pytest
from app.models.observation import Observation, ObservationType
from app.models.user import User
from app.services.observation_service import ObservationService
from app.services.summary_service import SummaryRangeError, SummaryService
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


def test_summary_builds_all_sections_for_range():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        old_day = date(2026, 6, 1)
        in_range = date(2026, 7, 13)
        service.upsert(user, old_day, ObservationType.WEIGHT, "91.0")
        service.upsert(user, in_range, ObservationType.WEIGHT, "92.3")
        service.upsert(user, in_range, ObservationType.PULSE, "71")
        service.upsert(user, in_range, ObservationType.BP, "121/78")
        service.upsert(
            user,
            in_range,
            ObservationType.WALK_DISTANCE,
            "325",
            metadata={"time_seconds": 840, "stops": 2},
        )
        service.upsert(user, in_range, ObservationType.SONGS, "3")
        service.upsert(user, in_range, ObservationType.NYHA, "3")
        service.upsert(user, in_range, ObservationType.SYMPTOMS, ["breathless"])
        service.upsert(user, in_range, ObservationType.NOTES, "Felt stronger today")

        summary = SummaryService(session).build(
            user_id=user.id, days="7", today=date(2026, 7, 13)
        )

        assert summary.range.days == 7
        assert summary.range.start_date == "2026-07-07"
        assert summary.range.end_date == "2026-07-13"
        assert summary.vitals.weight == [{"date": "2026-07-13", "value": 92.3}]
        assert summary.vitals.pulse == [{"date": "2026-07-13", "value": 71}]
        assert summary.vitals.bp == [
            {"date": "2026-07-13", "systolic": 121, "diastolic": 78}
        ]
        assert summary.activity.walk == [
            {"date": "2026-07-13", "distance": 325, "time_seconds": 840, "stops": 2}
        ]
        assert summary.activity.songs == [{"date": "2026-07-13", "value": 3}]
        assert summary.functional.nyha == [{"date": "2026-07-13", "value": 3}]
        assert summary.symptoms == [{"date": "2026-07-13", "values": ["breathless"]}]
        assert summary.notes == [{"date": "2026-07-13", "text": "Felt stronger today"}]


def test_walk_uses_same_day_time_and_stops_fallbacks_when_metadata_missing():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        day = date(2026, 7, 13)
        service.upsert(user, day, ObservationType.WALK_DISTANCE, "325")
        service.upsert(user, day, ObservationType.WALK_TIME, "840")
        service.upsert(user, day, ObservationType.WALK_STOPS, "2")

        summary = SummaryService(session).build(user_id=user.id, days="7", today=day)

        assert summary.activity.walk == [
            {"date": "2026-07-13", "distance": 325, "time_seconds": 840, "stops": 2}
        ]


def test_summary_is_scoped_to_user_and_skips_invalid_values():
    with make_session() as session:
        simon = make_user(session, "simon")
        vicky = make_user(session, "vicky")
        day = date(2026, 7, 13)
        ObservationService(session).upsert(vicky, day, ObservationType.WEIGHT, "99.9")
        session.add(
            Observation(
                user_id=simon.id,
                date=day,
                type=ObservationType.PULSE,
                value="not-a-number",
            )
        )
        session.commit()

        summary = SummaryService(session).build(user_id=simon.id, days="7", today=day)

        assert summary.vitals.weight == []
        assert summary.vitals.pulse == []


def test_invalid_range_raises_summary_range_error():
    with make_session() as session:
        user = make_user(session)

        with pytest.raises(SummaryRangeError):
            SummaryService(session).build(user_id=user.id, days="14", today=date(2026, 7, 13))
```

- [ ] **Step 2: Run service tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_summary_service.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.summary_service'`.

- [ ] **Step 3: Create summary schemas**

Create `backend/app/schemas/summary.py`:

```python
from pydantic import BaseModel


class DumpableModel(BaseModel):
    def __eq__(self, other: object) -> bool:
        if isinstance(other, dict):
            return self.model_dump() == other
        return super().__eq__(other)


class SummaryPoint(DumpableModel):
    date: str
    value: float | int


class SummaryBpPoint(DumpableModel):
    date: str
    systolic: int
    diastolic: int


class SummaryWalkPoint(DumpableModel):
    date: str
    distance: int
    time_seconds: int | None = None
    stops: int | None = None


class SummarySymptomsEntry(DumpableModel):
    date: str
    values: list[str]


class SummaryNoteEntry(DumpableModel):
    date: str
    text: str


class SummaryRange(BaseModel):
    days: int
    start_date: str
    end_date: str
    generated_at: str


class SummaryVitals(BaseModel):
    weight: list[SummaryPoint]
    pulse: list[SummaryPoint]
    bp: list[SummaryBpPoint]


class SummaryActivity(BaseModel):
    walk: list[SummaryWalkPoint]
    songs: list[SummaryPoint]


class SummaryFunctional(BaseModel):
    nyha: list[SummaryPoint]


class SummaryResponse(BaseModel):
    range: SummaryRange
    vitals: SummaryVitals
    activity: SummaryActivity
    functional: SummaryFunctional
    symptoms: list[SummarySymptomsEntry]
    notes: list[SummaryNoteEntry]
```

- [ ] **Step 4: Implement summary service**

Create `backend/app/services/summary_service.py`:

```python
import json
import math
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlmodel import Session, select

from app.models.observation import Observation, ObservationType
from app.schemas.summary import (
    SummaryActivity,
    SummaryBpPoint,
    SummaryFunctional,
    SummaryNoteEntry,
    SummaryPoint,
    SummaryRange,
    SummaryResponse,
    SummarySymptomsEntry,
    SummaryVitals,
    SummaryWalkPoint,
)

ALLOWED_SUMMARY_RANGES = {"7", "30"}


class SummaryRangeError(ValueError):
    pass


class SummaryService:
    def __init__(self, session: Session):
        self.session = session

    def build(
        self, user_id: uuid.UUID, days: str = "7", today: date | None = None
    ) -> SummaryResponse:
        if days not in ALLOWED_SUMMARY_RANGES:
            raise SummaryRangeError("days must be one of 7, 30")

        current_day = today or date.today()
        days_int = int(days)
        start_day = current_day - timedelta(days=days_int - 1)
        observations = self.session.exec(
            select(Observation)
            .where(Observation.user_id == user_id)
            .where(Observation.date >= start_day)
            .where(Observation.date <= current_day)
            .order_by(Observation.date)
        ).all()
        grouped = self._group(observations)

        return SummaryResponse(
            range=SummaryRange(
                days=days_int,
                start_date=start_day.isoformat(),
                end_date=current_day.isoformat(),
                generated_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            ),
            vitals=SummaryVitals(
                weight=self._metric(grouped, ObservationType.WEIGHT, prefer_int=False),
                pulse=self._metric(grouped, ObservationType.PULSE, prefer_int=True),
                bp=self._bp(grouped),
            ),
            activity=SummaryActivity(
                walk=self._walk(grouped),
                songs=self._metric(grouped, ObservationType.SONGS, prefer_int=True),
            ),
            functional=SummaryFunctional(
                nyha=self._metric(grouped, ObservationType.NYHA, prefer_int=True)
            ),
            symptoms=self._symptoms(grouped),
            notes=self._notes(grouped),
        )

    def _group(
        self, observations: list[Observation]
    ) -> dict[date, dict[ObservationType, Observation]]:
        grouped: dict[date, dict[ObservationType, Observation]] = {}
        for observation in observations:
            grouped.setdefault(observation.date, {})[observation.type] = observation
        return grouped

    def _metric(
        self,
        grouped: dict[date, dict[ObservationType, Observation]],
        observation_type: ObservationType,
        prefer_int: bool,
    ) -> list[SummaryPoint]:
        points: list[SummaryPoint] = []
        for day, values in sorted(grouped.items()):
            observation = values.get(observation_type)
            if observation is None:
                continue
            value = self._number(observation.value, prefer_int=prefer_int)
            if value is not None:
                points.append(SummaryPoint(date=day.isoformat(), value=value))
        return points

    def _bp(self, grouped: dict[date, dict[ObservationType, Observation]]) -> list[SummaryBpPoint]:
        points: list[SummaryBpPoint] = []
        for day, values in sorted(grouped.items()):
            observation = values.get(ObservationType.BP)
            if observation is None:
                continue
            bp = self._parse_bp(observation.value)
            if bp is not None:
                systolic, diastolic = bp
                points.append(
                    SummaryBpPoint(
                        date=day.isoformat(), systolic=systolic, diastolic=diastolic
                    )
                )
        return points

    def _walk(
        self, grouped: dict[date, dict[ObservationType, Observation]]
    ) -> list[SummaryWalkPoint]:
        points: list[SummaryWalkPoint] = []
        for day, values in sorted(grouped.items()):
            observation = values.get(ObservationType.WALK_DISTANCE)
            if observation is None:
                continue
            distance = self._number(observation.value, prefer_int=True)
            if not isinstance(distance, int):
                continue
            metadata = observation.extra_metadata or {}
            time_seconds = self._optional_int(metadata.get("time_seconds"))
            stops = self._optional_int(metadata.get("stops"))
            if time_seconds is None:
                time_seconds = self._observation_int(values.get(ObservationType.WALK_TIME))
            if stops is None:
                stops = self._observation_int(values.get(ObservationType.WALK_STOPS))
            points.append(
                SummaryWalkPoint(
                    date=day.isoformat(),
                    distance=distance,
                    time_seconds=time_seconds,
                    stops=stops,
                )
            )
        return points

    def _symptoms(
        self, grouped: dict[date, dict[ObservationType, Observation]]
    ) -> list[SummarySymptomsEntry]:
        entries: list[SummarySymptomsEntry] = []
        for day, values in sorted(grouped.items()):
            observation = values.get(ObservationType.SYMPTOMS)
            if observation is None:
                continue
            try:
                symptoms = json.loads(observation.value)
            except json.JSONDecodeError:
                continue
            if isinstance(symptoms, list) and all(isinstance(item, str) for item in symptoms):
                entries.append(SummarySymptomsEntry(date=day.isoformat(), values=symptoms))
        return entries

    def _notes(
        self, grouped: dict[date, dict[ObservationType, Observation]]
    ) -> list[SummaryNoteEntry]:
        entries: list[SummaryNoteEntry] = []
        for day, values in sorted(grouped.items()):
            observation = values.get(ObservationType.NOTES)
            if observation is not None:
                entries.append(SummaryNoteEntry(date=day.isoformat(), text=observation.value))
        return entries

    def _observation_int(self, observation: Observation | None) -> int | None:
        if observation is None:
            return None
        return self._optional_int(observation.value)

    def _optional_int(self, value: object) -> int | None:
        number = self._number(value, prefer_int=True)
        return number if isinstance(number, int) else None

    def _number(self, value: object, prefer_int: bool) -> float | int | None:
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

    def _parse_bp(self, value: str) -> tuple[int, int] | None:
        if "/" not in value:
            return None
        systolic_text, diastolic_text = value.split("/", 1)
        systolic = self._optional_int(systolic_text)
        diastolic = self._optional_int(diastolic_text)
        if systolic is None or diastolic is None:
            return None
        return systolic, diastolic
```

- [ ] **Step 5: Run summary service tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_summary_service.py -v`

Expected: PASS.

- [ ] **Step 6: Run backend lint for changed files**

Run: `cd backend && ruff check app/schemas/summary.py app/services/summary_service.py tests/test_summary_service.py`

Expected: PASS.

- [ ] **Step 7: Commit summary service**

Run:

```bash
git add backend/app/schemas/summary.py backend/app/services/summary_service.py backend/tests/test_summary_service.py
git commit -m "Add doctor summary service"
```

---

### Task 2: Backend Summary Route

**Files:**
- Create: `backend/app/routers/summary.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_summary_routes.py`

**Interfaces:**
- Consumes: `SummaryService(session).build(user_id, days="7")` from Task 1.
- Produces: protected `GET /api/summary?days=7|30` endpoint.

- [ ] **Step 1: Write failing summary route tests**

Create `backend/tests/test_summary_routes.py`:

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


def test_summary_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/summary")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_summary_defaults_to_7_days_and_is_scoped_to_current_user():
    with make_session() as session:
        simon = seed_user(session, "simon")
        vicky = seed_user(session, "vicky")
        service = ObservationService(session)
        service.upsert(simon, date.today(), ObservationType.WEIGHT, "92.3")
        service.upsert(vicky, date.today(), ObservationType.WEIGHT, "99.9")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, simon)}"}
        try:
            response = client.get("/api/summary", headers=headers)
            body = response.json()
            assert response.status_code == 200
            assert body["range"]["days"] == 7
            assert body["vitals"]["weight"] == [
                {"date": date.today().isoformat(), "value": 92.3}
            ]
        finally:
            clear_overrides()


def test_summary_accepts_30_days():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/summary?days=30", headers=headers)
            assert response.status_code == 200
            assert response.json()["range"]["days"] == 30
        finally:
            clear_overrides()


def test_invalid_days_returns_422():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/summary?days=14", headers=headers)
            assert response.status_code == 422
            assert "detail" in response.json()
        finally:
            clear_overrides()
```

- [ ] **Step 2: Run route tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_summary_routes.py -v`

Expected: FAIL with `404 Not Found` for authenticated summary requests.

- [ ] **Step 3: Implement summary router**

Create `backend/app/routers/summary.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.database import get_session
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.summary import SummaryResponse
from app.services.summary_service import SummaryRangeError, SummaryService

router = APIRouter(prefix="/api/summary", tags=["summary"])
DaysQuery = Annotated[str, Query(pattern="^(7|30)$")]


@router.get("", response_model=SummaryResponse)
async def get_summary(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "7",
) -> SummaryResponse:
    try:
        return SummaryService(session).build(user_id=user.id, days=days)
    except SummaryRangeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
```

- [ ] **Step 4: Include summary router**

Modify `backend/app/main.py`:

```python
from app.routers.summary import router as summary_router
```

Then include it with the other routers:

```python
app.include_router(summary_router)
```

- [ ] **Step 5: Run summary route tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_summary_routes.py -v`

Expected: PASS.

- [ ] **Step 6: Run backend checks for summary files**

Run: `cd backend && ruff check app/routers/summary.py app/main.py tests/test_summary_routes.py && PYTHONPATH=. pytest tests/test_summary_service.py tests/test_summary_routes.py -v`

Expected: PASS.

- [ ] **Step 7: Commit summary route**

Run:

```bash
git add backend/app/routers/summary.py backend/app/main.py backend/tests/test_summary_routes.py
git commit -m "Add doctor summary API"
```

---

### Task 3: Frontend Doctor Page

**Files:**
- Create: `frontend/src/api/summary.ts`
- Create: `frontend/src/pages/Doctor.tsx`
- Test: `frontend/src/pages/Doctor.test.tsx`

**Interfaces:**
- Consumes: protected `GET /api/summary?days=7|30` from Task 2.
- Produces: `getSummary(accessToken: string, days: SummaryDays) -> Promise<SummaryResponse>`.
- Produces: `Doctor({ accessToken }: { accessToken: string })` page component.

- [ ] **Step 1: Create summary API wrapper**

Create `frontend/src/api/summary.ts`:

```typescript
import { handleUnauthorized } from './auth'

export type SummaryDays = '7' | '30'

export type SummaryPoint = { date: string; value: number }
export type SummaryBpPoint = { date: string; systolic: number; diastolic: number }
export type SummaryWalkPoint = { date: string; distance: number; time_seconds: number | null; stops: number | null }
export type SummarySymptomsEntry = { date: string; values: string[] }
export type SummaryNoteEntry = { date: string; text: string }

export type SummaryResponse = {
  range: { days: number; start_date: string; end_date: string; generated_at: string }
  vitals: { weight: SummaryPoint[]; pulse: SummaryPoint[]; bp: SummaryBpPoint[] }
  activity: { walk: SummaryWalkPoint[]; songs: SummaryPoint[] }
  functional: { nyha: SummaryPoint[] }
  symptoms: SummarySymptomsEntry[]
  notes: SummaryNoteEntry[]
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized()
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

export async function getSummary(
  accessToken: string,
  days: SummaryDays,
): Promise<SummaryResponse> {
  const response = await fetch(`/api/summary?days=${days}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<SummaryResponse>(response)
}
```

- [ ] **Step 2: Write failing doctor page tests**

Create `frontend/src/pages/Doctor.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Doctor } from './Doctor'

const summary = {
  range: {
    days: 7,
    start_date: '2026-07-07',
    end_date: '2026-07-13',
    generated_at: '2026-07-13T10:30:00Z',
  },
  vitals: {
    weight: [{ date: '2026-07-13', value: 92.3 }],
    pulse: [{ date: '2026-07-13', value: 71 }],
    bp: [{ date: '2026-07-13', systolic: 121, diastolic: 78 }],
  },
  activity: {
    walk: [{ date: '2026-07-13', distance: 325, time_seconds: 840, stops: 2 }],
    songs: [{ date: '2026-07-13', value: 3 }],
  },
  functional: { nyha: [{ date: '2026-07-13', value: 3 }] },
  symptoms: [{ date: '2026-07-13', values: ['breathless', 'good_day'] }],
  notes: [{ date: '2026-07-13', text: 'Felt stronger today' }],
}

function mockSummaryFetch(body: unknown = summary) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }))
}

describe('Doctor', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads the 7 day summary by default and renders sections', async () => {
    mockSummaryFetch()

    render(<Doctor accessToken="token" />)

    expect(await screen.findByRole('heading', { name: 'Doctor Summary' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/summary?days=7', expect.any(Object))
    expect(screen.getByText('Weight')).toBeInTheDocument()
    expect(screen.getByText('Blood Pressure')).toBeInTheDocument()
    expect(screen.getByText('Walk')).toBeInTheDocument()
    expect(screen.getByText('Symptoms')).toBeInTheDocument()
    expect(screen.getByText('Felt stronger today')).toBeInTheDocument()
    expect(screen.getByText('Breathless')).toBeInTheDocument()
    expect(screen.getByText('Good day')).toBeInTheDocument()
  })

  it('changes to the 30 day summary', async () => {
    mockSummaryFetch({ ...summary, range: { ...summary.range, days: 30 } })

    render(<Doctor accessToken="token" />)
    await screen.findByRole('heading', { name: 'Doctor Summary' })
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/summary?days=30', expect.any(Object))
    })
  })

  it('renders print-safe empty states', async () => {
    mockSummaryFetch({
      ...summary,
      vitals: { weight: [], pulse: [], bp: [] },
      activity: { walk: [], songs: [] },
      functional: { nyha: [] },
      symptoms: [],
      notes: [],
    })

    render(<Doctor accessToken="token" />)

    expect(await screen.findAllByText('No data recorded for this period.')).not.toHaveLength(0)
  })

  it('prints the page', async () => {
    mockSummaryFetch()
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)

    render(<Doctor accessToken="token" />)
    await screen.findByRole('heading', { name: 'Doctor Summary' })
    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }))

    expect(print).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run doctor page tests to verify they fail**

Run: `cd frontend && npm test -- src/pages/Doctor.test.tsx`

Expected: FAIL with `Failed to resolve import "./Doctor"`.

- [ ] **Step 4: Implement doctor page**

Create `frontend/src/pages/Doctor.tsx`:

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

import * as summaryApi from '../api/summary'
import type { SummaryBpPoint, SummaryDays, SummaryPoint, SummaryResponse, SummaryWalkPoint } from '../api/summary'

type DoctorProps = { accessToken: string }
const EMPTY_TEXT = 'No data recorded for this period.'
const SYMPTOM_LABELS: Record<string, string> = {
  breathless: 'Breathless',
  chest_discomfort: 'Chest discomfort',
  palpitations: 'Palpitations',
  swollen_ankles: 'Swollen ankles',
  dizzy: 'Dizzy',
  very_tired: 'Very tired',
  poor_sleep: 'Poor sleep',
  poor_appetite: 'Poor appetite',
  good_day: 'Good day',
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="doctor-section"><h2>{title}</h2>{children}</section>
}

function PointTable({ rows, unit }: { rows: SummaryPoint[]; unit: string }) {
  if (rows.length === 0) return <p>{EMPTY_TEXT}</p>
  return <table><thead><tr><th>Date</th><th>Value</th></tr></thead><tbody>{rows.map((row) => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{row.value} {unit}</td></tr>)}</tbody></table>
}

function PointLineChart({ data, unit }: { data: SummaryPoint[]; unit: string }) {
  if (data.length === 0) return null
  return <ResponsiveContainer width="100%" height={180}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip formatter={(value) => [`${value} ${unit}`, unit]} /><Line type="monotone" dataKey="value" stroke="#111827" strokeWidth={2} dot /></LineChart></ResponsiveContainer>
}

function PointBarChart({ data, unit }: { data: SummaryPoint[]; unit: string }) {
  if (data.length === 0) return null
  return <ResponsiveContainer width="100%" height={180}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip formatter={(value) => [`${value} ${unit}`, unit]} /><Bar dataKey="value" fill="#111827" /></BarChart></ResponsiveContainer>
}

function BpSection({ rows }: { rows: SummaryBpPoint[] }) {
  return <Section title="Blood Pressure">{rows.length === 0 ? <p>{EMPTY_TEXT}</p> : <><ResponsiveContainer width="100%" height={180}><LineChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line name="Systolic" dataKey="systolic" stroke="#111827" /><Line name="Diastolic" dataKey="diastolic" stroke="#6b7280" /></LineChart></ResponsiveContainer><table><thead><tr><th>Date</th><th>Systolic</th><th>Diastolic</th></tr></thead><tbody>{rows.map((row) => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{row.systolic}</td><td>{row.diastolic}</td></tr>)}</tbody></table></>}</Section>
}

function WalkSection({ rows }: { rows: SummaryWalkPoint[] }) {
  const chartRows = rows.map((row) => ({ date: row.date, value: row.distance }))
  return <Section title="Walk">{rows.length === 0 ? <p>{EMPTY_TEXT}</p> : <><PointBarChart data={chartRows} unit="m" /><table><thead><tr><th>Date</th><th>Distance</th><th>Time</th><th>Stops</th></tr></thead><tbody>{rows.map((row) => <tr key={row.date}><td>{formatDate(row.date)}</td><td>{row.distance} m</td><td>{row.time_seconds ?? '-'}</td><td>{row.stops ?? '-'}</td></tr>)}</tbody></table></>}</Section>
}

function SymptomsSection({ summary }: { summary: SummaryResponse }) {
  return <Section title="Symptoms">{summary.symptoms.length === 0 ? <p>{EMPTY_TEXT}</p> : <table><thead><tr><th>Date</th><th>Symptoms</th></tr></thead><tbody>{summary.symptoms.map((entry) => <tr key={entry.date}><td>{formatDate(entry.date)}</td><td>{entry.values.map((value) => SYMPTOM_LABELS[value] ?? value).join(', ')}</td></tr>)}</tbody></table>}</Section>
}

function NotesSection({ summary }: { summary: SummaryResponse }) {
  return <Section title="Notes">{summary.notes.length === 0 ? <p>{EMPTY_TEXT}</p> : <table><thead><tr><th>Date</th><th>Note</th></tr></thead><tbody>{summary.notes.map((entry) => <tr key={entry.date}><td>{formatDate(entry.date)}</td><td>{entry.text}</td></tr>)}</tbody></table>}</Section>
}

export function Doctor({ accessToken }: DoctorProps) {
  const [days, setDays] = useState<SummaryDays>('7')
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    summaryApi.getSummary(accessToken, days).then((data) => {
      if (!active) return
      setSummary(data)
      setLoadError(false)
    }).catch((error: Error) => {
      if (!active) return
      if (error.message !== '401') setLoadError(true)
    })
    return () => { active = false }
  }, [accessToken, days])

  if (loadError) return <main><h1>Could not load doctor summary</h1><p>Please try again.</p></main>
  if (!summary) return <p>Loading...</p>

  return <main className="doctor-report"><style>{`@media print { header, .no-print { display: none !important; } body { background: #fff; color: #000; } .doctor-report { margin: 0; font-size: 11pt; } .doctor-section { break-inside: avoid; page-break-inside: avoid; } table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #000; padding: 0.25rem; } }`}</style><section><h1>Doctor Summary</h1><p>{`Last ${summary.range.days} days: ${formatDate(summary.range.start_date)} to ${formatDate(summary.range.end_date)}`}</p><p>Generated: {new Date(summary.range.generated_at).toLocaleString('en-GB')}</p><div className="no-print"><button type="button" aria-pressed={days === '7'} onClick={() => setDays('7')}>Last 7 days</button><button type="button" aria-pressed={days === '30'} onClick={() => setDays('30')}>Last 30 days</button><button type="button" onClick={() => window.print()}>Print / Save as PDF</button></div></section><Section title="Weight"><PointLineChart data={summary.vitals.weight} unit="kg" /><PointTable rows={summary.vitals.weight} unit="kg" /></Section><Section title="Pulse"><PointLineChart data={summary.vitals.pulse} unit="bpm" /><PointTable rows={summary.vitals.pulse} unit="bpm" /></Section><BpSection rows={summary.vitals.bp} /><WalkSection rows={summary.activity.walk} /><Section title="Guitar"><PointBarChart data={summary.activity.songs} unit="songs" /><PointTable rows={summary.activity.songs} unit="songs" /></Section><Section title="NYHA"><PointLineChart data={summary.functional.nyha} unit="class" /><PointTable rows={summary.functional.nyha} unit="class" /></Section><SymptomsSection summary={summary} /><NotesSection summary={summary} /></main>
}
```

- [ ] **Step 5: Run doctor page tests**

Run: `cd frontend && npm test -- src/pages/Doctor.test.tsx`

Expected: PASS.

- [ ] **Step 6: Run frontend lint and typecheck**

Run: `cd frontend && npm run lint && npm run typecheck`

Expected: PASS. If lint rejects long JSX lines, split the JSX into small components without changing behavior.

- [ ] **Step 7: Commit doctor page**

Run:

```bash
git add frontend/src/api/summary.ts frontend/src/pages/Doctor.tsx frontend/src/pages/Doctor.test.tsx
git commit -m "Add doctor summary page"
```

---

### Task 4: Doctor Routing, Print Verification, and Final Checks

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `Doctor({ accessToken })` from Task 3.
- Produces: authenticated `/doctor` route and `Doctor` navigation link.

- [ ] **Step 1: Update App tests first**

Modify `frontend/src/App.test.tsx` to add the Doctor mock:

```typescript
vi.mock('./pages/Doctor', () => ({
  Doctor: () => <main><h1>Doctor route</h1></main>,
}))
```

Add tests inside `describe('App routing', () => { ... })`:

```typescript
  it('renders doctor at /doctor', () => {
    window.history.replaceState(null, '', '/doctor')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Doctor route' })).toBeInTheDocument()
  })

  it('shows a Doctor navigation link', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('link', { name: 'Doctor' })).toHaveAttribute('href', '/doctor')
  })
```

- [ ] **Step 2: Run App tests to verify they fail**

Run: `cd frontend && npm test -- src/App.test.tsx`

Expected: FAIL because `/doctor` renders daily observations and the `Doctor` link is absent.

- [ ] **Step 3: Implement doctor routing and nav**

Modify `frontend/src/App.tsx` imports:

```typescript
import { Doctor } from './pages/Doctor'
```

Update route selection:

```typescript
  const showDoctor = pathname === '/doctor'
```

Add nav link:

```tsx
          <a href="/doctor">Doctor</a>
```

Update rendering:

```tsx
      {showDoctor ? <Doctor accessToken={auth.accessToken ?? ''} /> : null}
      {!showDashboard && !showCharts && !showDoctor ? <Daily /> : null}
```

- [ ] **Step 4: Run App tests**

Run: `cd frontend && npm test -- src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run frontend verification**

Run: `cd frontend && npm test && npm run lint && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 6: Rebuild images and run full project verification**

Run: `DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose build backend frontend && just check`

Expected: PASS for backend Ruff, backend Pytest, frontend ESLint, frontend typecheck, and frontend build.

- [ ] **Step 7: Manual acceptance check**

Run: `just up`

Then complete these checks in a browser when available:

- Log in and open `/doctor`.
- Confirm `Dashboard`, `Today`, `Charts`, and `Doctor` nav links appear on screen.
- Confirm 7-day and 30-day period buttons load matching summaries.
- Confirm charts and tables render for numeric sections.
- Confirm symptoms and notes render readable text.
- Use print preview or Save as PDF and confirm nav/logout/period selector/print button are hidden.
- Confirm printed charts and tables are visible and readable on A4.

- [ ] **Step 8: Commit routing and verification changes**

Run:

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "Route authenticated users to doctor summary"
```

---

## Final Review Checklist

- `GET /api/summary` is protected.
- Summary data is scoped to `current_user.id`.
- `days` defaults to `7` and accepts only `7` or `30`.
- Invalid `days` returns `422`.
- Backend returns `range`, `vitals`, `activity`, `functional`, `symptoms`, and `notes`.
- Backend skips invalid stored values.
- Walk entries include metadata and same-day fallback time/stops.
- Frontend renders charts and tables/lists from the summary response.
- Frontend maps `good_day` to `Good day`.
- `/doctor` route and nav link work.
- Print CSS hides app controls and keeps report content visible.
- `just check` passes after rebuilding images.
