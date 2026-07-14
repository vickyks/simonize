# Slice 5 Doctor View Design

## Goal

Create a clean printable summary for medical appointments. The doctor view should show Simon's recent observations clearly enough to read on screen and in an A4 printout or PDF.

This slice includes compact charts and tabular detail. Charts make trends visible; tables make the report reliable and readable without interactive tooling.

## Scope

### In Scope

- Protected `GET /api/summary?days=7|30` endpoint.
- `SummaryService` that builds a doctor-view model from user-scoped observations.
- Doctor view page at `/doctor`.
- Period selector for `Last 7 days` and `Last 30 days`.
- Compact printable charts for vitals, activity, and NYHA.
- Tables/lists for all numeric data, symptoms, and notes.
- Print stylesheet for a professional A4 output.
- `Print / Save as PDF` button using `window.print()`.
- Authenticated navigation link to `Doctor`.

### Out of Scope

- Server-side PDF generation.
- Medication or appointment details.
- Clinical interpretation or diagnosis.
- Automatically attaching dashboard advisory status.
- Targets, milestones, and achievements from Slice 6.

## Backend Design

Add a protected summary route:

- `GET /api/summary?days=7`
- `GET /api/summary?days=30`

Missing `days` defaults to `7`. Invalid `days` returns `422`.

The route stays thin and delegates to `SummaryService`.

### Response Shape

```json
{
  "range": {
    "days": 30,
    "start_date": "2026-06-14",
    "end_date": "2026-07-13",
    "generated_at": "2026-07-13T10:30:00Z"
  },
  "vitals": {
    "weight": [{ "date": "2026-07-13", "value": 92.3 }],
    "pulse": [{ "date": "2026-07-13", "value": 71 }],
    "bp": [{ "date": "2026-07-13", "systolic": 121, "diastolic": 78 }]
  },
  "activity": {
    "walk": [{ "date": "2026-07-13", "distance": 325, "time_seconds": 840, "stops": 2 }],
    "songs": [{ "date": "2026-07-13", "value": 3 }]
  },
  "functional": {
    "nyha": [{ "date": "2026-07-13", "value": 3 }]
  },
  "symptoms": [
    { "date": "2026-07-13", "values": ["breathless"] }
  ],
  "notes": [
    { "date": "2026-07-13", "text": "Felt stronger today" }
  ]
}
```

### Data Rules

- `days` accepts only `7` or `30`.
- Finite ranges include observations from `today - (days - 1)` through today.
- Data is scoped to the authenticated user.
- Dates are returned as stored local date strings in `YYYY-MM-DD` format.
- Section arrays are ordered by date ascending.
- Missing observations are omitted rather than represented as zero.
- Invalid stored values are skipped rather than crashing the report.
- Walk entries use `walk_distance` as the primary observation and include `time_seconds` and `stops` from metadata when present.
- If walk metadata is missing, `SummaryService` uses same-day `walk_time` and `walk_stops` observations as fallbacks when they are present and valid.
- Symptoms are returned as stored symptom keys; the frontend maps keys to readable labels.
- Notes are returned as plain text with their observation date.
- No derived summary data is stored.

## Frontend Design

Add `frontend/src/api/summary.ts` for summary API types and fetcher. It handles `401` through the existing unauthorized handler and sends the in-memory access token as a bearer token.

Add a protected `/doctor` route rendered by a new `Doctor` page.

Authenticated navigation becomes:

- `Dashboard`
- `Today`
- `Charts`
- `Doctor`

### Page Layout

The doctor page includes:

- Title: `Doctor Summary`.
- Date range line, for example `Last 7 days: 7 July 2026 to 13 July 2026`.
- Generated timestamp.
- Period selector: `Last 7 days` and `Last 30 days`.
- `Print / Save as PDF` button that calls `window.print()`.
- Sections: Weight, Pulse, Blood Pressure, Walk, Guitar, NYHA, Symptoms, Notes.

### Numeric Sections

Each numeric section includes:

- A compact Recharts chart.
- A table with date/value rows.
- Empty state text when no data exists.

Chart choices:

- Weight: line chart, kg.
- Pulse: line chart, bpm.
- Blood Pressure: two-line chart for systolic and diastolic.
- Walk: bar chart using distance in metres.
- Guitar: bar chart using songs count.
- NYHA: compact line or bar chart using class number.

Charts are useful visual aids, but the tables are the authoritative printable record.

### Symptoms And Notes

Symptoms show date plus friendly labels. `good_day` is labelled as `Good day`, not as a negative symptom.

Notes show date plus note text. Notes should wrap cleanly in print.

## Print Design

Add print-specific CSS for `/doctor`.

Print rules:

- Hide app navigation, logout button, period selector, print button, and non-print UI.
- Use black text on white.
- Avoid large coloured backgrounds.
- Keep Recharts SVG charts visible.
- Include the date range and generated timestamp at the top.
- Fit comfortably on A4.
- Avoid splitting an individual section title from its table or chart.
- Use page breaks between major groups if needed.

The printed view should be readable without the rest of the app.

## Data Flow

1. The authenticated user opens `/doctor`.
2. The frontend requests `GET /api/summary?days=7` by default.
3. Changing the period requests `GET /api/summary?days=30` or `?days=7`.
4. The route authenticates through `current_user`.
5. `SummaryService` queries observations scoped to `current_user.id`.
6. `SummaryService` parses observations and returns a doctor-view model.
7. The frontend renders that model directly into charts, tables, symptoms, and notes.
8. The print button calls `window.print()`.

## Error Handling

- `401` follows the existing auth flow and redirects to login.
- Invalid `days` returns `422`.
- Empty section datasets render print-safe empty states.
- Invalid stored values are skipped.
- Failed summary requests show a simple page-level error with retry guidance.

## Testing

### Backend

- Summary endpoint requires authentication.
- Summary data is scoped to the authenticated user.
- Missing `days` defaults to `7`.
- `days=7` and `days=30` filter correctly.
- Invalid `days` returns `422`.
- Response includes `range`, `vitals`, `activity`, `functional`, `symptoms`, and `notes`.
- Weight, pulse, BP, walk, songs, and NYHA parse correctly.
- Walk metadata is included when present.
- Same-day walk time/stops observations are used as fallback when metadata is missing.
- Symptoms parse JSON arrays correctly.
- Notes return text and date.
- Invalid stored values are skipped.

### Frontend

- Doctor page loads the 7-day summary by default.
- Changing the period requests the matching summary range.
- All sections render charts and tables/lists from the API response.
- Empty sections render print-safe empty states.
- Symptoms render friendly labels, including `Good day`.
- Print button calls `window.print()`.
- `/doctor` routing and `Doctor` navigation link work.
- Print CSS hides navigation/buttons and keeps report content visible.

### Manual Acceptance

- Open `/doctor` and confirm the report renders for 7-day and 30-day periods.
- Print or preview as PDF and confirm the output is readable on A4.
- Confirm navigation, logout, period selector, and print button do not appear in print.
- Confirm charts and tables are visible in print.
- Confirm symptoms and notes are readable.

## Acceptance Criteria

- Doctor view renders all summary data cleanly.
- Both 7-day and 30-day views work.
- The printed version looks professional and is readable without the app.
- Charts are included without replacing tabular detail.
- The implementation remains observation-first and does not store derived summary data.
