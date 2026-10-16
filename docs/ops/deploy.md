# Deploy

**Completed by:** `add-staging-deploy` (registry push from CI, the SSH deploy job, the first deploy,
monitoring hooks).

## Purpose

Put a new release on a running server.

## When

After a release is tagged on `main`, and CI was green for the merged commit.

## Before you start

- The release tag (`APP_VERSION`) and the tag running now (`GET /api/v1/system/status` → `version`),
  for `rollback.md`.
- A backup from today (`backup-restore.md`). Migrations are additive (CG-DB-02), so a rollback never
  needs one. A restore does.
- Read the release's new variables, if any, in the diff of `.env.example`.

## Steps

1. Check out the release tag on the server.
2. Add any new variables to `.env`, and set `APP_VERSION` to the release tag.
3. `docker compose build`. _`add-staging-deploy` replaces this with a pull of the CI-built images._
4. `docker compose run --rm migrate`. Migrations run before the new code, and they are additive, so
   the running release keeps working on the new schema.
5. `docker compose up -d`. Compose recreates only the services whose image or settings changed.
6. Only on an environment that has no company admin yet (the first release with sign-in): create it
   once with `admin-create`, as `install.md` step 6 describes.

## Check

- `GET https://<public host>/api/v1/system/status` → `version` is the new tag.
- `GET https://<staff host>/api/v1/health` → `status` is `ok`.
- `docker compose ps` shows no service restarting.

## If it fails

- **`migrate` fails:** stop here; the running release still runs. Prisma records the failed migration
  and applies no further one until it is resolved. Send the output to the developer of that migration.
- **The new release misbehaves after `up -d`:** follow `rollback.md`.
