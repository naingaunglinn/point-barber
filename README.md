# point-barber

Application repository of the **Point Barbershop System** — staff / admin app, public website with online
booking, one API and one PostgreSQL database (ADR-001).

The specs and every planning source live in the sibling repository **`point-sdd`**; clone both side by side:

```
point/
├── point-sdd/      specs, decisions, DB / API / UX design, test cases  (github.com/agkyawpai/point-sdd)
└── point-barber/   this repo — code                                     (github.com/naingaunglinn/point-barber)
```

Planning sources: [`../point-sdd`](../point-sdd) · Local set-up in detail:
[`docs/engineering/local-setup.md`](docs/engineering/local-setup.md) · Rules for code:
[`docs/engineering/coding-guideline.md`](docs/engineering/coding-guideline.md) · Pinned versions:
[`VERSIONS.md`](VERSIONS.md)

## Prerequisites

| Tool     | Version                                                                                  | Check                    |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| Node.js  | 24 LTS (`.nvmrc`)                                                                        | `node --version`         |
| pnpm     | from `package.json` → `packageManager`, through corepack (`corepack enable`)             | `pnpm --version`         |
| Docker   | Docker Desktop (Windows / macOS) or Docker Engine with Compose v2                        | `docker compose version` |
| gitleaks | 8.x — optional locally (the `pre-commit` hook uses it when installed; CI always runs it) | `gitleaks version`       |

## First steps (each developer)

```powershell
npm install -g @fission-ai/openspec@1.14.0
openspec store register ..\point-sdd --id point-sdd     # once per machine
openspec init --tools claude .                          # installs the /opsx:* commands here
openspec list                                           # the changes of point-sdd appear
```

Then, in Claude Code opened in this folder: `/opsx:apply add-repo-scaffold`.

## Everyday commands

```powershell
pnpm install        # dependencies (frozen in CI); also installs the Git hooks
pnpm dev            # API and web app with reload
pnpm lint           # ESLint — module boundaries, access decorators, guard rails
pnpm typecheck      # tsc --noEmit for every workspace
pnpm test           # unit tests (Vitest)
pnpm guards         # repository guards (tools/guards/check-*.mjs)
```

Also: `pnpm format` / `pnpm format:check` (Prettier), `pnpm test:int` (API on PostgreSQL 16),
`pnpm e2e` (Playwright against the Compose stack), `pnpm db:migrate` / `pnpm db:test`.

## Branches and pull requests

Branch `feature/<change-id>` (`feature/<change-id>/<part>` when a change has several pull requests) or
`chore/<topic>`; the pull-request title is `<type>(<change-id>): <summary>` and the description follows
`.github/pull_request_template.md` (CG-GIT-01 … CG-GIT-05). Squash merge after green CI and one review by
the other developer.

## Rules in one paragraph

No code without a spec. Money is an integer number of kyats. Permission and branch scope are checked in the
API. Finished sales are never edited and transactional rows never deleted. Time is Myanmar time, computed on
the server. No raw UI text, colours or status numbers in code. Tests first for money, permission and date
rules. Never commit secrets or real customer data. Everything else: `docs/engineering/coding-guideline.md`.
