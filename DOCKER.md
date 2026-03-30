# RepMap — Docker Development Guide

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- A free [Mapbox access token](https://account.mapbox.com/)

---

## First-time Setup

**1. Configure your environment**

```bash
# The root .env already contains safe defaults for local development.
# Open it and fill in the two required values:
#   DJANGO_SECRET_KEY  — generate with the command below
#   VITE_MAPBOX_TOKEN  — your Mapbox token

python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Edit [.env](.env) and replace the placeholder values.

**2. Build and start all services**

```bash
docker-compose up --build
```

This will:
- Pull `postgres:16-alpine` and `python:3.12-slim` / `node:20-alpine` base images
- Install Python and Node dependencies inside their respective images
- Start PostgreSQL, wait for it to be healthy, then start the backend
- Run `python manage.py migrate` and seed initial representative data
- Start the Vite dev server with hot-reload enabled

**3. Open the app**

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:5173      |
| Backend API | http://localhost:8000/api/v1/representatives/ |
| Health check | http://localhost:8000/api/health/ |

---

## Daily Usage

```bash
# Start everything (no rebuild)
docker-compose up

# Start in the background
docker-compose up -d

# View logs for a specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop all services
docker-compose down

# Stop and remove the database volume (full reset)
docker-compose down -v
```

---

## Rebuilding After Dependency Changes

If you add a Python package to `backend/requirements/` or a Node package to `frontend/package.json`, rebuild the affected image:

```bash
# Rebuild only the backend image
docker-compose up --build backend

# Rebuild only the frontend image
docker-compose up --build frontend

# Rebuild everything
docker-compose up --build
```

---

## Running Management Commands

```bash
# Run any Django management command inside the backend container
docker-compose exec backend python manage.py <command>

# Examples:
docker-compose exec backend python manage.py sync_legislators
docker-compose exec backend python manage.py build_district_data
docker-compose exec backend python manage.py createsuperuser
docker-compose exec backend python manage.py shell
```

---

## Running Tests

```bash
docker-compose exec backend python manage.py test representatives
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Host machine (your laptop)                         │
│                                                     │
│  Browser → localhost:5173 (Vite dev server)         │
│          → localhost:8000 (Django API, direct)      │
└───────────────────┬──────────────────┬──────────────┘
                    │                  │
          ┌─────────▼──────┐  ┌────────▼────────┐
          │   frontend     │  │    backend       │
          │ node:20-alpine │  │ python:3.12-slim │
          │  port 5173     │  │  port 8000       │
          └────────────────┘  └────────┬─────────┘
                                       │ DATABASE_URL
                               ┌───────▼────────┐
                               │      db         │
                               │ postgres:16-    │
                               │ alpine          │
                               │ (named volume)  │
                               └────────────────┘
```

All three services communicate over the internal `repmap_net` bridge network.
The database volume `postgres_data` persists data between restarts.

---

## Troubleshooting

**Backend fails to connect to the database on first boot**

The `db` service has a healthcheck; the backend waits until it passes. If the
backend still fails, check that no other process is using port 5432 on your
host and try `docker-compose down -v && docker-compose up --build`.

**`DJANGO_SECRET_KEY` error**

Django refuses to start without a secret key. Edit `.env` and set
`DJANGO_SECRET_KEY` to a generated value (see First-time Setup above).

**Mapbox map is blank**

Set `VITE_MAPBOX_TOKEN` in `.env` to a valid Mapbox public token, then
restart: `docker-compose restart frontend`.

**Hot-reload not working**

File watching uses polling (`usePolling: true` in `vite.config.ts`) for
cross-platform compatibility. If changes still aren't picked up, ensure the
`./frontend` directory is shared in Docker Desktop → Settings → Resources →
File Sharing.

**Port already in use**

```bash
# Find and kill the process using port 8000 or 5173, or change the host-side
# port in docker-compose.yml:
#   ports:
#     - "8001:8000"   # maps host 8001 → container 8000
```
