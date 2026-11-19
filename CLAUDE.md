# point-barber — rules for Claude Code (application)

Point Barbershop System: staff / admin app, public website with a booking modal, one API, one database.
This repository holds the **code**. The **specs and every planning source** live in the sibling repository
`../point-sdd` (workspace folder `point/` holds both — ADR-016).

Full rulebook: **`docs/engineering/coding-guideline.md`** (rule IDs `CG-…`). This file is the short form;
where the two differ, the guideline wins.

## 1. Before writing code

1. **Spec before code (D-PLT-17).** Work only on an OpenSpec change: `/opsx:apply <change-id>` — one change
   per session. The change lives in `../point-sdd/openspec/changes/<change-id>/` (this repo's
   `openspec/config.yaml` points there). No change → no branch. **A change whose `proposal.md` still has
   an item under "Open questions → Needs the owner's answer" is not applied at all** — say so and stop
   (D-PLT-13).
2. **Read first:** the change's `proposal.md`, `specs/`, `design.md`, `tasks.md`; then the sources its
   requirements cite.
3. **If the code needs behaviour the spec does not state — stop.** Fix the spec in `point-sdd` first
   (CG-META-03, CG-META-04). Never fill the gap with a guess.
4. **Conflict = STOP (D-PLT-13).** Two locked sources disagree, or a task contradicts one → describe both
   sides with their IDs and ask. Do not pick.
5. **Never invent** a business rule, an error code, a colour, a logo, a font or UI copy (D-PLT-11, D-UX-02,
   CG-AI-04). Cite only IDs you found in the files (CG-AI-05).

## 2. Sources (in `../point-sdd`) — precedence, highest first

| # | Source | IDs |
|---|---|---|
| 1 | `docs/decisions/decision-register.md` — 🔒 rows only | `D-…` |
| 2 | `docs/db/` — DBML, constraints, tests (this repo's `db/source/` holds hash-checked copies) | table / constraint names |
| 3 | `docs/ux/admin-panel.md` · `docs/ux/frontend-website.md` | `AD-…` · `FE-…` |
| 4 | `docs/api/00-conventions.md` · `docs/api/01..08-*.md` · `docs/api/openapi/` | `API-…` · `P4.VIS.02` · `P4-RULE-10` |
| 5 | `docs/adr/` · `docs/architecture/system-design.md` | `ADR-…` |
| 6 | `design-reference/` (this repo) — images, reference only | – |
| 7 | Fresha — reference only; the admin panel follows its layout about 80 % and must be easier to use | – |

Scenario and seed data: `../point-sdd/docs/plan/spec-fixtures.md`. A design fact is never changed here: DB,
API, UX and ADR changes are made in `point-sdd` first, then implemented.

## 3. Stack (ADR-001 — do not substitute)

NestJS (`apps/api`) · Prisma + SQL-first migrations · PostgreSQL 16 · Next.js 16 App Router (`apps/web`:
`app/site/` public website, `app/staff/` staff app, host rewrite in `proxy.ts`) · Tailwind + shadcn/ui ·
TanStack Query · React Hook Form + Zod (`packages/shared`) · next-intl (`packages/i18n`) · lucide-react ·
pg-boss jobs (ADR-002) · Socket.IO (ADR-008) · Caddy + Docker Compose · pnpm workspaces + Turborepo · Node 24
LTS · TypeScript strict · Vitest · Playwright. Exact versions: `VERSIONS.md`.

```
apps/api        NestJS — src/common (cross-cutting) · src/modules/<bounded-context> (index.ts = public surface)
apps/web        Next.js — app/site · app/staff · proxy.ts            apps/android · apps/windows — shells (later)
packages/shared Zod schemas, constants, money / time / format helpers, permission + setting definitions
packages/ui     tokens.css + shared components        packages/i18n  my / en        packages/documents  receipt etc.
db              source/ (copies) · migrations/ (raw SQL) · schema.prisma (introspected) · scripts/
e2e · infra · tools · docs/engineering · docs/ops · design-reference · openspec/config.yaml (pointer)
```

## 4. Rules that protect money and data (the daily list — details in the guideline)

- **Money is an integer number of kyats** — `bigint` (`Mmk`) in code, JSON integer on the wire. No float, no
  `parseFloat`, no arithmetic on money outside the money helpers. Totals are computed by the server
  (CG-MONEY-01, CG-MONEY-03, CG-MONEY-06 · D-PLT-04).
- **Every endpoint has exactly one access decorator** (`@Can`, `@CanView`, `@Staff`, `@Self`, `@Public`,
  `@Internal`). Permission AND data-level scope are checked in the API; the UI only mirrors
  (CG-API-02, CG-SEC-02 · D-ROLE-03, ADR-011, ADR-012).
- **A money row is never created twice** — `Idempotency-Key` on row-creating money endpoints, state checks on
  actions, one key per logical submit on the client (CG-IDEM-01 · API-IDEM-01).
- **Locks first, in the one order; checks after the locks; READ COMMITTED** for anything that writes money,
  stock or pay data (CG-DB-06, CG-DB-07 · API-IDEM-06).
- **Finished records are immutable; transactional rows are never hard-deleted** — a correction is a new row
  with a reason (CG-DB-11 · D-VIS-08, D-DAT-05).
- **The server computes `business_date` in Asia/Yangon** and reads time only from the injected clock
  (CG-TIME-02, CG-TIME-03 · D-PLT-15).
- **A module writes only its own tables; Next.js never writes** — the API is the only writer
  (CG-ARCH-02, CG-ARCH-06 · ADR-001).
- **No raw UI string, no hex colour, no raw status number, no raw `font-family`** — language keys (`my`, `en`),
  tokens from `packages/ui/tokens.css`, named constants (CG-I18N-01, CG-UI-05, CG-TS-04 · D-PLT-03, D-UX-02,
  D-DB-03). Receipts are always English.
- **Colours:** website = `#EEEEEE` background, `#000000` text, `#DC5F00` decoration, black buttons with white
  text; the orange is never used for small text. Admin panel = shadcn `neutral` until the owner gives its
  palette. Values live only in `tokens.css`.
- **Never swallow an error; never log a secret, a token, a sign-in code, a phone number or a salary**
  (CG-ERR-01, CG-OBS-03).
- **Migrations are SQL-first and additive**; never edit an applied migration; a schema change starts in
  `point-sdd/docs/db` (CG-DB-01, CG-DB-02).

## 5. How to work

- **Tests first** for money, permission and date-boundary rules; integration tests run against a real
  PostgreSQL 16; one test at least per spec scenario (CG-TEST-03, CG-TEST-04, CG-TEST-07).
- Before saying a task is done: `pnpm lint` · `pnpm typecheck` · `pnpm test` (· `pnpm test:int` · `pnpm e2e`
  when the task touches them) · `pnpm guards` — and tick the task in `tasks.md`.
- **UI:** build from the shared components (`packages/ui`, AD-IMPL-02); before building a screen open the
  image that `design-reference/<website|admin-panel>/README.md` names for it. An image never overrides a rule.
  Every screen works in Myanmar and English at 360 px (AD-QA-01).
- **Git:** branch `feature/<change-id>` (one per pull request when a change has several:
  `feature/<change-id>/<part>`); commits and the PR title are Conventional Commits with the change id as
  scope — `feat(add-walkin-visit-checkout): take split payment`; the PR description names
  `Spec: point-sdd/openspec/changes/<change-id>` and the decision / rule IDs. Order: CI green + one human
  review → test cases run with no open NG → squash merge → archive (CG-GIT-01..05, guideline §23).
- Keep the diff inside the task (CG-AI-07). Clean-ups go in their own PR. Never loosen a lint rule, a guard or a
  test to get green (CG-AI-06).
- **Never** commit secrets, `.env`, real customer or staff data, or screenshots of the live Fresha account.
  Fixture data only. Never paste secrets or customer data into a prompt; no production access for the agent
  (CG-GIT-06, CG-SEC-11, CG-AI-08).
- The system is passwordless. Tests sign in with the e-mail code read from Mailpit; there is no test-only
  login endpoint.
