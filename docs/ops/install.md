# Install

## Purpose

Set up a new server and start Point Barbershop System on it for the first time, so that releases reach
it through the release workflow (`deploy.md`).

The first server is the **pilot server** (add-staging-deploy design D1): one VPS (Singapore, 4 vCPU /
8 GB / 100 GB SSD, Ubuntu 24.04 LTS), rented on the owner's ops account. It is labelled
`APP_ENV=staging` for one reason only: sign-in e-mails go to a Mailpit on the same machine until the
owner's domain is verified at Resend (D-ARC-02). For its data it is production: real staff and real
customers. So:

- no dump leaves it except to the owner's backup bucket (CG-SEC-11);
- no browser tester or Playwright run is pointed at it;
- at go-live, the same server and database become production (the go-live switch below).

## When

Once per server: the pilot server, or a replacement after a loss (then continue with
`backup-restore.md` → Restore).

## Before you start

From the owner (add-staging-deploy tasks 1.1–1.6). Everything is on the owner's ops Gmail:

- The VPS, created with the operator's public SSH key. No password is exchanged.
- Two DNS `A` records pointing at the server's IPv4: the public host (`SITE_ORIGIN`) and the staff
  host `app.…` (`APP_ORIGIN`).
- The Google OAuth client: its client id (may be sent normally), with the redirect address
  `https://<staff host>/api/v1/auth/google/callback`. The **client secret** is not sent: it is typed in
  step 5, while the owner reads it out.
- The two Sentry DSNs (projects `point-api`, `point-web`). They may be sent normally.
- The Cloudflare R2 buckets and their two keys: the application bucket, and the backup bucket with the
  lifecycle rule "delete `pilot/daily/` after 30 days". The **keys** are typed in steps 5 and 7, while
  the owner reads them out.
- The first company admin: Google e-mail, name in Myanmar, name in English, employee code.

**How values travel (design D16):**

- Secret values (the Google client secret, the bucket keys, later the Resend key) are typed into the
  server `.env` by the operator during a shared screen session, while the owner reads them from the
  provider console. They are never sent by chat or e-mail, never committed, never pasted into an AI
  prompt (CG-AI-08).
- Internal secrets are generated on the server and never leave it.
- Host names, the client id, the DSNs, bucket names and the admin's e-mail may travel normally. They
  are still not committed (CG-SEC-11).
- Record what you did **by name only** under "Install record" at the end of this file. Never record a
  value.

## Steps

**1. Base system** (as the operator, with sudo):

```sh
sudo timedatectl set-timezone Asia/Yangon
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get -y install unattended-upgrades ufw git curl
```

- In `/etc/ssh/sshd_config.d/10-point.conf`: `PasswordAuthentication no` and `PermitRootLogin no`.
  Then `sudo systemctl reload ssh`. Before you close your session, check from a second terminal that
  you can still log in with your key.
- Firewall:
  ```sh
  sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
  sudo ufw enable
  ```
- Security updates install unattended, but **without an automatic reboot**: a reboot during opening
  hours would stop the shop. In `/etc/apt/apt.conf.d/50unattended-upgrades`, keep
  `Unattended-Upgrade::Automatic-Reboot "false";`. Reboot by hand, in the deploy window
  (`deploy.md`).

**2. Docker** (Engine and Compose v2 from Docker's apt repository, per docs.docker.com → Install
Docker Engine on Ubuntu). Then send the container logs to the journal, kept 7 days (ADR-007
decision 5):

- `/etc/docker/daemon.json`: `{ "log-driver": "journald" }`. Then `sudo systemctl restart docker`.
- `/etc/systemd/journald.conf.d/10-point.conf`: `[Journal]` and `MaxRetentionSec=7day`. Then
  `sudo systemctl restart systemd-journald`.

`docker compose logs` keeps working with the journald driver.

**3. The deploy user and the checkout:**

```sh
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo mkdir -p /opt/point && sudo chown deploy:deploy /opt/point
sudo -u deploy git clone https://github.com/<repository owner>/point-barber.git /opt/point
```

`deploy` has no password and no sudo. Membership of `docker` is root-equivalent, so the forced command
of step 4 is what limits the deploy key.

**4. The deploy key** (design D5):

1. Make a new key pair, without a passphrase:
   `ssh-keygen -t ed25519 -N "" -C point-deploy -f /tmp/point-deploy`.
2. Put its public half into `/home/deploy/.ssh/authorized_keys`, on one line, behind the forced command:
   ```
   command="/opt/point/infra/deploy/entry.sh",restrict ssh-ed25519 AAAA… point-deploy
   ```
   Make `.ssh` mode `700` and `authorized_keys` mode `600`, both owned by `deploy`.
3. In a shared screen session with the repository admin, hand over three values for the GitHub
   environment `pilot` (task 1.7):
   - `PILOT_SSH_KEY`: the private half, from `/tmp/point-deploy`;
   - `PILOT_SSH_HOST`: the server's host name or IPv4;
   - `PILOT_SSH_KNOWN_HOSTS`: one line built from the server's own host key, so nothing is taken on
     trust from the network: `echo "<host> $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"`.
     Here `<host>` is exactly what `PILOT_SSH_HOST` holds.
4. Delete the private half from the server: `shred -u /tmp/point-deploy`.

Check it from your own machine with the key: `ssh -i <key> deploy@<host> ls` must answer `refused`.

**5. The server `.env`** (as `deploy`, in `/opt/point`):

```sh
cp .env.example .env && chmod 600 .env
```

Set the values below. Every other value keeps its `.env.example` default.

| Variable                                                                     | Value on the pilot server                                                                   | Who types it                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| `SITE_ORIGIN`, `APP_ORIGIN`                                                  | `https://<public host>`, `https://<staff host>` (no path, no trailing slash)                | operator                        |
| `POSTGRES_PASSWORD`, `POINT_APP_DB_PASSWORD`                                 | `openssl rand -hex 24` each; the same values inside `MIGRATE_DATABASE_URL` / `DATABASE_URL` | operator, generated             |
| `INTERNAL_SSR_KEY`, `INTERNAL_OPS_KEY`                                       | `openssl rand -hex 32` each (two different values)                                          | operator, generated             |
| `OTP_HMAC_SECRET`, `AUDIT_HASH_SECRET`                                       | `openssl rand -hex 32` each                                                                 | operator, generated             |
| `MAIL_PAYLOAD_KEY`                                                           | `openssl rand -base64 32`                                                                   | operator, generated             |
| `APP_ENV`                                                                    | `staging`                                                                                   | operator                        |
| `MAIL_TRANSPORT`, `SMTP_HOST`, `RESEND_API_KEY`                              | `mailpit`, `mailpit`, empty                                                                 | operator                        |
| `GOOGLE_CLIENT_ID`                                                           | from the owner                                                                              | operator                        |
| `GOOGLE_CLIENT_SECRET`                                                       | from the Google Cloud console                                                               | operator, while the owner reads |
| `COMPANY_NAME_MM`, `COMPANY_NAME_EN`                                         | from the owner                                                                              | operator                        |
| `SENTRY_DSN_API`, `SENTRY_DSN_WEB`                                           | the two DSNs                                                                                | operator                        |
| `CADDY_CSP_CONNECT`                                                          | the origin of `SENTRY_DSN_WEB`, e.g. `https://o0.ingest.sentry.io`                          | operator                        |
| `IMAGE_PREFIX`                                                               | `ghcr.io/<repository owner>/`                                                               | operator                        |
| `S3_ENDPOINT`, `S3_REGION`                                                   | `https://<account id>.r2.cloudflarestorage.com`, `auto`                                     | operator                        |
| `S3_BUCKET_APP`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                  | the application bucket and its key                                                          | operator, while the owner reads |
| `S3_BUCKET_BACKUP`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | the backup bucket and its key (step 7)                                                      | operator, while the owner reads |
| `CADDY_GLOBAL_OPTIONS`, `CADDY_HSTS`                                         | empty, `max-age=31536000`                                                                   | (defaults)                      |
| `APP_VERSION`                                                                | leave `0.0.0-dev`; the first deploy writes the tag                                          | (the deploy)                    |

- `SESSION_COOKIE_SECURE=true` and `MAIL_ALLOW_REAL=false` stay as in `.env.example`.
- `grep -c change-me .env` must print `0`. The deploy refuses to run otherwise.

**6. The server stack** is `docker-compose.yml` + `docker-compose.staging.yml`, never
`docker-compose.dev.yml`:

- the images come from `ghcr.io` (the server never builds);
- only Caddy publishes ports (80, 443);
- `mailpit` holds the sign-in e-mails and publishes no port.

You never start it by hand: the first deploy (step 8) pulls, migrates and starts it (a rehearsal is the
exception, see below). For a command by hand, as `deploy` in `/opt/point`:

```sh
alias dc='docker compose -f docker-compose.yml -f docker-compose.staging.yml'
```

**7. The nightly backup** (design D12 · SD4 = A). Install the timer once:

```sh
sudo cp /opt/point/infra/pilot-backup/point-pilot-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now point-pilot-backup.timer
systemctl list-timers point-pilot-backup.timer   # NEXT shows 03:00
```

The backup bucket values of step 5 must be in `.env`. The hand-run check needs a running database,
so it comes after the first release (end of step 8).

**8. The first release** (task 11.1). From a developer machine, push the tag on `main`:
`git tag v0.1.0 <commit> && git push origin v0.1.0`. The release workflow:

1. checks the tag;
2. builds and pushes the images;
3. waits for the other developer to approve `deploy` in the GitHub environment `pilot`;
4. then runs `deploy v0.1.0` on the server (`deploy.md`).

While the repository is public, set the three `ghcr.io/<owner>/point-*` packages to public (task 11.2).
The server pulls without a login.

Once the deploy is `ok`, check the backup of step 7 by hand:
`sudo systemctl start point-pilot-backup.service`, then
`journalctl -t pilot-backup -n 5` → the last line is `pilot-backup ok pilot/daily/point-<date>.dump <bytes>`
(the rclone `NOTICE` lines above it are normal), and run the restore drill once (`backup-restore.md`, "Pilot").

**9. First company admin** (once per environment — P1-RULE-14), with the owner present. After the
first deploy, once the base seed job has finished: `dc logs api | grep -c 'sync.code_tables step done'` prints `3`
(before that the roles may still be missing and the command refuses):

```sh
dc exec api node dist/cli/admin-create.js \
  --email <their Google e-mail> --name-mm "<name in Myanmar>" --name-en "<name in English>" --code <employee code>
```

- It prints the new employee code and exits with status 0. No invitation e-mail is sent.
- It refuses (status 1, one line on stderr, nothing changed) when an active company admin exists, or
  when the e-mail or the code is taken. An admin who has not signed in yet counts as active (P1-RULE-14):
  a second run before the first sign-in is refused.
- The admin signs in with **Google**, in the browser tab, on an Android phone and on an iPhone. Staff
  use Google on the pilot server: e-mail codes only reach Mailpit.

## Check

From outside the server (task 11.4):

- `https://<public host>/` and `https://<staff host>/` answer with a publicly trusted certificate.
  `http://` redirects to `https://`.
- `curl -s https://<staff host>/api/v1/health` → `{"status":"ok",…}`.
- `curl -s https://<public host>/api/v1/system/status` → `"version":"v0.1.0"`.
- `curl -sI https://<staff host>/login | grep -i content-security-policy` → the policy, on both
  hosts.
- `curl -s -o /dev/null -w '%{http_code}' https://<public host>/api/v1/internal/backup-runs` →
  `404`.
- A port scan (`nmap -Pn <host>`) shows only 22, 80, 443.

On the server:

- `grep -c change-me /opt/point/.env` → `0`.
- `dc exec web printenv INTERNAL_OPS_KEY` prints nothing and exits with status 1.
- Mail stays on the server (task 11.5): request a code for the admin's address in the browser. The
  response is 202, nothing arrives in that mailbox, and
  `dc exec api node -e "fetch('http://mailpit:8025/api/v1/messages').then(r=>r.text()).then(console.log)"`
  shows the message.
- The logs are kept 7 days (task 11.8):
  - `journalctl --disk-usage`;
  - `journalctl -u docker -n 1 --reverse --output short-iso` shows the newest entry, and the oldest
    entry is at most 7 days old after a week.
- The first nightly backup line, then one restore drill (`backup-restore.md`, "Pilot").
- Monitoring and error reports: `uptime-alert.md`, "Set-up" (tasks 11.6, 11.7).
- Before the pilot starts, open and share one receipt PDF on an Android phone and an iPhone (task
  11.9).

## If it fails

- **`api` keeps restarting:** run `dc logs api`. Look for `Invalid API environment: …`, which names
  the variable but not its value, or for a database time zone other than `Asia/Yangon`.
- **Caddy has no certificate:** check the DNS records and that ports 80/443 are reachable from
  outside. Caddy logs the ACME error: `dc logs caddy`.
- **The deploy job cannot connect:**
  - `Permission denied (publickey)`: the `authorized_keys` line or its modes are wrong.
  - `Host key verification failed`: `PILOT_SSH_KNOWN_HOSTS` does not match the server.
- **The deploy stops with `missing in .env: …` or `change-me in .env: …`:** fix `.env` and approve
  the job again. Nothing was changed.
- **`migrate` fails:** read its output. Prisma records a failed migration and applies no further one
  until it is resolved. Send the output to the developer of that migration before running anything
  else against the database.

## The go-live switch (not run by this runbook)

At go-live (`add-go-live-readiness`), the same server and database become production (SD2 = A).

In `.env`:

- `SITE_ORIGIN` and `APP_ORIGIN` change to the final host names;
- `APP_ENV=production`;
- `MAIL_TRANSPORT=resend`, `RESEND_API_KEY` (typed while the owner reads it), and `MAIL_FROM` with the
  verified domain.

Outside `.env`:

- the Google redirect address;
- the two HetrixTools monitors;
- the DNS records.

Each phone signs in once more on the new host.

## A rehearsal on a developer machine

Not part of an install. Use it to walk this runbook against production images before the server exists,
with fixture data only (CG-SEC-11). Four things differ from the server:

- **Its own project name, before the first `up`.** `docker-compose.yml` sets `name: point`, the same as
  the dev stack, and `dc`, `deploy.sh`, `pilot-backup.sh` and `restore-check.sh` pass no `-p`. Without
  the line below, they act on the dev stack's `postgres`. Use a separate checkout with its own `.env`,
  and add to that `.env`:

  ```sh
  COMPOSE_PROJECT_NAME=point-rehearsal
  ```

  The pilot server runs one stack, so its `.env` does not need this line.

- **One Caddy at a time.** Both stacks publish ports 80 and 443, so stop the dev stack's Caddy first.
- **No `deploy.sh`.** It accepts only a `vX.Y.Z` tag on `main` and pulls from `ghcr.io`, so a local tag
  such as `v0.1.0-local` is refused, on purpose. Do its steps by hand, after setting `APP_VERSION` to the
  local tag and `IMAGE_PREFIX` to the prefix the images were built with:

  ```sh
  dc --profile tools run --rm migrate
  dc up -d --no-build
  ```

- **No release workflow.** Step 8's tag, approval and package steps do not apply. Step 9 works as
  written once the stack is up. On a machine without systemd, run
  `infra/pilot-backup/pilot-backup.sh` directly instead of step 7's timer.

## Install record

Names only, never values. Who did each step, and when:

| Step                              | Done by | Date | Note |
| --------------------------------- | ------- | ---- | ---- |
| 1 Base system                     |         |      |      |
| 2 Docker, journald                |         |      |      |
| 3 Deploy user, checkout           |         |      |      |
| 4 Deploy key, environment secrets |         |      |      |
| 5 Server `.env`                   |         |      |      |
| 7 Backup timer                    |         |      |      |
| 8 First release                   |         |      |      |
| 9 First company admin             |         |      |      |
