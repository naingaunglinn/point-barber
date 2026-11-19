#!/usr/bin/env bash
# The pilot's stopgap backup (add-staging-deploy design D12 · SD4 = A · docs/ops/backup-restore.md,
# "Pilot"): every night at 03:00 MMT (point-pilot-backup.timer) a pg_dump custom-format dump of the
# database is streamed into the owner's backup bucket as pilot/daily/point-<YYYY-MM-DD>.dump. It never
# lands on the server's disk (CG-SEC-11): pg_dump in the postgres container | rclone rcat to
# pilot/daily/.partial/, then moved into place only when both sides succeeded; otherwise the partial
# object is deleted. Retention (30 days) is the bucket's lifecycle rule on pilot/daily/.
# Removed by add-backup-restore (#72), which brings the backup sidecar.
#
# Reads from the server .env: POSTGRES_DB, POSTGRES_USER; the backup bucket's own key
# BACKUP_S3_ACCESS_KEY_ID / BACKUP_S3_SECRET_ACCESS_KEY and S3_BUCKET_BACKUP (ADR-014 least
# privilege); the provider's S3_ENDPOINT and S3_REGION (both buckets are at the one provider).
# Prints one line: `pilot-backup ok <object> <bytes>` or `pilot-backup FAILED dump|upload|move`
# (exit 1); the service unit writes it to the journal.
# PILOT_BACKUP_DATE=YYYY-MM-DD names the object for another day (CI job deploy-script only).
set -euo pipefail

main() {
  # shellcheck source=../deploy/lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib.sh"
  # shellcheck source=bucket.sh
  source "$(dirname "${BASH_SOURCE[0]}")/bucket.sh"
  cd "$DEPLOY_ROOT"
  bucket_setup

  local day bucket object partial status dump upload bytes
  day="${PILOT_BACKUP_DATE:-$(TZ=MMT-6:30 date +%F)}"
  bucket=$BACKUP_BUCKET
  object="pilot/daily/point-$day.dump"
  partial="pilot/daily/.partial/point-$day.dump"

  failed() {
    rclone deletefile "backup:$bucket/$partial" >/dev/null 2>&1 || true
    say "pilot-backup FAILED $1"
    exit 1
  }

  wait_for_postgres || true
  # Both sides' statuses: when the upload breaks, pg_dump ends on a broken pipe, so the upload is
  # checked first and named as the cause.
  set +e
  compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    | rclone rcat "backup:$bucket/$partial"
  status=("${PIPESTATUS[@]}")
  set -e
  dump=${status[0]}
  upload=${status[1]}
  [ "$upload" -eq 0 ] || failed upload
  [ "$dump" -eq 0 ] || failed dump

  rclone moveto "backup:$bucket/$partial" "backup:$bucket/$object" || failed move
  bytes=$(rclone size --json "backup:$bucket/$object" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
  say "pilot-backup ok $object ${bytes:-?}"
}

main "$@"
