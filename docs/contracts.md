# Simonizer — API Contracts

These schemas are **frozen at the start of Wave 4**. Parallel agents depend on them. Do not change a response shape without updating this file and notifying all active agents.

---

## Shared types

```typescript
type ISODate = string            // "2026-06-27"
type NyhaClass = 1 | 2 | 3 | 4
type AdvisoryStatus = "green" | "amber" | "red"

type SymptomKey =
  | "breathless"
  | "chest_discomfort"
  | "palpitations"
  | "swollen_ankles"
  | "dizzy"
  | "very_tired"
  | "poor_sleep"
  | "poor_appetite"
  | "good_day"
```

---

## Auth

### `POST /api/auth/login`

Request:
```json
{ "username": "simon", "password": "..." }
```

Response `200`:
```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

Response `401`:
```json
{ "detail": "Invalid credentials" }
```

Refresh token set as httpOnly cookie `refresh_token`.

---

### `POST /api/auth/refresh`

No body. Reads `refresh_token` cookie.

Response `200`:
```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

---

## Observations

### `GET /api/observations/{date}`

Response `200`:
```json
{
  "date": "2026-06-27",
  "observations": {
    "weight": { "value": "92.3", "metadata": null, "updated_at": "2026-06-27T09:14:00Z" },
    "pulse": { "value": "71", "metadata": null, "updated_at": "2026-06-27T09:15:00Z" },
    "bp": { "value": "121/78", "metadata": null, "updated_at": "2026-06-27T09:16:00Z" },
    "walk_distance": { "value": "325", "metadata": { "time_seconds": 840, "stops": 1 }, "updated_at": "2026-06-27T14:30:00Z" },
    "songs": { "value": "3", "metadata": null, "updated_at": "2026-06-27T16:00:00Z" },
    "nyha": { "value": "3", "metadata": null, "updated_at": "2026-06-27T09:20:00Z" },
    "symptoms": { "value": "[\"breathless\"]", "metadata": null, "updated_at": "2026-06-27T09:21:00Z" },
    "notes": { "value": "Felt stronger today", "metadata": null, "updated_at": "2026-06-27T20:00:00Z" }
  },
  "checklist": {
    "weight": true,
    "bp": true,
    "pulse": true,
    "walk": true,
    "songs": true,
    "nyha": true,
    "symptoms": true,
    "notes": true
  }
}
```

Missing observation types are omitted from `observations`. All keys are present in `checklist` (false if not yet recorded).

---

### `PUT /api/observations/{date}/{type}`

Request (all types use same envelope):
```json
{ "value": "92.3", "metadata": null }
```

For `bp`: `"value": "121/78"`
For `symptoms`: `"value": "[\"breathless\",\"dizzy\"]"`
For `walk_distance`: `"value": "325", "metadata": { "time_seconds": 840, "stops": 1 }`

Response `200`:
```json
{ "date": "2026-06-27", "type": "weight", "value": "92.3", "updated_at": "2026-06-27T09:14:00Z" }
```

Response `422`:
```json
{ "detail": "Weight must be between 30 and 300 kg" }
```

---

## Dashboard

### `GET /api/dashboard`

```json
{
  "date": "2026-06-27",
  "today": {
    "weight": 92.3,
    "pulse": 71,
    "bp_sys": 121,
    "bp_dia": 78,
    "walk_distance": 325,
    "walk_time_seconds": 840,
    "songs": 3,
    "nyha": 3
  },
  "trends": {
    "weight_7d":        [{ "date": "2026-06-21", "value": 93.1 }, { "date": "2026-06-22", "value": 92.8 }],
    "pulse_7d":         [{ "date": "2026-06-21", "value": 74 }],
    "walk_distance_7d": [{ "date": "2026-06-21", "value": 280 }]
  },
  "advisory": {
    "status": "amber",
    "messages": ["Your weight has increased 2 kg over the last 3 days."]
  },
  "milestones": [
    { "key": "longest_walk", "label": "Longest walk yet", "value": "325 m", "date": "2026-06-27", "is_new": true }
  ],
  "targets": {
    "walk_distance": 500,
    "songs": 5,
    "nyha": 2
  },
  "checklist_complete": false
}
```

`today` fields are `null` if not yet recorded today. Trend arrays contain only dates where an observation exists — no null-filled gaps. `is_new: true` on a milestone means it was achieved today.

---

## Charts

All chart endpoints accept `?days=7|30|90|all` (default `30`).

### `GET /api/charts/weight`
### `GET /api/charts/pulse`
### `GET /api/charts/walk`
### `GET /api/charts/songs`

```json
{
  "metric": "walk_distance",
  "unit": "m",
  "target": 500,
  "data": [
    { "date": "2026-06-01", "value": 200 },
    { "date": "2026-06-05", "value": 250 },
    { "date": "2026-06-27", "value": 325 }
  ]
}
```

`target` is `null` if no target set for that metric. Dates with no observation are omitted.

---

### `GET /api/charts/bp`

```json
{
  "metric": "bp",
  "unit": "mmHg",
  "target": null,
  "data": [
    { "date": "2026-06-01", "sys": 128, "dia": 82 },
    { "date": "2026-06-27", "sys": 121, "dia": 78 }
  ]
}
```

---

### `GET /api/charts/nyha`

Returns all-time data regardless of `?days` param (used for calendar grid).

```json
{
  "metric": "nyha",
  "data": [
    { "date": "2026-06-01", "value": 3 },
    { "date": "2026-06-10", "value": 3 },
    { "date": "2026-06-20", "value": 2 },
    { "date": "2026-06-27", "value": 3 }
  ]
}
```

---

## Summary (Doctor view)

### `GET /api/summary?days=7` or `?days=30`

```json
{
  "period_days": 7,
  "from_date": "2026-06-21",
  "to_date": "2026-06-27",
  "weight": {
    "first": 93.1, "last": 92.3, "min": 92.0, "max": 93.5,
    "trend": "improving",
    "data": [{ "date": "2026-06-21", "value": 93.1 }]
  },
  "pulse": {
    "first": 74, "last": 71, "min": 68, "max": 76,
    "trend": "stable",
    "data": [{ "date": "2026-06-21", "value": 74 }]
  },
  "bp": {
    "data": [{ "date": "2026-06-21", "sys": 128, "dia": 82 }]
  },
  "walk": {
    "max_distance": 325, "total_distance": 1450,
    "trend": "improving",
    "data": [{ "date": "2026-06-21", "value": 200 }]
  },
  "songs": {
    "max": 4, "total": 14,
    "data": [{ "date": "2026-06-21", "value": 2 }]
  },
  "nyha": {
    "most_common": 3,
    "data": [{ "date": "2026-06-21", "value": 3 }]
  },
  "symptoms": {
    "by_day": [{ "date": "2026-06-21", "symptoms": ["breathless"] }],
    "frequency": { "breathless": 5, "dizzy": 2 }
  },
  "notes": [
    { "date": "2026-06-21", "text": "Felt stronger today" }
  ]
}
```

`trend` is one of `"improving"` | `"stable"` | `"worsening"` | `"insufficient_data"`.

---

## Targets

### `GET /api/targets`

```json
{
  "targets": [
    { "type": "walk_distance", "value": 500, "unit": "m" },
    { "type": "songs", "value": 5, "unit": null },
    { "type": "nyha", "value": 2, "unit": null }
  ]
}
```

### `PUT /api/targets/{type}`

Request:
```json
{ "value": 600 }
```

Response `200`:
```json
{ "type": "walk_distance", "value": 600, "unit": "m" }
```

---

## Error envelope

All errors use the same shape:
```json
{ "detail": "Human-readable error message" }
```

HTTP status codes: `400` validation, `401` auth, `404` not found, `422` semantic validation, `500` server error.
