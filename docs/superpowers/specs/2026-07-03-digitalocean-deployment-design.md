# DigitalOcean Deployment Design

## Goal

Deploy Simonizer to the DigitalOcean droplet `flysonata-test` after changes merge to `main` and CI passes.

The public app URL is `simonizer.vickystephens.co.uk`. The DNS A record should resolve that exact hostname to `178.62.1.70`.

## Chosen Architecture

Use the droplet's existing host nginx as the public entrypoint and keep Simonizer's own Docker nginx as the app boundary.

Traffic flow:

```text
simonizer.vickystephens.co.uk
  -> host nginx on the droplet
  -> http://127.0.0.1:8082
  -> Simonizer Docker nginx
  -> frontend container for /*
  -> backend container for /api/*
  -> PostgreSQL internal Docker network only
```

The backend and database are not exposed directly to the host network or internet. Only the Simonizer nginx container is bound on the host, and only to `127.0.0.1:8082`.

## Production Compose

The development compose file can continue exposing Simonizer nginx on port 80 for local Slice 0 usage.

Production should use a compose override that changes the nginx port binding to:

```yaml
ports:
  - "127.0.0.1:8082:80"
```

This avoids conflict with the host nginx service already listening on ports 80 and 443.

## Host Nginx

The droplet should add a new server block:

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

After editing nginx config on Ubuntu:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Deployment Workflow

GitHub Actions should deploy only after the backend, frontend, and Docker CI jobs pass on `main`.

The deploy job will:

1. SSH to the droplet as `vicky` using a dedicated deploy key.
2. Change directory to `/home/vicky/simonize`.
3. Pull latest `main`.
4. Build/recreate the production compose stack.
5. Run Alembic migrations with `alembic upgrade head`.
6. Smoke-check `http://127.0.0.1:8082/api/health`.
7. Print container status and recent logs for debugging.

Required GitHub secrets:

- `DROPLET_HOST`: `178.62.1.70`
- `DROPLET_USER`: `vicky`
- `DROPLET_SSH_KEY`: private key for a dedicated deployment key authorized for user `vicky` on the droplet

## Operational Commands

Production deploy commands should be available locally as `just` recipes, using the production compose override:

- `just prod-up`
- `just prod-down`
- `just prod-logs`
- `just prod-migrate`
- `just prod-smoke`

## Testing

CI should continue running:

- Backend lint and tests
- Frontend lint, typecheck, and build
- Docker compose config validation and image builds

Deployment should add a post-deploy smoke check for:

```bash
curl -fsS http://127.0.0.1:8082/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Out Of Scope

- HTTPS automation and certificate management.
- Moving existing droplet services into Docker.
- Replacing host nginx with a container reverse proxy.
- Publishing Docker images to GHCR before deployment.
