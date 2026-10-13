# Operations runbooks

Handover documents for running Point Barbershop System on its server (D-PLT-06 · ADR-001 action item
5). Each runbook has the same headings: Purpose · When · Before you start · Steps · Check · If it
fails.

These are **skeletons**: they hold what is known now, and the change named in each file's "Completed
by" line finishes it. No server, domain, bucket or ops account exists yet; they are owner-supplied.

| Runbook                                      | Use it to                                                  | Completed by         |
| -------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| [`install.md`](install.md)                   | Set up a new server and start the stack for the first time | `add-staging-deploy` |
| [`deploy.md`](deploy.md)                     | Put a new release on the server                            | `add-staging-deploy` |
| [`rollback.md`](rollback.md)                 | Go back to the previous release                            | `add-staging-deploy` |
| [`backup-restore.md`](backup-restore.md)     | Take a backup by hand; restore one                         | `add-backup-restore` |
| [`secrets-rotation.md`](secrets-rotation.md) | Change a password or internal key                          | `add-staging-deploy` |

## The stack

One server, Docker Compose (ADR-001), from `docker-compose.yml` **without** the dev override:

| Service    | Image                                      | Published | Holds                                                                                |
| ---------- | ------------------------------------------ | --------- | ------------------------------------------------------------------------------------ |
| `caddy`    | `caddy:2.11.6-alpine`                      | 80, 443   | the public certificates (volume `caddy_data`)                                        |
| `api`      | `apps/api/Dockerfile`                      | no        | `DATABASE_URL`, `INTERNAL_SSR_KEY`, `INTERNAL_OPS_KEY`, the sign-in and mail secrets |
| `web`      | `apps/web/Dockerfile`                      | no        | `INTERNAL_SSR_KEY`                                                                   |
| `postgres` | `postgres:16.15-bookworm`                  | no        | the data (volume `postgres_data`)                                                    |
| `backup`   | `infra/backup/Dockerfile`                  | no        | `INTERNAL_OPS_KEY`                                                                   |
| `migrate`  | the `api` image, profile `tools`, one-shot | no        | `MIGRATE_DATABASE_URL`                                                               |

Every variable is in `.env` on the server. `.env.example` lists them, each with a one-line comment.

## Who holds which secret

| Secret                                                      | Held by                                                             | Never in                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| `INTERNAL_SSR_KEY`                                          | `api`, `web`                                                        | `backup`, `caddy`                                       |
| `INTERNAL_OPS_KEY`                                          | `api`, `backup`                                                     | **`web`**: the internet-facing container (API-SHAPE-02) |
| `POSTGRES_PASSWORD` (owner role)                            | `postgres` (first start), `MIGRATE_DATABASE_URL` → `migrate`        | `api`                                                   |
| `POINT_APP_DB_PASSWORD` (role `point_app`)                  | `postgres` (`00-roles.sh`), `DATABASE_URL` → `api`                  | everything else                                         |
| `OTP_HMAC_SECRET`, `AUDIT_HASH_SECRET`, `MAIL_PAYLOAD_KEY`  | `api`                                                               | everything else                                         |
| `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY` (provider secrets) | `api`                                                               | everything else                                         |
| Bucket keys (`S3_*`, `BACKUP_S3_*`)                         | reserved; read by `add-attachments-upload` and `add-backup-restore` | n/a                                                     |

Each service lists its own variables under `environment:`, and there is no shared `env_file`. A
secret reaches exactly the containers in this table. CI job `e2e` checks it with `printenv` from
task 8.6 of `add-repo-scaffold` on.
