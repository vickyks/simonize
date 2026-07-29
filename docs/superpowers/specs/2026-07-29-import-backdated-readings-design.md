# Import And Backdated Readings Design

## Goal

Make it fast and safe to enter Mum's paper/spreadsheet readings for older dates.

This slice has two high-priority outcomes:

- Rename and reshape the existing daily entry flow into an `Add Readings` flow with an obvious date picker.
- Add a paste-based CSV/TSV import with preview and conflict handling.

It also adds oxygen saturation as a first-class observation because Mum's source data contains oxygen values and Simon's recovery tracking benefits from storing them as observations rather than burying them in notes.

## Scope

In scope:

- Rename the user-facing `Daily` navigation/page language to `Add Readings`.
- Add a visible date picker and `Today` shortcut to the readings entry page.
- Preserve direct date URLs such as `/2026-07-13`.
- Add `oxygen` as an observation type.
- Add oxygen entry on the `Add Readings` page.
- Add paste-based import for Mum's current tab-separated spreadsheet format.
- Preview imports before writing anything.
- Detect conflicts with existing observations.
- Let the user choose which conflicts to overwrite before applying import.

Out of scope:

- File upload.
- A full spreadsheet-style editor.
- Chart target lines or oxygen charts.
- Dashboard oxygen cards unless requested separately.
- Storing import batches or audit records.
- Supporting arbitrary CSV column mapping UI.

## Product Flow

### Add Readings Page

The current Daily page becomes `Add Readings` in navigation and page copy.

The page remains the single observation entry screen, but it is now date-first:

- A date input appears near the page header.
- A `Today` shortcut returns to today's date.
- Changing the date navigates to that date's entry view and loads readings for that date.
- Direct URLs like `/2026-07-13` continue to work.
- Historical dates show calm context copy, not a warning, because backdating is expected.
- Auto-save behavior stays unchanged: each field saves when changed or blurred according to existing input behavior.

Suggested copy:

- Navigation label: `Add Readings`.
- Page title: `Add Readings`.
- Header copy: `Record Simon's readings for the selected date. Each field saves automatically.`

### Import Readings Flow

Add an authenticated `/import` page reachable from navigation, labelled `Import Readings`.

The first version uses a paste box, not file upload:

1. User pastes Mum's tab-separated spreadsheet text.
2. User clicks `Preview import`.
3. The app parses and validates rows without writing anything.
4. Preview groups readings by date and shows importable values, blanks skipped, validation errors, and conflicts.
5. Existing observations are skipped by default.
6. User can mark individual conflicting observations for overwrite.
7. User clicks `Import readings`.
8. The app applies only approved import items and returns a concise result.

The preview must make it hard to overwrite existing data accidentally. Import is explicit and never happens on paste alone.

## Data Model

### Oxygen Observation

Add `oxygen` to `ObservationType`.

Store oxygen as an integer string representing SpO2 percentage.

Validation:

- Integer only.
- Range `50` to `100`.
- Invalid stored oxygen values are skipped by view-model services if encountered later.

Oxygen should appear on `Add Readings` as a normal input. It does not need to appear on dashboard, charts, or doctor summary in this slice unless implementation discovers those response models require a harmless null-compatible field.

### CSV/TSV Mapping

The importer supports Mum's current tab-separated format.

Source columns:

| Source column | Target |
| --- | --- |
| `Date` | Observation date |
| `Column 2` | `weight` |
| `Resting Pulse` | `pulse` |
| `BP` | `bp` |
| `Walk distance` | `walk_distance` |
| `Walk Time` | walk time |
| `Stops` | walk stops |
| `Songs` | `songs` |
| `NYHA` | `nyha` |
| `Notes` | `notes` |
| `Column 1` | `oxygen` |

Ignored source columns:

- `Column 3`.

Date parsing:

- Accept `DD/MM/YYYY` from Mum's sheet.
- Convert to ISO `YYYY-MM-DD` internally.
- Invalid dates make the row invalid but do not block other rows.

Oxygen parsing:

- Accept plain values like `97`.
- Accept prefixed values like `Oxygen 97`.
- Store only the numeric percentage.

Walk time parsing:

- Treat plain numeric values as minutes because the current UI displays minutes while the backend stores seconds.
- Convert minutes to seconds before saving.
- Blank values are skipped.

NYHA parsing:

- Existing app validation allows integer classes `1` to `4` only.
- Values such as `3.5` are validation errors for `nyha` and are not imported.
- Other valid fields in the same row can still be imported.

Blank cells:

- Blank cells are skipped.
- Skipped blanks do not overwrite existing observations.

## Backend Design

Keep API routes thin. Business logic lives in services.

Add `ObservationImportService` with two responsibilities:

1. Preview pasted data.
2. Apply approved import items.

Suggested public methods:

- `preview(user: User, text: str) -> ObservationImportPreview`.
- `apply(user: User, items: list[ObservationImportApplyItem]) -> ObservationImportResult`.

Preview behavior:

- Parse TSV text using Python's CSV support with tab delimiter.
- Normalize known column names exactly as listed above.
- Build candidate observations for non-blank cells.
- Validate candidates using the same rules as `ObservationService`.
- Check existing observations for `(user_id, date, type)` conflicts.
- Return row-level and item-level status without writing to the database.

Apply behavior:

- Revalidate each requested import item before writing.
- Skip conflicts unless the item explicitly says `overwrite: true`.
- Upsert approved items with `ObservationService`.
- Return counts and per-item statuses.

Protected API endpoints:

- `POST /api/import/observations/preview`
- `POST /api/import/observations/apply`

Request/response models should be purpose-built view models for the frontend. The frontend must not infer raw database state.

## Frontend Design

### Add Readings

Update the existing page rather than creating a duplicate entry form.

Changes:

- Rename route/nav/page copy from Daily/Today language to `Add Readings`.
- Add date input and `Today` shortcut.
- Add oxygen input.
- Preserve existing auto-save behavior.
- Preserve invalid date handling.

### Import Readings

Add a small `/import` page using the existing page shell/card language.

Preview should show:

- Date.
- Parsed field labels and values.
- Blank/skipped fields.
- Validation errors.
- Conflicts, including existing value and incoming value.
- Default conflict action: skip existing.

Conflict controls are per observation, not all-or-nothing for the whole import. A row with an existing weight and a new pulse can skip the weight conflict while importing the pulse.

Apply should show:

- Imported count.
- Skipped count.
- Error count.
- Any rows/items that still need attention.

The UI should be calm and practical, not alarming. This is a data-entry safety tool, not a clinical alert system.

## Error Handling

Backend:

- Unauthorized import requests return `401`.
- Malformed request bodies return `422`.
- Invalid CSV/TSV content returns a preview with row errors where possible rather than failing the whole import.
- Apply revalidates data and reports skipped/error items instead of partially hiding failures.

Frontend:

- Failed preview shows `Could not preview import - please check the pasted text and try again.`
- Failed apply shows `Could not import readings - please try again.`
- Unauthorized responses use the shared unauthorized handler.

## Testing Plan

Backend tests:

- Oxygen validation accepts `50` to `100` and rejects invalid values.
- Daily observations can save and retrieve oxygen.
- Import preview parses Mum's sample TSV format.
- Import preview maps `Column 2` to weight and `Column 1` to oxygen.
- Import preview flags `NYHA` value `3.5` without blocking other fields in that row.
- Import preview detects conflicts with existing observations.
- Import apply skips conflicts by default.
- Import apply overwrites conflicts only when requested.
- Import routes require authentication.

Frontend tests:

- Navigation shows `Add Readings` instead of Daily.
- Entry page date picker navigates to the selected date.
- `Today` shortcut returns to today's entry.
- Oxygen input saves through the observation API.
- Import page submits pasted text for preview.
- Preview displays parsed rows, validation errors, and conflicts.
- Apply request includes selected per-observation overwrite decisions.
- Import result displays imported/skipped/error counts.

## Acceptance Criteria

- Vicky can choose a date and enter readings for that date from the main entry page.
- The old direct date URLs still work.
- Oxygen can be entered, validated, stored, and reloaded.
- Vicky can paste Mum's current tab-separated spreadsheet text and preview it before importing.
- Blank cells do not overwrite existing readings.
- Existing readings are skipped by default and overwritten only when explicitly selected.
- Invalid values such as `NYHA = 3.5` are clearly shown and not imported as NYHA.
- Valid values in a row with one invalid field can still be imported.
- The implementation remains observation-first and does not store daily records or derived import summaries.
