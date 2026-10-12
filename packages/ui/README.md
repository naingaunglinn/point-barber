# @point/ui

Shared UI for both web route trees (`app/site`, `app/staff`) — AD-IMPL-03 · design D1 of
`add-shared-ui-components`.

| Path             | Holds                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `tokens.css`     | The only place for colours, fonts, spacing, radii, shadows and motion (CG-UI-05, AD-VIS-01) |
| `fonts/`         | The self-hosted WOFF2 files, one licence file per family (`pnpm fonts:check`)               |
| `src/fonts.ts`   | `fontPreloads(tree, locale)` for the root layouts                                           |
| `src/providers/` | `ClockProvider` and `useNow()` — the only reader of a device clock (D-PLT-15)               |
| `src/catalogue/` | The `/dev/ui` sections, fixtures and checks; imported only by the catalogue route           |

The staff tree keeps the shadcn/ui `neutral` values until the owner supplies the admin palette; the website
colours come from FE-VIS-01a. The shared components of AD-IMPL-02 (`AppShell`, `DataTable`, `MoneyInput`,
`StatusBadge`, `PermissionGate` …) follow, each shown in the catalogue (CG-UI-04).

Run: `pnpm vitest run --project @point/ui` (Testing Library on jsdom) · `pnpm --filter @point/ui typecheck`.
