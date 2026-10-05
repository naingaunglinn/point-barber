# Local set-up

A developer machine from nothing to a running stack (D-PLT-06 · design D12 / D13). Windows commands are
PowerShell; macOS and Linux are the same unless shown.

## 1. Prerequisites

| Tool         | Version                                                           | Check                    | Notes                                                                                                                                                                                                                             |
| ------------ | ----------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git          | any recent                                                        | `git --version`          | Windows: keep `core.autocrlf` as installed; `.gitattributes` keeps every file LF in the repository                                                                                                                                |
| Node.js      | 24 LTS (`.nvmrc`)                                                 | `node --version`         |                                                                                                                                                                                                                                   |
| pnpm         | `package.json` → `packageManager`, through corepack               | `pnpm --version`         | `corepack enable` once. Set `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` to skip the download question                                                                                                                                     |
| Docker       | Docker Desktop (Windows / macOS) or Docker Engine with Compose v2 | `docker compose version` | Windows: the WSL 2 back end                                                                                                                                                                                                       |
| gitleaks     | 8.30.1 (`VERSIONS.md`)                                            | `gitleaks version`       | Optional locally. The `pre-commit` hook runs it when it is on `PATH`; CI always runs it. Install it from the [GitHub release](https://github.com/gitleaks/gitleaks/releases), `brew install gitleaks` or `scoop install gitleaks` |
| OpenSpec CLI | 1.14.0                                                            | `openspec --version`     | `npm install -g @fission-ai/openspec@1.14.0`                                                                                                                                                                                      |
| OpenSSL      | any                                                               | `openssl version`        | Only to generate keys. It comes with Git for Windows (`C:\Program Files\Git\usr\bin\openssl.exe`)                                                                                                                                 |

Disk: the images and the pnpm store need about 5 GB. On a slow connection the first image build takes
a long time; see [Troubleshooting](#9-troubleshooting).

## 2. Clone and register the spec store

```powershell
mkdir point; cd point
git clone https://github.com/agkyawpai/point-sdd.git
git clone https://github.com/naingaunglinn/point-barber.git
cd point-barber
pnpm install                                         # also installs the git hooks (prepare)
openspec store register ..\point-sdd --id point-sdd  # once per machine
openspec list                                        # the changes of point-sdd appear
```

## 3. `.env`

```powershell
Copy-Item .env.example .env        # macOS / Linux: cp .env.example .env
```

`.env` is git-ignored and never enters an image (`.dockerignore`). Every variable has a one-line
comment in `.env.example`. Before the first start, change these:

- **`INTERNAL_SSR_KEY`, `INTERNAL_OPS_KEY`:** required. Each must be at least 16 characters, and the
  two must differ, or the API does not start. Generate each one with `openssl rand -hex 32`.
- **`POSTGRES_PASSWORD`, `POINT_APP_DB_PASSWORD`:** any URL-safe value; hex is safest.
  - Each password appears twice: `POSTGRES_PASSWORD` again in `MIGRATE_DATABASE_URL`, and
    `POINT_APP_DB_PASSWORD` again in `DATABASE_URL`. Change both places.
  - They take effect on the **first** start of the database volume. Later changes follow
    `docs/ops/secrets-rotation.md`.

Leave the rest as it is for local work: the origins, `API_UPSTREAM` / `WEB_UPSTREAM`, `CADDY_*`, and
the empty bucket block.

## 4. Hosts file

Add one line:

```
127.0.0.1 point.test app.point.test postgres
```

- **Windows:** `C:\Windows\System32\drivers\etc\hosts`, edited as Administrator.
- **macOS / Linux:** `/etc/hosts`, edited with `sudo`.

`point.test` is the public host and `app.point.test` the staff host (design D12). `postgres` lets the
tools on your machine use the same database URLs as the containers: `.env` names the database by its
Compose service name (recorded reading 11 of `add-repo-scaffold`).

## 5. The stack

Every command below uses both Compose files. To type less, set `COMPOSE_FILE` in your shell profile.
Don't put it in `.env`: the `check-env-example` guard would reject it.

```powershell
$env:COMPOSE_FILE = 'docker-compose.yml;docker-compose.dev.yml'   # Windows: ';' separates
export COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml     # macOS / Linux: ':'
```

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml build           # first time: slow
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
```

`migrate` is the one migrate entry point (`node db/scripts/migrate.mjs`, design D4.6). From your
machine, `pnpm db:migrate` does the same.

| Service    | What                                                                              | Reached at                                                                                       |
| ---------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `caddy`    | The edge, with Caddy's local certificate authority                                | `https://point.test`, `https://app.point.test`, `http://localhost:3000` (alias, read-only `GET`) |
| `api`      | NestJS, port 3001 in the network                                                  | through Caddy only                                                                               |
| `web`      | Next.js standalone, port 3000 in the network                                      | through Caddy only                                                                               |
| `postgres` | PostgreSQL 16; the first start runs `db/bootstrap/00-roles.sh` (role `point_app`) | `127.0.0.1:5432`                                                                                 |
| `backup`   | PostgreSQL client tools, idle                                                     | `docker compose exec backup …`                                                                   |
| `mailpit`  | Catches all mail (the OTP inbox of the next change)                               | `http://localhost:8025`, SMTP `localhost:1025`                                                   |
| `minio`    | S3-compatible bucket, only with `--profile storage`                               | `http://localhost:9000`, console `9001`                                                          |

Every port that `docker-compose.dev.yml` publishes binds to `127.0.0.1` only. Nobody on your network
can reach your database, inbox or bucket.

**Check:**

```powershell
curl.exe -sk https://app.point.test/api/v1/health      # {"status":"ok","time":"…+06:30"}
curl.exe -sk https://point.test/api/v1/system/status   # maintenance false, version 0.0.0-dev
```

Stop with `… down`. **`… down -v` also deletes the database, Caddy's certificates and the build cache.**

## 6. Database

| Command                       | What                                                                    |
| ----------------------------- | ----------------------------------------------------------------------- |
| `pnpm db:migrate`             | Applies the migrations as the owner role (`MIGRATE_DATABASE_URL`)       |
| `pnpm db:test`                | Runs the constraint tests, each file on its own fresh migrated database |
| `pnpm db:check-introspection` | Checks that `db/schema.prisma` equals the database                      |
| `pnpm db:check-source`        | Compares `db/source/` with `../point-sdd/docs/db/`                      |
| `pnpm --filter api generate`  | Regenerates the Prisma client (`apps/api/src/generated/`, git-ignored)  |

There are two roles:

- the **owner** (`POSTGRES_USER`): migrations and tests only;
- **`point_app`**: the API. It has no `UPDATE` / `DELETE` on the audit tables, and its session time
  zone is `Asia/Yangon`.

How the schema changes: [`db-changes.md`](db-changes.md).

## 7. Host-run development

To work on the API or the web app with reload, run them on your machine and leave the rest in Compose:

1. In `.env`, set
   ```
   API_UPSTREAM=host.docker.internal:3101
   WEB_UPSTREAM=host.docker.internal:3100
   ```
2. Recreate Caddy with the new upstreams: `docker compose … up -d caddy`.
3. Stop the containers you replace: `docker compose … stop api web`.
4. Run `pnpm dev`, which starts:
   - **the API on port 3101:** builds once, then `tsc --watch` and `node --watch`. It reads the
     root `.env`, with `API_PORT` forced to 3101;
   - **the web app on port 3100:** `next dev`. Its environment is described under
     [Web app](#8-web-app).

Requests still go through Caddy (`https://app.point.test`), so routing, hosts and edge rules are the
real ones. The API restarts on each rebuild, so Caddy answers **502** for the second that the
API is down. Wait, then retry.

Put both upstreams back to `api:3001` / `web:3000` before using the full stack again.

**Tests:**

| Command         | Needs                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`     | nothing: unit tests, lint-rule tests, guard tests                                                                                      |
| `pnpm test:int` | `DATABASE_URL` in the **shell** (Turborepo passes it through; it does not read `.env`), pointing at a migrated database as `point_app` |

For example:

```powershell
$env:DATABASE_URL = 'postgresql://point_app:<POINT_APP_DB_PASSWORD>@postgres:5432/point'
pnpm test:int
```

Before a push, the same checks as CI: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
`pnpm guards`, `pnpm test`.

### Which 404 is it?

The edge and the API both answer 404, and the difference tells you whether the request reached
NestJS (design D12):

| Who answered                                  | Status | Body                                                | `X-Request-Id`                            | Example                                                                                          |
| --------------------------------------------- | ------ | --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Edge** (Caddy): path refused before any app | 404    | empty                                               | none                                      | `https://point.test/api/v1/auth/otp/request`, `/api/v1/internal/…`, `/internal/…` on either host |
| **API** (NestJS): no such route               | 404    | `application/problem+json` with `code: "not_found"` | **yes**, also in the body as `request_id` | `https://app.point.test/api/v1/does-not-exist`, `https://point.test/api/v1/public/site`          |
| **Web app**: no such page                     | 404    | HTML not-found page                                 | none                                      | `https://app.point.test/v1/health`                                                               |

`curl.exe -sk -D - <url>` prints the headers, so the answer is one look away. On the public host,
only `/api/v1/public/*`, `/api/v1/health` and `/api/v1/system/status` ever reach the API.

## 8. Web app

One Next.js app serves both hosts. `proxy.ts` picks the route tree from the request's `Host` header
(design D11).

### Which host shows which tree

| URL                                                                                                                        | What you get                                                                             |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `https://point.test/`                                                                                                      | The public website: `app/site/` (for now the page with `data-testid="site-placeholder"`) |
| `https://app.point.test/`                                                                                                  | The staff app: `app/staff/` (for now `data-testid="staff-placeholder"`)                  |
| `https://point.test/staff`, `https://point.test/site`, `https://app.point.test/site`, `https://app.point.test/staff/today` | 404. A tree is reached only through its host, never by its folder name                   |
| Any other host, e.g. `http://localhost:3100` directly                                                                      | 404. Open the web app through Caddy                                                      |

`/internal/*` reaches the web app only over the Docker network; from outside, the edge refuses it
(design D12).

### Trust Caddy's local certificate

Caddy signs `point.test` and `app.point.test` with its own local certificate authority
(`CADDY_GLOBAL_OPTIONS=local_certs` in `docker-compose.dev.yml`). Until your machine trusts that
authority, browsers warn and `curl` needs `-k`.

Caddy creates the root certificate on its first start and keeps it in the `caddy_data` volume, so you
trust it once. `… down -v` deletes the volume. After that, Caddy makes a new root and you trust it
again.

Copy the root certificate out of the container, to a place outside the repository. Only the
certificate leaves the container; its private key stays in the volume.

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml cp caddy:/data/caddy/pki/authorities/local/root.crt $HOME/caddy-local-root.crt
```

Then add it to the trust store:

| System                  | Command                                                                                                       | Notes                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Windows                 | `Import-Certificate -FilePath $HOME\caddy-local-root.crt -CertStoreLocation Cert:\CurrentUser\Root`           | Windows asks you to confirm. Chrome and Edge use this store                                                                              |
| macOS                   | `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/caddy-local-root.crt` | Chrome and Safari use the system keychain                                                                                                |
| Linux (Debian / Ubuntu) | `sudo cp ~/caddy-local-root.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`             | For `curl` and the system tools. Chrome and Firefox on Linux keep their own store: import the file in the browser's certificate settings |
| WSL 2                   | Trust it on the Windows side for the browser, and run the Linux line inside WSL for `curl` there              |                                                                                                                                          |

Firefox may keep its own store on every system. If it still warns, import the file under Settings →
Privacy & Security → Certificates → View Certificates → Authorities.

**Check:** `curl.exe -s https://app.point.test/api/v1/health`, without `-k`, returns
`{"status":"ok",…}`.

### The `http://localhost:3000` alias

`docker-compose.dev.yml` makes Caddy also answer `http://localhost:3000` with the staff-host rules,
and send `Host: app.point.test` upstream (design D12, `infra/caddy/dev/localhost-alias.caddy`). It
keeps the "Local development" server of point-sdd's `docs/api/openapi/part1-foundation.yaml` working.
It is plain HTTP, so no certificate is involved.

```powershell
curl.exe -s http://localhost:3000/api/v1/health
```

Use it for **read-only `GET` calls only**. Once `add-foundation-auth-access` is merged:

- a changing request (`POST`, `PATCH`, `DELETE`) through the alias fails the CSRF origin check,
  because its origin is not `APP_ORIGIN` (API-AUTH-02);
- the session cookie is `Secure` (API-AUTH-01), so only a browser that treats `localhost` as secure
  keeps it.

Sign in and do every write on `https://app.point.test`. A change that needs `localhost` as the real
staff origin replaces this block in its own dev override; it does not reuse the alias.

### `next dev` (host-run)

`pnpm dev` starts the web app with `next dev --port 3100` in `apps/web`. Next.js reads environment
files only from `apps/web`, not the root `.env` that the API's dev script reads. Create
`apps/web/.env.development.local` (git-ignored by `.env.*`) with the variables of `apps/web/env.ts`:

```
SITE_ORIGIN=https://point.test
APP_ORIGIN=https://app.point.test
NEXT_PUBLIC_API_BASE=/api/v1
API_INTERNAL_BASE=http://localhost:3101/api/v1
```

- The origins must equal the ones in the root `.env`: `proxy.ts` compares the request's host with
  them.
- `API_INTERNAL_BASE` is the host-run API on 3101; in Compose it is `http://api:3001/api/v1`. Nothing
  calls it yet.
- `APP_VERSION` can stay unset; it defaults to `0.0.0-dev`.
- A missing or malformed variable fails each request with
  `Invalid web app environment: <name> …`, never its value.

Open the app through Caddy, with `WEB_UPSTREAM=host.docker.internal:3100` as in
[section 7](#7-host-run-development). `http://localhost:3100` itself answers 404, because its host is
neither origin.

`next dev` writes no `AGENTS.md` or `CLAUDE.md` into `apps/web`: `agentRules: false` in
`next.config.ts` turns that off, so Claude Code reads only the repository's own instructions.

## 9. Troubleshooting

| Symptom                                                                                    | Cause and fix                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Could not download the pnpm … binary: terminated` during an image build or `pnpm install` | Corepack's download timed out on a slow connection. Retry. Docker keeps the finished layers, so a retry continues from the failed step.                                                                                                                                                                 |
| `Bind for 127.0.0.1:5432 failed: port is already allocated`                                | Another PostgreSQL holds the port. Stop it, or change the left-hand port in `docker-compose.dev.yml` locally (don't commit that).                                                                                                                                                                       |
| The API container restarts with `Invalid API environment: …`                               | A variable in `.env` is missing or malformed. The message names it, never its value. The usual cause is the internal keys (empty, shorter than 16 characters, or equal).                                                                                                                                |
| The API stops with `Database session time zone is …, expected Asia/Yangon`                 | The `point_app` role or the database lost its time-zone setting (D-PLT-15), for example after a restore. Re-run `00-roles.sh`, which restores the role setting the API checks. After a restore, see `docs/ops/backup-restore.md`: restore with `--create`, which also brings back the database setting. |
| `password authentication failed for user "point_app"`                                      | `POINT_APP_DB_PASSWORD` was changed after the database volume was created. Follow `docs/ops/secrets-rotation.md`, or start over with `… down -v`, which deletes local data.                                                                                                                             |
| Browser warns about the certificate                                                        | Caddy's local root certificate is not trusted yet. See [Web app](#8-web-app). `curl` needs `-k` until then.                                                                                                                                                                                             |
| `502` from Caddy                                                                           | The upstream is not running. In host-run mode the API restarts on each rebuild: wait, then retry.                                                                                                                                                                                                       |
