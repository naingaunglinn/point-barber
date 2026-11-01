# Rollback

## Purpose

Go back to a release the server ran before, when a new one misbehaves (add-staging-deploy design D6).

## When

- After a deploy whose output ended with `to go back: rollback <tag>`.
- Or when a deployed release causes errors that cannot wait for a fix.

Fixing forward with a new release is often better when the cause is known and small. A rollback is
for "stop the harm now".

## Before you start

- The tag to go back to. It must be in the server's history as deployed `ok`:
  `grep ' ok$' /opt/point/deploy-history.log`. The deploy keeps the images of the last three good tags
  on the server, so a rollback normally needs no registry.
- **Migrations are never rolled back.** They are additive during V1 (CG-DB-02): no dropped table,
  column or type change. So the older code runs on the newer schema as it is. There are no
  down-migrations, and the rollback command never runs `migrate`.

## Steps

**Normal way: the Rollback workflow.**

1. Actions → Rollback → Run workflow, `tag` = the tag to go back to.
2. The other developer approves the environment `pilot`.
3. The server runs `infra/deploy/rollback.sh <tag>`:
   1. checks the tag is in the history as `ok`;
   2. checks it out and sets `APP_VERSION`;
   3. pulls its images, only if they are not on the server;
   4. `up -d` — no migrate;
   5. the same health and version checks as a deploy;
   6. a history line `rollback <tag> ok|failed`.

**When GitHub or the second developer cannot be reached** (the shop is losing time): on the server,
as the operator:

```sh
sudo -u deploy /opt/point/infra/deploy/rollback.sh <tag>
```

It does the same. It needs no network apart from the registry, and only when the images are gone.
Tell the other developer afterwards.

## Check

- `curl -s https://<public host>/api/v1/system/status` → `"version":"<tag>"`.
- `curl -s https://<staff host>/api/v1/health` → `"status":"ok"`.
- `tail -n 1 /opt/point/deploy-history.log` → `… rollback <tag> ok`.
- `dc exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM _prisma_migrations"'`
  gives the same number as before. Nothing was migrated.

## If it fails

- **`<tag> was never deployed here`:** that tag never ran here successfully. Choose one from the
  history's `ok` lines.
- **`rollback to <tag> failed`:** the older release does not start on the current schema or
  configuration.
  - Read `dc logs --since 10m api`.
  - If a migration was not additive (the migration guard `tools/guards/check-migrations.mjs` should
    have refused it), restore the last good backup (`backup-restore.md`) and report the migration.
  - If a variable is the cause, fix `.env` and run the rollback again.
