# Simonizer — Agent Ownership

This file governs which agent owns which files during parallel execution.
An agent must never write to files it does not own.

---

## Wave map

| Wave | Slices | Mode | Agents |
|------|--------|------|--------|
| W0 | Slice 0 | Sequential | 1 |
| W1 | Slice 1 | Sequential | 1 |
| W2 | Slice 2 | Sequential | 1 |
| W3 | Slices 3, 4, 5 | **Parallel** | up to 3 |
| W4 | Slice 6 | Sequential | 1 |

W3 agents may only start once W2's acceptance criteria are met and all W2 branches are merged.

---

## W3 agent briefs

### Agent A — Dashboard (Slice 3)

**Prompt to use:**
> You are building the Dashboard slice of Simonizer. Read `CLAUDE.md`, `docs/contracts.md`, and `docs/ux.md` before writing any code. You own the files listed below and must not touch anything outside them. The observations API is already built — consume it, do not modify it.

**Owns (may read and write):**
```
backend/app/services/dashboard_service.py
backend/app/services/warning_service.py
backend/app/services/achievement_service.py
backend/app/routers/dashboard.py
backend/app/schemas/dashboard.py
frontend/src/pages/Dashboard.tsx
frontend/src/api/dashboard.ts
frontend/src/components/cards/
```

**Read-only (must not modify):**
```
backend/app/models/
backend/app/routers/observations.py
backend/app/services/observation_service.py
frontend/src/api/observations.ts
docs/contracts.md
```

**Must not create:**
- Any new database migrations
- Any new ObservationTypes
- Any files outside the owned list

**Acceptance criteria (from `docs/slices.md` Slice 3):**
- Dashboard loads with real data
- Advisory status reflects actual observations
- Milestones appear when criteria are met
- Page feels optimistic and easy to read

---

### Agent B — Charts (Slice 4)

**Prompt to use:**
> You are building the Charts slice of Simonizer. Read `CLAUDE.md`, `docs/contracts.md`, and `docs/ux.md` before writing any code. You own the files listed below and must not touch anything outside them. The observations API is already built — consume it, do not modify it.

**Owns (may read and write):**
```
backend/app/routers/charts.py
backend/app/schemas/charts.py
frontend/src/pages/Charts.tsx
frontend/src/api/charts.ts
frontend/src/components/charts/
```

**Read-only (must not modify):**
```
backend/app/models/
backend/app/routers/observations.py
backend/app/services/observation_service.py
frontend/src/api/observations.ts
docs/contracts.md
```

**Must not create:**
- Any new database migrations
- Any new ObservationTypes
- Any files outside the owned list

**Acceptance criteria (from `docs/slices.md` Slice 4):**
- All six chart types render with real data
- NYHA calendar colour-codes correctly
- Day-range toggle works (7 / 30 / 90 / all)
- Empty state handled gracefully

---

### Agent C — Doctor view (Slice 5)

**Prompt to use:**
> You are building the Doctor view slice of Simonizer. Read `CLAUDE.md`, `docs/contracts.md`, and `docs/ux.md` before writing any code. You own the files listed below and must not touch anything outside them. The observations API is already built — consume it, do not modify it.

**Owns (may read and write):**
```
backend/app/services/summary_service.py
backend/app/routers/summary.py
backend/app/schemas/summary.py
frontend/src/pages/Doctor.tsx
frontend/src/api/summary.ts
```

**Read-only (must not modify):**
```
backend/app/models/
backend/app/routers/observations.py
backend/app/services/observation_service.py
frontend/src/api/observations.ts
docs/contracts.md
```

**Must not create:**
- Any new database migrations
- Any new ObservationTypes
- Any files outside the owned list

**Acceptance criteria (from `docs/slices.md` Slice 5):**
- Page renders all data cleanly for 7-day and 30-day views
- Print stylesheet works — clean, no nav, no wasted ink
- "Print / Save as PDF" button works

---

## Shared files — coordinate before touching

These files are touched by multiple slices at different waves. During W3, no agent should need to edit them. If an agent believes it must, stop and raise it explicitly.

```
frontend/src/App.tsx           # routing — add routes in W4 only
frontend/src/components/layout/ # nav — add nav items in W4 only
docker-compose.yml             # infrastructure — W0 only
nginx/nginx.conf               # routing — W0 only
```

---

## Merge order for W3

When all three W3 agents are done, merge in this order to minimise conflicts:

1. Agent C (Doctor view) — smallest surface area, backend-heavy
2. Agent B (Charts) — new router + new frontend page, no shared components
3. Agent A (Dashboard) — touches shared card components, merge last

After each merge, run:
```bash
docker compose up --build
pytest backend/
```

before merging the next branch.
