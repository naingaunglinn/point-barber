# shellcheck shell=bash
# The backup bucket for pilot-backup.sh and restore-check.sh (add-staging-deploy design D12). Sourced
# after infra/deploy/lib.sh. rclone's remote `backup:` comes from the environment — built from the
# server .env — so no key is ever on a command line (ps) or in a file.

RCLONE_IMAGE=rclone/rclone:1.75.2

bucket_setup() {
  export RCLONE_CONFIG_BACKUP_TYPE=s3
  export RCLONE_CONFIG_BACKUP_PROVIDER=Other
  export RCLONE_CONFIG_BACKUP_ENDPOINT RCLONE_CONFIG_BACKUP_REGION
  export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY
  RCLONE_CONFIG_BACKUP_ENDPOINT=$(env_value S3_ENDPOINT)
  RCLONE_CONFIG_BACKUP_REGION=$(env_value S3_REGION)
  RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID=$(env_value BACKUP_S3_ACCESS_KEY_ID)
  RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY=$(env_value BACKUP_S3_SECRET_ACCESS_KEY)
  # The key may not create buckets; the bucket exists.
  export RCLONE_S3_NO_CHECK_BUCKET=true
  BACKUP_BUCKET=$(env_value S3_BUCKET_BACKUP)
}

rclone() {
  docker run --rm -i --network host \
    -e RCLONE_CONFIG_BACKUP_TYPE -e RCLONE_CONFIG_BACKUP_PROVIDER -e RCLONE_CONFIG_BACKUP_ENDPOINT \
    -e RCLONE_CONFIG_BACKUP_REGION -e RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID \
    -e RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY -e RCLONE_S3_NO_CHECK_BUCKET \
    "$RCLONE_IMAGE" --retries 3 --low-level-retries 3 "$@"
}

# After a reboot the timer's catch-up run (Persistent=true) can start before PostgreSQL is ready.
wait_for_postgres() {
  for _ in $(seq 1 30); do
    compose exec -T postgres pg_isready -q >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}
