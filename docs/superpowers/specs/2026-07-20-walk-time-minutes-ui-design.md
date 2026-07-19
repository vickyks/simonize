# Walk Time Minutes UI Design

## Context

The Daily walk form currently asks for `Time (seconds)`. That is not a sensible human-facing unit for walking. Simon should enter walk duration in minutes.

The backend and persisted observation model already store `walk_time` and `walk_distance.metadata.time_seconds` in seconds. Migrations are not needed for this change.

## Design

- Keep backend storage and API payloads unchanged: `walk_time` remains seconds, and walk distance metadata remains `time_seconds`.
- Change the Daily walk input label from `Time (seconds)` to `Time (minutes)`.
- When existing `walk_time` seconds are loaded into the Daily form, display whole minutes.
- When the Daily form saves walk time, convert entered minutes back to seconds for both the `walk_time` observation and `walk_distance.metadata.time_seconds`.
- Keep Doctor summaries unchanged because they already receive seconds and display them as minutes.

## Constraints

- No database migration.
- No backend API contract change.
- No change to existing validation rules.
- No Save button.
- Preserve auto-save behaviour.

## Testing

- Update Daily page/input tests to expect `Time (minutes)`.
- Add/adjust a Daily test proving minutes are converted to seconds in the saved API payload.
- Run frontend tests, typecheck, and build.
