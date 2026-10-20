# Module map

The API is one NestJS application split into 13 modules: the bounded contexts of ADR-001, fixed by
design D1 of `add-repo-scaffold`. Each module is a folder under `apps/api/src/modules/`.

A module folder is created by the change that first needs it. After `add-repo-scaffold` only
`platform` existed; `add-foundation-auth-access` adds `auth` (sign-in, sessions, `/me`) and `people`
(company, branches, employees, roles, the permission catalogue). Sign-in and access are described in
[`auth-and-access.md`](auth-and-access.md). **No module outside this table is ever added**; a new resource goes into the module
that owns its part.

| Module         | Owns (API part → resources)                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`         | Part 1: login, sessions, devices, one-time codes                                                                                                                                |
| `people`       | Part 1: company, branches, employees, branch assignments, roles, permissions                                                                                                    |
| `catalog`      | Part 2: service categories, services, options, prices, eligibility                                                                                                              |
| `scheduling`   | Part 2: patterns, shifts, availability, leave · Part 5: attendance                                                                                                              |
| `booking`      | Part 3: customers, bookings, cancel reasons, public booking                                                                                                                     |
| `delivery`     | Part 4: visits and visit lines                                                                                                                                                  |
| `sales`        | Part 4: sales, sale items, receipt counters, payment methods, payments, discounts, refunds, adjustments                                                                         |
| `cash-closing` | Part 7: daily closing, cash outs and returns (`DayLock`)                                                                                                                        |
| `commission`   | Part 5: commission plans and the estimate                                                                                                                                       |
| `payroll`      | Part 5: salaries, payroll runs, payslips, receivables (`PayrollLock`)                                                                                                           |
| `finance`      | Part 7: expenses, manual incomes, P&L                                                                                                                                           |
| `inventory`    | Part 6                                                                                                                                                                          |
| `platform`     | Part 1: settings and system (health, status) · Part 8: notifications, attachments and storage, audit, import / export, backup, website content, reports · jobs, documents, mail |

The API parts are in point-sdd [`docs/api/`](../../../point-sdd/docs/api/).

## Inside a module

```
apps/api/src/modules/<module>/
├── index.ts          the public surface: what other modules and app.module.ts may import
├── <module>.module.ts
├── <area>/           controllers, services, DTO schemas of one area (platform: system/)
└── repositories/     the only place in the module that imports the Prisma client
```

Cross-cutting code with no business rule lives in `apps/api/src/common/`: config, database, http,
access, logging. The Zod schemas shared with the web app live in `packages/shared` (ADR-001 rule 3).

## The two boundary rules

ADR-001's module boundary rules 1 and 2 bind all code:

1. **A module writes only its own tables.** A cross-module effect goes through the other module's
   service API (its `index.ts`) or an in-process domain event emitted after commit.
2. **No business logic in the web app.** The API is the only writer. Next.js server actions and
   route handlers never read or write data directly.

What enforces them at build time (design D10):

| Check                                                                                         | Rule id                      | Where                                   |
| --------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------- |
| Another module is imported only through its `index.ts`; `app.module.ts` and `src/common/` too | `no-restricted-imports`      | `tools/eslint/boundaries.mjs`           |
| The Prisma client only in a module's `repositories/` and in `src/common/database/`            | `no-restricted-imports`      | `tools/eslint/boundaries.mjs`           |
| The web app imports no Prisma client, no PostgreSQL client and nothing from `apps/api`        | `no-restricted-imports`      | `tools/eslint/boundaries.mjs`           |
| No route handler under `/api` in the web app                                                  | guard                        | `tools/guards/check-web-api-routes.mjs` |
| `$transaction` only in `src/common/database/` (`TransactionRunner`)                           | `no-restricted-syntax`       | `tools/eslint/api.mjs`                  |
| An SDK (pg-boss, nodemailer, openid-client) only in the one folder that wraps it              | `no-restricted-imports`      | `tools/eslint/boundaries.mjs`           |
| Every endpoint carries exactly one access decorator (and `AccessGuard` closes one without)    | `point/one-access-decorator` | `tools/eslint/api.mjs`                  |

What crosses the two modules of `add-foundation-auth-access` without an import cycle: `people`
registers into `platform` at start-up (the audit writer's primary-branch rule, the steps of
`sync.code_tables`, the `employee` target of the access guard) and supplies the access guard's port
`GrantSource`; `auth` reads people only through `PeopleDirectory`.

Lint cannot see which tables a repository writes. Rule 1's "own tables only" is kept by review; the
table-ownership guard comes with `add-ci-guard-rails`.
