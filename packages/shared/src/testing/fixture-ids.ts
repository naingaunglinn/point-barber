// The fixed ids of the development fixture (docs/plan/spec-fixtures.md §1–§3 · add-foundation-auth-access
// design D16): `pnpm db:seed` writes these rows, and the API tests and the Playwright specs refer to
// them, so every change tells the same story with the same ids. Development and test data only —
// db:seed refuses to run in production. This file imports nothing: db/seed/fixtures/*.mjs loads it
// directly with Node's type stripping.

const id = (group: string, n: string): string =>
  `0199a3f2-0000-7000-8${group}-${n.padStart(12, '0')}`;

/** The id group of each table whose rows have no code of their own. */
const ROW_GROUPS = {
  employee_branches: '006',
  employee_roles: '007',
  employee_role_branches: '008',
  branch_services: '009',
  service_prices: '00a',
  // add-walkin-visit-checkout (fixture modules 070, 080, 090)
  employee_service_eligibilities: '00c',
  branch_opening_hours: '00d',
  role_permissions: '00e',
} as const;

export const FIXTURE_IDS = {
  branches: { B1: id('001', 'b1'), B2: id('001', 'b2'), B3: id('001', 'b3') },
  users: {
    E001: id('002', 'e001'),
    E002: id('002', 'e002'),
    E003: id('002', 'e003'),
    E004: id('002', 'e004'),
    E005: id('002', 'e005'),
    E006: id('002', 'e006'),
    E007: id('002', 'e007'),
    E008: id('002', 'e008'),
    E009: id('002', 'e009'),
  },
  employees: {
    E001: id('003', 'e001'),
    E002: id('003', 'e002'),
    E003: id('003', 'e003'),
    E004: id('003', 'e004'),
    E005: id('003', 'e005'),
    E006: id('003', 'e006'),
    E007: id('003', 'e007'),
    E008: id('003', 'e008'),
    E009: id('003', 'e009'),
  },
  serviceCategories: { SERVICES: id('004', '1') },
  services: { HAIRCUT: id('005', '1'), SHAVE: id('005', '2'), HAIR_WASH: id('005', '3') },
  // add-walkin-visit-checkout — spec-fixtures §2 customers (fixture module 060).
  customers: { MA_SU: id('00b', '1') },
} as const;

/** The id of row `n` (1, 2, …) of a fixture table whose rows have no code of their own. */
export function fixtureRowId(table: keyof typeof ROW_GROUPS, n: number): string {
  return id(ROW_GROUPS[table], n.toString(16));
}
