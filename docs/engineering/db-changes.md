# Database changes

How the database of point-barber is built and how it changes (design D4 of `add-repo-scaffold` ·
CG-DB-01 · CG-DB-02 · D-PLT-06).

## Where the truth is

- **point-sdd `docs/db/`** — the locked design: DBML, constraint SQL (`*-constraints.sql`) and constraint
  tests (`*-test.sql`). Every change to the database starts there.
- **`db/source/`** — byte-identical copies of those files, with `manifest.json` (file name, SHA-256 of the
  LF-normalised text, the point-sdd commit). Never edited in point-barber.
- **`db/migrations/`** — what is applied, in order: `<timestamp>_baseline` (generated once from
  `db/source/`), `<timestamp>_app_role_grants` (hand-written), then one forward migration per later change.
- **`db/schema.prisma`** — produced by `prisma db pull`; a typing aid for the Prisma client, never
  edited by hand and never used to generate DDL. CHECK, partial-unique, EXCLUDE constraints and triggers
  live only in the SQL.

## One migrate entry point

`node db/scripts/migrate.mjs` (`pnpm db:migrate`) is the **only** thing that migrates a database: the
developer command, the Compose `migrate` service, the CI jobs `db`, `integration` and `e2e`, and the
deploy runbook all call it. It is an ordered list of steps — now one, `prisma migrate deploy`. A change
that needs an owner-role step after the migrations (for example the pg-boss schema and its grants in
`add-foundation-auth-access`) **appends a step to this script**; it is then picked up everywhere at once.
Never run `prisma migrate deploy` (or any migration) another way.

Connections: `MIGRATE_DATABASE_URL` = the owner role (migrations, introspection, constraint tests);
`DATABASE_URL` = `point_app` (the API). `point_app` is created before the migrations by
`db/bootstrap/00-roles.sh`.

## How a later database change flows

1. **point-sdd first.** Edit the DBML / constraint / test file in `docs/db/`, bump its version, add the
   README line and the decision-register note. It is reviewed there.
2. **New forward migration in point-barber.** Write
   `db/migrations/<timestamp>_<change-id>/migration.sql` by hand. During V1 it is **additive only** — no
   `DROP TABLE`, `DROP COLUMN`, `RENAME`, `ALTER COLUMN … TYPE` (system-design §4.1, CG-DB-02). A merged
   migration is never edited or deleted; `pnpm guards` (`check-migrations.mjs`) fails if one is.
3. **Source copies.** Replace the changed files in `db/source/` with the new point-sdd files and update
   `manifest.json` (hash + commit). `pnpm db:check-source` must pass (it also compares with
   `../point-sdd/docs/db` when the sibling folder exists).
4. **Introspection.** Migrate a fresh database and run `prisma db pull`; commit `db/schema.prisma`.
   `pnpm db:check-introspection` must pass.
5. **Tests.** `pnpm db:test` — every `*-test.sql` on its own freshly migrated database — must report
   `PASS` for every case.

The baseline is never rebuilt (`db/scripts/build-baseline.mjs` refuses when one exists).

## Commands

| Command                              | Does                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `pnpm db:migrate`                    | Applies every pending migration (owner role)                                                     |
| `pnpm db:test`                       | Constraint tests: template database migrated once, one copy per `*-test.sql`, `PGTZ=Asia/Yangon` |
| `pnpm db:check-source`               | `db/source/` = manifest (+ = `../point-sdd/docs/db` when present)                                |
| `pnpm db:check-introspection`        | Committed `db/schema.prisma` = a fresh `prisma db pull`                                          |
| `node db/scripts/check-baseline.mjs` | CI checks: 91 tables, `btree_gist`, `Asia/Yangon`, `point_app` privileges                        |

These need `psql` (PostgreSQL 16 client) on the PATH and a reachable PostgreSQL 16.
