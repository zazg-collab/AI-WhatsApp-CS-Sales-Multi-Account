#!/bin/sh
set -e

# Apply any pending Prisma migrations before the API starts. This keeps the
# database schema in lockstep with the deployed image. `migrate deploy` only
# runs already-generated migrations (no schema drift / no prompts).
echo "Running database migrations..."
if npx --prefix packages/database prisma migrate deploy --schema packages/database/prisma/schema.prisma; then
  echo "Migrations applied."
else
  # Fail-fast in production: booting the API against a stale/partial schema turns
  # a clear deploy failure into silent runtime 500s, and the rollout should abort
  # instead of serving a broken release. Outside production we warn and continue
  # so local/dev boots aren't blocked by a transient/unreachable DB.
  if [ "$NODE_ENV" = "production" ]; then
    echo "FATAL: prisma migrate deploy failed in production; aborting boot." >&2
    exit 1
  fi
  echo "WARNING: prisma migrate deploy failed (NODE_ENV=$NODE_ENV); continuing to start API." >&2
fi

exec "$@"
