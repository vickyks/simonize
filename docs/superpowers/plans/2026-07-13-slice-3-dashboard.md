# Slice 3 Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core dashboard so Simon can see today's key observations, recent trends, and advisory status at a glance.

**Architecture:** The backend exposes a protected `GET /api/dashboard` view-model endpoint. `DashboardService` loads user-scoped observations and assembles `today`, `trends`, and `advisory`; `WarningService` owns advisory rules. The frontend adds a dashboard API wrapper, a `/dashboard` page, and lightweight navigation while continuing to use the current in-memory auth token and `useEffect` data loading pattern.

**Tech Stack:** Python, FastAPI, SQLModel, Pydantic, Pytest, React 18, TypeScript, Vite, Vitest, Testing Library.

## Global Constraints

- Store raw observations only; dashboard values, trends, and advisory status are derived at query time.
- Keep API routers thin; business logic belongs in `DashboardService` and `WarningService`.
- The frontend must render the dashboard view model directly and must not transform raw observations.
- Access token remains in frontend memory only; refresh token remains an httpOnly cookie.
- Missing observations are represented as `null` in `today` and are never treated as zero.
- Trend arrays contain valid observations only, ordered by date ascending.
- Advisory copy must be factual observations, never diagnoses.
- Scope excludes editable targets, milestone badges, full chart pages, and doctor summary/export.

---

## File Structure

- Create `backend/app/services/warning_service.py`: advisory status and message calculation from parsed recent observations.
- Create `backend/app/services/dashboard_service.py`: dashboard view-model assembly and safe parsing of observations.
- Create `backend/app/schemas/dashboard.py`: Pydantic response models for the dashboard endpoint.
- Create `backend/app/routers/dashboard.py`: thin protected route for `GET /api/dashboard`.
- Modify `backend/app/main.py`: include the dashboard router.
- Create `backend/tests/test_warning_service.py`: unit tests for green, amber, and red advisory logic.
- Create `backend/tests/test_dashboard_service.py`: unit tests for today's view and trend assembly.
- Create `backend/tests/test_dashboard_routes.py`: route auth, shape, and user scoping tests.
- Create `frontend/src/api/dashboard.ts`: dashboard API types and fetch wrapper.
- Create `frontend/src/pages/Dashboard.tsx`: dashboard UI, summary cards, advisory panel, and inline sparklines.
- Modify `frontend/src/App.tsx`: route between dashboard, today, historical daily pages, and login.
- Modify `frontend/src/pages/Login.tsx`: redirect to `/dashboard` after successful login.
- Modify `frontend/package.json`: add test script and frontend test dependencies.
- Modify `frontend/package-lock.json`: update via `npm install` from inside `frontend/`.
- Create `frontend/src/pages/Dashboard.test.tsx`: component tests for dashboard rendering.
- Create `frontend/src/App.test.tsx`: route selection tests for authenticated users.

---

### Task 1: Warning Service

**Files:**
- Create: `backend/app/services/warning_service.py`
- Test: `backend/tests/test_warning_service.py`

**Interfaces:**
- Consumes: `app.models.observation.ObservationType`; plain dictionaries grouped by observation type.
- Produces: `WarningService.evaluate(today: dict[ObservationType, object], recent: list[DailyWarningObservations]) -> AdvisoryResult`.
- Produces: `DailyWarningObservations(date: date, values: dict[ObservationType, object])`.
- Produces: `AdvisoryResult(status: Literal["green", "amber", "red"], messages: list[str])`.

- [ ] **Step 1: Write failing red advisory tests**

Add this to `backend/tests/test_warning_service.py`:

```python
from datetime import date

from app.models.observation import ObservationType
from app.services.warning_service import DailyWarningObservations, WarningService


def test_red_for_chest_discomfort_today():
    result = WarningService().evaluate(
        today={ObservationType.SYMPTOMS: ["chest_discomfort"]},
        recent=[],
    )

    assert result.status == "red"
    assert "Chest discomfort was recorded today." in result.messages
    assert (
        "If symptoms are severe or sudden, call 999. Otherwise contact the Heart Failure team urgently."
        in result.messages
    )


def test_red_for_nyha_four_today():
    result = WarningService().evaluate(
        today={ObservationType.NYHA: 4},
        recent=[],
    )

    assert result.status == "red"
    assert "NYHA class IV was recorded today." in result.messages


def test_red_for_three_kg_weight_gain_within_two_days():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 11), values={ObservationType.WEIGHT: 90.0}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 13), values={ObservationType.WEIGHT: 93.1}
            ),
        ],
    )

    assert result.status == "red"
    assert "Your weight has increased 3 kg over 2 days." in result.messages
```

- [ ] **Step 2: Run red tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_warning_service.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.warning_service'`.

- [ ] **Step 3: Implement red advisory logic**

Create `backend/app/services/warning_service.py`:

```python
from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.models.observation import ObservationType

AdvisoryStatus = Literal["green", "amber", "red"]

URGENT_ADVICE = (
    "If symptoms are severe or sudden, call 999. Otherwise contact the Heart Failure team urgently."
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
            return AdvisoryResult(status="amber", messages=[*amber_messages, AMBER_ADVICE])

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
        return []

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
```

- [ ] **Step 4: Run red tests to verify they pass**

Run: `cd backend && PYTHONPATH=. pytest tests/test_warning_service.py -v`

Expected: PASS for 3 tests.

- [ ] **Step 5: Add failing amber and green tests**

Append to `backend/tests/test_warning_service.py`:

```python
def test_amber_for_two_kg_weight_gain_within_three_days():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(
                date=date(2026, 7, 10), values={ObservationType.WEIGHT: 91.0}
            ),
            DailyWarningObservations(
                date=date(2026, 7, 13), values={ObservationType.WEIGHT: 93.0}
            ),
        ],
    )

    assert result.status == "amber"
    assert "Your weight has increased 2 kg over 3 days." in result.messages
    assert "Consider contacting the Heart Failure team if this continues." in result.messages


def test_amber_for_pulse_average_rise():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(date=date(2026, 7, 7), values={ObservationType.PULSE: 70}),
            DailyWarningObservations(date=date(2026, 7, 8), values={ObservationType.PULSE: 72}),
            DailyWarningObservations(date=date(2026, 7, 12), values={ObservationType.PULSE: 84}),
            DailyWarningObservations(date=date(2026, 7, 13), values={ObservationType.PULSE: 85}),
        ],
    )

    assert result.status == "amber"
    assert "Your resting pulse average has increased by more than 10 BPM over 7 days." in result.messages


def test_amber_for_walk_distance_falling():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(date=date(2026, 7, 7), values={ObservationType.WALK_DISTANCE: 500}),
            DailyWarningObservations(date=date(2026, 7, 10), values={ObservationType.WALK_DISTANCE: 420}),
            DailyWarningObservations(date=date(2026, 7, 13), values={ObservationType.WALK_DISTANCE: 390}),
        ],
    )

    assert result.status == "amber"
    assert "Your walk distance has fallen by more than 20% over 7 days." in result.messages


def test_amber_for_nyha_worsening_three_consecutive_days():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(date=date(2026, 7, 10), values={ObservationType.NYHA: 2}),
            DailyWarningObservations(date=date(2026, 7, 11), values={ObservationType.NYHA: 3}),
            DailyWarningObservations(date=date(2026, 7, 12), values={ObservationType.NYHA: 3}),
            DailyWarningObservations(date=date(2026, 7, 13), values={ObservationType.NYHA: 3}),
        ],
    )

    assert result.status == "amber"
    assert "NYHA class has worsened for 3 consecutive days." in result.messages


def test_amber_for_repeated_symptom_excluding_good_day():
    result = WarningService().evaluate(
        today={},
        recent=[
            DailyWarningObservations(date=date(2026, 7, 7), values={ObservationType.SYMPTOMS: ["good_day"]}),
            DailyWarningObservations(date=date(2026, 7, 8), values={ObservationType.SYMPTOMS: ["breathless"]}),
            DailyWarningObservations(date=date(2026, 7, 10), values={ObservationType.SYMPTOMS: ["breathless"]}),
            DailyWarningObservations(date=date(2026, 7, 13), values={ObservationType.SYMPTOMS: ["breathless"]}),
        ],
    )

    assert result.status == "amber"
    assert "Breathless was recorded on 3 of the last 7 days." in result.messages


def test_green_when_no_warning_conditions_or_not_enough_data():
    result = WarningService().evaluate(
        today={ObservationType.WEIGHT: 92.0},
        recent=[DailyWarningObservations(date=date(2026, 7, 13), values={ObservationType.WEIGHT: 92.0})],
    )

    assert result.status == "green"
    assert result.messages == []
```

- [ ] **Step 6: Run amber and green tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_warning_service.py -v`

Expected: FAIL for amber cases because `_amber_messages` returns `[]`.

- [ ] **Step 7: Implement amber and green logic**

Replace `_amber_messages` and add helpers in `backend/app/services/warning_service.py`:

```python
    def _amber_messages(self, recent: list[DailyWarningObservations]) -> list[str]:
        messages: list[str] = []

        if self._weight_gain(recent, max_days=3, threshold=2.0):
            messages.append("Your weight has increased 2 kg over 3 days.")

        if self._pulse_average_rise(recent):
            messages.append(
                "Your resting pulse average has increased by more than 10 BPM over 7 days."
            )

        if self._walk_distance_falling(recent):
            messages.append("Your walk distance has fallen by more than 20% over 7 days.")

        if self._nyha_worsening(recent):
            messages.append("NYHA class has worsened for 3 consecutive days.")

        repeated_symptom = self._repeated_symptom(recent)
        if repeated_symptom:
            messages.append(f"{repeated_symptom.replace('_', ' ').title()} was recorded on 3 of the last 7 days.")

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

        earliest = readings[:3]
        latest = readings[-3:]
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
            consecutive = all((day - baseline_date).days in {1, 2, 3} for day, _ in window)
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
```

- [ ] **Step 8: Run warning service tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_warning_service.py -v`

Expected: PASS.

- [ ] **Step 9: Run backend lint for this file**

Run: `cd backend && ruff check app/services/warning_service.py tests/test_warning_service.py`

Expected: PASS.

- [ ] **Step 10: Commit warning service**

Run:

```bash
git add backend/app/services/warning_service.py backend/tests/test_warning_service.py
git commit -m "Add dashboard warning service"
```

---

### Task 2: Dashboard Service and API

**Files:**
- Create: `backend/app/schemas/dashboard.py`
- Create: `backend/app/services/dashboard_service.py`
- Create: `backend/app/routers/dashboard.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_dashboard_service.py`
- Test: `backend/tests/test_dashboard_routes.py`

**Interfaces:**
- Consumes: `WarningService.evaluate(today, recent)` from Task 1.
- Produces: `DashboardService(session: Session).build(user_id: uuid.UUID, today: date | None = None) -> DashboardResponse`.
- Produces: `GET /api/dashboard -> DashboardResponse`.

- [ ] **Step 1: Write failing dashboard service tests**

Create `backend/tests/test_dashboard_service.py`:

```python
from datetime import date

from app.models.observation import Observation, ObservationType
from app.models.user import User
from app.services.dashboard_service import DashboardService
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


def test_dashboard_builds_today_values_and_trends():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 7, 7), ObservationType.WEIGHT, "92.8")
        service.upsert(user, date(2026, 7, 12), ObservationType.WEIGHT, "92.4")
        service.upsert(user, date(2026, 7, 13), ObservationType.WEIGHT, "92.3")
        service.upsert(user, date(2026, 7, 13), ObservationType.PULSE, "71")
        service.upsert(user, date(2026, 7, 13), ObservationType.BP, "121/78")
        service.upsert(user, date(2026, 7, 13), ObservationType.WALK_DISTANCE, "325")
        service.upsert(user, date(2026, 7, 13), ObservationType.SONGS, "3")
        service.upsert(user, date(2026, 7, 13), ObservationType.NYHA, "3")

        dashboard = DashboardService(session).build(user_id=user.id, today=date(2026, 7, 13))

        assert dashboard.today.date == "2026-07-13"
        assert dashboard.today.weight == 92.3
        assert dashboard.today.pulse == 71
        assert dashboard.today.bp == "121/78"
        assert dashboard.today.walk_distance == 325
        assert dashboard.today.songs == 3
        assert dashboard.today.nyha == 3
        assert dashboard.trends.weight_7d == [
            {"date": "2026-07-07", "value": 92.8},
            {"date": "2026-07-12", "value": 92.4},
            {"date": "2026-07-13", "value": 92.3},
        ]
        assert dashboard.advisory.status == "green"


def test_dashboard_missing_today_values_are_null():
    with make_session() as session:
        user = make_user(session)

        dashboard = DashboardService(session).build(user_id=user.id, today=date(2026, 7, 13))

        assert dashboard.today.weight is None
        assert dashboard.today.pulse is None
        assert dashboard.today.bp is None
        assert dashboard.today.walk_distance is None
        assert dashboard.today.songs is None
        assert dashboard.today.nyha is None
        assert dashboard.trends.weight_7d == []


def test_dashboard_ignores_invalid_stored_values():
    with make_session() as session:
        user = make_user(session)
        session.add(
            Observation(
                user_id=user.id,
                date=date(2026, 7, 13),
                type=ObservationType.WEIGHT,
                value="not-a-number",
            )
        )
        session.commit()

        dashboard = DashboardService(session).build(user_id=user.id, today=date(2026, 7, 13))

        assert dashboard.today.weight is None
        assert dashboard.trends.weight_7d == []
```

- [ ] **Step 2: Run dashboard service tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_dashboard_service.py -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.dashboard_service'`.

- [ ] **Step 3: Create dashboard schemas**

Create `backend/app/schemas/dashboard.py`:

```python
from typing import Literal

from pydantic import BaseModel


class TrendPoint(BaseModel):
    date: str
    value: float | int


class DashboardToday(BaseModel):
    date: str
    weight: float | None
    pulse: int | None
    bp: str | None
    walk_distance: int | None
    songs: int | None
    nyha: int | None


class DashboardTrends(BaseModel):
    weight_7d: list[TrendPoint]
    pulse_7d: list[TrendPoint]
    walk_7d: list[TrendPoint]


class DashboardAdvisory(BaseModel):
    status: Literal["green", "amber", "red"]
    messages: list[str]


class DashboardResponse(BaseModel):
    today: DashboardToday
    trends: DashboardTrends
    advisory: DashboardAdvisory
```

- [ ] **Step 4: Implement dashboard service**

Create `backend/app/services/dashboard_service.py`:

```python
import math
import uuid
from datetime import date, timedelta

from sqlmodel import Session, select

from app.models.observation import Observation, ObservationType
from app.schemas.dashboard import (
    DashboardAdvisory,
    DashboardResponse,
    DashboardToday,
    DashboardTrends,
    TrendPoint,
)
from app.services.warning_service import DailyWarningObservations, WarningService


class DashboardService:
    def __init__(self, session: Session):
        self.session = session

    def build(self, user_id: uuid.UUID, today: date | None = None) -> DashboardResponse:
        current_day = today or date.today()
        start_day = current_day - timedelta(days=6)
        observations = self.session.exec(
            select(Observation)
            .where(Observation.user_id == user_id)
            .where(Observation.date >= start_day)
            .where(Observation.date <= current_day)
            .order_by(Observation.date)
        ).all()

        grouped = self._group_by_date(observations)
        today_values = grouped.get(current_day, {})
        recent = [
            DailyWarningObservations(date=day, values=values)
            for day, values in sorted(grouped.items())
        ]
        advisory = WarningService().evaluate(today=today_values, recent=recent)

        return DashboardResponse(
            today=DashboardToday(
                date=current_day.isoformat(),
                weight=self._float(today_values.get(ObservationType.WEIGHT)),
                pulse=self._int(today_values.get(ObservationType.PULSE)),
                bp=self._str(today_values.get(ObservationType.BP)),
                walk_distance=self._int(today_values.get(ObservationType.WALK_DISTANCE)),
                songs=self._int(today_values.get(ObservationType.SONGS)),
                nyha=self._int(today_values.get(ObservationType.NYHA)),
            ),
            trends=DashboardTrends(
                weight_7d=self._trend(grouped, ObservationType.WEIGHT, "float"),
                pulse_7d=self._trend(grouped, ObservationType.PULSE, "int"),
                walk_7d=self._trend(grouped, ObservationType.WALK_DISTANCE, "int"),
            ),
            advisory=DashboardAdvisory(
                status=advisory.status,
                messages=advisory.messages,
            ),
        )

    def _group_by_date(
        self, observations: list[Observation]
    ) -> dict[date, dict[ObservationType, object]]:
        grouped: dict[date, dict[ObservationType, object]] = {}
        for observation in observations:
            value = self._parse_observation(observation)
            if value is None:
                continue
            grouped.setdefault(observation.date, {})[observation.type] = value
        return grouped

    def _parse_observation(self, observation: Observation) -> object | None:
        if observation.type == ObservationType.WEIGHT:
            return self._float(observation.value)
        if observation.type in {
            ObservationType.PULSE,
            ObservationType.WALK_DISTANCE,
            ObservationType.SONGS,
            ObservationType.NYHA,
        }:
            return self._int(observation.value)
        if observation.type == ObservationType.BP:
            return observation.value if "/" in observation.value else None
        if observation.type == ObservationType.SYMPTOMS:
            import json

            try:
                symptoms = json.loads(observation.value)
            except json.JSONDecodeError:
                return None
            return symptoms if isinstance(symptoms, list) else None
        return observation.value

    def _trend(
        self,
        grouped: dict[date, dict[ObservationType, object]],
        observation_type: ObservationType,
        value_type: str,
    ) -> list[TrendPoint]:
        points: list[TrendPoint] = []
        for day, values in sorted(grouped.items()):
            value = values.get(observation_type)
            parsed = self._float(value) if value_type == "float" else self._int(value)
            if parsed is not None:
                points.append(TrendPoint(date=day.isoformat(), value=parsed))
        return points

    def _float(self, value: object) -> float | None:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number if math.isfinite(number) else None

    def _int(self, value: object) -> int | None:
        if isinstance(value, bool):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _str(self, value: object) -> str | None:
        return value if isinstance(value, str) else None
```

- [ ] **Step 5: Run dashboard service tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_dashboard_service.py -v`

Expected: PASS.

- [ ] **Step 6: Write failing dashboard route tests**

Create `backend/tests/test_dashboard_routes.py`:

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


def test_dashboard_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/dashboard")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_dashboard_returns_view_model():
    with make_session() as session:
        user = seed_user(session)
        ObservationService(session).upsert(user, date.today(), ObservationType.WEIGHT, "92.3")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/dashboard", headers=headers)
            body = response.json()

            assert response.status_code == 200
            assert body["today"]["weight"] == 92.3
            assert "weight_7d" in body["trends"]
            assert body["advisory"]["status"] in {"green", "amber", "red"}
        finally:
            clear_overrides()


def test_dashboard_is_scoped_to_current_user():
    with make_session() as session:
        simon = seed_user(session, "simon")
        vicky = seed_user(session, "vicky")
        ObservationService(session).upsert(simon, date.today(), ObservationType.WEIGHT, "92.3")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, vicky)}"}
        try:
            response = client.get("/api/dashboard", headers=headers)
            assert response.status_code == 200
            assert response.json()["today"]["weight"] is None
        finally:
            clear_overrides()
```

- [ ] **Step 7: Run dashboard route tests to verify they fail**

Run: `cd backend && PYTHONPATH=. pytest tests/test_dashboard_routes.py -v`

Expected: FAIL with `404 Not Found` for authenticated dashboard requests.

- [ ] **Step 8: Implement dashboard router**

Create `backend/app/routers/dashboard.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.dashboard import DashboardResponse
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> DashboardResponse:
    return DashboardService(session).build(user_id=user.id)
```

- [ ] **Step 9: Include dashboard router**

Modify `backend/app/main.py` imports and router registration:

```python
from app.routers.auth import router as auth_router
from app.routers.dashboard import router as dashboard_router
from app.routers.observations import router as observations_router
```

```python
app.include_router(auth_router)
app.include_router(observations_router)
app.include_router(dashboard_router)
```

- [ ] **Step 10: Run dashboard route tests**

Run: `cd backend && PYTHONPATH=. pytest tests/test_dashboard_routes.py -v`

Expected: PASS.

- [ ] **Step 11: Run backend tests and lint**

Run: `cd backend && ruff check app tests && PYTHONPATH=. pytest`

Expected: PASS.

- [ ] **Step 12: Commit dashboard API**

Run:

```bash
git add backend/app/schemas/dashboard.py backend/app/services/dashboard_service.py backend/app/routers/dashboard.py backend/app/main.py backend/tests/test_dashboard_service.py backend/tests/test_dashboard_routes.py
git commit -m "Add dashboard API"
```

---

### Task 3: Frontend Dashboard Page

**Files:**
- Create: `frontend/src/api/dashboard.ts`
- Create: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Test: `frontend/src/pages/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `GET /api/dashboard` from Task 2.
- Produces: `getDashboard(accessToken: string): Promise<DashboardResponse>`.
- Produces: `Dashboard` React component that receives auth from `useAuth()` and renders the dashboard route.

- [ ] **Step 1: Add frontend test tooling**

Run: `cd frontend && npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom`

Expected: `package.json` and `package-lock.json` update with the new dev dependencies.

- [ ] **Step 2: Add the test script**

Modify `frontend/package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "vite",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run --environment jsdom"
  }
}
```

- [ ] **Step 3: Write dashboard API wrapper**

Create `frontend/src/api/dashboard.ts`:

```typescript
import { handleUnauthorized } from './auth'

export type AdvisoryStatus = 'green' | 'amber' | 'red'

export type TrendPoint = {
  date: string
  value: number
}

export type DashboardResponse = {
  today: {
    date: string
    weight: number | null
    pulse: number | null
    bp: string | null
    walk_distance: number | null
    songs: number | null
    nyha: number | null
  }
  trends: {
    weight_7d: TrendPoint[]
    pulse_7d: TrendPoint[]
    walk_7d: TrendPoint[]
  }
  advisory: {
    status: AdvisoryStatus
    messages: string[]
  }
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

export async function getDashboard(accessToken: string): Promise<DashboardResponse> {
  const response = await fetch('/api/dashboard', {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<DashboardResponse>(response)
}
```

- [ ] **Step 4: Write failing dashboard component tests**

Create `frontend/src/pages/Dashboard.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from './Dashboard'

function mockFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }))
}

function renderDashboard() {
  render(<Dashboard accessToken="token" />)
}

describe('Dashboard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders summary cards and green advisory from the API response', async () => {
    mockFetch({
      today: {
        date: '2026-07-13',
        weight: 92.3,
        pulse: 71,
        bp: '121/78',
        walk_distance: 325,
        songs: 3,
        nyha: 3,
      },
      trends: {
        weight_7d: [{ date: '2026-07-13', value: 92.3 }],
        pulse_7d: [{ date: '2026-07-13', value: 71 }],
        walk_7d: [{ date: '2026-07-13', value: 325 }],
      },
      advisory: { status: 'green', messages: [] },
    })

    renderDashboard()

    expect(await screen.findByRole('heading', { name: "Simon's Dashboard" })).toBeInTheDocument()
    expect(screen.getByText('92.3 kg')).toBeInTheDocument()
    expect(screen.getByText('71 bpm')).toBeInTheDocument()
    expect(screen.getByText('121/78')).toBeInTheDocument()
    expect(screen.getByText('325 m')).toBeInTheDocument()
    expect(screen.getByText('3 songs')).toBeInTheDocument()
    expect(screen.getByText('Class 3')).toBeInTheDocument()
    expect(screen.getByText('No current concerns from recorded observations.')).toBeInTheDocument()
  })

  it('renders calm empty states for missing values', async () => {
    mockFetch({
      today: {
        date: '2026-07-13',
        weight: null,
        pulse: null,
        bp: null,
        walk_distance: null,
        songs: null,
        nyha: null,
      },
      trends: { weight_7d: [], pulse_7d: [], walk_7d: [] },
      advisory: { status: 'green', messages: [] },
    })

    renderDashboard()

    expect(await screen.findByText('No weight recorded today yet')).toBeInTheDocument()
    expect(screen.getByText('No walk recorded today yet')).toBeInTheDocument()
  })

  it('renders amber advisory messages', async () => {
    mockFetch({
      today: {
        date: '2026-07-13',
        weight: 93,
        pulse: null,
        bp: null,
        walk_distance: null,
        songs: null,
        nyha: null,
      },
      trends: { weight_7d: [], pulse_7d: [], walk_7d: [] },
      advisory: {
        status: 'amber',
        messages: [
          'Your weight has increased 2 kg over 3 days.',
          'Consider contacting the Heart Failure team if this continues.',
        ],
      },
    })

    renderDashboard()

    expect(await screen.findByText('Possible concern')).toBeInTheDocument()
    expect(screen.getByText('Your weight has increased 2 kg over 3 days.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run dashboard component tests to verify they fail**

Run: `cd frontend && npm test -- src/pages/Dashboard.test.tsx`

Expected: FAIL with `Failed to resolve import "./Dashboard"`.

- [ ] **Step 6: Implement dashboard page**

Create `frontend/src/pages/Dashboard.tsx`:

```typescript
import { useEffect, useState } from 'react'

import * as dashboardApi from '../api/dashboard'
import type { DashboardResponse, TrendPoint } from '../api/dashboard'

type DashboardProps = {
  accessToken: string
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) return null

  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100
    const y = 30 - ((point.value - min) / range) * 30
    return `${x},${y}`
  })

  return (
    <svg viewBox="0 0 100 32" role="img" aria-label="7 day trend" style={{ width: '100%', height: '2rem' }}>
      <polyline fill="none" stroke="currentColor" strokeWidth="3" points={coordinates.join(' ')} />
    </svg>
  )
}

function SummaryCard({
  title,
  value,
  empty,
  trend,
}: {
  title: string
  value: string | null
  empty: string
  trend?: TrendPoint[]
}) {
  return (
    <article style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '1rem', padding: '1rem', boxShadow: '0 8px 24px rgb(15 23 42 / 0.06)' }}>
      <h2 style={{ fontSize: '0.9rem', margin: 0, color: '#475569' }}>{title}</h2>
      <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0.5rem 0' }}>{value ?? empty}</p>
      {trend ? <Sparkline points={trend} /> : null}
    </article>
  )
}

function Advisory({ dashboard }: { dashboard: DashboardResponse }) {
  const status = dashboard.advisory.status
  const styles = {
    green: { background: '#ecfdf5', border: '#86efac', label: 'Steady', copy: 'No current concerns from recorded observations.' },
    amber: { background: '#fffbeb', border: '#fbbf24', label: 'Possible concern', copy: null },
    red: { background: '#fef2f2', border: '#f87171', label: 'Potentially serious', copy: null },
  }[status]

  return (
    <section style={{ background: styles.background, border: `1px solid ${styles.border}`, borderRadius: '1rem', padding: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>{styles.label}</h2>
      {styles.copy ? <p>{styles.copy}</p> : null}
      {dashboard.advisory.messages.length > 0 ? (
        <ul>
          {dashboard.advisory.messages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      ) : null}
    </section>
  )
}

export function Dashboard({ accessToken }: DashboardProps) {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    dashboardApi.getDashboard(accessToken)
      .then((data) => {
        setDashboard(data)
        setLoadError(false)
      })
      .catch((error: Error) => {
        if (error.message !== '401') setLoadError(true)
      })
  }, [accessToken])

  if (loadError) return <main><h1>Could not load dashboard</h1><p>Please try again.</p></main>
  if (!dashboard) return <p>Loading...</p>

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem', display: 'grid', gap: '1.5rem' }}>
      <section>
        <p style={{ color: '#64748b', margin: 0 }}>{formatDate(dashboard.today.date)}</p>
        <h1>Simon's Dashboard</h1>
        <p>Today's recovery picture, from the observations recorded so far.</p>
      </section>
      <Advisory dashboard={dashboard} />
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '1rem' }}>
        <SummaryCard title="Weight" value={dashboard.today.weight === null ? null : `${dashboard.today.weight} kg`} empty="No weight recorded today yet" trend={dashboard.trends.weight_7d} />
        <SummaryCard title="Pulse" value={dashboard.today.pulse === null ? null : `${dashboard.today.pulse} bpm`} empty="No pulse recorded today yet" trend={dashboard.trends.pulse_7d} />
        <SummaryCard title="Blood Pressure" value={dashboard.today.bp} empty="No blood pressure recorded today yet" />
        <SummaryCard title="Today's Walk" value={dashboard.today.walk_distance === null ? null : `${dashboard.today.walk_distance} m`} empty="No walk recorded today yet" trend={dashboard.trends.walk_7d} />
        <SummaryCard title="Guitar" value={dashboard.today.songs === null ? null : `${dashboard.today.songs} songs`} empty="No guitar recorded today yet" />
        <SummaryCard title="Current NYHA" value={dashboard.today.nyha === null ? null : `Class ${dashboard.today.nyha}`} empty="No NYHA recorded today yet" />
      </section>
      <p><a href="/">Record today's observations</a></p>
    </main>
  )
}
```

- [ ] **Step 7: Run dashboard component tests**

Run: `cd frontend && npm test -- src/pages/Dashboard.test.tsx`

Expected: PASS.

- [ ] **Step 8: Run frontend lint and typecheck**

Run: `cd frontend && npm run lint && npm run typecheck`

Expected: PASS.

- [ ] **Step 9: Commit frontend dashboard page**

Run:

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/api/dashboard.ts frontend/src/pages/Dashboard.tsx frontend/src/pages/Dashboard.test.tsx
git commit -m "Add dashboard page"
```

---

### Task 4: Routing, Navigation, and Final Verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Login.tsx`

**Interfaces:**
- Consumes: `Dashboard` component from Task 3.
- Produces: authenticated app routing where `/dashboard` renders the dashboard, `/` and `/{date}` render daily observations, and `/login` redirects authenticated users to `/dashboard`.

- [ ] **Step 1: Write failing route behavior test through App**

Create `frontend/src/App.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

vi.mock('./auth/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    accessToken: 'token',
    status: 'authenticated',
    username: 'simon',
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('./pages/Dashboard', () => ({
  Dashboard: () => <main><h1>Dashboard route</h1></main>,
}))

vi.mock('./pages/Daily', () => ({
  Daily: () => <main><h1>Daily route</h1></main>,
}))

describe('App routing', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('renders dashboard at /dashboard', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Dashboard route' })).toBeInTheDocument()
  })

  it('renders daily observations at /', () => {
    window.history.replaceState(null, '', '/')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Daily route' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run App route test to verify it fails**

Run: `cd frontend && npm test -- src/App.test.tsx`

Expected: FAIL because `/dashboard` still renders the daily page.

- [ ] **Step 3: Implement routing and navigation**

Replace `frontend/src/App.tsx` with:

```typescript
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Dashboard } from './pages/Dashboard'
import { Daily } from './pages/Daily'
import { Login } from './pages/Login'

function AppContent() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return <p>Loading...</p>
  }

  if (auth.status === 'anonymous') {
    return <Login />
  }

  if (window.location.pathname === '/login') {
    window.history.replaceState(null, '', '/dashboard')
  }

  const showDashboard = window.location.pathname === '/dashboard'

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', margin: '1rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
        <strong>Simonizer</strong>
        <nav style={{ display: 'flex', gap: '1rem' }} aria-label="Main navigation">
          <a href="/dashboard">Dashboard</a>
          <a href="/">Today</a>
        </nav>
        <button type="button" onClick={() => void auth.logout()}>Log out</button>
      </header>
      {showDashboard ? <Dashboard accessToken={auth.accessToken ?? ''} /> : <Daily />}
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
```

- [ ] **Step 4: Redirect successful login to dashboard**

Modify `frontend/src/pages/Login.tsx` submit success block:

```typescript
    try {
      await auth.login(username, password)
      window.history.replaceState(null, '', '/dashboard')
    } catch {
      setError('That username or password did not work.')
    }
```

- [ ] **Step 5: Run frontend tests**

Run: `cd frontend && npm test`

Expected: PASS.

- [ ] **Step 6: Run frontend verification**

Run: `cd frontend && npm run lint && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 7: Run full project verification**

Run: `just check`

Expected: PASS for backend Ruff, backend Pytest, frontend ESLint, frontend typecheck, and frontend build.

- [ ] **Step 8: Manual acceptance check**

Run: `just up`

Then complete these checks in the browser:

- Log in and confirm the app lands on `/dashboard`.
- Confirm `/dashboard` shows summary cards and a green advisory with no warning conditions.
- Go to `/`, enter observations for today, and confirm `/dashboard` reflects them.
- Enter weights that trigger the amber 3-day gain rule and confirm the advisory changes to `Possible concern`.
- Resize to a mobile-width viewport and confirm cards stack cleanly.

- [ ] **Step 9: Commit routing and verification updates**

Run:

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/pages/Login.tsx
git commit -m "Route authenticated users to dashboard"
```

---

## Final Review Checklist

- `GET /api/dashboard` is protected and returns `today`, `trends`, and `advisory`.
- All dashboard backend queries are scoped to `current_user.id`.
- `DashboardService` and `WarningService` contain business logic; route handlers stay thin.
- Missing today values are `null`.
- Trend arrays contain only valid parsed values and are date ascending.
- Frontend displays the backend view model directly.
- Frontend has no advisory or trend calculations beyond sparkline coordinate drawing.
- Amber/red copy uses observations and advice, not diagnoses.
- `just check` passes.
