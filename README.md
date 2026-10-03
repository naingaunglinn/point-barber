# point-barber

Application repository of the **Point Barbershop System** — staff / admin app, public website with online
booking, one API and one PostgreSQL database (ADR-001).

The specs and every planning source live in the sibling repository **`point-sdd`**; clone both side by side:

```
point/
├── point-sdd/      specs, decisions, DB / API / UX design, test cases  (github.com/agkyawpai/point-sdd)
└── point-barber/   this repo — code                                     (github.com/naingaunglinn/point-barber)
```

## Status

The repository starts with only the files below. The working tree (monorepo, database baseline, CI) is built
by the first OpenSpec change, **`add-repo-scaffold`**; this README is replaced by that change.

| File | What it is |
|---|---|
| `CLAUDE.md` | Rules for Claude Code in this repository (short form) |
| `docs/engineering/coding-guideline.md` | The coding guideline — rule IDs `CG-…` (v1.0 — approved by the owner on 02/Oct/2026; every rule is binding) |
| `openspec/config.yaml` | OpenSpec pointer: `store: point-sdd` — the changes are read from `../point-sdd` |
| `design-reference/` | The owner's reference images for the website and the admin panel (reference only) |

## First steps (each developer)

```powershell
npm install -g @fission-ai/openspec@1.14.0
openspec store register ..\point-sdd --id point-sdd     # once per machine
openspec init --tools claude .                          # installs the /opsx:* commands here
openspec list                                           # the changes of point-sdd appear
```

Then, in Claude Code opened in this folder: `/opsx:apply add-repo-scaffold`.

Order of the first changes (details: `../point-sdd/docs/plan/roadmap.md`):

1. `add-repo-scaffold` — both developers
2. `add-shared-ui-components` (Dev 1) and `add-foundation-auth-access` (Dev 2) — in parallel
3. `add-walkin-visit-checkout`

## Rules in one paragraph

No code without a spec. Money is an integer number of kyats. Permission and branch scope are checked in the
API. Finished sales are never edited and transactional rows never deleted. Time is Myanmar time, computed on
the server. No raw UI text, colours or status numbers in code. Tests first for money, permission and date
rules. Never commit secrets or real customer data. Everything else: `docs/engineering/coding-guideline.md`.
