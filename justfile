set dotenv-load := true

compose := "docker-compose"
prod_compose := "NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml"

default:
    @just --list

# Start the full app stack in the background.
up:
    {{compose}} up -d

# Alias for `up`.
start: up

# Stop containers, keeping the database volume.
down:
    {{compose}} down

# Alias for `down`.
stop: down

# Restart the full app stack.
restart:
    {{compose}} down
    {{compose}} up -d

# Rebuild images and start the stack.
rebuild:
    {{compose}} build
    {{compose}} up -d

# Show running container status.
ps:
    {{compose}} ps

# Follow logs for all services, or pass a service name: `just logs backend`.
logs service="":
    @if [ -n "{{service}}" ]; then {{compose}} logs -f {{service}}; else {{compose}} logs -f; fi

# Show recent logs for all services, or pass a service name: `just logs-tail backend`.
logs-tail service="":
    @if [ -n "{{service}}" ]; then {{compose}} logs --tail=80 {{service}}; else {{compose}} logs --tail=80; fi

# Check the API through nginx.
health:
    curl -fsS http://localhost/api/health

# Run Alembic migrations.
migrate:
    {{compose}} run --rm backend alembic upgrade head

# Create an Alembic migration: `just migration "add users"`.
migration name:
    {{compose}} run --rm backend alembic revision --autogenerate -m "{{name}}"

# Roll back the last migration, or pass a target: `just downgrade base`.
downgrade target="-1":
    {{compose}} run --rm backend alembic downgrade {{target}}

# Open a shell in the backend container.
backend-shell:
    {{compose}} run --rm backend bash

# Open a shell in the frontend container.
frontend-shell:
    {{compose}} run --rm frontend sh

# Open psql against the app database.
db-shell:
    {{compose}} exec db psql -U simonizer -d simonizer

# Run the frontend TypeScript/Vite build check.
frontend-build:
    {{compose}} run --rm frontend npm run build

# Run frontend ESLint.
frontend-lint:
    {{compose}} run --rm frontend npm run lint

# Run frontend TypeScript type checks.
frontend-typecheck:
    {{compose}} run --rm frontend npm run typecheck

# Run backend Ruff lint.
backend-lint:
    {{compose}} run --rm backend sh -c "pip install -r requirements-dev.txt && ruff check ."

# Run backend tests.
backend-test:
    {{compose}} run --rm backend sh -c "pip install -r requirements-dev.txt && PYTHONPATH=. pytest"

# Build app Docker images.
docker-build:
    {{compose}} build backend frontend

# Run current available checks.
check:
    {{compose}} run --rm backend sh -c "pip install -r requirements-dev.txt && ruff check . && PYTHONPATH=. pytest"
    {{compose}} run --rm frontend npm run lint
    {{compose}} run --rm frontend npm run typecheck
    {{compose}} run --rm frontend npm run build

# Smoke test the running stack.
smoke:
    {{compose}} ps
    curl -fsS http://localhost/api/health

# Start the production stack with localhost-only nginx binding.
prod-up:
    {{prod_compose}} up -d --build

# Check that production secrets are present and not unsafe defaults.
prod-check-env env_file=".env":
    ./scripts/check-production-env.sh {{env_file}}

# Stop the production stack, keeping the database volume.
prod-down:
    {{prod_compose}} down

# Follow production stack logs, or pass a service name: `just prod-logs backend`.
prod-logs service="":
    @if [ -n "{{service}}" ]; then {{prod_compose}} logs -f {{service}}; else {{prod_compose}} logs -f; fi

# Run Alembic migrations against the production stack.
prod-migrate:
    {{prod_compose}} run --rm backend alembic upgrade head

# Smoke test the production stack through its host-local port.
prod-smoke:
    curl -fsS http://127.0.0.1:8082/api/health

# Build, migrate, and smoke test the production stack locally/on the droplet.
prod-deploy-local: prod-check-env
    {{prod_compose}} build
    {{prod_compose}} up -d db
    {{prod_compose}} run --rm backend alembic upgrade head
    {{prod_compose}} up -d
    curl -fsS http://127.0.0.1:8082/api/health

# Stop containers and remove orphaned containers, keeping the database volume.
clean:
    {{compose}} down --remove-orphans

# Stop containers and delete the app database volume.
reset-db:
    {{compose}} down -v --remove-orphans
    {{compose}} up -d

# Remove unused Docker resources across the machine. Use intentionally.
prune:
    docker system prune
