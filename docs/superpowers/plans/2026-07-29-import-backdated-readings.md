# Import And Backdated Readings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a date-first `Add Readings` entry flow, first-class oxygen observations, and safe paste-based import for Mum's tab-separated readings.

**Architecture:** Preserve the observation-first model: each imported value becomes a normal dated observation and no daily records or import batches are stored. Keep API routes thin and put parsing, validation, preview, conflict detection, and apply behavior in an `ObservationImportService`. Reuse existing frontend page shell/input patterns and existing observation API conventions.

**Tech Stack:** Python, FastAPI, SQLModel, Pydantic, Pytest, React, TypeScript, Vite, Testing Library, Vitest.

## Global Constraints

- User-facing `Daily` navigation/page language becomes `Add Readings`.
- The entry page has a visible date input and a `Today` shortcut.
- Direct date URLs such as `/2026-07-13` continue to work.
- Add `oxygen` as a first-class `ObservationType`.
- Oxygen is stored as an integer string representing SpO2 percentage.
- Oxygen validation range is integer `50` to `100`.
- Import uses pasted tab-separated text, not file upload.
- Import preview writes nothing.
- Blank cells are skipped and never overwrite existing observations.
- Existing observations are skipped by default and overwritten only when an individual conflicting observation is explicitly selected.
- `NYHA = 3.5` is a validation error and is not imported as NYHA.
- Valid fields in a row with one invalid field can still be imported.
- Routes remain thin; business logic belongs in services.
- Frontend uses backend purpose-built view models and does not infer raw database state.
- Do not store daily records, import batches, derived import summaries, milestones, or progress values.
- Keep existing page shell/card visual language.
- File upload, arbitrary column mapping UI, spreadsheet-style editor, oxygen charts, and dashboard oxygen cards are out of scope.

---

## File Structure

- Modify `backend/app/models/observation.py`: add `ObservationType.OXYGEN = "oxygen"`.
- Modify `backend/app/services/observation_service.py`: validate oxygen values as integer 50-100.
- Modify `backend/app/routers/observations.py`: add oxygen to the daily checklist.
- Modify `docs/data-model.md`: document oxygen observation type and validation rule.
- Modify `backend/tests/test_observation_service.py`: oxygen validation tests.
- Modify `backend/tests/test_observation_routes.py`: oxygen route/checklist tests.
- Modify `frontend/src/api/observations.ts`: add `oxygen` to `ObservationType`.
- Create `frontend/src/components/inputs/OxygenInput.tsx`: input component matching existing vitals inputs.
- Modify `frontend/src/pages/Daily.tsx`: rename copy to Add Readings, add date picker/Today shortcut, add oxygen input.
- Modify `frontend/src/pages/Daily.test.tsx`: Add Readings/date picker/oxygen tests.
- Modify `frontend/src/App.tsx`: rename nav label, add `/import` route later in Task 4.
- Modify `frontend/src/App.test.tsx`: nav label test and import route test later.
- Create `backend/app/schemas/imports.py`: import preview/apply request and response schemas.
- Create `backend/app/services/observation_import_service.py`: parse/preview/apply import values.
- Create `backend/app/routers/imports.py`: protected import preview/apply endpoints.
- Modify `backend/app/main.py`: include import router.
- Create `backend/tests/test_observation_import_service.py`: parser/preview/apply tests.
- Create `backend/tests/test_import_routes.py`: auth and route tests.
- Create `frontend/src/api/imports.ts`: import API wrapper and types.
- Create `frontend/src/pages/ImportReadings.tsx`: paste/preview/apply UI.
- Create `frontend/src/pages/ImportReadings.test.tsx`: import UI tests.

---

### Task 1: Backend Oxygen Observation

**Files:**
- Modify: `backend/app/models/observation.py`
- Modify: `backend/app/services/observation_service.py`
- Modify: `backend/app/routers/observations.py`
- Modify: `docs/data-model.md`
- Modify: `backend/tests/test_observation_service.py`
- Modify: `backend/tests/test_observation_routes.py`

**Interfaces:**
- Consumes: `ObservationService.upsert(user, day, observation_type, value, metadata=None)`.
- Produces: `ObservationType.OXYGEN = "oxygen"`, accepted by observation routes and returned in daily observations.
- Later tasks consume: `oxygen` as a normal observation type in frontend and import services.

- [ ] **Step 1: Add failing oxygen service tests**

Modify `backend/tests/test_observation_service.py`.

Add oxygen to `test_valid_values_are_stored` params:

```python
        (ObservationType.OXYGEN, "97", "97"),
```

Add oxygen invalid values to `test_invalid_values_raise_validation_error` params:

```python
        (ObservationType.OXYGEN, "49"),
        (ObservationType.OXYGEN, "101"),
```

Add oxygen to integer rejection params in `test_integer_values_reject_non_integral_numbers_and_booleans`:

```python
        (ObservationType.OXYGEN, 97.5),
        (ObservationType.OXYGEN, True),
```

- [ ] **Step 2: Run oxygen service tests to verify failure**

Run:

```bash
cd backend && PYTHONPATH=. pytest tests/test_observation_service.py -v
```

Expected: FAIL with `AttributeError: OXYGEN` or equivalent enum missing failure.

- [ ] **Step 3: Add failing oxygen route/checklist test**

Modify `backend/tests/test_observation_routes.py`.

Add this test:

```python
def test_put_and_get_oxygen_updates_checklist():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            saved = client.put(
                "/api/observations/2026-06-27/oxygen",
                headers=headers,
                json={"value": "97"},
            )
            loaded = client.get("/api/observations/2026-06-27", headers=headers)

            assert saved.status_code == 200
            assert saved.json()["value"] == "97"
            assert loaded.status_code == 200
            assert loaded.json()["observations"]["oxygen"]["value"] == "97"
            checklist = {item["type"]: item for item in loaded.json()["checklist"]}
            assert checklist["oxygen"] == {
                "type": "oxygen",
                "label": "Oxygen",
                "recorded": True,
            }
        finally:
            clear_overrides()
```

- [ ] **Step 4: Run route test to verify failure**

Run:

```bash
cd backend && PYTHONPATH=. pytest tests/test_observation_routes.py::test_put_and_get_oxygen_updates_checklist -v
```

Expected: FAIL with `422` for unknown enum value or missing checklist item.

- [ ] **Step 5: Implement oxygen enum, validation, and checklist**

Modify `backend/app/models/observation.py`:

```python
class ObservationType(StrEnum):
    WEIGHT = "weight"
    PULSE = "pulse"
    BP = "bp"
    WALK_DISTANCE = "walk_distance"
    WALK_TIME = "walk_time"
    WALK_STOPS = "walk_stops"
    SONGS = "songs"
    NYHA = "nyha"
    OXYGEN = "oxygen"
    SYMPTOMS = "symptoms"
    NOTES = "notes"
```

Modify `backend/app/services/observation_service.py` integer observation set:

```python
        if observation_type in {
            ObservationType.PULSE,
            ObservationType.WALK_DISTANCE,
            ObservationType.WALK_TIME,
            ObservationType.WALK_STOPS,
            ObservationType.SONGS,
            ObservationType.NYHA,
            ObservationType.OXYGEN,
        }:
```

Add oxygen to the `ranges` dict:

```python
                ObservationType.OXYGEN: (
                    50,
                    100,
                    "Oxygen must be between 50 and 100 percent",
                ),
```

Modify `backend/app/routers/observations.py` `CHECKLIST`:

```python
CHECKLIST = [
    (ObservationType.WEIGHT, "Weight"),
    (ObservationType.PULSE, "Pulse"),
    (ObservationType.BP, "Blood Pressure"),
    (ObservationType.OXYGEN, "Oxygen"),
    (ObservationType.WALK_DISTANCE, "Walk"),
    (ObservationType.SONGS, "Guitar"),
    (ObservationType.NYHA, "NYHA"),
    (ObservationType.SYMPTOMS, "Symptoms"),
    (ObservationType.NOTES, "Notes"),
]
```

- [ ] **Step 6: Document oxygen in the data model**

Modify `docs/data-model.md` observation type table by adding oxygen after pulse:

```markdown
| `oxygen` | integer string | `"97"` | — |
```

Modify validation rules by adding oxygen after pulse:

```markdown
| `oxygen` | Integer, 50–100 |
```

- [ ] **Step 7: Run backend oxygen tests**

Run:

```bash
cd backend && PYTHONPATH=. pytest tests/test_observation_service.py tests/test_observation_routes.py -v
```

Expected: PASS.

- [ ] **Step 8: Run backend lint for changed files**

Run:

```bash
cd backend && ruff check app/models/observation.py app/services/observation_service.py app/routers/observations.py tests/test_observation_service.py tests/test_observation_routes.py
```

Expected: PASS.

- [ ] **Step 9: Commit backend oxygen**

Run:

```bash
git add backend/app/models/observation.py backend/app/services/observation_service.py backend/app/routers/observations.py backend/tests/test_observation_service.py backend/tests/test_observation_routes.py docs/data-model.md
git commit -m "Add oxygen observations"
```

---

### Task 2: Add Readings Entry Page

**Files:**
- Modify: `frontend/src/api/observations.ts`
- Create: `frontend/src/components/inputs/OxygenInput.tsx`
- Modify: `frontend/src/pages/Daily.tsx`
- Modify: `frontend/src/pages/Daily.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: backend `ObservationType.OXYGEN = "oxygen"` and existing `/api/observations/{day}/{type}` route.
- Produces: user-facing `Add Readings` entry page with date picker and oxygen input.
- Later tasks consume: `/import` route will be added alongside this navigation pattern.

- [ ] **Step 1: Write failing App nav label test**

Modify `frontend/src/App.test.tsx`.

Change the Daily mock to:

```typescript
vi.mock('./pages/Daily', () => ({
  Daily: () => <main><h1>Add Readings route</h1></main>,
}))
```

Replace `renders daily observations at /` with:

```typescript
  it('renders add readings at /', () => {
    window.history.replaceState(null, '', '/')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Add Readings route' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add Readings' })).toHaveAttribute('aria-current', 'page')
  })
```

Add:

```typescript
  it('shows an Add Readings navigation link', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('link', { name: 'Add Readings' })).toHaveAttribute('href', '/')
  })
```

- [ ] **Step 2: Run App tests to verify failure**

Run:

```bash
cd frontend && npm test -- src/App.test.tsx
```

Expected: FAIL because nav still says `Today`.

- [ ] **Step 3: Write failing Daily page tests**

Modify `frontend/src/pages/Daily.test.tsx`.

In `mockDailyFetch`, add oxygen observation and checklist item:

```typescript
        oxygen: { type: 'oxygen', value: '97', metadata: null, updated_at: '2026-07-19T08:00:00Z' },
```

```typescript
        { type: 'oxygen', label: 'Oxygen', recorded: true },
```

Update the first test name and expectations:

```typescript
  it('renders the add readings form with a date picker and oxygen input', async () => {
    mockDailyFetch()

    render(<Daily />)

    expect(await screen.findByRole('heading', { name: 'Add Readings' })).toHaveClass('page-title')
    expect(screen.getByText("Record Simon's readings for the selected date. Each field saves automatically.")).toBeInTheDocument()
    expect(screen.getByLabelText('Reading date')).toHaveAttribute('type', 'date')
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/')
    expect(screen.getByLabelText('Oxygen (%)')).toHaveValue('97')
  })
```

Add date navigation test:

```typescript
  it('navigates when the reading date changes', async () => {
    mockDailyFetch()
    window.history.replaceState(null, '', '/')

    render(<Daily />)

    const dateInput = await screen.findByLabelText('Reading date')
    fireEvent.change(dateInput, { target: { value: '2026-07-10' } })

    expect(window.location.pathname).toBe('/2026-07-10')
  })
```

Add oxygen save test:

```typescript
  it('saves oxygen readings', async () => {
    const fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/oxygen')) {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          date: '2026-07-20',
          observations: {
            oxygen: { type: 'oxygen', value: '97', metadata: null, updated_at: '2026-07-20T08:00:00Z' },
          },
          checklist: [],
        }),
      })
    })
    vi.stubGlobal('fetch', fetch)
    window.history.replaceState(null, '', '/2026-07-20')

    render(<Daily />)

    const oxygen = await screen.findByLabelText('Oxygen (%)')
    fireEvent.change(oxygen, { target: { value: '98' } })
    fireEvent.blur(oxygen)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/observations/2026-07-20/oxygen',
        expect.objectContaining({ body: JSON.stringify({ value: '98', metadata: null }) }),
      )
    })
  })
```

- [ ] **Step 4: Run Daily tests to verify failure**

Run:

```bash
cd frontend && npm test -- src/pages/Daily.test.tsx
```

Expected: FAIL because copy/date picker/oxygen are missing.

- [ ] **Step 5: Add frontend oxygen type and input component**

Modify `frontend/src/api/observations.ts`:

```typescript
export type ObservationType =
  | 'weight'
  | 'pulse'
  | 'bp'
  | 'oxygen'
  | 'walk_distance'
  | 'walk_time'
  | 'walk_stops'
  | 'songs'
  | 'nyha'
  | 'symptoms'
  | 'notes'
```

Create `frontend/src/components/inputs/OxygenInput.tsx`:

```typescript
import { Field } from '../ui/PageShell'
import type { SaveState } from './SaveStatus'
import { SaveStatus } from './SaveStatus'

export function OxygenInput({ value, onChange, onBlur, saveState }: { value: string; onChange: (value: string) => void; onBlur: () => void; saveState: SaveState }) {
  return (
    <Field label="Oxygen (%)">
      <input className="input-control" value={value} inputMode="numeric" onChange={(event) => onChange(event.target.value)} onBlur={onBlur} />
      <SaveStatus state={saveState} />
    </Field>
  )
}
```

- [ ] **Step 6: Update Daily page date/copy/oxygen UI**

Modify imports in `frontend/src/pages/Daily.tsx`:

```typescript
import { OxygenInput } from '../components/inputs/OxygenInput'
```

Add helper near `routeDate`:

```typescript
function navigateToDate(value: string) {
  if (value === todayIso()) {
    window.history.pushState(null, '', '/')
  } else {
    window.history.pushState(null, '', `/${value}`)
  }
  window.dispatchEvent(new PopStateEvent('popstate'))
}
```

Add state to force rerender when navigating by date input:

```typescript
  const [pathDate, setPathDate] = useState(routeDate())
```

Replace `const date = routeDate()` with:

```typescript
  const date = pathDate
```

Add this effect after state declarations:

```typescript
  useEffect(() => {
    function updatePathDate() {
      setPathDate(routeDate())
    }
    window.addEventListener('popstate', updatePathDate)
    return () => window.removeEventListener('popstate', updatePathDate)
  }, [])
```

Replace historical banner and header with:

```tsx
      {historical ? <aside className="status-banner border-blue-200 bg-blue-50 text-blue-950">You are adding readings for {date}. <a href="/">Today</a></aside> : null}
      <PageHeader kicker="Readings" title="Add Readings">
        <p>Record Simon's readings for the selected date. Each field saves automatically.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="field-label">
            Reading date
            <input
              className="input-control mt-1"
              type="date"
              value={date}
              onChange={(event) => navigateToDate(event.target.value)}
            />
          </label>
          <a className="btn-secondary self-start sm:self-auto" href="/">Today</a>
        </div>
      </PageHeader>
```

Add oxygen input inside the `Vitals` section after pulse:

```tsx
        <div className="mt-5 grid gap-5 scroll-mt-6" id="section-oxygen">
          <OxygenInput value={stringValue(values.oxygen)} onChange={(value) => setValues((current) => ({ ...current, oxygen: value }))} onBlur={() => saveNonBlank('oxygen', stringValue(values.oxygen))} saveState={saveStates.oxygen ?? 'idle'} />
        </div>
```

- [ ] **Step 7: Update App nav label**

Modify `frontend/src/App.tsx` nav item:

```typescript
    { href: '/', label: 'Add Readings', active: !showDashboard && !showCharts && !showDoctor && !showTargets },
```

- [ ] **Step 8: Run frontend tests for Add Readings**

Run:

```bash
cd frontend && npm test -- src/App.test.tsx src/pages/Daily.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Run frontend lint/typecheck**

Run:

```bash
cd frontend && npm run lint && npm run typecheck
```

Expected: PASS, allowing the existing `PageShell.tsx` Fast Refresh warning if still present.

- [ ] **Step 10: Commit Add Readings frontend**

Run:

```bash
git add frontend/src/api/observations.ts frontend/src/components/inputs/OxygenInput.tsx frontend/src/pages/Daily.tsx frontend/src/pages/Daily.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "Rename entry flow to add readings"
```

---

### Task 3: Backend Observation Import API

**Files:**
- Create: `backend/app/schemas/imports.py`
- Create: `backend/app/services/observation_import_service.py`
- Create: `backend/app/routers/imports.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_observation_import_service.py`
- Create: `backend/tests/test_import_routes.py`

**Interfaces:**
- Consumes: `ObservationType.OXYGEN`, `ObservationService.upsert`, and `ObservationService._serialize_value` validation behavior via service use.
- Produces: `ObservationImportService.preview(user, text)` and `ObservationImportService.apply(user, items)`.
- Produces protected endpoints `POST /api/import/observations/preview` and `POST /api/import/observations/apply`.
- Later frontend task consumes response fields exactly: `rows`, `items`, `summary`, `status`, `conflict`, `error`, `existing_value`, `incoming_value`, `overwrite`.

- [ ] **Step 1: Write failing import service tests**

Create `backend/tests/test_observation_import_service.py`:

```python
from datetime import date

from app.models.observation import ObservationType
from app.models.user import User
from app.services.observation_import_service import ObservationImportService
from app.services.observation_service import ObservationService
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool


SAMPLE_TSV = """Date\tColumn 3\tColumn 2\tResting Pulse\tBP\tWalk distance\tWalk Time\tStops\tSongs\tNYHA\tNotes\tColumn 1
28/06/2026\t\t80.9\t71\t134/68\t325\t14\t1\t6\t4\tWalked around house and had bath.\tOxygen 97
09/07/2026\tth\t75.7\t90\t113/65\t\t\t\t\t3.5\tnurse again 58 heart rate.\t99
"""


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


def item_by_type(preview, day: str, observation_type: str):
    return next(
        item
        for item in preview.items
        if item.date == day and item.type == observation_type
    )


def test_preview_maps_mums_tsv_and_flags_invalid_nyha():
    with make_session() as session:
        user = make_user(session)

        preview = ObservationImportService(session).preview(user=user, text=SAMPLE_TSV)

        assert preview.summary.total_rows == 2
        assert item_by_type(preview, "2026-06-28", "weight").incoming_value == "80.9"
        assert item_by_type(preview, "2026-06-28", "pulse").incoming_value == "71"
        assert item_by_type(preview, "2026-06-28", "bp").incoming_value == "134/68"
        assert item_by_type(preview, "2026-06-28", "walk_distance").incoming_value == "325"
        assert item_by_type(preview, "2026-06-28", "walk_time").incoming_value == "840"
        assert item_by_type(preview, "2026-06-28", "walk_stops").incoming_value == "1"
        assert item_by_type(preview, "2026-06-28", "songs").incoming_value == "6"
        assert item_by_type(preview, "2026-06-28", "nyha").incoming_value == "4"
        assert item_by_type(preview, "2026-06-28", "oxygen").incoming_value == "97"
        assert item_by_type(preview, "2026-07-09", "nyha").status == "error"
        assert item_by_type(preview, "2026-07-09", "nyha").error == "NYHA class must be between 1 and 4"


def test_preview_detects_conflicts_and_apply_skips_by_default():
    with make_session() as session:
        user = make_user(session)
        ObservationService(session).upsert(user, date(2026, 6, 28), ObservationType.WEIGHT, "81.0")

        service = ObservationImportService(session)
        preview = service.preview(user=user, text=SAMPLE_TSV)
        conflict = item_by_type(preview, "2026-06-28", "weight")

        assert conflict.status == "conflict"
        assert conflict.existing_value == "81"
        assert conflict.incoming_value == "80.9"

        result = service.apply(user=user, items=preview.items)
        observations = ObservationService(session).get_for_date(user, date(2026, 6, 28))

        assert result.summary.imported > 0
        assert result.summary.skipped >= 1
        assert observations[ObservationType.WEIGHT].value == "81"
        assert observations[ObservationType.OXYGEN].value == "97"


def test_apply_overwrites_selected_conflict_only():
    with make_session() as session:
        user = make_user(session)
        ObservationService(session).upsert(user, date(2026, 6, 28), ObservationType.WEIGHT, "81.0")

        service = ObservationImportService(session)
        preview = service.preview(user=user, text=SAMPLE_TSV)
        items = [item.model_copy(update={"overwrite": item.type == "weight"}) for item in preview.items]

        result = service.apply(user=user, items=items)
        observations = ObservationService(session).get_for_date(user, date(2026, 6, 28))

        assert result.summary.imported > 0
        assert observations[ObservationType.WEIGHT].value == "80.9"
```

- [ ] **Step 2: Run import service tests to verify failure**

Run:

```bash
cd backend && PYTHONPATH=. pytest tests/test_observation_import_service.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.observation_import_service'`.

- [ ] **Step 3: Create import schemas**

Create `backend/app/schemas/imports.py`:

```python
from pydantic import BaseModel


class ImportPreviewRequest(BaseModel):
    text: str


class ImportSummary(BaseModel):
    total_rows: int = 0
    importable: int = 0
    conflicts: int = 0
    errors: int = 0
    skipped: int = 0
    imported: int = 0


class ImportItem(BaseModel):
    row: int
    date: str
    type: str
    label: str
    incoming_value: str
    existing_value: str | None = None
    status: str
    error: str | None = None
    overwrite: bool = False


class ImportApplyRequest(BaseModel):
    items: list[ImportItem]


class ImportRow(BaseModel):
    row: int
    date: str | None
    status: str
    message: str | None = None


class ImportPreviewResponse(BaseModel):
    rows: list[ImportRow]
    items: list[ImportItem]
    summary: ImportSummary


class ImportApplyResponse(BaseModel):
    items: list[ImportItem]
    summary: ImportSummary
```

- [ ] **Step 4: Implement import service**

Create `backend/app/services/observation_import_service.py`:

```python
import csv
import re
from datetime import date
from io import StringIO

from sqlmodel import Session

from app.models.observation import ObservationType
from app.models.user import User
from app.schemas.imports import ImportItem, ImportPreviewResponse, ImportRow, ImportSummary, ImportApplyResponse
from app.services.observation_service import ObservationService, ValidationError

COLUMN_MAP = {
    "Column 2": (ObservationType.WEIGHT, "Weight"),
    "Resting Pulse": (ObservationType.PULSE, "Pulse"),
    "BP": (ObservationType.BP, "Blood pressure"),
    "Walk distance": (ObservationType.WALK_DISTANCE, "Walk distance"),
    "Walk Time": (ObservationType.WALK_TIME, "Walk time"),
    "Stops": (ObservationType.WALK_STOPS, "Stops"),
    "Songs": (ObservationType.SONGS, "Songs"),
    "NYHA": (ObservationType.NYHA, "NYHA"),
    "Notes": (ObservationType.NOTES, "Notes"),
    "Column 1": (ObservationType.OXYGEN, "Oxygen"),
}


class ObservationImportService:
    def __init__(self, session: Session):
        self.session = session
        self.observations = ObservationService(session)

    def preview(self, user: User, text: str) -> ImportPreviewResponse:
        rows: list[ImportRow] = []
        items: list[ImportItem] = []
        reader = csv.DictReader(StringIO(text.strip()), delimiter="\t")
        for row_number, row in enumerate(reader, start=2):
            day = self._parse_date(row.get("Date", ""))
            if day is None:
                rows.append(ImportRow(row=row_number, date=None, status="error", message="Invalid date"))
                continue
            rows.append(ImportRow(row=row_number, date=day.isoformat(), status="ok"))
            existing = self.observations.get_for_date(user, day)
            for column, (observation_type, label) in COLUMN_MAP.items():
                raw = (row.get(column) or "").strip()
                if raw == "":
                    continue
                incoming = self._normalize_value(observation_type, raw)
                item = ImportItem(
                    row=row_number,
                    date=day.isoformat(),
                    type=observation_type.value,
                    label=label,
                    incoming_value=incoming,
                    status="ready",
                )
                try:
                    self.observations._serialize_value(observation_type, incoming)
                except ValidationError as exc:
                    items.append(item.model_copy(update={"status": "error", "error": str(exc)}))
                    continue
                if observation_type in existing:
                    items.append(item.model_copy(update={"status": "conflict", "existing_value": existing[observation_type].value}))
                else:
                    items.append(item)
        return ImportPreviewResponse(rows=rows, items=items, summary=self._summary(rows, items))

    def apply(self, user: User, items: list[ImportItem]) -> ImportApplyResponse:
        result_items: list[ImportItem] = []
        for item in items:
            if item.status == "error":
                result_items.append(item)
                continue
            observation_type = ObservationType(item.type)
            day = date.fromisoformat(item.date)
            existing = self.observations.get_for_date(user, day)
            if observation_type in existing and not item.overwrite:
                result_items.append(item.model_copy(update={"status": "skipped", "existing_value": existing[observation_type].value}))
                continue
            try:
                self.observations.upsert(user, day, observation_type, item.incoming_value)
            except ValidationError as exc:
                result_items.append(item.model_copy(update={"status": "error", "error": str(exc)}))
                continue
            result_items.append(item.model_copy(update={"status": "imported"}))
        return ImportApplyResponse(items=result_items, summary=self._summary([], result_items))

    def _parse_date(self, value: str) -> date | None:
        try:
            day, month, year = value.strip().split("/")
            return date(int(year), int(month), int(day))
        except (TypeError, ValueError):
            return None

    def _normalize_value(self, observation_type: ObservationType, value: str) -> str:
        if observation_type == ObservationType.OXYGEN:
            match = re.search(r"\d+", value)
            return match.group(0) if match else value
        if observation_type == ObservationType.WALK_TIME:
            minutes = float(value)
            return str(round(minutes * 60))
        return value

    def _summary(self, rows: list[ImportRow], items: list[ImportItem]) -> ImportSummary:
        return ImportSummary(
            total_rows=len(rows),
            importable=sum(1 for item in items if item.status == "ready"),
            conflicts=sum(1 for item in items if item.status == "conflict"),
            errors=sum(1 for item in items if item.status == "error"),
            skipped=sum(1 for item in items if item.status == "skipped"),
            imported=sum(1 for item in items if item.status == "imported"),
        )
```

- [ ] **Step 5: Run import service tests**

Run:

```bash
cd backend && PYTHONPATH=. pytest tests/test_observation_import_service.py -v
```

Expected: PASS.

- [ ] **Step 6: Write failing import route tests**

Create `backend/tests/test_import_routes.py`:

```python
from app.database import get_session
from app.main import app
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


def test_import_preview_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.post("/api/import/observations/preview", json={"text": "Date\n"})
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_import_preview_returns_rows_and_items():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.post(
                "/api/import/observations/preview",
                headers=headers,
                json={"text": "Date\tColumn 2\tColumn 1\n28/06/2026\t80.9\t97\n"},
            )
            assert response.status_code == 200
            assert response.json()["summary"]["total_rows"] == 1
            assert {item["type"] for item in response.json()["items"]} == {"weight", "oxygen"}
        finally:
            clear_overrides()
```

- [ ] **Step 7: Run import route tests to verify failure**

Run:

```bash
cd backend && PYTHONPATH=. pytest tests/test_import_routes.py -v
```

Expected: FAIL with `404 Not Found`.

- [ ] **Step 8: Add import router and register it**

Create `backend/app/routers/imports.py`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.imports import ImportApplyRequest, ImportApplyResponse, ImportPreviewRequest, ImportPreviewResponse
from app.services.observation_import_service import ObservationImportService

router = APIRouter(prefix="/api/import/observations", tags=["import"])


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    request: ImportPreviewRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ImportPreviewResponse:
    return ObservationImportService(session).preview(user=user, text=request.text)


@router.post("/apply", response_model=ImportApplyResponse)
async def apply_import(
    request: ImportApplyRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ImportApplyResponse:
    return ObservationImportService(session).apply(user=user, items=request.items)
```

Modify `backend/app/main.py` imports:

```python
from app.routers.imports import router as imports_router
```

Include router after observations:

```python
app.include_router(imports_router)
```

- [ ] **Step 9: Run backend import tests**

Run:

```bash
cd backend && PYTHONPATH=. pytest tests/test_observation_import_service.py tests/test_import_routes.py -v
```

Expected: PASS.

- [ ] **Step 10: Run backend lint for import files**

Run:

```bash
cd backend && ruff check app/schemas/imports.py app/services/observation_import_service.py app/routers/imports.py app/main.py tests/test_observation_import_service.py tests/test_import_routes.py
```

Expected: PASS.

- [ ] **Step 11: Commit backend import API**

Run:

```bash
git add backend/app/schemas/imports.py backend/app/services/observation_import_service.py backend/app/routers/imports.py backend/app/main.py backend/tests/test_observation_import_service.py backend/tests/test_import_routes.py
git commit -m "Add readings import API"
```

---

### Task 4: Frontend Import Readings Page

**Files:**
- Create: `frontend/src/api/imports.ts`
- Create: `frontend/src/pages/ImportReadings.tsx`
- Create: `frontend/src/pages/ImportReadings.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `POST /api/import/observations/preview` and `POST /api/import/observations/apply` from Task 3.
- Produces: authenticated `/import` route and `Import Readings` nav link.

- [ ] **Step 1: Create import API wrapper**

Create `frontend/src/api/imports.ts`:

```typescript
import { handleUnauthorized } from './auth'

export type ImportSummary = {
  total_rows: number
  importable: number
  conflicts: number
  errors: number
  skipped: number
  imported: number
}

export type ImportItem = {
  row: number
  date: string
  type: string
  label: string
  incoming_value: string
  existing_value: string | null
  status: 'ready' | 'conflict' | 'error' | 'skipped' | 'imported'
  error: string | null
  overwrite: boolean
}

export type ImportRow = {
  row: number
  date: string | null
  status: string
  message: string | null
}

export type ImportPreviewResponse = {
  rows: ImportRow[]
  items: ImportItem[]
  summary: ImportSummary
}

export type ImportApplyResponse = {
  items: ImportItem[]
  summary: ImportSummary
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized()
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

export async function previewReadingsImport(accessToken: string, text: string): Promise<ImportPreviewResponse> {
  const response = await fetch('/api/import/observations/preview', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ text }),
  })
  return parseJson<ImportPreviewResponse>(response)
}

export async function applyReadingsImport(accessToken: string, items: ImportItem[]): Promise<ImportApplyResponse> {
  const response = await fetch('/api/import/observations/apply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ items }),
  })
  return parseJson<ImportApplyResponse>(response)
}
```

- [ ] **Step 2: Write failing ImportReadings tests**

Create `frontend/src/pages/ImportReadings.test.tsx`:

```typescript
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImportReadings } from './ImportReadings'

const preview = {
  rows: [{ row: 2, date: '2026-06-28', status: 'ok', message: null }],
  items: [
    { row: 2, date: '2026-06-28', type: 'weight', label: 'Weight', incoming_value: '80.9', existing_value: null, status: 'ready', error: null, overwrite: false },
    { row: 2, date: '2026-06-28', type: 'oxygen', label: 'Oxygen', incoming_value: '97', existing_value: '96', status: 'conflict', error: null, overwrite: false },
    { row: 3, date: '2026-07-09', type: 'nyha', label: 'NYHA', incoming_value: '3.5', existing_value: null, status: 'error', error: 'NYHA class must be between 1 and 4', overwrite: false },
  ],
  summary: { total_rows: 2, importable: 1, conflicts: 1, errors: 1, skipped: 0, imported: 0 },
}

describe('ImportReadings', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('previews pasted readings and shows conflicts and errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => preview })
    vi.stubGlobal('fetch', fetchMock)

    render(<ImportReadings accessToken="token" />)
    fireEvent.change(screen.getByLabelText('Paste readings'), { target: { value: 'Date\tColumn 2\n28/06/2026\t80.9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))

    expect(await screen.findByText('2026-06-28')).toBeInTheDocument()
    expect(screen.getByText('Weight')).toBeInTheDocument()
    expect(screen.getByText('80.9')).toBeInTheDocument()
    expect(screen.getByText('Conflict: existing 96')).toBeInTheDocument()
    expect(screen.getByText('NYHA class must be between 1 and 4')).toBeInTheDocument()
  })

  it('applies selected overwrite decisions', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => preview })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [], summary: { total_rows: 0, importable: 0, conflicts: 0, errors: 0, skipped: 1, imported: 1 } }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<ImportReadings accessToken="token" />)
    fireEvent.change(screen.getByLabelText('Paste readings'), { target: { value: 'Date\tColumn 2\n28/06/2026\t80.9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))
    fireEvent.click(await screen.findByLabelText('Overwrite Oxygen on 2026-06-28'))
    fireEvent.click(screen.getByRole('button', { name: 'Import readings' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('/api/import/observations/apply', expect.objectContaining({
        body: expect.stringContaining('"overwrite":true'),
      }))
    })
    expect(await screen.findByText('Imported 1 readings. Skipped 1. Errors 0.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run ImportReadings tests to verify failure**

Run:

```bash
cd frontend && npm test -- src/pages/ImportReadings.test.tsx
```

Expected: FAIL with missing `ImportReadings` module.

- [ ] **Step 4: Implement ImportReadings page**

Create `frontend/src/pages/ImportReadings.tsx`:

```typescript
import { useState } from 'react'

import * as importsApi from '../api/imports'
import type { ImportApplyResponse, ImportItem, ImportPreviewResponse } from '../api/imports'
import { PageHeader, PageShell, SectionCard } from '../components/ui/PageShell'

export function ImportReadings({ accessToken }: { accessToken: string }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)
  const [result, setResult] = useState<ImportApplyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function previewImport() {
    try {
      setError(null)
      setResult(null)
      setPreview(await importsApi.previewReadingsImport(accessToken, text))
    } catch {
      setError('Could not preview import - please check the pasted text and try again.')
    }
  }

  async function applyImport() {
    if (!preview) return
    try {
      setError(null)
      setResult(await importsApi.applyReadingsImport(accessToken, preview.items))
    } catch {
      setError('Could not import readings - please try again.')
    }
  }

  function toggleOverwrite(item: ImportItem) {
    if (!preview) return
    setPreview({
      ...preview,
      items: preview.items.map((current) => (
        current.row === item.row && current.date === item.date && current.type === item.type
          ? { ...current, overwrite: !current.overwrite }
          : current
      )),
    })
  }

  return (
    <PageShell>
      <PageHeader kicker="Import" title="Import Readings">
        <p>Paste Mum's readings, preview them, then choose exactly what to import.</p>
      </PageHeader>
      <SectionCard>
        <label className="field-label" htmlFor="readings-import">Paste readings</label>
        <textarea id="readings-import" className="input-control mt-2 min-h-56 font-mono" value={text} onChange={(event) => setText(event.target.value)} />
        <button className="btn-primary mt-4" type="button" onClick={() => void previewImport()}>Preview import</button>
        {error ? <p className="mt-3 text-sm font-semibold text-amber-700">{error}</p> : null}
      </SectionCard>
      {preview ? (
        <SectionCard>
          <h2 className="section-title mb-4">Preview</h2>
          <p className="page-copy mb-4">{preview.summary.importable} ready. {preview.summary.conflicts} conflicts. {preview.summary.errors} errors.</p>
          <div className="grid gap-3">
            {preview.items.map((item) => (
              <div className="rounded-2xl border border-slate-200 bg-white p-4" key={`${item.row}-${item.date}-${item.type}`}>
                <p className="text-sm font-semibold text-slate-500">{item.date}</p>
                <p className="font-semibold text-slate-900">{item.label}</p>
                <p className="page-copy">{item.incoming_value}</p>
                {item.status === 'conflict' ? <p className="text-sm font-semibold text-amber-700">Conflict: existing {item.existing_value}</p> : null}
                {item.error ? <p className="text-sm font-semibold text-amber-700">{item.error}</p> : null}
                {item.status === 'conflict' ? (
                  <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={item.overwrite} onChange={() => toggleOverwrite(item)} />
                    Overwrite {item.label} on {item.date}
                  </label>
                ) : null}
              </div>
            ))}
          </div>
          <button className="btn-primary mt-5" type="button" onClick={() => void applyImport()}>Import readings</button>
        </SectionCard>
      ) : null}
      {result ? (
        <SectionCard>
          <p className="section-title">Imported {result.summary.imported} readings. Skipped {result.summary.skipped}. Errors {result.summary.errors}.</p>
        </SectionCard>
      ) : null}
    </PageShell>
  )
}
```

- [ ] **Step 5: Run ImportReadings tests**

Run:

```bash
cd frontend && npm test -- src/pages/ImportReadings.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Write failing App import route/nav tests**

Modify `frontend/src/App.test.tsx`.

Add mock:

```typescript
vi.mock('./pages/ImportReadings', () => ({
  ImportReadings: () => <main><h1>Import Readings route</h1></main>,
}))
```

Add tests:

```typescript
  it('renders import readings at /import', () => {
    window.history.replaceState(null, '', '/import')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Import Readings route' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Import Readings' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows an Import Readings navigation link', () => {
    window.history.replaceState(null, '', '/dashboard')

    render(<App />)

    expect(screen.getByRole('link', { name: 'Import Readings' })).toHaveAttribute('href', '/import')
  })
```

- [ ] **Step 7: Run App tests to verify failure**

Run:

```bash
cd frontend && npm test -- src/App.test.tsx
```

Expected: FAIL because `/import` route/nav is not wired.

- [ ] **Step 8: Wire import route and nav**

Modify `frontend/src/App.tsx` imports:

```typescript
import { ImportReadings } from './pages/ImportReadings'
```

Add route flag:

```typescript
  const showImport = pathname === '/import'
```

Update `navItems`:

```typescript
    { href: '/', label: 'Add Readings', active: !showDashboard && !showCharts && !showDoctor && !showTargets && !showImport },
    { href: '/import', label: 'Import Readings', active: showImport },
```

Render route:

```tsx
      {showImport ? <ImportReadings accessToken={auth.accessToken ?? ''} /> : null}
      {!showDashboard && !showCharts && !showDoctor && !showTargets && !showImport ? <Daily /> : null}
```

- [ ] **Step 9: Run frontend import/App tests**

Run:

```bash
cd frontend && npm test -- src/App.test.tsx src/pages/ImportReadings.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Run frontend verification**

Run:

```bash
cd frontend && npm test && npm run lint && npm run typecheck && npm run build
```

Expected: PASS, allowing the existing `PageShell.tsx` Fast Refresh warning and Vite chunk warning if still present.

- [ ] **Step 11: Commit frontend import page**

Run:

```bash
git add frontend/src/api/imports.ts frontend/src/pages/ImportReadings.tsx frontend/src/pages/ImportReadings.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "Add import readings page"
```

---

### Task 5: Full Verification And Review Prep

**Files:**
- Modify only if verification reveals a small defect in files touched by Tasks 1-4.

**Interfaces:**
- Consumes: all prior task commits.
- Produces: verified branch ready for final code review.

- [ ] **Step 1: Run full Docker-backed verification**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose build backend frontend && just check
```

Expected: PASS. Existing acceptable warnings: frontend Fast Refresh warning in `PageShell.tsx`, Vite chunk-size warning, backend third-party deprecation warnings.

- [ ] **Step 2: Fix any verification failures with TDD**

If a failure appears, write or update a focused failing test first, verify red, apply the smallest fix, verify green, then rerun Step 1.

- [ ] **Step 3: Check git status and log**

Run:

```bash
git status --short
git log --oneline -12
```

Expected: clean worktree except ignored `.superpowers/sdd/*` scratch files, and recent commits matching this plan.

- [ ] **Step 4: Final commit only if Step 2 created fixes**

If Step 2 created fixes, commit them:

```bash
git add <only-fixed-files>
git commit -m "Fix import readings verification issues"
```

If Step 2 made no changes, do not create an empty commit.
