# Backup and restore

**Completed by:** `add-backup-restore` (schedule, upload to the backup bucket, retention, the backup
watchdog, `backup_runs` reported through the internal API).

## Purpose

Take a copy of the database, and restore one.

## When

- **Backup:** before every deploy, and until `add-backup-restore` schedules it, by hand every day.
- **Restore:** after data loss, or onto a new server (`install.md` first, then this).

## Before you start

- The `backup` service has the PostgreSQL 16 client tools (`pg_dump`, `pg_restore`, `psql`). Until
  `add-backup-restore` gives it a database connection, the steps below run the client tools in the
  `postgres` container, which has the owner role's variables.
- Store copies off the server. The backup bucket (`S3_BUCKET_BACKUP`) is owner-supplied and reserved
  for `add-backup-restore`.

## Steps

**Backup:**

```sh
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > point-$(date +%Y%m%d-%H%M).dump
```

**Restore:**

1. Stop the writers: `docker compose stop api web`.
2. Make sure the role `point_app` exists, since the dump grants to it:
   ```sh
   docker compose exec postgres sh /docker-entrypoint-initdb.d/00-roles.sh
   ```
   It is safe to run twice, and it also sets the role's `Asia/Yangon` time zone.
3. Drop the damaged database, if there is one:
   ```sh
   docker compose exec postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"'
   ```
4. Restore with `--create`, which re-creates the database **with its settings**, including
   `ALTER DATABASE … SET timezone` (D-PLT-15):
   ```sh
   docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d postgres --create --no-owner' < point-….dump
   ```
5. `docker compose run --rm migrate`. It applies any migration newer than the dump; the older ones
   are recorded in the restored data.
6. `docker compose up -d`.

## Check

- `docker compose exec postgres psql -U point_app -d "$POSTGRES_DB" -Atc 'SHOW timezone'` →
  `Asia/Yangon`. The API refuses to start otherwise.
- `GET https://<staff host>/api/v1/health` → `ok`.
- _`add-backup-restore` adds the row-count and integrity checks of a restore drill._

## If it fails

- **The API stops with "Database session time zone is …":** the role or database setting is missing.
  Two causes:
  - Step 2 was skipped: run it.
  - The dump was restored without `--create`, so the database setting is gone: repeat steps 3–4.
- **`pg_restore` reports missing roles:** step 2 was skipped. Run it, then repeat steps 3–4.
