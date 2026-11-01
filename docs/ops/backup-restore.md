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

- `docker compose exec postgres sh -c 'psql -U point_app -d "$POSTGRES_DB" -Atc "SHOW timezone"'` →
  `Asia/Yangon`. The API refuses to start otherwise.
- `GET https://<staff host>/api/v1/health` → `ok`.
- _`add-backup-restore` adds the row-count and integrity checks of a restore drill._

## If it fails

- **The API stops with "Database session time zone is …":** the role or database setting is missing.
  Two causes:
  - Step 2 was skipped: run it.
  - The dump was restored without `--create`, so the database setting is gone: repeat steps 3–4.
- **`pg_restore` reports missing roles:** step 2 was skipped. Run it, then repeat steps 3–4.

## Pilot (until `add-backup-restore`)

The pilot server runs a stopgap (add-staging-deploy design D12 · SD4 = A, owner 16/Oct/2026).

**What runs.**

- `point-pilot-backup.timer` starts `infra/pilot-backup/pilot-backup.sh` every night at 03:00 MMT.
  It is installed by `install.md` step 7.
- The script streams `pg_dump -Fc` straight into the owner's backup bucket as
  `pilot/daily/point-<YYYY-MM-DD>.dump`. Nothing is written to the server's disk.
- The bucket deletes the dumps after 30 days (its lifecycle rule).
- If the server was off at 03:00, the timer runs the missed night once it is back.

**Not covered** (the owner was told, SD4): weekly copies kept a year, the automatic monthly restore
test, `backup_runs`, and a failure notification. Those come with `add-backup-restore`.

**The morning check** (the operator, each day of the pilot, before opening):

```sh
journalctl -t pilot-backup --since yesterday
```

- `pilot-backup ok pilot/daily/point-<today>.dump <bytes>`: done. The size grows slowly from day to
  day.
- `pilot-backup FAILED dump|upload|move`, or no line at all:
  1. take a dump by hand today (Steps → Backup, above);
  2. keep it off the server;
  3. run `sudo systemctl start point-pilot-backup.service` once the cause is fixed.

  The common causes:
  - `upload`: the bucket key, or the provider;
  - `dump`: the `postgres` container is down.

**The restore drill** (once before the pilot starts, and after any change to the script). It restores
into a scratch database and never touches the real one:

```sh
alias dc='docker compose -f docker-compose.yml -f docker-compose.staging.yml'
# 1. Fetch last night's dump from the bucket console (owner) or with rclone, into /tmp on the server.
# 2. Restore into a scratch database and compare one count:
dc exec postgres sh -c 'createdb -U "$POSTGRES_USER" restore_check'
dc exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d restore_check --no-owner --no-privileges' < /tmp/point-<date>.dump
dc exec postgres sh -c 'psql -U "$POSTGRES_USER" -d restore_check -tAc "SELECT count(*) FROM users"'
dc exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM users"'
# 3. Clean up — the dump holds personal data (CG-SEC-11):
dc exec postgres sh -c 'dropdb -U "$POSTGRES_USER" restore_check'
shred -u /tmp/point-<date>.dump
```

The two counts match, or differ only by users created since 03:00. Write the date and the result in
`install.md`'s install record.
