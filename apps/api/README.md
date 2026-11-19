# api

The NestJS API (ADR-001 · ADR-009): the only writer of the database (CG-ARCH-06). Every route is under
`/api/v1` on the staff host `APP_ORIGIN`, behind Caddy; the public host forwards only the public,
health and status paths. Errors are problem details (API-ERR-01).

| Folder                   | Holds                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/modules/<context>/` | One Nest module per bounded context (CG-ARCH-01); `index.ts` is its public surface — other modules import only from there. The contexts: `docs/engineering/module-map.md`            |
| `src/common/config/`     | The only reader of `process.env`: a Zod schema checked at start (CG-SEC-05); a missing or malformed variable stops the start with its name                                           |
| `src/common/`            | What every module uses: `database/` (`TransactionRunner`, the only place `$transaction` is called), `http/` (problem filter, request id, Zod pipes), `logging/`, `access/`, `clock/` |
| `scripts/`               | `dev.mjs` (host-run development) · `openapi.mjs` (the generated OpenAPI document, `pnpm --filter api openapi`)                                                                       |
| `test/`                  | Integration tests and their fixture endpoints, which only the test application registers                                                                                             |
| `Dockerfile`             | The image the `api` service and the one-shot `migrate` service run                                                                                                                   |

**Run**

- With the whole stack: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`, then
  `docker compose … run --rm migrate`; the API answers at `https://app.point.test/api/v1/health`
  (`docs/engineering/local-setup.md` §5).
- Host-run with rebuild on change: `pnpm --filter api dev` (`scripts/dev.mjs`, port 3101). It reads the
  repository's `.env` (`cp .env.example .env`, local-setup.md §3) and needs Caddy's `API_UPSTREAM`
  pointed at `host.docker.internal:3101` (local-setup.md §7).

**Test**

- Unit: `pnpm vitest run --project api` (`src/**/*.test.ts`). Types: `pnpm --filter api typecheck`.
- Integration: `pnpm test:int` (`vitest.int.config.ts`) — the real application on a migrated
  PostgreSQL 16, connected as `point_app`; `DATABASE_URL` comes from the shell (local-setup.md §6).
