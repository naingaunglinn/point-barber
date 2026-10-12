# web

The one Next.js app that serves both hosts (ADR-001 · ADR-009 · design D11): the public website on
`SITE_ORIGIN` and the staff app on `APP_ORIGIN`. It never writes data: the API is the only writer
(CG-ARCH-06), and the browser calls it on the page's own origin under `/api/v1`.

| File                            | Holds                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `resolve-route.ts` · `proxy.ts` | The host rewrite: the public host gets `app/site/`, the staff host `app/staff/`; another host or a tree's folder name is a 404 |
| `app/site/` · `app/staff/`      | The two route trees; placeholders until `add-public-website-pages` (site) and `add-foundation-auth-access` (staff)             |
| `app/*/layout.tsx`              | One root layout per tree: `<html lang data-tree>`; the staff language comes from `resolveLocale` (`packages/i18n`)             |
| `app/staff/dev/ui/`             | The component catalogue `/dev/ui` (AD-IMPL-06): only in the `dev` and `build:catalogue` builds, 404 in any other build         |
| `env.ts`                        | The only reader of `process.env` (Zod schema; CG-ARCH-09)                                                                      |
| `next.config.ts` · `Dockerfile` | `output: 'standalone'`, and the image that runs it                                                                             |

The app shows no literal text: UI strings come from `packages/i18n`, and `tools/eslint/web.mjs` fails on
raw JSX text (D-PLT-03).

**Run**

- With the whole stack: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d`, then
  open `https://point.test/` and `https://app.point.test/` (`docs/engineering/local-setup.md` §5, §8).
- Host-run with hot reload: `pnpm --filter web dev` (port 3100) with
  `apps/web/.env.development.local` and Caddy pointed at it (local-setup.md §7 and §8 "`next dev`
  (host-run)"). The catalogue is at `/dev/ui` on the staff host.
- Catalogue test build: `pnpm turbo run build:catalogue --filter=web`, then `next start` (design D12). The
  flag that turns the catalogue on is set only inside the `dev` and `build:catalogue` scripts — never in an
  env file, a Dockerfile, a Compose file, a workflow or `next.config.ts`.

**Test**

- Unit: `pnpm vitest run --project web`. Types: `pnpm --filter web typecheck`.
- Through the edge: `pnpm e2e` (`e2e/smoke.spec.ts`, `e2e/edge.spec.ts`), against the running stack.
