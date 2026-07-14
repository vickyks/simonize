# Slice 4 Charts Design

## Goal

Long-term trends are obvious. Simon and Vicky can see whether weight, pulse, blood pressure, walking, guitar, and NYHA class are moving in the right direction over time.

This slice adds chart-specific backend view models and a dedicated `/charts` page. It does not add targets, milestones, annotations, or doctor-printable chart snapshots.

## Scope

### In Scope

- Protected chart endpoints under `/api/charts`.
- `ChartService` that builds chart-ready view models from user-scoped observations.
- Standard range support for `7`, `30`, `90`, and `all`.
- Charts page at `/charts`.
- Recharts for weight, pulse, blood pressure, walk distance, and guitar songs.
- Custom NYHA calendar grid using the colours from `docs/ux.md`.
- Empty chart states that do not crash.
- Navigation link from the authenticated header to `Charts`.

### Out of Scope

- Target lines. Targets are introduced later.
- Milestone or best-ever annotations.
- Regression lines or clinical interpretation.
- Doctor-view printable chart snapshots.
- Storing chart summaries, trend flags, or derived chart data.

## Backend Design

Add a protected charts router:

- `GET /api/charts/weight?days=30`
- `GET /api/charts/pulse?days=30`
- `GET /api/charts/bp?days=30`
- `GET /api/charts/walk?days=30`
- `GET /api/charts/songs?days=30`
- `GET /api/charts/nyha`

Routes stay thin and delegate to `ChartService`.

`ChartService` loads only observations for the authenticated user, parses stored text values safely, drops invalid stored values, applies range filtering, and returns arrays already shaped for the frontend chart components.

### Range Rules

`days` accepts only `7`, `30`, `90`, or `all`.

For standard metric endpoints:

- Missing `days` defaults to `30`.
- `days=7`, `days=30`, and `days=90` include observations from `today - (days - 1)` through today.
- `days=all` includes all available observations for that metric.
- Invalid `days` returns `422`.

NYHA always returns all available NYHA observations. The frontend decides how many weeks to draw, with a minimum of 12 weeks.

Dates are returned as stored local date strings in `YYYY-MM-DD` format. No timezone conversion is applied to chart data.

### Response Shapes

Weight, pulse, walk, songs, and NYHA return simple point arrays:

```json
[
  { "date": "2026-07-13", "value": 92.3 }
]
```

Blood pressure returns systolic and diastolic values separately:

```json
[
  { "date": "2026-07-13", "systolic": 121, "diastolic": 78 }
]
```

All arrays are ordered by date ascending. Missing observations are omitted rather than represented as zero.

## Frontend Design

Add `frontend/src/api/charts.ts` for chart API types and fetchers. It handles `401` through the existing unauthorized handler and sends the in-memory access token as a bearer token.

Add a `/charts` route rendered by a new `Charts` page.

The authenticated header navigation becomes:

- `Dashboard`
- `Today`
- `Charts`

The charts page includes a range toggle with `7`, `30`, `90`, and `all`. The selected range is used for weight, pulse, blood pressure, walk, and songs. NYHA remains all-time.

### Chart Cards

Use Recharts for:

- Weight: line chart, kg.
- Pulse: line chart, bpm.
- Blood pressure: two-line chart, systolic and diastolic.
- Walk distance: bar chart, metres.
- Guitar: bar chart, songs.

Each chart card has:

- A plain-language title.
- Tooltip on hover showing date and value.
- Empty state text: `No data yet — start recording to see your progress`.
- No clinical interpretation text.

The frontend passes backend arrays directly to Recharts. It may format labels and tooltips, but it must not calculate trends, warnings, or improvement status.

### NYHA Calendar

The NYHA calendar is a custom CSS grid, not Recharts.

Rules:

- One cell per day.
- Weeks run left to right, with the most recent week on the right.
- Days of week run vertically.
- Show at least 12 weeks.
- If all-time NYHA data is longer than 12 weeks, expand to include the older data.
- No-data cells use the light grey colour.

Colours:

| NYHA | Colour |
|------|--------|
| I | `#22c55e` |
| II | `#eab308` |
| III | `#f97316` |
| IV | `#ef4444` |
| No data | `#e5e7eb` |

Each cell has an accessible label, such as:

- `13 July 2026: NYHA class III`
- `13 July 2026: no NYHA recorded`

## Data Flow

1. The authenticated user opens `/charts`.
2. The frontend requests chart endpoint data with the selected range.
3. Each request includes the in-memory access token.
4. Backend chart routes authenticate through `current_user`.
5. `ChartService` queries observations scoped to `current_user.id`.
6. `ChartService` parses and returns chart-ready arrays.
7. The frontend renders Recharts charts and the custom NYHA grid from those arrays.

## Error Handling

- `401` follows the existing auth flow and redirects to login.
- Invalid `days` returns `422`.
- Empty datasets render empty chart states.
- Invalid stored values are ignored for chart output rather than crashing a chart.
- A failed chart request shows an unobtrusive page-level error with a retry suggestion.

## Testing

### Backend

- Chart endpoints require authentication.
- Chart data is scoped to the authenticated user.
- `days` defaults to `30` for standard endpoints.
- `days=7`, `30`, `90`, and `all` filter correctly.
- Invalid `days` returns `422`.
- Weight, pulse, walk, and songs parse numeric values correctly.
- Blood pressure splits `SYS/DIA` into `systolic` and `diastolic`.
- Invalid stored values are skipped.
- NYHA endpoint returns all-time values ordered by date ascending.

### Frontend

- Charts page loads chart data with the default `30` range.
- Changing range requests standard chart endpoints with the selected range.
- Empty chart data renders the empty-state message.
- Blood pressure chart renders systolic and diastolic series.
- Navigation renders a `Charts` link and `/charts` shows the charts page.
- NYHA calendar maps values to the documented colours and accessible labels.

### Manual Acceptance

- Enter observations across several dates and confirm all six chart types render real data.
- Confirm empty datasets show the empty state and do not crash.
- Confirm the range toggle changes the standard charts.
- Confirm NYHA colours match `docs/ux.md`.
- Confirm the charts page is readable on mobile and desktop.

## Acceptance Criteria

- All six chart types render with real user-scoped data.
- Standard chart endpoints support `7`, `30`, `90`, and `all` ranges.
- NYHA calendar colour-codes correctly.
- Charts handle empty datasets gracefully.
- The page makes long-term trends easier to see without diagnosing or over-interpreting them.
