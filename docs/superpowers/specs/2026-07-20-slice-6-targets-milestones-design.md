# Slice 6 Targets & Milestones Design

## Goal

Slice 6 gives Simon personal recovery targets and a calm, encouraging view of achievements. It answers the app's core question, "Is Simon getting better?", by showing progress against a few explicit goals and by noticing meaningful milestones from recorded observations.

The slice must stay personal and simple. It is not a generic gamification system, and milestones must feel like a friend noticing progress rather than a badge system.

## Scope

In scope:

- Persist editable targets for `walk_distance`, `songs`, and `nyha`.
- Add protected targets API endpoints.
- Calculate milestones from observations at query time.
- Add a `/targets` page for editing targets and viewing all achieved milestones.
- Extend `/dashboard` with target progress and the latest 3 milestones.

Out of scope:

- Arbitrary user-defined target types in the UI.
- Chart target lines.
- Storing achievements or milestone state.
- Gamified badges, points, levels, streak animations, or social sharing.
- Clinical interpretation or advice.

## Backend Design

### Target Model

Add a `targets` table with a user-scoped target per metric:

- `id`: UUID primary key.
- `user_id`: UUID foreign key to `users.id`.
- `type`: target type enum value.
- `value`: text value, validated per target type.
- `created_at`: timestamp.
- `updated_at`: timestamp.

Use a unique constraint on `(user_id, type)`.

Target types are limited to a backend enum for this slice:

- `walk_distance`
- `songs`
- `nyha`

The enum can be extended later, but the Slice 6 UI only exposes these three targets.

Default target values:

- `walk_distance`: `500`
- `songs`: `5`
- `nyha`: `2`

Defaults are created lazily for the current user when a targets or dashboard endpoint needs them. This avoids a separate startup seeding path and keeps targets user-scoped.

### Services

Add `TargetService` for target persistence and validation.

Responsibilities:

- Ensure the three default targets exist for a user.
- Return targets in a stable order: walk distance, songs, NYHA.
- Update one target by type.
- Validate values before writing.
- Scope every query and update by `current_user.id`.

Validation:

- `walk_distance`: integer `0` to `50000` metres.
- `songs`: integer `0` to `100`.
- `nyha`: integer `1` to `4`.
- Unknown target types return `422`.
- Invalid values return `422`.

Add `AchievementService` for derived milestones.

Responsibilities:

- Read observations for the current user.
- Skip invalid stored values rather than crashing.
- Calculate all milestones at request time.
- Return achieved milestones ordered newest first for display, with stable tie-breaking by milestone type.
- Store no derived achievement data.

### API Shape

Add protected endpoints:

- `GET /api/targets`
- `PUT /api/targets/{type}`

`GET /api/targets` returns the editable targets and all achieved milestones.

`PUT /api/targets/{type}` updates one target and returns the refreshed targets view model. The frontend will save all three fields by issuing one update per target that changed, then using the final refreshed response.

Example response shape:

```json
{
  "targets": [
    { "type": "walk_distance", "label": "Walk distance target", "value": 500, "unit": "m" },
    { "type": "songs", "label": "Guitar songs target", "value": 5, "unit": "songs" },
    { "type": "nyha", "label": "NYHA target", "value": 2, "unit": "class" }
  ],
  "milestones": [
    {
      "type": "longest_walk",
      "title": "Longest walk",
      "date": "2026-07-13",
      "message": "You walked 325 metres - your furthest yet.",
      "value": "325 m"
    }
  ]
}
```

Extend `GET /api/dashboard` with:

```json
{
  "targets": {
    "walk_distance": { "current": 325, "target": 500, "met": false, "label": "325 m of 500 m" },
    "songs": { "current": 3, "target": 5, "met": false, "label": "3 of 5 songs" },
    "nyha": { "current": 3, "target": 2, "met": false, "label": "Class 3, target Class 2" }
  },
  "milestones": [
    {
      "type": "longest_walk",
      "title": "Longest walk",
      "date": "2026-07-13",
      "message": "You walked 325 metres - your furthest yet.",
      "value": "325 m"
    }
  ]
}
```

Dashboard `milestones` contains only the latest 3 achieved milestones. Full detail lives on `/targets`.

## Achievement Rules

Milestones are calculated from observations only. Missing observations mean the milestone is not achieved yet. Invalid values are skipped.

### Best-Value Milestones

For best-value milestones, if the best value occurs multiple times, use the first date it was achieved.

- `longest_walk`: highest valid `walk_distance`; value formatted as metres.
- `most_songs`: highest valid `songs`; value formatted as songs.
- `lowest_resting_pulse`: lowest valid `pulse`; value formatted as bpm.

### Weight Stable Milestones

Weight stable milestones are achieved when the first and last valid weights within the period differ by no more than `1.0 kg`.

- `weight_stable_7_days`: uses the latest 7-day window with valid start and end weights.
- `weight_stable_30_days`: uses the latest 30-day window with valid start and end weights.

The achieved date is the end date of the qualifying period. The value is `7 days` or `30 days`.

### First-Time Milestones

- `first_nyha_iii`: first date with valid NYHA class `3`.
- `first_nyha_ii`: first date with valid NYHA class `2`.
- `first_symptom_free_day`: first date where a symptoms observation exists and is either an empty list or only `good_day`.

### Recording Milestones

- `one_hundred_observations`: achieved on the date of the 100th observation by `created_at` order.
- `thirty_consecutive_days`: achieved on the 30th consecutive calendar day with at least one observation.

## Target Progress Rules

Dashboard target progress is derived from today's values where possible.

- Walk progress compares today's `walk_distance` with the walk target.
- Songs progress compares today's `songs` with the songs target.
- NYHA progress uses today's NYHA when present; if today is missing, it uses the latest valid NYHA so the dashboard can still show current functional progress.
- NYHA target is met when current/latest NYHA is less than or equal to the target, because lower is better.
- Missing current values produce gentle copy rather than zero progress.

Example missing-value labels:

- Walk: `No walk recorded today yet - target 500 m`.
- Songs: `No guitar recorded today yet - target 5 songs`.
- NYHA: `No NYHA recorded yet - target Class 2`.

## Frontend Design

### `/targets` Page

Add authenticated route `/targets` and a `Targets` nav link.

The page title is `Targets & Milestones`.

Use the existing page shell/card styling introduced on recent frontend work. Do not introduce a separate visual system.

The page has two main sections:

1. Targets editor.
2. Milestones list.

Targets editor:

- `Walk distance target`, metres.
- `Guitar songs target`, songs.
- `NYHA target`, class 1 to 4.
- One `Save targets` button for the whole page.
- Local edits are kept in component state until saved.
- A successful save shows `Saved` feedback.
- A failed save keeps typed values visible and shows `Could not save targets - please try again.`

The milestones list shows all achieved milestones returned by the backend.

Each milestone displays:

- Title.
- Date achieved.
- Encouraging message.
- Supporting value where useful.

Empty state:

`Keep recording - milestones will appear here as Simon's recovery builds.`

### Dashboard Changes

Dashboard cards for walk, guitar, and NYHA gain target progress text:

- Walk: `325 m of 500 m`.
- Guitar: `3 of 5 songs`.
- NYHA: `Class 3, target Class 2`.

Add a compact `Milestones` card showing the latest 3 achieved milestones.

If no milestones are achieved yet, show:

`Keep recording - milestones will appear here as Simon's recovery builds.`

Charts target lines remain out of scope for Slice 6.

## Error Handling

Backend:

- Unauthorized requests return `401`.
- Unknown target types and invalid values return `422`.
- Invalid stored observation values are skipped during achievement calculation.
- Target defaults are created idempotently.

Frontend:

- If `/targets` fails to load, show `Could not load targets` and `Please try again.`
- If saving fails, keep typed values visible and show `Could not save targets - please try again.`
- If dashboard target or milestone fields are absent due a failed response, the normal dashboard load error path applies.

## Testing Plan

Backend tests:

- Target model migration/default creation.
- `TargetService` returns defaults in stable order.
- `TargetService` validates walk, songs, and NYHA values.
- Updates persist and are scoped to the current user.
- Route auth is required for targets endpoints.
- `GET /api/targets` returns defaults and achievements.
- `PUT /api/targets/{type}` persists updates and returns the refreshed view model.
- Invalid type/value returns `422`.
- `AchievementService` calculates each milestone correctly.
- `AchievementService` skips invalid observations.
- Dashboard response includes target progress and latest 3 milestones.

Frontend tests:

- App route/nav includes `/targets` and `Targets`.
- `/targets` loads and displays the three target fields.
- Editing all fields and clicking `Save targets` sends updates and shows saved feedback.
- Save failure displays the error without clearing typed values.
- Milestones render title, date, message, and value.
- Empty milestone state renders when no milestones exist.
- Dashboard renders target progress text and latest 3 milestones.

## Acceptance Criteria

- Targets can be updated and persist.
- Target values are user-scoped and validated.
- All Slice 6 milestones calculate correctly from real observation data.
- Dashboard shows target progress for walk, guitar, and NYHA.
- Dashboard shows latest 3 milestones.
- `/targets` shows editable targets and full milestone detail.
- Milestone language is encouraging and personal, not gamified.
- No derived milestones or progress values are stored.
