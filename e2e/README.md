# End-to-end tests

Playwright against a running Compose stack (`docker-compose.yml` + `docker-compose.dev.yml`, migrated):
`pnpm e2e` from the repository root. CI job `e2e` runs the same.

## Rate limits — read before adding a spec that signs in

The API limits code sign-in per client IP (API-LIM-02 · add-foundation-auth-access design D5): **10 code
requests and 10 verifies per hour**, and one code request per address per 60 seconds. Every request of
the suite comes from one IP. The limiter lives in the `api` process, so a restart empties it — the
documented property of D5, not a test hook. Therefore:

- A spec file that requests codes calls `restartApi(playwright)` in `test.beforeAll`
  (`helpers/stack.ts`).
- Each such file sends **at most 8 code requests and 8 verifies**; its header comment counts them.
- A second code for the same address within 60 seconds needs another `restartApi()` first.
- A spec that is not about the screens signs in with `signInAs()` / `signInWithCode()`
  (`helpers/sign-in.ts`): one code request and one verify per person.

## The content-security policy and error reporting

Caddy sends the content-security policy on every response (add-staging-deploy design D8). The suite
expects the stack's `.env` to set `CADDY_CSP_CONNECT=https://o0.ingest.sentry.io` — the fake Sentry
ingest origin; CI job `e2e` sets it, a local run needs the same line. `SENTRY_DSN_WEB` stays empty:
`error-reporting.spec.ts` recreates the `web` container with a DSN for its one case and puts it back
(`withServiceEnv`, `helpers/stack.ts`); Playwright intercepts the ingest origin, so nothing leaves
the machine.

The `page` and `context` fixtures (`fixtures.ts`) record every `securitypolicyviolation` event and
fail the test on any. A context made with `browser.newContext()` is not covered.

## Before the suite

`global-setup.ts` runs `pnpm db:seed`: the base seed and the fixture people of
`docs/plan/spec-fixtures.md` §2, with their login state reset (status, language, failed count, lock,
Google id). It needs the `.env` of the stack (DATABASE_URL reaches `postgres` through the hosts-file
line of `docs/engineering/local-setup.md`).

## Codes

The code e-mail goes to Mailpit (`E2E_MAILPIT_URL`, default `http://localhost:8025`);
`mailpit.readCode(address, since)` returns the one 8-digit run of the newest message.

## Test ids

Elements are found by test id, never by translated text (CG-TEST-06).
