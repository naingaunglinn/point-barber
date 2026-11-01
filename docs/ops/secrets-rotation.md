# Secrets rotation

## Purpose

Change a password, an internal key or a provider key without losing data.

## When

There is no calendar (SD6 = A). A secret changes:

- when it may have leaked (a laptop lost, a value pasted where it should not be, a provider's
  notice);
- when a person who knew it leaves the team.

The owner and both developers decide together which secrets the person knew.

## Before you start

- Who holds each secret: [`README.md`](README.md#who-holds-which-secret). Rotate a secret in all its
  holders at once.
- On the server, as `deploy` in `/opt/point`, every command below uses the server stack:
  `alias dc='docker compose -f docker-compose.yml -f docker-compose.staging.yml'`.
- New values: `openssl rand -hex 32` for keys, `openssl rand -hex 24` for passwords. Keep them
  URL-safe: the passwords also appear inside the database URLs.
- A provider secret is typed into `.env` while the owner reads it from the provider console. It is
  never sent by chat or e-mail (`install.md`, "How values travel").
- A backup (`backup-restore.md`) before changing a database password.

## Steps

**`INTERNAL_SSR_KEY` (`api` + `web`), `INTERNAL_OPS_KEY` (`api` + `backup`):**

1. Set the new value in `.env`. Each key must stay at least 16 characters, and the two keys must
   stay different.
2. Recreate both holders together:
   - `INTERNAL_SSR_KEY`: `dc up -d api web`
   - `INTERNAL_OPS_KEY`: `dc up -d api backup`

**`OTP_HMAC_SECRET`, `AUDIT_HASH_SECRET`, `MAIL_PAYLOAD_KEY`** (`api` only — design D18):

1. Set the new value in `.env`: `openssl rand -hex 32` for the two HMAC secrets (at least 32 bytes),
   `openssl rand -base64 32` for `MAIL_PAYLOAD_KEY` (exactly 32 bytes, base64).
2. `dc up -d api`.

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
2. Set it in `.env` and `dc up -d api`.
3. Sign in once with Google, or request one e-mail code, to check it.
4. Delete the old secret at the provider.

**`POINT_APP_DB_PASSWORD`** (role `point_app`):

1. Set the new value in `.env`, both as `POINT_APP_DB_PASSWORD` and inside `DATABASE_URL`.
2. `dc up -d postgres`. This recreates the container with the new variable; the data
   volume stays.
3. `dc exec postgres sh /docker-entrypoint-initdb.d/00-roles.sh`. It sets the new
   password and keeps the password out of the server log.
4. `dc up -d api`.

**`POSTGRES_PASSWORD`** (owner role):

1. `dc exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`, then
   `\password` and the new password. `\password` sends only the hashed password, never the plain one.
2. Set the new value in `.env`, both as `POSTGRES_PASSWORD` and inside `MIGRATE_DATABASE_URL`.
   `POSTGRES_PASSWORD` itself is read only on the volume's first start.

**The deploy SSH key** (GitHub environment `pilot` + the server's `authorized_keys`):

1. On the server, make a new pair: `ssh-keygen -t ed25519 -N "" -C point-deploy -f /tmp/point-deploy`.
2. Add the new public half to `/home/deploy/.ssh/authorized_keys` with the same
   `command="/opt/point/infra/deploy/entry.sh",restrict` prefix. Keep the old line for now.
3. With the repository admin, in a shared screen session: replace `PILOT_SSH_KEY` in the environment
   `pilot` with the new private half. Then `shred -u /tmp/point-deploy`.
4. Run the Rollback workflow from the running tag (Use workflow from → Tags), with `tag` = the tag
   running now. It changes nothing, and it proves the new key.
5. Delete the old line from `authorized_keys`.

**The Sentry DSNs** (`SENTRY_DSN_API` → `api`, `SENTRY_DSN_WEB` → `web`). A DSN is not a secret, but
a leaked one lets anyone send events into the quota.

1. Sentry → the project → Client Keys → create a new key, and copy its DSN.
2. Set it in `.env`. For the web DSN, `CADDY_CSP_CONNECT` stays the same origin.
3. `dc up -d api` or `dc up -d web`, then disable the old key in Sentry.

**The bucket keys** (`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` → `api`; `BACKUP_S3_ACCESS_KEY_ID` /
`BACKUP_S3_SECRET_ACCESS_KEY` → the pilot backup script):

1. Cloudflare → R2 → API tokens: create a new token limited to the one bucket (application or backup).
   The owner reads the two values while the operator types them into `.env`.
2. Application key: `dc up -d api`, then open one receipt in the app. Backup key: run
   `sudo systemctl start point-pilot-backup.service` and read `journalctl -t pilot-backup -n 1` →
   `ok`.
3. Delete the old token at Cloudflare.

**The GHCR read token** (only once the repository and its packages are private — ADR-016):

1. A token with only `read:packages`, made by the repository admin.
2. On the server, as `deploy`: `docker login ghcr.io -u <admin> --password-stdin`, typing the token
   while the admin reads it.
3. Check it: `dc pull api`. Then revoke the old token on GitHub.

**The server's read credential for `git fetch`** (only once the repository is private): a read-only
deploy key of `point-barber` (GitHub → Settings → Deploy keys), used by `deploy`'s `origin`.

1. Add the new key on GitHub.
2. Put its private half in `/home/deploy/.ssh/`, and point an `ssh` config `Host github.com` entry at
   it.
3. Check it: `sudo -u deploy git -C /opt/point fetch origin`. Then remove the old key on GitHub.

## Check

- `GET https://<staff host>/api/v1/health` → `ok`. The API reconnected with the new password.
- `dc exec web printenv INTERNAL_OPS_KEY` still prints nothing and exits with status 1.
- After an owner-password change: `dc run --rm migrate` ends with
  `migrate: 2 step(s) done`.

## If it fails

- **`password authentication failed for user "point_app"`:** `DATABASE_URL` and the role's password
  differ. Repeat steps 1–3 of the `point_app` rotation.
- **The API stops with `Invalid API environment`:** the message names the variable. An internal key
  is shorter than 16 characters, or the two internal keys are equal; an HMAC secret is shorter than
  32 bytes; `MAIL_PAYLOAD_KEY` is not 32 bytes in base64.
