# Sign-in, sessions and access

How a person signs in, how a request is checked, and what an endpoint must declare. Written for a
developer adding an endpoint or a screen. The rules themselves are in point-sdd
(`openspec/changes/add-foundation-auth-access` — design D2–D19 and the specs `auth`, `access`,
`audit`, `organization`); this page says where they live in the code.

## Signing in on a developer machine

1. Start the stack and migrate (`local-setup.md`), then `pnpm db:seed` — the base seed and the nine
   fixture people below. A second run resets their login state.
2. Open `https://app.point.test/` → the login screen. Enter a fixture address and choose **Email me a
   sign-in code**.
3. The code arrives in Mailpit: `http://localhost:8025`. It is valid for 5 minutes; only the newest
   code works.

Google sign-in needs a real OAuth client and its own override (`docker-compose.google.yml`, design
D7): see [Manual Google test](#manual-google-test).

| Code | Person     | Address              | Login    | Role · scope              | Branches              |
| ---- | ---------- | -------------------- | -------- | ------------------------- | --------------------- |
| E001 | U Kyaw Zin | `kyawzin@point.test` | active   | Admin · company           | B1, B2, B3            |
| E002 | Ma Hnin    | `hnin@point.test`    | active   | Manager · B3              | B3                    |
| E003 | Ko Zaw     | `zaw@point.test`     | active   | Manager · B1              | B1                    |
| E004 | Ko Aung    | `aung@point.test`    | active   | Barber · B3               | B3                    |
| E005 | Ko Min     | `min@point.test`     | active   | Barber · B3               | B3                    |
| E006 | Ko Htet    | `htet@point.test`    | active   | Barber · B1               | B1                    |
| E007 | Ko Thura   | `thura@point.test`   | active   | Barber · B2               | B2                    |
| E008 | Ma Thida   | `thida@point.test`   | invited  | none                      | B3                    |
| E009 | Ko Naing   | `naing@point.test`   | disabled | Barber · B3 (left active) | B3, ended 30/Sep/2026 |

Ids are fixed: `FIXTURE_IDS` in `packages/shared/src/testing/fixture-ids.ts`.

## What every request goes through

Three global guards, in this order (`apps/api/src/app.module.ts`, design D2):

| Guard          | Where                                   | Refuses                                                                                                                         |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `CsrfGuard`    | `common/http/csrf.guard.ts`             | a `POST` / `PATCH` / `PUT` / `DELETE` without `X-Requested-With: point-app` or from another origin → 403 `csrf`                 |
| `SessionGuard` | `modules/auth/session/session.guard.ts` | no cookie / unknown token → 401 `unauthenticated`; revoked, or user / employee not active → 401 `session_revoked` with `reason` |
| `AccessGuard`  | `common/access/access.guard.ts`         | the route's declaration is not met → 403 / 404; a route without a declaration → 403 for everyone                                |

`/v1/public/*` and `@Internal()` routes skip the CSRF check; `@Public()` and `@Internal()` skip the
session check. The session guard puts `user_id`, `session_id` and `employee_id` into
`RequestContext`; the access guard adds the caller's `grants`, the read `scope` and, when the request
acts on exactly one branch, `branch_id` (the audit row's branch).

## Declaring access on an endpoint

Every handler carries exactly one access decorator — the lint rule `point/one-access-decorator` fails
the build otherwise. Import them from `common/access/index.ts`.

| Decorator                                                   | Use for                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `@Public()`                                                 | no session: sign-in, health, the website's API                                      |
| `@Internal()`                                               | operator calls with `X-Internal-Key` = `INTERNAL_OPS_KEY`                           |
| `@Self()`                                                   | the caller's own record (`/me`, sign-out)                                           |
| `@Staff()`                                                  | operational reads; filter by `AccessContext.scope()`                                |
| `@Can(code, { level: 'company' \| 'shared' \| 'private' })` | company-master writes, shared data, private data                                    |
| `@Can(code, { branch: '<path>' })`                          | branch data; the target branch comes from the path                                  |
| `@Can(code, { branch: '<path>?' })`                         | mixed: empty → company master, a branch → branch data                               |
| `@Can(code, { target: 'employee:<param>' })`                | an employee as the target (P1-RULE-11: overlap with their active assignments)       |
| `@CanView(module, …)`                                       | management reads: any code of the module; a list filters by `AccessContext.scope()` |

Paths: `body.<field>`, `query.<field>`, `params.<field>`, `body.<list>[].<field>` (every element) and
`params.<id>→entity.<field>`. A code that is not in `packages/shared/definitions/permissions.json`
does not compile.

**An entity path needs a loader.** The module that owns the entity registers it in `onModuleInit`:

```ts
this.targets.register(
  [routeKey('GET', '/v1/visits/:id'), routeKey('POST', '/v1/visits/:id/complete')],
  async (id) => {
    const visit = await this.visits.find(id);
    return visit === null ? null : { branch_ids: [visit.branch_id] };
  },
);
```

The route key is `<METHOD> <route pattern>` without `/api`. `null` means "not found".
`orSelf: '<path>'` lets the record's subject in without the code; a named rule goes into
`OrSelfResolvers.register(name, fn)`.

**The answers** come from the one pure function `decide()` (`common/access/decide.ts`, the D11
table; every row is a unit test):

| Situation                                           | Answer                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| caller holds no code of it (and is not the subject) | 403 `forbidden`, `context.required` = the code                    |
| company / private level, held only at branch scope  | 403 `company_scope_required`                                      |
| the entity or employee does not exist               | 404 `not_found`                                                   |
| holds the code, not for this branch — a read        | 404 `not_found` (outside the scope looks like missing)            |
| holds the code, not for this branch — a change      | 403 `forbidden` (or `out_of_scope` where the part's text says so) |

Grants are read on every request, never cached, so a changed role applies to the next request. An
archived or inactive role, an archived permission and a revoked assignment grant nothing.

## Audit rows

A changing endpoint that the API design audits carries `@Audited({ actions: [...] })`. Inside its one
`TransactionRunner.run()` the service calls `Audit.emit({ action, entity_type, entity_id, before,
after, reason })` for what it did, or `Audit.skip()` when it did nothing (an idempotent replay, an
unchanged repeat). The runner writes the rows just before commit — a rollback leaves none. Returning
without emitting or skipping is a 500: the check catches a forgotten row in the first test. A job
uses `Audit.emitSystem`. Codes, tokens and their hashes are dropped from `before` / `after`
(`modules/platform/audit/secrets.ts`).

## Idempotent creates

An endpoint that creates a money or stock row takes `@Idempotent()` and calls, as the first statement
of its transaction:

```ts
await this.runner.run((tx) =>
  this.idempotency.run(tx, {
    key,
    find: () => this.rows.byClientRequestId(tx, key),
    same: (row) => row.branch_id === body.branch_id && row.amount === body.amount,
    create: () => this.rows.create(tx, { ...body, client_request_id: key }),
  }),
);
```

A replay answers 200 with `Idempotent-Replayed: true`, a different body with the same key 422
`idempotency_mismatch`, a parallel one 409 `idempotency_in_progress` (design D14).

## Rate limits and tests

Code requests: 1 per address per 60 seconds and 10 per IP per hour; verifies: 10 per IP per hour
(API-LIM-02, design D5). The limiter is in the api process; a restart empties it.

- **Integration tests** build the application with a fake clock (`startTestApp({ now })`, moved
  with `t.clock.set()`) and call `RateLimiter.reset()` between cases; they never wait.
- **End-to-end tests:** see `e2e/README.md` — each spec file that requests codes restarts the api
  container first and stays at 8 code requests and 8 verifies.
- **Manual testing:** restart the `api` container between sections of at most 8 code requests and 8
  verifies.

## Seams for later changes

| Behaviour not built yet                        | Seam                                         | Delivered by                                           |
| ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `login.new_device` notification                | event `auth.session_created`                 | `add-notifications-inbox`                              |
| `session.updated` / `session.revoked` push     | event `auth.session_revoked`; `/me` on focus | `add-realtime-gateway`                                 |
| Maintenance mode 503                           | `MaintenanceGate`                            | `add-settings-store`                                   |
| Settings from the store                        | `SettingsReader`                             | `add-settings-store`                                   |
| `today_branch_id`                              | `TodayBranch`                                | `add-schedule-patterns-shifts`, `add-attendance-clock` |
| Shell / iOS-PWA hand-off                       | `SessionService.create`                      | `add-android-shell`                                    |
| My devices, admin "log out all"                | `SessionService.revoke`, `revokeAllForUser`  | `add-employee-management`                              |
| Employee list, forms, P1-RULE-11 write actions | the `employee` target resolver               | `add-employee-management`                              |

## The web app

- `apps/web/proxy.ts`: a staff path without the `point_session` cookie (other than `/login` and
  `/dev/ui`) is redirected to `/login?return_to=…`. Presence only — the API decides.
- `apps/web/lib/api/client.ts`: every call sends `X-Requested-With: point-app` and `X-Client: web`;
  a 401 goes to the login screen with the reason and the page to come back to, a 403 loads `/me`
  again.
- `apps/web/lib/session/`: `useMe()` (`/me`, refetched on window focus), the grants
  (`PermissionGate`, `useCan`), the session layer that makes the page language follow the account.
- Screens find nothing by text: test ids `login-*` and `landing-*`.

## Manual Google test

Google accepts redirect addresses only on a public domain or `localhost`, so this test runs on
`http://localhost:3000` (design D7):

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.google.yml up -d
```

with `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` of a real OAuth client in `.env` (redirect URI
`http://localhost:3000/api/v1/auth/google/callback`), a database with the base seed only, and a first
admin created for a real Google address with `pnpm admin:create`. Chrome only.

| Case                                          | Expected                                  | Result      |
| --------------------------------------------- | ----------------------------------------- | ----------- |
| First sign-in with the admin's Google account | start page; `google_subject` stored       | not run yet |
| Second sign-in, same account                  | start page                                | not run yet |
| Sign-in again in the same browser             | the earlier session revoked with reason 1 | not run yet |
| Another Google account with the same address  | login screen, `google_not_linked`         | not run yet |
| A Google account nobody registered            | login screen, `google_not_linked`         | not run yet |

The test needs the owner's OAuth client (pilot plan, due ~21/Oct/2026); the results are recorded here
when it has run.
