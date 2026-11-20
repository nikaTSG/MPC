#!/bin/sh
set -e

DB_FILE="/app/data/prod.db"
SEED_DB="/app/server/prisma/dev.db"

if [ ! -f "$DB_FILE" ] && [ -f "$SEED_DB" ]; then
  echo "Initializing SQLite database from seeded dev.db..."
  cp "$SEED_DB" "$DB_FILE"
fi

exec "$@"