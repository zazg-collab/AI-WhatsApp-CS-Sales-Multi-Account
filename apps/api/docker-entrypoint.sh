#!/bin/sh
set -e

# Apply any pending Prisma migrations before the API starts. This keeps the
# database schema in lockstep with the deployed image. `migrate deploy` only
# runs already-generated migrations (no schema drift / no prompts), so it is
# safe to run on every boot.
echo "Running database migrations..."
npx --prefix packages/database prisma migrate deploy --schema packages/database/prisma/schema.prisma || {
  echo "WARNING: prisma migrate deploy failed; continuing to start API." >&2
}

echo "Running database seed..."
cd /app && npm run db:seed 2>/dev/null || echo "WARNING: seed failed; continuing." >&2

exec "$@"
