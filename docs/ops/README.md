# Operations runbooks

Handover documents for running Point Barbershop System on its server (D-PLT-06 · ADR-001 action item
5). Each runbook has the same headings: Purpose · When · Before you start · Steps · Check · If it
fails.

`backup-restore.md` is still completed by `add-backup-restore`; until then its "Pilot" section
describes the nightly stopgap of the pilot server. The rest describe the pilot server as it runs
(`add-staging-deploy`).

| Runbook                                      | Use it to                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- |
| [`install.md`](install.md)                   | Set up a new server and start the stack for the first time           |
| [`deploy.md`](deploy.md)                     | Put a new release on the server                                      |
| [`rollback.md`](rollback.md)                 | Go back to a release the server ran before                           |
| [`uptime-alert.md`](uptime-alert.md)         | Act on a down alert or a Sentry e-mail; set the monitors up          |
| [`backup-restore.md`](backup-restore.md)     | The nightly pilot dump; take a backup by hand; restore one           |
| [`secrets-rotation.md`](secrets-rotation.md) | Change a password, an internal key, a provider key or the deploy key |

## The stack

One server, Docker Compose (ADR-001): `docker-compose.yml` + `docker-compose.staging.yml`, never the dev
override. The images are pulled from `ghcr.io/<owner>/point-<name>:<tag>` (`IMAGE_PREFIX`); the server
never builds. On the server: `alias dc='docker compose -f docker-compose.yml -f docker-compose.staging.yml'`.

| Service    | Image                                      | Published | Holds                                                                                |
| ---------- | ------------------------------------------ | --------- | ------------------------------------------------------------------------------------ |
| `caddy`    | `caddy:2.11.6-alpine`                      | 80, 443   | the public certificates (volume `caddy_data`)                                        |
| `api`      | `apps/api/Dockerfile`                      | no        | `DATABASE_URL`, `INTERNAL_SSR_KEY`, `INTERNAL_OPS_KEY`, the sign-in and mail secrets |
| `web`      | `apps/web/Dockerfile`                      | no        | `INTERNAL_SSR_KEY`                                                                   |
| `postgres` | `postgres:16.15-bookworm`                  | no        | the data (volume `postgres_data`)                                                    |
| `backup`   | `infra/backup/Dockerfile`                  | no        | `INTERNAL_OPS_KEY`                                                                   |
| `migrate`  | the `api` image, profile `tools`, one-shot | no        | `MIGRATE_DATABASE_URL`                                                               |
| `mailpit`  | `axllent/mailpit:v1.31.4` (staging only)   | no        | the sign-in e-mails of the pilot server (D-ARC-02)                                   |

Every variable is in `.env` on the server. `.env.example` lists them, each with a one-line comment.

## Who holds which secret

| Secret                                                              | Held by                                                                                                       | Never in                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `INTERNAL_SSR_KEY`                                                  | `api`, `web`                                                                                                  | `backup`, `caddy`                                       |
| `INTERNAL_OPS_KEY`                                                  | `api`, `backup`                                                                                               | **`web`**: the internet-facing container (API-SHAPE-02) |
| `POSTGRES_PASSWORD` (owner role)                                    | `postgres` (first start), `MIGRATE_DATABASE_URL` → `migrate`                                                  | `api`                                                   |
| `POINT_APP_DB_PASSWORD` (role `point_app`)                          | `postgres` (`00-roles.sh`), `DATABASE_URL` → `api`                                                            | everything else                                         |
| `OTP_HMAC_SECRET`, `AUDIT_HASH_SECRET`, `MAIL_PAYLOAD_KEY`          | `api`                                                                                                         | everything else                                         |
| `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY` (provider secrets)         | `api`                                                                                                         | everything else                                         |
| Application bucket key (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) | `api`                                                                                                         | everything else                                         |
| Backup bucket key (`BACKUP_S3_*`)                                   | the pilot backup script on the host (`infra/pilot-backup`)                                                    | every container                                         |
| Deploy SSH key                                                      | GitHub environment `pilot`; its public half in `deploy`'s `authorized_keys`, bound to `infra/deploy/entry.sh` | the server (the private half is deleted there)          |

Each service lists its own variables under `environment:`, and there is no shared `env_file`. A
secret reaches exactly the containers in this table. CI job `e2e` checks it with `printenv` from
task 8.6 of `add-repo-scaffold` on.
