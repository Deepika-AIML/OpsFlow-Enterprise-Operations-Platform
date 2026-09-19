#!/bin/sh
set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-3306}"

echo "Waiting for MySQL at ${DB_HOST}:${DB_PORT}..."
python - <<PYCODE
import socket
import time

host = "${DB_HOST}"
port = int("${DB_PORT}")

for attempt in range(60):
    try:
        socket.create_connection((host, port), timeout=2).close()
        print("Database is reachable.")
        break
    except OSError:
        print(f"  ...not ready yet (attempt {attempt + 1}/60)")
        time.sleep(2)
else:
    raise SystemExit("Database did not become reachable within 120 seconds.")
PYCODE

cd /app/src

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Seeding demo Admin/Manager/Employee accounts (safe to re-run)..."
python manage.py seed_demo_users

echo "Starting Django on 0.0.0.0:8000 ..."
exec python manage.py runserver 0.0.0.0:8000
