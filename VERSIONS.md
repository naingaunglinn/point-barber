# Pinned versions

One row per tool (CG-DOC-04). **Pin rule (CG-DEP-03 · design D2):** a tool is pinned at the newest
stable major that every lint plugin, preset and example of the coding guideline supports — not at npm
`latest`. A version changes only in a pull request that also edits this file; a major upgrade is its
own pull request.

All rows verified on **03/Oct/2026** against the npm registry, Docker Hub and GitHub releases
(add-repo-scaffold task 1.2). "Installed" = the pull request of add-repo-scaffold that adds the
dependency; until then the row fixes the version that pull request must use.

## Runtime and package manager

| Tool      | Version             | Installed                         | Reason                                                                                                                   | Checked against                                                          |
| --------- | ------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Node.js   | 24.21.0 (line 24.x) | PR-A (`engines`, `.nvmrc`)        | Node 24 LTS fixed by the owner (D-ENG-01). Support: active LTS, maintenance until 30/Apr/2028 — re-check at each upgrade | eslint-plugin-n 18.4.1 engines `>=24` · Vitest 5.0.3 `@types/node >=24`  |
| pnpm      | 12.8.1              | PR-A (`packageManager`, corepack) | npm `latest`; workspaces + frozen lockfile (CG-DEP-03)                                                                   | engines `node >=18`; used with corepack 0.36.0 bundled with Node 24.21.0 |
| Turborepo | 2.11.7              | PR-A                              | npm `latest`                                                                                                             | Runs the six tasks of D2 on pnpm 12 workspaces (verified locally)        |

## Language, lint, format

| Tool                                            | Version | Installed                 | Reason                                                                                                                                    | Checked against                                             |
| ----------------------------------------------- | ------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| TypeScript                                      | 6.0.3   | PR-A                      | `latest` is 7.0.2, but typescript-eslint 8.71.0 accepts `typescript >=4.8.4 <6.1.0` → newest 6.0.x (guideline OPEN-CG-02)                 | typescript-eslint peer range                                |
| ESLint                                          | 9.39.5  | PR-A                      | `latest` is 10.12.0, but eslint-plugin-react 7.37.5 (`^9.7`) and eslint-plugin-jsx-a11y 6.10.2 (`^9`) stop at 9 → newest 9.x (OPEN-CG-02) | peer ranges of every plugin below                           |
| @eslint/js                                      | 9.39.5  | PR-A                      | Matches ESLint                                                                                                                            | ESLint 9.39.5                                               |
| typescript-eslint                               | 8.71.0  | PR-A                      | npm `latest`; type-aware parsing for every workspace                                                                                      | peers: ESLint `^8.57 \|\| ^9 \|\| ^10`, TypeScript `<6.1.0` |
| globals                                         | 17.13.0 | PR-A                      | npm `latest`                                                                                                                              | –                                                           |
| Prettier                                        | 3.9.9   | PR-A                      | npm `latest` stable (4.0 is alpha)                                                                                                        | –                                                           |
| eslint-plugin-n                                 | 18.4.1  | PR-C (`n/no-process-env`) | npm `latest`                                                                                                                              | ESLint `>=8.57.1`, TypeScript `>=5`, Node `>=24`            |
| eslint-plugin-import-x                          | 4.17.1  | add-ci-guard-rails        | Replaces `eslint-plugin-import` (no release for ESLint 9 flat config); rule prefix `import-x/` (OPEN-CG-02)                               | ESLint `^9`, `@typescript-eslint/utils ^8.56`               |
| @eslint-community/eslint-plugin-eslint-comments | 4.8.1   | add-ci-guard-rails        | npm `latest`; rule prefix `@eslint-community/eslint-comments/` (guideline writes `eslint-comments/`)                                      | ESLint `^9`                                                 |
| eslint-plugin-unicorn                           | 65.0.1  | add-ci-guard-rails        | `latest` 77.0.0 and every release from 66.0.0 need ESLint `>=10.4` → newest that accepts 9                                                | ESLint `>=9.38.0`, Node `>=21`                              |
| eslint-plugin-react                             | 7.37.5  | add-shared-ui-components  | npm `latest`; the reason ESLint stays on 9                                                                                                | ESLint `^9.7`                                               |
| eslint-plugin-react-hooks                       | 7.1.1   | add-shared-ui-components  | npm `latest`                                                                                                                              | ESLint `^9`                                                 |
| eslint-plugin-jsx-a11y                          | 6.10.2  | add-shared-ui-components  | npm `latest`; the reason ESLint stays on 9                                                                                                | ESLint `^9`                                                 |
| @next/eslint-plugin-next                        | 16.3.8  | PR-D                      | Same version as Next.js                                                                                                                   | Next.js 16.3.8                                              |
| @tanstack/eslint-plugin-query                   | 5.104.1 | add-shared-ui-components  | npm `latest`                                                                                                                              | ESLint `^9`, TypeScript `^6`                                |
| @vitest/eslint-plugin                           | 1.6.27  | add-ci-guard-rails        | npm `latest`                                                                                                                              | ESLint `>=8.57`, TypeScript `>=5`, Vitest any               |
| eslint-plugin-playwright                        | 2.12.0  | add-ci-guard-rails        | npm `latest`                                                                                                                              | ESLint `>=8.40`                                             |

## Frameworks and libraries

| Tool                                                  | Version | Installed | Reason                                                                                                                               | Checked against                                                        |
| ----------------------------------------------------- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| NestJS (`@nestjs/core`, `common`, `platform-express`) | 12.1.2  | PR-C      | npm `latest`; Express adapter (design D5)                                                                                            | Node `>=20`; peers re-checked when PR-C installs                       |
| Prisma (`prisma`, `@prisma/client`)                   | 7.10.0  | PR-B      | Newest stable 7.x. `latest` is 8.0.0-rc.19 — a release candidate with another client API — and is never used (OPEN-CG-02, CG-DEP-03) | `@prisma/client` peers: TypeScript `>=5.4`                             |
| Next.js                                               | 16.3.8  | PR-D      | Major fixed by ADR-001 / AD-IMPL-01; newest 16.x                                                                                     | React `^19`                                                            |
| React · React DOM                                     | 19.3.0  | PR-D      | npm `latest`                                                                                                                         | Next.js 16.3.8 peer `^19.0.0`                                          |
| Zod                                                   | 4.6.5   | PR-C      | npm `latest`                                                                                                                         | Zod → OpenAPI generator chosen in PR-C (OPEN-CG-05) must support Zod 4 |
| pino                                                  | 10.4.0  | PR-C      | npm `latest` (ADR-007 JSON logs)                                                                                                     | –                                                                      |

## Tests

| Tool                                       | Version | Installed    | Reason                              | Checked against                                                          |
| ------------------------------------------ | ------- | ------------ | ----------------------------------- | ------------------------------------------------------------------------ |
| Vitest                                     | 5.0.3   | PR-A         | npm `latest`                        | peers: Vite `^6.4 \|\| ^7 \|\| ^8`, `@types/node >=24`                   |
| Vite                                       | 8.3.2   | PR-A         | Vitest 5 peer; npm `latest`         | Vitest 5.0.3                                                             |
| @types/node                                | 24.19.1 | PR-A         | Newest 24.x — matches the Node line | Vitest 5.0.3 peer                                                        |
| Playwright (`@playwright/test`) + Chromium | 1.63.0  | PR-I (`e2e`) | npm `latest`                        | Next.js 16.3.8 optional peer `^1.51.1`; point-sdd browser tester `^1.61` |

## Infrastructure and tooling

| Tool            | Version                                                              | Installed                                                                                  | Reason                                                                               | Checked against                        |
| --------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------- |
| PostgreSQL      | 16 (`postgres:16.15-bookworm`)                                       | PR-B (CI service) · PR-E (compose)                                                         | Major fixed by the DB design (91 tables, constraint tests)                           | Docker Hub tag 16.15                   |
| Node base image | `node:24.21.0-bookworm-slim`                                         | PR-E                                                                                       | Debian-based for the later Chromium install (design D14); same Node version as above | Docker Hub tag                         |
| Caddy           | 2.11.6 (`caddy:2.11.6-alpine`)                                       | PR-E                                                                                       | Newest stable 2.x                                                                    | Docker Hub tag                         |
| gitleaks        | 8.30.1                                                               | PR-A (CI job `static`, checksum-verified download; local `pre-commit` hook when installed) | Secret scanner named in OPEN-CG-05                                                   | GitHub release + `checksums.txt`       |
| OpenSpec CLI    | 1.14.0                                                               | each machine (`npm install -g`)                                                            | Pinned by point-sdd `openspec/config.yaml` (ADR-016)                                 | `openspec doctor` → store point-sdd ok |
| GitHub Actions  | `actions/checkout@v7` · `actions/setup-node@v7` · `actions/cache@v6` | PR-A                                                                                       | Current majors on 03/Oct/2026                                                        | GitHub releases                        |

## Not installed

| Tool      | Pinned by           |
| --------- | ------------------- |
| Capacitor | `add-android-shell` |
| Tauri     | `add-windows-shell` |
