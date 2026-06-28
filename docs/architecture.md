# Simonizer — Architecture

## Overview

```
React SPA  →  FastAPI REST API  →  PostgreSQL
                    ↓
              Docker Compose
                    ↓
                 Nginx
```

All frontend–backend communication is JSON over REST. The frontend never touches the database directly.

---

## Folder layout

```
simonizer/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app, middleware, routers
│   │   ├── config.py              # Settings from env
│   │   ├── database.py            # SQLModel engine + session
│   │   ├── models/
│   │   │   ├── observation.py     # Observation, ObservationType
│   │   │   ├── user.py
│   │   │   └── target.py
│   │   ├── services/
│   │   │   ├── observation_service.py
│   │   │   ├── dashboard_service.py
│   │   │   ├── achievement_service.py
│   │   │   ├── warning_service.py
│   │   │   └── summary_service.py
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── observations.py
│   │   │   ├── dashboard.py
│   │   │   ├── charts.py
│   │   │   ├── summary.py
│   │   │   └── targets.py
│   │   └── schemas/               # Pydantic request/response models
│   ├── alembic/
│   ├── alembic.ini
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/                   # React Query hooks + fetch wrappers
│   │   │   ├── observations.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── charts.ts
│   │   │   └── auth.ts
│   │   ├── components/
│   │   │   ├── inputs/            # WeightInput, PulseInput, NyhaSelector, etc.
│   │   │   ├── cards/             # Dashboard summary cards
│   │   │   ├── charts/            # Recharts wrappers
│   │   │   └── layout/            # Nav, Page, Banner
│   │   ├── pages/
│   │   │   ├── Daily.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Charts.tsx
│   │   │   ├── Doctor.tsx
│   │   │   ├── Targets.tsx
│   │   │   └── Login.tsx
│   │   └── types/                 # Shared TypeScript types
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── package.json
│
├── nginx/
│   └── nginx.conf
│
├── docker-compose.yml
├── .env.example
└── docs/
```

---

## API conventions

- All routes prefixed `/api/`
- Auth routes: `/api/auth/login`, `/api/auth/refresh`
- Observation routes: `/api/observations/{date}`, `/api/observations/{date}/{type}`
- Dashboard: `/api/dashboard`
- Charts: `/api/charts/{metric}?days=30`
- Summary: `/api/summary?days=7`
- Targets: `/api/targets`, `/api/targets/{type}`

### Date format
All dates are `YYYY-MM-DD` strings (ISO 8601, no time component).

### HTTP methods
| Action | Method |
|--------|--------|
| Read | GET |
| Create or update observation | PUT |
| Update target | PUT |
| Login | POST |

---

## Service layer rules

Business logic lives in services, never in routers.

| Service | Responsibility |
|---------|---------------|
| `ObservationService` | Upsert, fetch, validate observations |
| `DashboardService` | Assemble the dashboard view model |
| `AchievementService` | Calculate all milestones from raw observations |
| `WarningService` | Evaluate advisory status (green / amber / red) |
| `SummaryService` | Build the doctor summary view |

Routers are thin:
```python
@router.get("/dashboard")
async def get_dashboard(session: Session = Depends(get_session), user = Depends(current_user)):
    return DashboardService(session).build()
```

---

## What is stored vs derived

### Stored (in `observations` table)
- Weight readings
- Pulse readings
- Blood pressure readings
- Walk distance / time / stops
- Songs count
- NYHA class
- Symptoms (as a JSON array in `value`)
- Notes (free text)

### Always derived (never stored)
- Advisory status (green / amber / red)
- Milestones and achievement dates
- Trends and moving averages
- Longest walk
- Current streak
- Weight stability flags
- Symptom-free day flag

---

## Authentication

- Single user, seeded at startup from env vars
- `POST /api/auth/login` → returns `{ access_token, token_type }`
- Access token: short-lived JWT (15 min), stored in memory on the frontend
- Refresh token: longer-lived (7 days), stored in httpOnly cookie
- All protected routes validate JWT via `Depends(current_user)`
- 401 from any route triggers automatic redirect to `/login`

---

## Environment variables

```env
DATABASE_URL=postgresql://simonizer:password@db:5432/simonizer
SECRET_KEY=<random 64-char string>
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
ADMIN_USERNAME=simon
ADMIN_PASSWORD=<strong password>
```
