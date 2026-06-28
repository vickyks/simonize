# Simonizer — Build Slices

Each slice must leave the application in a **usable, deployable state** before the next begins.

---

## Slice 0 — Repo skeleton & Docker

**Goal:** A running stack with nothing in it yet.

### Tasks
- [ ] Monorepo layout: `/backend`, `/frontend`, `/nginx`, `docker-compose.yml`
- [ ] FastAPI app boots at `localhost:8000/health` → `{ "status": "ok" }`
- [ ] Vite/React app boots at `localhost:5173`
- [ ] PostgreSQL container running and reachable from backend
- [ ] Alembic initialised (no migrations yet)
- [ ] Nginx reverse proxy: `/api/*` → FastAPI, `/*` → React
- [ ] `.env.example` with all required vars

### Acceptance criteria
- `docker compose up` starts all four services without errors
- Health endpoint responds
- React app loads in browser

---

## Slice 1 — Authentication

**Goal:** Simon (and Vicky) can log in. Everything behind a JWT wall.

### Tasks
- [ ] `users` table with a single seeded user
- [ ] `POST /api/auth/login` → returns JWT
- [ ] `POST /api/auth/refresh`
- [ ] JWT middleware protecting all non-auth routes
- [ ] React login page (username + password)
- [ ] JWT stored in memory (not localStorage); refresh token in httpOnly cookie
- [ ] Auto-redirect to login on 401
- [ ] Logout clears session

### Acceptance criteria
- Cannot reach any API route without a valid JWT
- Login with correct credentials works; wrong credentials return 401
- Refreshing the page does not log the user out

---

## Slice 2 — Daily observations (core data layer)

**Goal:** Simon can record today's observations. Each one saves automatically.

### Backend tasks
- [ ] `observations` table: `id, date, type, value, metadata, created_at, updated_at`
- [ ] `ObservationType` enum: `weight, pulse, bp, walk_distance, walk_time, walk_stops, songs, nyha, symptoms, notes`
- [ ] `ObservationService` with `upsert(date, type, value, metadata)`
- [ ] `GET /api/observations/{date}` → all observations for a date
- [ ] `PUT /api/observations/{date}/{type}` → upsert a single observation
- [ ] Validation per type (e.g. pulse: integer 30–250, weight: float 30–300 kg)
- [ ] Alembic migration

### Frontend tasks
- [ ] Daily page at `/` (defaults to today) and `/{date}` for historical
- [ ] Historical date banner: "You are editing Tuesday 24 June."
- [ ] Date navigation (prev/next day)
- [ ] Checklist showing which observation types have been recorded today
- [ ] Auto-save on blur / selection change — no Save button
- [ ] Unobtrusive save indicator ("Saved ✓" fades out)
- [ ] Components:
  - `WeightInput` — number field, kg
  - `PulseInput` — number field, BPM
  - `BloodPressureInput` — two fields SYS / DIA
  - `WalkInput` — distance (m), time, stops
  - `SongsInput` — count field
  - `NyhaSelector` — four large colour-coded buttons (see `docs/ux.md`)
  - `SymptomsSelector` — checkbox list (see `docs/ux.md`)
  - `NotesInput` — textarea

### Acceptance criteria
- Every observation type can be entered and is persisted
- Navigating away and back shows saved values
- Checklist reflects actual saved state
- Historical date editing shows the banner
- No Save button exists anywhere on this page

---

## Slice 3 — Dashboard

**Goal:** At a glance, Simon can see how he's doing.

### Backend tasks
- [ ] `GET /api/dashboard` returns a view model:
  ```json
  {
    "today": { "weight": 92.3, "pulse": 71, "bp": "121/78", "walk_distance": 325, "songs": 3, "nyha": 3 },
    "trends": { "weight_7d": [...], "pulse_7d": [...], "walk_7d": [...] },
    "advisory": { "status": "green" | "amber" | "red", "messages": [...] },
    "milestones": [...],
    "targets": { "walk": 500, "songs": 5, "nyha": 2 }
  }
  ```
- [ ] `DashboardService` calculates all derived values
- [ ] `WarningService` implements advisory logic (see `docs/ux.md`)

### Frontend tasks
- [ ] Dashboard page at `/dashboard`
- [ ] Summary cards: Weight · Pulse · Blood Pressure · Today's Walk · Today's Songs · Current NYHA
- [ ] Advisory status banner (green / amber / red)
- [ ] Milestone badges (encouraging, not gamified)
- [ ] Mini sparkline charts on cards (last 7 days)
- [ ] Target progress indicators

### Acceptance criteria
- Dashboard loads with real data
- Advisory status reflects actual observations (test amber case manually)
- Milestones appear when criteria are met
- Page feels optimistic and easy to read

---

## Slice 4 — Charts

**Goal:** Long-term trends are obvious.

### Backend tasks
- [ ] `GET /api/charts/weight?days=30`
- [ ] `GET /api/charts/pulse?days=30`
- [ ] `GET /api/charts/bp?days=30`
- [ ] `GET /api/charts/walk?days=30`
- [ ] `GET /api/charts/songs?days=30`
- [ ] `GET /api/charts/nyha` → calendar grid data (all time)
- [ ] Each endpoint returns `[{ date, value }]` arrays ready for Recharts

### Frontend tasks
- [ ] Charts page at `/charts`
- [ ] Weight chart (line, 30-day)
- [ ] Pulse chart (line, 30-day)
- [ ] Blood pressure chart (two lines SYS/DIA, 30-day)
- [ ] Walk distance chart (bar or line, 30-day)
- [ ] Songs chart (bar, 30-day)
- [ ] NYHA calendar — GitHub contribution graph style, colour-coded by NYHA class
- [ ] Day-range toggle: 7 / 30 / 90 / all

### Acceptance criteria
- All six chart types render with real data
- NYHA calendar colour-codes correctly (see `docs/ux.md`)
- Charts show a clear upward/improving trend when data supports it
- Empty state is handled gracefully (no crashed charts)

---

## Slice 5 — Doctor view

**Goal:** A clean printable summary for medical appointments.

### Backend tasks
- [ ] `GET /api/summary?days=7` and `?days=30`
- [ ] Returns: weight trend, pulse trend, BP trend, walk progression, songs, NYHA trend, all symptoms, all notes

### Frontend tasks
- [ ] Doctor view at `/doctor`
- [ ] Period selector: Last 7 days / Last 30 days
- [ ] Sections: Weight · Pulse · BP · Walk · Songs · NYHA · Symptoms · Notes
- [ ] Print stylesheet — clean, no nav, no colours that waste ink
- [ ] "Print / Save as PDF" button

### Acceptance criteria
- Page renders all data cleanly
- Printed version looks professional and is readable without the app
- Covers both 7-day and 30-day views

---

## Slice 6 — Targets & milestones

**Goal:** Simon has personal targets and can see achievements.

### Backend tasks
- [ ] `targets` table: `type, value` (one row per metric)
- [ ] `GET /api/targets` · `PUT /api/targets/{type}`
- [ ] `AchievementService` — calculates all milestones from observations:
  - Longest walk · Most songs · Lowest resting pulse
  - Weight stable 7 days · Weight stable 30 days
  - First NYHA III · First NYHA II
  - First symptom-free day
  - 100 observations recorded · 30 consecutive days

### Frontend tasks
- [ ] Targets page at `/targets` — edit each target value
- [ ] Milestones section on dashboard (already stubbed in Slice 3)
- [ ] Milestone detail — date achieved, short encouraging message

### Acceptance criteria
- Targets can be updated and persist
- All milestones calculate correctly against real observation data
- Milestones feel like a celebration, not a game score

---

## Future slices (out of scope for MVP)

- Multiple walks per day
- Multiple BP readings per day
- Medication tracking
- Voice entry
- PDF export
- AI weekly summaries
- Family accounts
