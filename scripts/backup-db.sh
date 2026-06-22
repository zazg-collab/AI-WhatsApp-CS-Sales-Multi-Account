#!/bin/sh
# Pre-migration database snapshot — the rollback safety net.
#
# Runs `pg_dump` against the running Postgres container before a deploy applies
# migrations. Forward-only Prisma migrations have no down path, so a timestamped
# dump is the only way back from a destructive migration. Keeps the last
# BACKUP_KEEP (default 14) dumps and prunes older ones.
#
# Usage (on the server, from the repo root): ./scripts/backup-db.sh
# Restore (manual, deliberate): see docs/deployment.md → "Rollback".
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
PG_SERVICE="${PG_SERVICE:-postgres}"
PG_USER="${POSTGRES_USER:-hermes}"
PG_DB="${POSTGRES_DB:-hermes}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/${PG_DB}-${STAMP}.sql.gz"

echo "Backing up database '$PG_DB' → $OUT"
$COMPOSE exec -T "$PG_SERVICE" pg_dump -U "$PG_USER" "$PG_DB" | gzip > "$OUT"

# Fail if the dump is suspiciously small (empty/failed dump should not pass as a
# valid safety net before we let migrations run).
if [ "$(gzip -dc "$OUT" | head -c 100 | wc -c)" -lt 50 ]; then
  echo "FATAL: backup looks empty; aborting before migrations run." >&2
  rm -f "$OUT"
  exit 1
fi

echo "Backup OK. Pruning to last $BACKUP_KEEP dumps."
ls -1t "$BACKUP_DIR/${PG_DB}-"*.sql.gz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm -f
