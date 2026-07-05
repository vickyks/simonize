# Simonizer — Data Model

## Core principle

The application is **observation-first**. There are no "daily records". Every metric is stored as an independent observation tied to a date.

The daily page is a **projection** over all observations for a given date.

---

## `observations` table

```sql
CREATE TABLE observations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date        DATE NOT NULL,
    type        VARCHAR NOT NULL,       -- ObservationType enum value
    value       TEXT NOT NULL,          -- always stored as text; parsed per type
    metadata    JSONB,                  -- optional extra fields (e.g. walk time/stops)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (date, type)                 -- one observation per type per day (MVP)
);
```

The `UNIQUE (date, type)` constraint enforces one-per-day for the MVP. Future slices (multiple walks, multiple BP readings) will relax this with a sequence or sub-type column.

---

## ObservationType enum

| Type | Value format | Example | Metadata |
|------|-------------|---------|----------|
| `weight` | float string | `"92.3"` | — |
| `pulse` | integer string | `"71"` | — |
| `bp` | `"SYS/DIA"` | `"121/78"` | — |
| `walk_distance` | integer string (metres) | `"325"` | `{ "time_seconds": 840, "stops": 2 }` |
| `walk_time` | integer string (seconds) | `"840"` | — |
| `walk_stops` | integer string | `"2"` | — |
| `songs` | integer string | `"3"` | — |
| `nyha` | integer string `"1"`–`"4"` | `"3"` | — |
| `symptoms` | JSON array string | `'["breathless","dizzy"]'` | — |
| `notes` | free text | `"Felt stronger today"` | — |

**Note:** Walk time and stops are stored as separate observations AND in `walk_distance` metadata for convenience. Services should prefer the metadata for walk calculations.

---

## `targets` table

```sql
CREATE TABLE targets (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type    VARCHAR NOT NULL UNIQUE,   -- e.g. "walk_distance", "songs", "nyha"
    value   TEXT NOT NULL              -- stored as text, parsed per type
);
```

Default targets (seeded at startup):

| Type | Default value |
|------|--------------|
| `walk_distance` | `"500"` (metres) |
| `songs` | `"5"` |
| `nyha` | `"2"` |

---

## `users` table

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR NOT NULL UNIQUE,
    hashed_password VARCHAR NOT NULL,
    is_seeded       BOOLEAN NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seeded account is identified by `is_seeded = true` and rotated from environment variables without mutating any non-seeded users.

---

## Validation rules (enforced in ObservationService)

| Type | Rule |
|------|------|
| `weight` | Float, 30.0–300.0 |
| `pulse` | Integer, 30–250 |
| `bp` | Two integers, SYS 60–250, DIA 40–150, SYS > DIA |
| `walk_distance` | Integer, 0–50000 (metres) |
| `walk_time` | Integer, 0–86400 (seconds) |
| `walk_stops` | Integer, 0–100 |
| `songs` | Integer, 0–100 |
| `nyha` | Integer, 1–4 |
| `symptoms` | Array of known symptom keys (see below) |
| `notes` | String, max 2000 chars |

---

## Symptom keys

```python
VALID_SYMPTOMS = [
    "breathless",
    "chest_discomfort",
    "palpitations",
    "swollen_ankles",
    "dizzy",
    "very_tired",
    "poor_sleep",
    "poor_appetite",
    "good_day",       # positive symptom — used for "symptom-free day" milestone
]
```

A **symptom-free day** is defined as: symptoms observation exists AND contains only `"good_day"` OR the array is empty (no symptoms recorded).

---

## Example: a full day's observations

```
date        type             value                metadata
----------  ---------------  -------------------  --------------------------------
2026-06-27  weight           92.3
2026-06-27  pulse            71
2026-06-27  bp               121/78
2026-06-27  walk_distance    325                  {"time_seconds": 840, "stops": 1}
2026-06-27  songs            3
2026-06-27  nyha             3
2026-06-27  symptoms         ["breathless"]
2026-06-27  notes            Felt stronger today
```

---

## Future schema evolution (do not implement now)

When multiple walks per day are needed, the `UNIQUE (date, type)` constraint will be replaced with `UNIQUE (date, type, sequence)` where `sequence` is an integer (1, 2, 3…). The MVP upsert logic should be written to make this change straightforward.
