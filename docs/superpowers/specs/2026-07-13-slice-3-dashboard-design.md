# Slice 3 Dashboard Design

## Goal

At a glance, Simon can see how he is doing today and whether recent observations suggest improvement, stability, or a possible concern.

This slice focuses on the core dashboard: summary cards, advisory status, and 7-day trends. Milestone badges, editable targets, full chart pages, and doctor summaries are deferred to later slices.

## Scope

### In Scope

- Protected `GET /api/dashboard` endpoint.
- `DashboardService` that assembles a purpose-built dashboard view model from observations.
- `WarningService` that calculates green, amber, or red advisory status from raw observations.
- Dashboard page at `/dashboard`.
- Summary cards for weight, pulse, blood pressure, today's walk, guitar songs, and current NYHA class.
- Mini 7-day trend data for weight, pulse, and walk distance.
- Calm empty states for missing observations.
- Navigation between the dashboard and today's observation page.

### Out of Scope

- Editable or persisted targets.
- Milestone badges.
- Full-size chart pages.
- Doctor summary or export features.
- Frontend-derived advisory or trend calculations.

## Backend Design

Add a protected dashboard route:

```python
@router.get("/dashboard")
async def get_dashboard(
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
):
    return DashboardService(session).build(user_id=user.id)
```

The router stays thin. `DashboardService` owns data loading, parsing, and view-model assembly. `WarningService` owns advisory status and messages.

### Response Shape

```json
{
  "today": {
    "date": "2026-07-13",
    "weight": 92.3,
    "pulse": 71,
    "bp": "121/78",
    "walk_distance": 325,
    "songs": 3,
    "nyha": 3
  },
  "trends": {
    "weight_7d": [{ "date": "2026-07-07", "value": 92.8 }],
    "pulse_7d": [{ "date": "2026-07-07", "value": 72 }],
    "walk_7d": [{ "date": "2026-07-07", "value": 300 }]
  },
  "advisory": {
    "status": "green",
    "messages": []
  }
}
```

Fields in `today` are always present. If no observation is recorded for a field, its value is `null`. Missing observations are never treated as zero.

Trend arrays contain only days with valid observations for that metric, ordered by date ascending. The frontend displays these arrays directly and does not transform raw observations.

## Advisory Design

`WarningService` implements the advisory rules from `docs/ux.md`. It uses only raw observations and never stores derived state.

### Red

Return `red` if any of these are true:

- `chest_discomfort` symptom is recorded today.
- NYHA IV is recorded today.
- Weight increases at least 3 kg between observations recorded up to 2 calendar days apart.

Red messages are factual observations, followed by the configured urgent advice:

- `Chest discomfort was recorded today.`
- `NYHA class IV was recorded today.`
- `Your weight has increased 3 kg over 2 days.`
- `If symptoms are severe or sudden, call 999. Otherwise contact the Heart Failure team urgently.`

### Amber

Return `amber` if no red condition is met and any of these are true:

- Weight increases at least 2 kg between observations recorded up to 3 calendar days apart, within the last 7 days.
- Resting pulse average rises more than 10 BPM by comparing the earliest available 3-day average with the latest available 3-day average in the last 7 days, when both averages have at least 2 readings.
- Walk distance falls more than 20% over 7 days with at least 3 data points.
- NYHA class worsens by 1 or more for at least 3 consecutive days.
- The same symptom appears on at least 3 of the last 7 days, excluding `good_day`.

Amber messages are factual observations, followed by:

- `Consider contacting the Heart Failure team if this continues.`

### Green

Return `green` when no red or amber condition is met, including when there is not enough data to assess a trend.

Green should feel reassuring but not falsely conclusive. The UI can show a subtle indicator rather than a prominent banner.

## Frontend Design

Add a dashboard page at `/dashboard`, loaded after authentication through a small dashboard API wrapper and React Query hook.

The dashboard shows:

- Advisory status at the top.
- Six summary cards: Weight, Pulse, Blood Pressure, Today's Walk, Guitar, Current NYHA.
- Mini sparklines for weight, pulse, and walk when trend data exists.
- Calm empty states for missing data, such as `No walk recorded today yet`.
- A clear link to today's observation page.

After login, the app should land on `/dashboard`. The daily observation page remains available at `/` and `/{date}`. A simple navigation element lets Simon or Vicky switch between `Dashboard` and `Today`.

The visual tone should be optimistic, uncluttered, and consistent with the existing daily page. Amber and red advisory states are visible, but all language remains observational rather than diagnostic.

## Data Flow

1. The frontend requests `GET /api/dashboard` with the in-memory access token.
2. The route authenticates through `current_user`.
3. `DashboardService` loads the current user's observations for today and the recent trend window.
4. `DashboardService` parses dashboard values and builds `today` and `trends`.
5. `WarningService` evaluates advisory status from the same user-scoped observations.
6. The frontend renders the returned view model directly.

## Error Handling

- `401` follows the existing auth flow and redirects to login.
- Missing observations render empty dashboard states, not errors.
- Invalid stored values are ignored for dashboard calculations rather than crashing the page; the service should only expose values it can parse safely.
- Advisory trend checks are skipped when there is not enough data.

## Testing

### Backend

- Dashboard endpoint requires authentication.
- Dashboard data is scoped to the authenticated user.
- Response shape includes `today`, `trends`, and `advisory`.
- Missing data produces a usable response.
- Trend arrays parse and order weight, pulse, and walk observations correctly.
- Green advisory is returned when no warning conditions are met.
- Amber advisory is returned for at least one manually testable concern, such as weight gain over 3 days.
- Red advisory is returned for chest discomfort today, NYHA IV today, or rapid weight gain.

### Frontend

- Dashboard loads and renders summary cards from the API response.
- Missing values render calm empty states.
- Green, amber, and red advisory states render with the correct tone and message area.
- Navigation between dashboard and today works.

### Manual Acceptance

- Enter real observations on the daily page and confirm the dashboard reflects them.
- Enter observations that trigger an amber advisory and confirm the dashboard changes status.
- Confirm the page is readable on mobile and desktop.

## Acceptance Criteria

- Dashboard loads with real user-scoped data.
- Simon can see today's key observations at a glance.
- Weight, pulse, and walk trends use the last 7 days of observations.
- Advisory status reflects actual observations and can show a manually tested amber case.
- Missing data is handled gracefully.
- The page feels optimistic and easy to read.
