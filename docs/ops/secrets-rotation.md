# Secrets rotation

**Completed by:** `add-staging-deploy` (rotation on the real server, the schedule). The sign-in and
mail secrets are from `add-foundation-auth-access`; the bucket keys come with `add-attachments-upload`
and `add-backup-restore`.

## Purpose

Change a password or an internal key without losing data.

## When

When a secret may have leaked; when a person who knew it leaves; on the schedule `add-staging-deploy`
sets.

## Before you start

- Who holds each secret: [`README.md`](README.md#who-holds-which-secret). Rotate a secret in all its
  holders at once.
- New values: `openssl rand -hex 32` for keys, `openssl rand -hex 24` for passwords. Keep them
  URL-safe: the passwords also appear inside the database URLs.
- A backup (`backup-restore.md`) before changing a database password.

## Steps

**`INTERNAL_SSR_KEY` (`api` + `web`), `INTERNAL_OPS_KEY` (`api` + `backup`):**

1. Set the new value in `.env`. Each key must stay at least 16 characters, and the two keys must
   stay different.
2. Recreate both holders together:
   - `INTERNAL_SSR_KEY`: `docker compose up -d api web`
   - `INTERNAL_OPS_KEY`: `docker compose up -d api backup`

**`OTP_HMAC_SECRET`, `AUDIT_HASH_SECRET`, `MAIL_PAYLOAD_KEY`** (`api` only — design D18):

1. Set the new value in `.env`: `openssl rand -hex 32` for the two HMAC secrets (at least 32 bytes),
   `openssl rand -base64 32` for `MAIL_PAYLOAD_KEY` (exactly 32 bytes, base64).
2. `docker compose up -d api`.

What each rotation costs:

- `OTP_HMAC_SECRET`: the sign-in codes in flight stop working (at most 5 minutes); people ask for a
  new code.
- `MAIL_PAYLOAD_KEY`: a sign-in e-mail still queued cannot be read; its job completes with a warning
  and sends nothing. Those codes are at most 5 minutes old anyway.
- `AUDIT_HASH_SECRET`: the `email_hash` of older `login.failed` rows can no longer be compared with
  new ones. Rotate it only when it may have leaked.

**`GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`** (provider secrets, `api` only):

1. Create the new secret at the provider: Google Cloud console → the OAuth client → add a secret;
   Resend → API keys → create.
2. Set it in `.env` and `docker compose up -d api`.
3. Sign in once with Google, or request one e-mail code, to check it.
4. Delete the old secret at the provider.

**`POINT_APP_DB_PASSWORD`** (role `point_app`):

1. Set the new value in `.env`, both as `POINT_APP_DB_PASSWORD` and inside `DATABASE_URL`.
2. `docker compose up -d postgres`. This recreates the container with the new variable; the data
   volume stays.
3. `docker compose exec postgres sh /docker-entrypoint-initdb.d/00-roles.sh`. It sets the new
   password and keeps the password out of the server log.
4. `docker compose up -d api`.

**`POSTGRES_PASSWORD`** (owner role):

1. `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`, then
   `\password` and the new password. `\password` sends only the hashed password, never the plain one.
2. Set the new value in `.env`, both as `POSTGRES_PASSWORD` and inside `MIGRATE_DATABASE_URL`.
   `POSTGRES_PASSWORD` itself is read only on the volume's first start.

## Check

- `GET https://<staff host>/api/v1/health` → `ok`. The API reconnected with the new password.
- `docker compose exec web printenv INTERNAL_OPS_KEY` still prints nothing and exits with status 1.
- After an owner-password change: `docker compose run --rm migrate` ends with
  `migrate: 2 step(s) done`.

## If it fails

- **`password authentication failed for user "point_app"`:** `DATABASE_URL` and the role's password
  differ. Repeat steps 1–3 of the `point_app` rotation.
- **The API stops with `Invalid API environment`:** the message names the variable. An internal key
  is shorter than 16 characters, or the two internal keys are equal; an HMAC secret is shorter than
  32 bytes; `MAIL_PAYLOAD_KEY` is not 32 bytes in base64.
