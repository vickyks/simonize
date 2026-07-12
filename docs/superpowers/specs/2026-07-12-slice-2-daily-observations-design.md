# Slice 2 Daily Observations Design

## Goal

Build the daily observation layer so Simon can record today's recovery observations and edit historical days. The app remains observation-first: each metric is stored as an individual observation, and the daily page is a view over observations for one date.

Slice 2 answers: what did Simon record for this day, what is still missing, and did it save?

## Scope

Slice 2 implements:

- `observations` table scoped to the authenticated user.
- Generic observation read and upsert API.
- Per-type validation in `ObservationService`.
- Daily page at `/`, defaulting to today.
- Historical daily page at `/{date}`.
- Grouped daily form with autosave and checklist.
- No demo or seeded observations.

Slice 2 does not implement:

- Dashboard trends or advisory logic.
- Charts.
- Doctor summary.
- Targets or milestones.
- Multiple observations of the same type per day.
- Imports, fixtures, or production demo data.

## Backend Design

### Observation Model

Add `backend/app/models/observation.py` with a SQLModel table:

- `id`: UUID primary key.
- `user_id`: UUID foreign key to `users.id`, indexed.
- `date`: `date`, indexed.
- `type`: observation type enum value.
- `value`: text.
- `metadata`: optional JSON object.
- `created_at`: timezone-aware datetime.
- `updated_at`: timezone-aware datetime.

The MVP uniqueness rule is one observation per user, date, and type:

```sql
UNIQUE (user_id, date, type)
```

This preserves future support for multiple users and prevents one user's JWT from reading or overwriting another user's observations.

### Observation Types

Use an `ObservationType` enum with these values:

- `weight`
- `pulse`
- `bp`
- `walk_distance`
- `walk_time`
- `walk_stops`
- `songs`
- `nyha`
- `symptoms`
- `notes`

### Stored Values

Values are stored as strings so the table remains generic. `ObservationService` is responsible for parsing, validating, and serialising per type.

Validation rules:

| Type | Rule | Stored value |
|------|------|--------------|
| `weight` | Float, `30.0`-`300.0` | Decimal string, e.g. `"92.3"` |
| `pulse` | Integer, `30`-`250` | Integer string |
| `bp` | SYS `60`-`250`, DIA `40`-`150`, SYS > DIA | `"SYS/DIA"` |
| `walk_distance` | Integer, `0`-`50000` metres | Integer string |
| `walk_time` | Integer, `0`-`86400` seconds | Integer string |
| `walk_stops` | Integer, `0`-`100` | Integer string |
| `songs` | Integer, `0`-`100` | Integer string |
| `nyha` | Integer, `1`-`4` | Integer string |
| `symptoms` | Array of known symptom keys | JSON array string |
| `notes` | String, max `2000` chars | Plain text |

Valid symptom keys are the keys in `docs/data-model.md`: `breathless`, `chest_discomfort`, `palpitations`, `swollen_ankles`, `dizzy`, `very_tired`, `poor_sleep`, `poor_appetite`, and `good_day`.

If `good_day` is selected, no negative symptoms may be selected at the same time.

### Walk Storage

The frontend walk section edits distance, time, and stops together, but the API remains observation-based.

When saving a walk:

- `walk_distance` is saved as its own observation.
- `walk_time` is saved as its own observation.
- `walk_stops` is saved as its own observation.
- The `walk_distance` observation also stores `metadata: { "time_seconds": <walk_time>, "stops": <walk_stops> }` when those values are available.

Services that calculate walk progress in later slices should prefer `walk_distance.metadata` for time and stops, with the separate observations available as a direct daily-entry record.

### Service Interface

Add `ObservationService(session)` with:

- `get_for_date(user: User, day: date) -> DailyObservations`
- `upsert(user: User, day: date, observation_type: ObservationType, value: Any, metadata: dict | None = None) -> Observation`
- `upsert_walk(user: User, day: date, distance: int | None, time_seconds: int | None, stops: int | None) -> list[Observation]`

Business logic, validation, serialisation, and user scoping live in the service. Routers stay thin.

### API Routes

Add `backend/app/routers/observations.py`.

All routes require `current_user`.

#### `GET /api/observations/{date}`

Returns a daily view model for the authenticated user and requested date:

```json
{
  "date": "2026-06-27",
  "observations": {
    "weight": { "type": "weight", "value": "92.3", "metadata": null, "updated_at": "..." },
    "symptoms": { "type": "symptoms", "value": ["good_day"], "metadata": null, "updated_at": "..." }
  },
  "checklist": [
    { "type": "weight", "label": "Weight", "recorded": true },
    { "type": "songs", "label": "Guitar", "recorded": false }
  ]
}
```

The backend returns parsed frontend-friendly values for complex types:

- `symptoms` returns an array of strings.
- Other values return strings or numbers matching the input component needs.

#### `PUT /api/observations/{date}/{type}`

Upserts one observation for the authenticated user.

Request body:

```json
{
  "value": "92.3",
  "metadata": null
}
```

For walk, the frontend saves `walk_distance`, `walk_time`, and `walk_stops` through the same generic route. When saving `walk_distance`, it includes the current walk time and stops in metadata if present. No separate walk route is added in Slice 2.

Response body is the saved observation view model.

Validation failures return `422` with a clear message. Missing or invalid auth returns `401` through the existing auth dependency.

## Frontend Design

### Routes

- `/` renders the daily page for today.
- `/{date}` renders the daily page for that ISO date.

Invalid date paths render a friendly error with a link back to today. They do not call the API.

### Layout

Use grouped sections:

- **Vitals**: Weight, Pulse, Blood Pressure, NYHA.
- **Walk**: Distance, Time, Stops.
- **Guitar**: Songs played.
- **Symptoms**: checkbox grid.
- **Notes**: textarea.

The checklist appears above the form. Each checklist item reflects whether its corresponding observation exists for the current date. Checklist labels use Simon's context, so `songs` displays as `Guitar`.

Clicking a checklist item scrolls to its section.

### Historical Editing

When the current route date is not today, show the amber historical banner from `docs/ux.md`:

```text
You are editing Tuesday 24 June 2026
```

The banner includes a `Go to today` link to `/`.

### Inputs

Create focused input components under `frontend/src/components/inputs/`:

- `WeightInput`
- `PulseInput`
- `BloodPressureInput`
- `WalkInput`
- `SongsInput`
- `NyhaSelector`
- `SymptomsSelector`
- `NotesInput`

Inputs are controlled by the daily page state. Values entered by Simon remain visible even if autosave fails.

### Autosave

Autosave has no global Save button.

- Typed fields save on blur only.
- NYHA selection saves immediately.
- Symptom checkbox changes save immediately.
- Walk fields save through the generic observation API on blur. Saving distance also sends current walk time and stops as metadata when present.

Save feedback is local and unobtrusive:

- `Saving...`
- `Saved ✓`
- `Could not save - try again`

Successful save feedback fades or clears after a short delay. Error feedback stays visible until the next successful save for that field or section.

### Auth Handling

Observation API calls use the existing auth session behavior:

- Include bearer access token.
- Redirect to `/login` on `401`.
- Never use `localStorage` or `sessionStorage`.

## Error Handling

- Empty days are normal and show blank inputs plus an unchecked checklist.
- Validation errors show near the field or section that failed.
- Network errors keep the typed value in place and allow retry by blurring/changing again.
- A failed save must not mark the checklist item as recorded.
- A successful save updates the checklist from the backend response or a refetched daily view.

## Testing And Verification

Backend tests must cover:

- Observation table migration and model metadata import.
- `GET /api/observations/{date}` requires auth.
- `PUT /api/observations/{date}/{type}` requires auth.
- Creating each observation type.
- Updating an existing observation does not create duplicates.
- User scoping: one user cannot read or overwrite another user's observations.
- Validation failures for representative invalid values across numeric, BP, symptoms, and notes.
- Checklist state reflects actual saved observations.
- Historical date requests return observations for that date only.

Frontend verification must cover:

- ESLint.
- TypeScript.
- Production build.
- No `localStorage` or `sessionStorage` usage.

End-to-end smoke verification should:

1. Log in.
2. Open today's daily page.
3. Save representative observations: weight, BP, walk, guitar, NYHA, symptoms, notes.
4. Reload or refetch the same date and confirm values persist.
5. Open a historical date and confirm the banner appears.
6. Confirm there is no Save button on the daily page.

## Acceptance Criteria

- Every Slice 2 observation type can be entered and persisted.
- Navigating away and back shows saved values.
- Checklist reflects actual saved state.
- Historical date editing shows the banner.
- No Save button exists anywhere on the daily page.
- All observation routes are protected and scoped to `current_user`.
- No demo observations are seeded in production or development startup.

## Implementation Notes

There are no open product decisions for this slice. Implementation details may choose the simplest frontend state structure that satisfies the design and tests.
