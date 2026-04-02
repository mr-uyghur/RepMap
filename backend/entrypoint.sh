#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Wait for PostgreSQL to be accepting connections.
# docker-compose's "condition: service_healthy" already gates the start of
# this container, but a short retry loop guards against rare timing gaps.
# ---------------------------------------------------------------------------
echo "[entrypoint] Waiting for database..."
until python manage.py check --database default >/dev/null 2>&1; do
  echo "[entrypoint] Database not ready — retrying in 2s"
  sleep 2
done
echo "[entrypoint] Database ready."

# ---------------------------------------------------------------------------
# Migrations
# ---------------------------------------------------------------------------
echo "[entrypoint] Running migrations..."
python manage.py migrate --noinput

# ---------------------------------------------------------------------------
# Seed data — safe to run on every boot because loaddata is idempotent when
# the fixture uses natural keys or when rows already exist (Django skips
# duplicates that would violate unique constraints via --ignorenonexistent).
# The "|| true" ensures a non-zero exit code (e.g. fixture already present)
# doesn't abort the container.
# ---------------------------------------------------------------------------
echo "[entrypoint] Loading initial representative data..."
python manage.py loaddata representatives/fixtures/initial_reps.json 2>/dev/null || true

# ---------------------------------------------------------------------------
# Hand off to the Django development server
# ---------------------------------------------------------------------------
echo "[entrypoint] Starting gunicorn on 0.0.0.0:8000..."
exec gunicorn repmap.wsgi:application --bind 0.0.0.0:8000 --workers 2
