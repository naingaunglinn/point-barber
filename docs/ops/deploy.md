# Deploy

## Purpose

Put a new release on the pilot server: a reviewed tag on `main` → the release workflow → the other
developer's approval → the server's `deploy <tag>` command (add-staging-deploy design D4 / D5).

## When

- After the pull requests of the release are merged and CI on `main` is green.
- **Only outside the pilot branch's opening hours** (SD5 = A). An urgent fix during opening hours goes
  out only after telling the branch.

The workflow does not enforce the clock: the person who approves does. Money stays safe during a
restart (idempotency, API-IDEM-02), but the barber sees an error and retries.

## Before you start

- The release's new variables, if any: the diff of `.env.example` since the running tag. The deploy
  refuses to change anything while one is missing. Add it to the server `.env` first; a secret is typed
  while the owner reads it (`install.md`, "How values travel").
- The tag running now: `curl -s https://<public host>/api/v1/system/status` → `version`. You need it
  if the deploy fails.
- The latest nightly backup is `ok`: `journalctl -t pilot-backup -n 1` on the server. Migrations are
  additive (CG-DB-02), so a rollback never needs a backup. A restore does.

## Steps

1. **Tag** the merged commit on `main` with the next version, then push the tag:
   ```sh
   git fetch origin && git tag v0.2.0 origin/main && git push origin v0.2.0
   ```
   Use `v<major>.<minor>.<patch>`; nothing else starts a release.
2. **Release workflow** (Actions → Release) runs by itself:
   - `check`: the tag's commit is on `main` and CI passed for it;
   - `images`: builds `point-api`, `point-web` and `point-backup` with `APP_VERSION` = the tag, runs
     the image checks of CI, and pushes them to `ghcr.io`.
3. **Approve.** Job `deploy` waits for the environment `pilot`. The **other** developer approves it.
   "Prevent self-review" stops the developer who pushed the tag.
4. **The server command.** The job connects with the deploy key, and the server runs
   `infra/deploy/deploy.sh <tag>`, which does, in order:
   1. checks the tag's commit is on `main`;
   2. checks the server `.env` against the tag's `.env.example`, before changing anything;
   3. checks out the tag and sets `APP_VERSION` (the only line of `.env` it changes);
   4. pulls the three images;
   5. runs `migrate`;
   6. `up -d`;
   7. waits up to 120 s for `api` to be healthy, then checks health and version through Caddy;
   8. writes a line to `/opt/point/deploy-history.log`;
   9. removes images older than the last three good tags.

The job's log shows the server's output. It ends with `deploy <tag> ok`.

By hand on the server (when GitHub cannot be reached; the same checks run):
`sudo -u deploy /opt/point/infra/deploy/deploy.sh <tag>`.

## Check

- `curl -s https://<public host>/api/v1/system/status` → `"version":"<tag>"`.
- `curl -s https://<staff host>/api/v1/health` → `"status":"ok"`.
- On the server: `tail -n 3 /opt/point/deploy-history.log` ends with
  `<time +06:30> deploy <tag> ok`.
- `dc ps` (`install.md` step 6) shows no service restarting.
- Sentry shows no new issue for the release in the next minutes.

## If it fails

What each message from the server means:

| Message                                                                                                                   | Meaning                                                                                                                            | What to do                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `refused`                                                                                                                 | The command was not exactly `deploy <tag>` / `rollback <tag>`.                                                                     | Check the tag name.                                                                                           |
| `<tag> is not on main` / `<tag> does not exist`                                                                           | The tag is on another branch, or not pushed.                                                                                       | Tag a commit of `main`.                                                                                       |
| `missing in .env: <NAME>` · `change-me in .env: <NAME>` · `CADDY_CSP_CONNECT must be …`                                   | The server configuration does not fit the release. **Nothing was changed.**                                                        | Fix `.env`, then re-run the failed job.                                                                       |
| `pull failed — <previous> is still running`                                                                               | The registry could not be reached, or a package is private. The checkout and `APP_VERSION` were put back.                          | Check the package visibility (task 11.2) and re-run.                                                          |
| `migrate failed — <previous> is still running`                                                                            | A migration failed. The running release was not touched, and the checkout and `APP_VERSION` were put back.                         | Stop. Prisma applies no further migration until the failed one is resolved. Send the output to its developer. |
| `api did not report healthy within 120 s` · `health on … did not answer ok` · `status on … does not answer version <tag>` | The new release started but is not working. The history says `failed`, and the output ends with `to go back: rollback <previous>`. | Read `dc logs --since 10m api` (`uptime-alert.md`), then decide: fix forward, or `rollback.md`.               |
| `another deploy or rollback is running`                                                                                   | One is already running on the server.                                                                                              | Wait for it.                                                                                                  |

The deploy **never rolls back by itself**. A failed start is usually configuration, and an automatic
rollback would hide it. A person decides, calmly, outside opening hours.
