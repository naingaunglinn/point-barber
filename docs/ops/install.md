# Install

**Completed by:** `add-staging-deploy` (server, registry, SSH deploy, monitoring hooks).

## Purpose

Set up a new server and start Point Barbershop System on it for the first time.

## When

Once per server: the first staging server, the production server, or a replacement after a loss
(then continue with `backup-restore.md` → Restore).

## Before you start

- A Linux server with Docker Engine and Compose v2 (`docker compose version`), with ports 80 and 443
  open to the internet and nothing else published.
- Two DNS names pointing at the server: the public host (for `SITE_ORIGIN`, e.g. `point.example`) and
  the staff host (for `APP_ORIGIN`, e.g. `app.point.example`). Caddy gets their certificates itself.
- The release to install: its Git tag, which becomes `APP_VERSION`.
- _Owner-supplied, not available yet:_ the domain (ACT-05), the bucket and its keys (ADR-014), the ops
  accounts (ADR-007).

## Steps

1. **Code.** Clone point-barber on the server and check out the release tag.
2. **`.env`.** Copy `.env.example` to `.env` (mode `600`, owned by the deploy user) and set the
   values below. The `change-me-*` passwords in `.env.example` are placeholders for a developer
   machine (coding guideline CG-SEC-05); none may stay on a server.
   - `SITE_ORIGIN`, `APP_ORIGIN`: the two hosts, `https://…`, no path, no trailing slash.
   - `POSTGRES_PASSWORD`, `POINT_APP_DB_PASSWORD`: new URL-safe passwords, e.g.
     `openssl rand -hex 24`. Write the same values into `MIGRATE_DATABASE_URL` and `DATABASE_URL`.
     The host in both URLs stays `postgres`.
   - `INTERNAL_SSR_KEY`, `INTERNAL_OPS_KEY`: two different values, each at least 16 characters,
     e.g. `openssl rand -hex 32`. The API does not start otherwise.
   - `APP_VERSION`: the release tag.
   - Leave `CADDY_GLOBAL_OPTIONS` empty and `CADDY_HSTS` at `max-age=31536000`.
3. **Images.** `docker compose build`. _`add-staging-deploy` replaces this with a pull from the
   registry._
4. **Start.** `docker compose up -d`. Do not use `docker-compose.dev.yml` on a server. On its first
   start `postgres` runs `db/bootstrap/00-roles.sh`, which creates the role `point_app` with its
   password and the `Asia/Yangon` time zone.
5. **Migrate.** `docker compose run --rm migrate`, which runs `node db/scripts/migrate.mjs` as the
   owner role.

## Check

- `curl -s https://<staff host>/api/v1/health` → `{"status":"ok","time":"…+06:30"}`.
- `curl -s https://<public host>/api/v1/system/status` → `"version"` equals the release tag, and
  `"maintenance": false`.
- `https://<public host>/` shows the website and `https://<staff host>/` the staff app.
- `docker compose exec web printenv INTERNAL_OPS_KEY` prints nothing and exits with status 1.
- `grep -c change-me .env` prints `0`.

## If it fails

- **`api` keeps restarting:** run `docker compose logs api`. Look for `Invalid API environment: …`,
  which names the variable but not its value, or a database time zone other than `Asia/Yangon`.
- **Caddy has no certificate:** check DNS and that ports 80/443 are reachable from outside. Caddy logs
  the ACME error.
- **`migrate` fails:** read its output. Prisma records a failed migration and applies no further one
  until it is resolved. Send the output to the developer of that migration before running anything
  else against the database.
