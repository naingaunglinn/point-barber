#!/bin/sh
# Creates / updates the role point_app (design D4.4). Used by the postgres image's init
# directory, CI job db and docs/ops/install.md. Reads POINT_APP_DB_PASSWORD from the
# environment and passes it to 00-roles.sql as a psql variable — the init directory cannot.
# Connection: POSTGRES_USER / POSTGRES_DB (+ the usual PGHOST / PGPORT / PGPASSWORD).
set -eu

: "${POINT_APP_DB_PASSWORD:?POINT_APP_DB_PASSWORD is required}"

if [ -z "${ROLES_SQL:-}" ]; then
  # Works when executed and when sourced by the postgres entrypoint (bash).
  script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE:-$0}")" && pwd)
  ROLES_SQL="$script_dir/00-roles.sql"
fi

psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  -v app_password="$POINT_APP_DB_PASSWORD" \
  -f "$ROLES_SQL"
