#!/bin/sh
set -e

echo "=== Running Database Migrations ==="
alembic upgrade head

echo "=== Loading POI search table (skipped when snapshot unchanged) ==="
python -m app.repositories.poi_repo || echo "POI load failed; /pois/search falls back to in-memory search"

if [ "$SEED_DEMO" = "true" ] || [ "$SEED_DEMO" = "1" ]; then
    echo "=== SEED_DEMO is true, running seed script ==="
    python -m app.core.seed
fi

echo "=== Starting Uvicorn on port ${PORT:-8000} ==="
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1 --proxy-headers --forwarded-allow-ips="*"
