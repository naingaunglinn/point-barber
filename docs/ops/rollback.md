# Rollback

**Completed by:** `add-staging-deploy` (images by tag from the registry, the rollback job).

## Purpose

Go back to the previous release when a new one misbehaves.

## When

After `deploy.md`, when the new release fails its checks or causes errors that cannot wait for a fix.

## Before you start

- The previous release tag, noted before the deploy.
- **Migrations are never rolled back.** They are additive during V1 (CG-DB-02): no dropped table,
  column or type change. So the previous release runs on the newer schema as it is. There are no
  down-migrations. A schema problem is fixed by a new forward migration.

## Steps

1. Set `APP_VERSION` in `.env` back to the previous tag, and check that tag out.
2. `docker compose build`. _`add-staging-deploy` replaces this with a pull of the previous tag's
   images._
3. `docker compose up -d`. Do **not** run `migrate`.

## Check

- `GET https://<public host>/api/v1/system/status` → `version` is the previous tag.
- `GET https://<staff host>/api/v1/health` → `status` is `ok`.

## If it fails

- **The previous release does not start on the newer schema:** a migration was not additive, which the
  migration guard should have refused (`tools/guards/check-migrations.mjs`). Restore the backup taken
  before the deploy (`backup-restore.md`). Report the migration.
