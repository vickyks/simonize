set dotenv-load := true

compose := "docker-compose"

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

# Run current available checks.
check:
    {{compose}} ps
    curl -fsS http://localhost/api/health
    {{compose}} run --rm frontend npm run build

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
