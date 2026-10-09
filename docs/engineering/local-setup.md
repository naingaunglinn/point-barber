# Local set-up

A developer machine from nothing to a running stack (D-PLT-06 · design D12 / D13). Windows commands are
PowerShell; macOS and Linux are the same unless shown.

## 1. Prerequisites

Install these before you clone. `.nvmrc` and `package.json` name the exact versions, but you can only
read them after the clone.

| Tool              | Version                                                            | Check                                   | Notes                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git               | any recent                                                         | `git --version`                         | Windows: keep `core.autocrlf` as installed; `.gitattributes` keeps every file LF in the repository                                                                                                                                                                                                                                                       |
| Node.js           | 24 LTS (`.nvmrc`)                                                  | `node --version` → `v24.…`              | With nvm-windows: `nvm install 24`, then `nvm use 24`. That asks for Administrator rights and switches Node for the whole machine. With nvm (macOS / Linux): `nvm install 24`. Or the installer from nodejs.org                                                                                                                                          |
| pnpm              | `package.json` → `packageManager` (12.8.1 today), through corepack | `pnpm --version`, inside `point-barber` | Run `corepack enable` once, with Node 24 active. To skip corepack's download question, set `$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'` (PowerShell) or `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0`. Check inside `point-barber`: anywhere else corepack shows its own default version                                                                    |
| Docker            | Docker Desktop (Windows / macOS) or Docker Engine with Compose v2  | `docker compose version`                | Windows: the WSL 2 back end                                                                                                                                                                                                                                                                                                                              |
| gitleaks          | 8.30.1 (`VERSIONS.md`)                                             | `gitleaks version`                      | Optional locally. The `pre-commit` hook runs it when it is on `PATH`; CI always runs it. Install it with `brew install gitleaks` or `scoop install gitleaks`. On Windows without scoop, download the Windows x64 archive of 8.30.1 from the [GitHub release](https://github.com/gitleaks/gitleaks/releases) and put `gitleaks.exe` in a folder on `PATH` |
| OpenSpec CLI      | 1.14.0                                                             | `openspec --version`                    | `npm install -g @fission-ai/openspec@1.14.0`, with Node 24 active                                                                                                                                                                                                                                                                                        |
| OpenSSL           | any                                                                | `openssl version`                       | Only to generate keys and passwords. Git for Windows ships it, but not on PowerShell's `PATH`: call it by its full path, `& 'C:\Program Files\Git\usr\bin\openssl.exe' rand -hex 32`, or run the command in Git Bash                                                                                                                                     |
| PostgreSQL client | 16                                                                 | `psql --version`                        | Only for `pnpm db:test`, which runs `psql` on your machine. Install the PostgreSQL 16 command-line tools and put `psql` on `PATH`                                                                                                                                                                                                                        |

Disk: the images and the pnpm store need about 5 GB. pnpm keeps its store at the root of the drive
that holds the clone (for example `D:\.pnpm-store`), so that drive needs the space. On a slow
connection the first image build takes a long time; see [Troubleshooting](#9-troubleshooting).

## 2. Clone and register the spec store

```powershell
mkdir point; cd point
git clone https://github.com/agkyawpai/point-sdd.git
git clone https://github.com/naingaunglinn/point-barber.git
cd point-barber
pnpm install                                         # also installs the git hooks (prepare)
openspec store register ..\point-sdd --id point-sdd  # once per machine, and again if you move or re-clone point-sdd
openspec list                                        # the changes of point-sdd appear
```

The registry keeps point-sdd's absolute path, so a moved or deleted clone leaves a stale entry.

OpenSpec and Turborepo collect anonymous usage statistics by default and say so on first use. To opt
out, set `OPENSPEC_TELEMETRY=0` and `TURBO_TELEMETRY_DISABLED=1` in your shell profile. In PowerShell
that is `$env:OPENSPEC_TELEMETRY = '0'`.

## 3. `.env`

```powershell
Copy-Item .env.example .env        # macOS / Linux: cp .env.example .env
```

`.env` is git-ignored and never enters an image (`.dockerignore`). Every variable has a one-line
comment in `.env.example`.

Open `.env` in your editor (for example `code .env`) and replace the values below. Keep the file
UTF-8 with LF line endings. Don't rewrite it with Windows PowerShell 5.1's `Get-Content` /
`Set-Content`: they misread the UTF-8 comments (`·` shows as `Â·`) and change the encoding. On Windows,
run `openssl` by its full path (section 1).

Before the first start, change these:

- **`INTERNAL_SSR_KEY`, `INTERNAL_OPS_KEY`:** required. Each must be at least 16 characters, and the
  two must differ, or the API does not start. Generate each one with `openssl rand -hex 32`.
- **`POSTGRES_PASSWORD`, `POINT_APP_DB_PASSWORD`:** any URL-safe value. Hex is safest:
  `openssl rand -hex 16`.
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

- **Windows:** in a PowerShell opened as Administrator, run:
  ```powershell
  Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value '127.0.0.1 point.test app.point.test postgres'
  ```
  Or open Notepad as Administrator, open `C:\Windows\System32\drivers\etc\hosts`, add the line and save.
- **macOS / Linux:** `echo '127.0.0.1 point.test app.point.test postgres' | sudo tee -a /etc/hosts`
- **WSL 2:** the browser runs on Windows, so the Windows file needs the line. WSL normally rebuilds
  its own `/etc/hosts` from the Windows file when it starts. Check inside WSL with
  `getent hosts point.test`. If that prints nothing, add the line to `/etc/hosts` as well.

`point.test` is the public host and `app.point.test` the staff host (design D12). `postgres` lets the
tools on your machine use the same database URLs as the containers: `.env` names the database by its
Compose service name (recorded reading 11 of `add-repo-scaffold`). With this line, `postgres` means
127.0.0.1 for every program on the machine.

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
machine, `pnpm db:migrate` does the same, reading `MIGRATE_DATABASE_URL` from `.env`
([section 6](#6-database)).

| Service    | What                                                                              | Reached at                                                                                       |
| ---------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `caddy`    | The edge, with Caddy's local certificate authority                                | `https://point.test`, `https://app.point.test`, `http://localhost:3000` (alias, read-only `GET`) |
| `api`      | NestJS, port 3001 in the network                                                  | through Caddy only                                                                               |
| `web`      | Next.js standalone, port 3000 in the network                                      | through Caddy only                                                                               |
| `postgres` | PostgreSQL 16; the first start runs `db/bootstrap/00-roles.sh` (role `point_app`) | `127.0.0.1:5432`                                                                                 |
| `backup`   | PostgreSQL client tools, idle                                                     | `docker compose exec backup …`                                                                   |
| `mailpit`  | Catches all mail (the OTP inbox of the next change)                               | `http://localhost:8025`, SMTP `localhost:1025`                                                   |
| `minio`    | S3-compatible bucket, only with `--profile storage`                               | `http://localhost:9000`, console `9001`                                                          |

Every port that `docker-compose.dev.yml` publishes binds to `127.0.0.1` only, so nobody on your
network can reach your database, inbox or bucket. Some ports listen on all interfaces, and your
firewall decides whether other machines reach them:

- Caddy's 80 and 443, from `docker-compose.yml`;
- in host-run mode ([section 7](#7-host-run-development)), 3100 and 3101.

**Check:**

```powershell
curl.exe -sk https://app.point.test/api/v1/health      # {"status":"ok","time":"…+06:30"}
curl.exe -sk https://point.test/api/v1/system/status   # maintenance false, version 0.0.0-dev
```

Stop with `… down`. **`… down -v` also deletes the database, Caddy's certificates and the build cache.**

## 6. Database

`pnpm db:migrate`, `pnpm db:test` and `pnpm db:check-introspection` read `MIGRATE_DATABASE_URL` from
the root `.env`. Its host `postgres` reaches the stack's database through the hosts-file line of
section 4. A value set in the shell wins over `.env`; to use another database for one command, set
it there:

```powershell
$env:MIGRATE_DATABASE_URL = 'postgresql://point:<password>@localhost:5432/point'   # Windows
export MIGRATE_DATABASE_URL='postgresql://point:<password>@localhost:5432/point'   # macOS / Linux
```

`pnpm db:test` also needs `psql` on your machine (section 1). The scripts pass the password to `psql`
through `PGPASSWORD`, never on its command line.

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
4. Once per clone, create `apps/web/.env.development.local` as described in
   [`next dev` (host-run)](#next-dev-host-run). Without it, every page answers
   `500 Invalid web app environment: …`.
5. Run `pnpm dev`, which starts:
   - **the API on port 3101:** builds once, then runs `tsc --watch` and `node --watch`. It reads the
     root `.env`, with `API_PORT` forced to 3101;
   - **the web app on port 3100:** `next dev`, with the file of step 4.

Requests still go through Caddy (`https://app.point.test`), so routing, hosts and edge rules are the
real ones. The API restarts on each rebuild, so Caddy answers **502** for the second that the
API is down. Wait, then retry. Only a new build of the API restarts it: writes to `apps/web/.next`,
`node_modules` or `.git` do not.

To go back to the full stack:

1. Stop `pnpm dev`.
2. Put both upstreams back to `api:3001` / `web:3000` in `.env`.
3. Run `docker compose … up -d`. It recreates Caddy and starts `api` and `web` again.

Until step 3, both hosts answer 502.

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

| System                  | Command                                                                                                       | Notes                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows                 | `Import-Certificate -FilePath $HOME\caddy-local-root.crt -CertStoreLocation Cert:\CurrentUser\Root`           | Run it in an ordinary PowerShell window (no Administrator needed) and confirm the Security Warning dialog. Chrome and Edge use this store: close all their windows and reopen them before you check |
| macOS                   | `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/caddy-local-root.crt` | Chrome and Safari use the system keychain                                                                                                                                                           |
| Linux (Debian / Ubuntu) | `sudo cp ~/caddy-local-root.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`             | For `curl` and the system tools. Chrome and Firefox on Linux keep their own store: import the file in the browser's certificate settings                                                            |
| WSL 2                   | Trust it on the Windows side for the browser, and run the Linux line inside WSL for `curl` there              |                                                                                                                                                                                                     |

Firefox may keep its own store on every system; on Windows, Firefox 152 did. If it still warns:

1. Import the file under Settings → Privacy & Security → Certificates → View Certificates →
   Authorities → Import.
2. Tick "Trust this CA to identify websites".
3. Restart Firefox.

A browser that was open during the import may show "Not secure" until it is fully restarted.

**Check, without `-k`.** Either command returns `{"status":"ok",…}`:

```powershell
curl.exe -s --ssl-revoke-best-effort https://app.point.test/api/v1/health   # Windows
curl -s https://app.point.test/api/v1/health                                # macOS / Linux / WSL
```

Windows' `curl.exe` also checks revocation, and Caddy's local authority can't answer that check.
Without `--ssl-revoke-best-effort` it fails with `CRYPT_E_NO_REVOCATION_CHECK` even though the
certificate is trusted.

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
| Browser warns about the certificate, or shows "Not secure"                                 | Caddy's local root certificate is not trusted yet. See [Trust Caddy's local certificate](#trust-caddys-local-certificate). If you just imported it, close all browser windows and reopen them. Firefox may need its own import. `curl` needs `-k` until then.                                           |
| `curl.exe` on Windows fails with `CRYPT_E_NO_REVOCATION_CHECK` (exit 35)                   | The certificate is trusted, but Windows' curl also checks revocation, which Caddy's local authority can't answer. Add `--ssl-revoke-best-effort`.                                                                                                                                                       |
| `502` from Caddy                                                                           | The upstream is not running. In host-run mode the API restarts on each rebuild: wait, then retry. After switching back from host-run mode, run `docker compose … up -d` ([section 7](#7-host-run-development)).                                                                                         |
| `MIGRATE_DATABASE_URL is required` from a `pnpm db:*` script                               | Neither `.env` nor the shell has it. Check that the root `.env` exists and has the line (section 3), or set it in the shell (section 6).                                                                                                                                                                |
| `could not start psql (ENOENT)` from `pnpm db:test`                                        | The PostgreSQL 16 client is not on `PATH`. Install it (section 1), or set `PSQL` to the full path of `psql.exe`.                                                                                                                                                                                        |
| Every page answers `500 Invalid web app environment: …` in host-run mode                   | `apps/web/.env.development.local` is missing. Create it as in [`next dev` (host-run)](#next-dev-host-run).                                                                                                                                                                                              |
