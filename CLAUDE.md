# Simonizer — Agent Context

## What is this?

Simonizer is a private, single-patient web application for Simon to track his cardiac recovery following heart failure and atrial fibrillation. It is built and maintained by his wife Vicky.

**The one question this app must always answer: Is Simon getting better?**

This is not a generic health tracker. Every decision should be optimised for Simon's specific recovery, not for a hypothetical population of users.

---

## Stack

| Layer      | Technology                                      |
|------------|--------------------------------------------------|
| Backend    | Python · FastAPI · SQLModel · PostgreSQL · Alembic · JWT |
| Frontend   | React · TypeScript · Vite · React Query · React Hook Form · Recharts |
| Deployment | Docker Compose · Nginx                          |
| Domain     | simonizer.vickystephens.co.uk                   |

---

## Key files

| File | Purpose |
|------|---------|
| `docs/slices.md` | **Start here for build order.** Full-stack slices with acceptance criteria. |
| `docs/architecture.md` | Principles, folder layout, API conventions |
| `docs/data-model.md` | Observation schema, all types, what is stored vs derived |
| `docs/ux.md` | UX rules, NYHA colours, symptoms, advisory logic |

---

## Non-negotiable principles

1. **Observation-first** — the database stores individual observations, never "daily records". The daily page is a view over observations for a date.
2. **Derive, don't store** — milestones, trends, advisory status, streaks are all calculated at query time. Only raw observations are persisted.
3. **Thin API routes** — business logic lives in service classes (`ObservationService`, `DashboardService`, etc.), not in route handlers.
4. **Frontend never transforms raw data** — the backend exposes purpose-built view-model endpoints (`/dashboard`, `/charts/walk`, etc.).
5. **Auto-save** — there is no Save button. Observations save immediately on change with unobtrusive feedback.
6. **Never diagnose** — warnings are phrased as observations ("Your weight has increased 2 kg over 3 days"), never as clinical conclusions ("You are retaining fluid").

---

## What this app is NOT

- Not a medical device
- Not multi-patient
- Not integrated with NHS, wearables, or Apple/Google Health
- Not a medication manager
- Not an appointment scheduler

---

## Tone

The app should feel **optimistic, personal, and simple**. Recovery should feel encouraging. Celebrate progress. Show improvement, not just numbers.
