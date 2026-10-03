# @point/ui

Shared UI for both web route trees (`app/site`, `app/staff`) — AD-IMPL-03.

Empty after `add-repo-scaffold`. Filled by **`add-shared-ui-components`**:

- `tokens.css` — the only place for colours, fonts, spacing, radii, shadows and motion (CG-UI-05,
  AD-VIS-01). Website colours come from D-UX-02; the admin panel stays shadcn/ui `neutral` until the
  owner supplies its palette.
- the shared components of AD-IMPL-02 (`AppShell`, `DataTable`, `MoneyInput`, `StatusBadge`,
  `PermissionGate` …), each shown in the `/dev/ui` catalogue (CG-UI-04).

Until then nothing imports this package. The lint rules of `tools/eslint/web.mjs` and the CSS guard
`tools/guards/check-css.mjs` already apply to it.
