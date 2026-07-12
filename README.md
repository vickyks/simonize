# Simonizer

Simonizer is a private, single-patient recovery tracker for Simon's cardiac recovery after heart failure and atrial fibrillation.

The app's guiding question is:

```text
Is Simon getting better?
```

It is intentionally not a generic health tracker or medical device.

## Stack

- Backend: Python, FastAPI, SQLModel, PostgreSQL, Alembic
- Frontend: React, TypeScript, Vite
- Deployment: Docker Compose, Nginx
- Production URL: `simonizer.vickystephens.co.uk`

## Current State

Slice 0 is complete:

- FastAPI health endpoint
- Vite/React frontend shell
- PostgreSQL container
- Docker Compose stack
- Internal app nginx routing
- GitHub Actions CI
- DigitalOcean deployment workflow

Slice 1 authentication is implemented:

- Admin login, logout, session refresh, and current-user endpoints
- Access tokens are held in frontend memory only
- Session restore uses an HTTP-only refresh cookie
- The configured admin user is seeded or updated at backend startup

Initial login uses `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `.env`.

Slice 2 daily observations are implemented:

- The daily observations page is available after login at `/`
- Historical editing uses ISO-dated paths such as `/2026-06-27`
- Observations are scoped to the authenticated user

The app does not yet have dashboard, charts, or broader recovery trend UI.

## Local Development

Install `just`, then use the root `justfile` for common tasks.

Start the stack:

```bash
just up
```

Stop the stack:

```bash
just down
```

Check service status:

```bash
just ps
```

Follow logs:

```bash
just logs
just logs backend
```

Health check:

```bash
just health
```

Local URLs:

- App: `http://localhost/`
- API health: `http://localhost/api/health`

## Checks

Run the current full local check suite:

```bash
just check
```

This runs:

- Backend Ruff lint
- Backend pytest
- Frontend ESLint
- Frontend TypeScript check
- Frontend production build

Build Docker images:

```bash
just docker-build
```

## Database And Migrations

Run migrations:

```bash
just migrate
```

Create a new Alembic migration:

```bash
just migration "describe change"
```

Open psql:

```bash
just db-shell
```

PostgreSQL data is stored in the named Docker volume `simonize_pgdata`. `docker-compose down` keeps it. `docker-compose down -v` deletes it.

## Environment

Copy `.env.example` when configuring an environment:

```bash
cp .env.example .env
```

Required values:

```env
DB_PASSWORD=<strong database password>
SECRET_KEY=<random long secret>
ADMIN_USERNAME=simon
ADMIN_PASSWORD=<strong admin password>
NGINX_HTTP_PORT=80
```

Generate a strong secret:

```bash
openssl rand -hex 64
```

## Production Deployment

Production runs on the DigitalOcean droplet `flysonata-test`.

Traffic flow:

```text
simonizer.vickystephens.co.uk
  -> host nginx
  -> http://127.0.0.1:8082
  -> Simonizer Docker nginx
  -> frontend container for /*
  -> backend container for /api/*
  -> PostgreSQL internal Docker network only
```

The backend and database are not exposed directly to the internet.

Production deploys run from GitHub Actions after CI passes on `main`. Required repository secrets:

```text
DROPLET_HOST=178.62.1.70
DROPLET_USER=vicky
DROPLET_SSH_KEY=<private deploy key>
```

On the droplet, production commands are:

```bash
just prod-check-env
just prod-deploy-local
just prod-smoke
```

See `docs/deployment.md` for full droplet setup, host nginx config, and troubleshooting commands.

## Project Docs

- `docs/slices.md`: build order and acceptance criteria
- `docs/architecture.md`: folder layout and API conventions
- `docs/data-model.md`: observation schema and validation rules
- `docs/ux.md`: product tone, NYHA colours, advisory logic, and UI rules
- `docs/deployment.md`: production deployment details
