#!/usr/bin/env bash
# The pilot's restore drill (add-staging-deploy design D12 · docs/ops/backup-restore.md, "Pilot"):
#   sudo -u deploy /opt/point/infra/pilot-backup/restore-check.sh <YYYY-MM-DD>
# Streams pilot/daily/point-<date>.dump from the backup bucket into a scratch database, compares
# the users count with the live database, and drops the scratch database. Like the backup, the dump
# never lands on the server's disk (CG-SEC-11), and the live database is only read.
# Prints `restore-check ok <object>: users <n> in the dump, <m> now`, or `restore-check FAILED …`
# with exit 1.
set -euo pipefail

main() {
  local day="${1:?usage: restore-check.sh <YYYY-MM-DD>}" object restored live status
  [[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "restore-check: $day is not a date"; exit 1; }

  # shellcheck source=../deploy/lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib.sh"
  # shellcheck source=bucket.sh
  source "$(dirname "${BASH_SOURCE[0]}")/bucket.sh"
  cd "$DEPLOY_ROOT"
  bucket_setup
  object="pilot/daily/point-$day.dump"

  psql_in() { # database, query
    compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d '$1' -tAc '$2'"
  }
  drop_scratch() {
    compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists restore_check' >/dev/null
  }

  drop_scratch
  compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" restore_check'
  trap drop_scratch EXIT

  set +e
  rclone cat "backup:$BACKUP_BUCKET/$object" \
    | compose exec -T postgres sh -c \
      'pg_restore -U "$POSTGRES_USER" -d restore_check --no-owner --no-privileges --exit-on-error'
  status=("${PIPESTATUS[@]}")
  set -e
  [ "${status[0]}" -eq 0 ] || { say "restore-check FAILED read $object"; exit 1; }
  [ "${status[1]}" -eq 0 ] || { say "restore-check FAILED restore $object"; exit 1; }

  restored=$(psql_in restore_check 'SELECT count(*) FROM users')
  live=$(compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM users"')
  say "restore-check ok $object: users $restored in the dump, $live now"
}

main "$@"
