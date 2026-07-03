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

## Droplet Environment

Create `/home/vicky/simonize/.env` on the droplet before the first production deploy:

```bash
cd /home/vicky/simonize
cp .env.example .env
$EDITOR .env
./scripts/check-production-env.sh .env
```

Required production values:

```text
DB_PASSWORD=<strong unique database password>
SECRET_KEY=<strong unique application secret>
ADMIN_USERNAME=simon
ADMIN_PASSWORD=<strong unique admin password>
```

Production deploys fail if `DB_PASSWORD`, `SECRET_KEY`, or `ADMIN_PASSWORD` are missing or still set to the defaults from `.env.example`.

## Manual Production Commands

Run these on the droplet from `/home/vicky/simonize`:

```bash
just prod-check-env
just prod-deploy-local
```

Equivalent raw Docker Compose commands:

```bash
./scripts/check-production-env.sh .env
NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml build
NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d db
NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml run --rm backend alembic upgrade head
NGINX_HTTP_PORT=127.0.0.1:8082 docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
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
