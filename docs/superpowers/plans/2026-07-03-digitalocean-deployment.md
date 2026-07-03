# DigitalOcean Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production deployment support so successful `main` builds deploy Simonizer to the DigitalOcean droplet behind host nginx.

**Architecture:** The droplet's host nginx remains the public entrypoint and proxies `simonizer.vickystephens.co.uk` to `127.0.0.1:8082`. Simonizer keeps its internal Docker nginx container, which routes `/api/*` to FastAPI and `/*` to the React frontend inside the Docker network. GitHub Actions SSHes to `/home/vicky/simonize`, pulls `main`, starts the production compose stack with `NGINX_HTTP_PORT=127.0.0.1:8082`, runs Alembic, and smoke-checks the health endpoint.

**Tech Stack:** GitHub Actions, Docker Compose, Nginx, FastAPI, Alembic, Vite/React, PostgreSQL, `just`.

## Global Constraints

- Deploy host: DigitalOcean droplet `flysonata-test`.
- Deploy path: `/home/vicky/simonize`.
- Deploy user: `vicky`.
- Public hostname: `simonizer.vickystephens.co.uk`.
- Droplet IP: `178.62.1.70`.
- Production host port binding: `127.0.0.1:8082:80` for the Simonizer Docker nginx service, produced by setting `NGINX_HTTP_PORT=127.0.0.1:8082`.
- Backend and PostgreSQL must remain internal to the Docker network.
- Deployment must only run after backend, frontend, and Docker CI jobs pass on `main`.
- Required GitHub secrets: `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`.
- HTTPS automation is out of scope.
- Do not replace the droplet's host nginx.

---

## File Structure

- Modify `docker-compose.yml`: parameterize the nginx port binding as `${NGINX_HTTP_PORT:-80}:80` so development still uses port 80 and production can use `127.0.0.1:8082` without compose list-merge issues.
- Create `docker-compose.prod.yml`: production compose marker file used by production commands alongside the base compose file.
- Modify `justfile`: add production compose variables and recipes for `prod-up`, `prod-down`, `prod-logs`, `prod-migrate`, `prod-smoke`, and `prod-deploy-local`.
- Modify `.github/workflows/ci.yml`: add a deploy job that depends on existing `backend`, `frontend`, and `docker` jobs and runs only for pushes to `main`.
- Create `docs/deployment.md`: document required GitHub secrets, host nginx config, manual droplet commands, and troubleshooting commands.

---

### Task 1: Production Compose And Local Deploy Commands

**Files:**
- Create: `docker-compose.prod.yml`
- Modify: `docker-compose.yml`
- Modify: `justfile`

**Interfaces:**
- Consumes: existing `docker-compose.yml` services `backend`, `frontend`, `nginx`, and `db`.
- Produces: production compose command `NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml ...`; `just prod-smoke` returns success only if `http://127.0.0.1:8082/api/health` responds.

- [ ] **Step 1: Parameterize the base nginx port binding**

Modify `docker-compose.yml` so the nginx service port mapping is exactly:

```yaml
    ports:
      - "${NGINX_HTTP_PORT:-80}:80"
```

- [ ] **Step 2: Add production compose marker file**

Create `docker-compose.prod.yml` with exactly this content:

```yaml
version: "3.8"

services: {}
```

- [ ] **Step 3: Verify the production command produces only the localhost nginx port binding**

Run:

```bash
NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml config | grep -A3 'ports:'
```

Expected output includes:

```text
- 127.0.0.1:8082:80
```

Expected output must not include:

```text
- 80:80
```

- [ ] **Step 4: Add production variables and recipes to `justfile`**

Modify the top of `justfile` so it contains:

```make
set dotenv-load := true

compose := "docker-compose"
prod_compose := "NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml"
```

Add these recipes after the existing `smoke` recipe:

```make
# Start the production stack with localhost-only nginx binding.
prod-up:
    {{prod_compose}} up -d --build

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
prod-deploy-local:
    {{prod_compose}} up -d --build
    {{prod_compose}} run --rm backend alembic upgrade head
    curl -fsS http://127.0.0.1:8082/api/health
```

- [ ] **Step 5: Verify just recipes parse**

Run:

```bash
just --list
```

Expected output includes:

```text
prod-up
prod-down
prod-logs
prod-migrate
prod-smoke
prod-deploy-local
```

- [ ] **Step 6: Run local non-destructive verification**

Run:

```bash
NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml config >/dev/null
```

Expected: command exits `0` with no output.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add docker-compose.yml docker-compose.prod.yml justfile
git commit -m "Add production compose commands"
```

---

### Task 2: GitHub Actions Deployment Job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: existing CI jobs named `backend`, `frontend`, and `docker`.
- Consumes: GitHub secrets `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`.
- Produces: `deploy` job that runs only on push to `main` after successful CI.

- [ ] **Step 1: Add workflow permissions and concurrency**

Modify `.github/workflows/ci.yml` after the `on:` block so it includes:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

- [ ] **Step 2: Add deploy job**

Append this job after the existing `docker` job:

```yaml
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    needs: [backend, frontend, docker]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up SSH
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.DROPLET_SSH_KEY }}

      - name: Add droplet to known hosts
        run: ssh-keyscan -H ${{ secrets.DROPLET_HOST }} >> ~/.ssh/known_hosts

      - name: Verify SSH connection
        run: ssh ${{ secrets.DROPLET_USER }}@${{ secrets.DROPLET_HOST }} "echo 'SSH connection successful'"

      - name: Deploy on droplet
        run: |
          ssh ${{ secrets.DROPLET_USER }}@${{ secrets.DROPLET_HOST }} << 'EOF'
            set -euo pipefail
            cd /home/vicky/simonize

            echo "Pulling latest main..."
            git fetch origin main
            git reset --hard origin/main

            echo "Starting production stack..."
            NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

            echo "Running database migrations..."
            NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml run --rm backend alembic upgrade head

            echo "Smoke checking Simonizer..."
            curl -fsS http://127.0.0.1:8082/api/health

            echo "Deployment complete."
          EOF

      - name: Deployment diagnostics
        if: always()
        run: |
          ssh ${{ secrets.DROPLET_USER }}@${{ secrets.DROPLET_HOST }} << 'EOF'
            cd /home/vicky/simonize || exit 0
            echo "=== Production services ==="
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps || true
            echo "=== Recent nginx logs ==="
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=40 nginx || true
            echo "=== Recent backend logs ==="
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=40 backend || true
          EOF

      - name: Deployment summary
        if: always()
        run: |
          echo "## Deployment Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "- **Status**: ${{ job.status }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Branch**: ${{ github.ref_name }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Commit**: ${{ github.sha }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Host**: ${{ secrets.DROPLET_HOST }}" >> $GITHUB_STEP_SUMMARY
```

- [ ] **Step 3: Validate workflow YAML shape locally**

Run:

```bash
python - <<'PY'
from pathlib import Path
text = Path('.github/workflows/ci.yml').read_text()
required = [
    'needs: [backend, frontend, docker]',
    "github.event_name == 'push' && github.ref == 'refs/heads/main'",
    'NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build',
    'curl -fsS http://127.0.0.1:8082/api/health',
]
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit(f'Missing required workflow text: {missing}')
print('workflow deploy checks present')
PY
```

Expected output:

```text
workflow deploy checks present
```

- [ ] **Step 4: Commit Task 2**

Run:

```bash
git add .github/workflows/ci.yml
git commit -m "Add DigitalOcean deploy workflow"
```

---

### Task 3: Deployment Documentation And Final Verification

**Files:**
- Create: `docs/deployment.md`

**Interfaces:**
- Consumes: production compose override from Task 1.
- Consumes: deploy workflow from Task 2.
- Produces: operator-facing deployment docs for GitHub secrets, host nginx config, and troubleshooting.

- [ ] **Step 1: Add deployment docs**

Create `docs/deployment.md` with exactly this content:

```markdown
# Deployment

Simonizer deploys to the DigitalOcean droplet `flysonata-test` at `178.62.1.70`.

## Public URL

The app is served at:

```text
http://simonizer.vickystephens.co.uk
```

The DNS A record should resolve `simonizer.vickystephens.co.uk` to `178.62.1.70`.

## Architecture

```text
simonizer.vickystephens.co.uk
  -> host nginx
  -> http://127.0.0.1:8082
  -> Simonizer Docker nginx
  -> frontend container for /*
  -> backend container for /api/*
  -> PostgreSQL internal Docker network only
```

The backend and database are not exposed directly to the host or internet.

## Host Nginx Config

Add this server block to the droplet nginx config:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name simonizer.vickystephens.co.uk;

    location / {
        proxy_pass http://127.0.0.1:8082/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Validate and reload nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## GitHub Secrets

Set these repository secrets:

```text
DROPLET_HOST=178.62.1.70
DROPLET_USER=vicky
DROPLET_SSH_KEY=<private deploy key authorized for vicky on the droplet>
```

Use a dedicated deploy key, not a personal SSH key.

## Manual Production Commands

Run these on the droplet from `/home/vicky/simonize`:

```bash
just prod-up
just prod-migrate
just prod-smoke
```

Equivalent raw Docker Compose commands:

```bash
NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml run --rm backend alembic upgrade head
curl -fsS http://127.0.0.1:8082/api/health
```

## Troubleshooting

Check whether host nginx can reach Simonizer:

```bash
curl -I -H "Host: simonizer.vickystephens.co.uk" http://127.0.0.1
curl -fsS http://127.0.0.1:8082/api/health
```

Watch host nginx logs:

```bash
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

Check Simonizer containers:

```bash
cd /home/vicky/simonize
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=80 nginx backend
```

If host nginx returns `502 Bad Gateway`, first check that something is listening on `127.0.0.1:8082`:

```bash
sudo ss -ltnp | grep ':8082'
```
```

- [ ] **Step 2: Run final local verification**

Run:

```bash
just --list >/dev/null
NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml config >/dev/null
just check
```

Expected: all commands exit `0`. `just check` should pass backend Ruff, backend pytest, frontend ESLint, frontend typecheck, and frontend build.

- [ ] **Step 3: Review git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected changed files:

```text
.github/workflows/ci.yml
docker-compose.prod.yml
docs/deployment.md
justfile
```

- [ ] **Step 4: Commit Task 3**

Run:

```bash
git add docs/deployment.md
git commit -m "Document production deployment"
```

- [ ] **Step 5: Push deployment changes**

Run:

```bash
git push
```

Expected: push succeeds and GitHub Actions starts CI. Deployment will run only after CI passes on `main`.
