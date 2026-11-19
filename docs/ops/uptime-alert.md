# The uptime alert fires

## Purpose

Know within minutes that the shop cannot work, and know what to do in the first five minutes
(ADR-007 decision 2 / 3 · add-staging-deploy design D11).

## When

- A HetrixTools **down** alert arrives (Telegram and the ops e-mail).
- Or a Sentry e-mail reports a new issue.
- Or the branch calls to say the app does not work.

## Before you start

Who receives what:

| Signal                                                                                                                      | Sent to                                                           | Typical delay     |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- |
| HetrixTools "Point — staff API": `GET <APP_ORIGIN>/api/v1/health` must contain `"status":"ok"`, every 60 s from 4 locations | Telegram: the owner and both developers · e-mail: the ops address | about 1–2 minutes |
| HetrixTools "Point — public site": `GET <SITE_ORIGIN>/` must answer 200                                                     | the same                                                          | about 1–2 minutes |
| Sentry `point-api` / `point-web`: a new issue, or an event of an issue, at most one e-mail per 5 minutes per rule           | the ops address (Sentry's one seat)                               | minutes           |

Neither is an in-app notification to staff (D-ARC-02). You need SSH access to the server as the
operator, and the alias of `install.md` step 6:
`alias dc='docker compose -f docker-compose.yml -f docker-compose.staging.yml'`, as `deploy` in
`/opt/point`.

## Steps

**The first five minutes:**

1. Say in the team chat that you are on it, so two people do not restart things at once.
2. `dc ps`: which service is not `running`, or not `healthy`?
3. `dc logs --since 10m api` (then `web`, `caddy`, `postgres` as needed). Look for:
   - `Invalid API environment`;
   - a database connection error;
   - `ENOSPC`;
   - an out-of-memory kill.
4. Disk and memory:
   - `df -h /`, and `docker system df`;
   - `free -m`;
   - `journalctl -k --since -15m | grep -i oom`.
5. Was there a deploy just now? `tail -n 3 /opt/point/deploy-history.log`.

**Then one of these:**

- **A service stopped or hangs:** restart in this order, waiting for each to be healthy:
  ```sh
  dc restart postgres   # only if postgres is the one in trouble
  dc restart api
  dc restart web
  dc restart caddy
  ```
- **It started with a deploy:** roll back (`rollback.md`). Do not debug on the live server first.
- **The disk is full:**
  - `docker image prune -f` removes images no container uses; the deploy keeps the last three good
    tags.
  - Then `journalctl --vacuum-time=7d`.
- **Data is damaged or lost:** stop the writers (`dc stop api web`) and follow
  `backup-restore.md` → Restore, with the owner.
- **The server itself is unreachable** (no SSH): check the VPS provider's console and status page.
  Reboot from there if needed.

**A Sentry e-mail:**

1. Open the issue. It carries the release (`v…`), the environment and, for the API, the `request_id`.
2. Find the request in the logs: `dc logs --since 1h api | grep <request_id>`.
3. A defect is fixed forward with a new release; it is rolled back only when it stops work.

## Check

- HetrixTools sends the **up** alert.
- `curl -s https://<staff host>/api/v1/health` → `"status":"ok"`.
- The branch confirms that a visit can be started and finished.
- Write two lines in the team chat: what happened, and what was done.

## If it fails

- **Nothing helps and the cause is unknown:**
  1. Roll back to the last good tag (`rollback.md`).
  2. Tell the branch to write visits on paper. Late entry records them afterwards.
  3. Keep the logs: `dc logs --since 2h > /tmp/incident.log`. It stays on the server: it holds
     personal data (CG-SEC-11).
- **No alert arrived, but the shop is down:** check the monitors in HetrixTools.
  - The Free plan needs a **login every 90 days**, or the account is paused. Put a reminder in the
    team calendar.
  - If the keyword option is no longer on the Free plan, the fallback is a status-code monitor on
    `<SITE_ORIGIN>/api/v1/system/status`. It fails when the API is down, but not when only the
    database is down. Write down which monitor is in use.

## Set-up (once, add-staging-deploy tasks 11.6 / 11.7)

**HetrixTools** (Free, on the ops account):

1. Create the two monitors of the table above.
2. Contacts:
   - the ops e-mail;
   - Telegram for the owner and both developers: each opens `@hetrixtools_bot` → Start, and sends
     their Chat ID.
3. Test it outside opening hours: `dc stop api` for 3 minutes.
   - A down alert arrives by Telegram and e-mail within about 2 minutes.
   - After `dc start api`, the up alert arrives.

**Sentry** (Developer plan, on the ops account), for both projects:

1. Environment `staging`.
2. Settings → Security & Privacy: server-side data scrubbing on, and "Prevent storing of IP
   addresses" on.
3. An issue alert: "a new issue is created" or "an event is seen", action interval 5 minutes, e-mail
   to the ops address.
4. Send one test event per project and check that the e-mail arrives.
