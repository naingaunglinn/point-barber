import {
  type Branch,
  type BranchSummary,
  type Grant,
  type MeResponse,
  BranchStatus,
  EmployeeStatus,
  ScopeType,
  branchSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import { meOf } from './pos-fixtures';

// add-branch-management — the people and branches of the branch screens' tests (spec-fixtures §1 / §2 ·
// the brief's fixture additions): U Kyaw Zin is Admin at company scope (every branch code), Ma Hnin the
// seed Manager of B3 (`branch.view` only — D-ROLE-09), Ko Aung a Barber of B3 (no branch code). The
// branch builder parses its result with the strict response schema, so a test never feeds the screens a
// shape the API cannot answer.

export const BRANCH_IDS = {
  ...FIXTURE_IDS.branches,
  /** The branch the scenarios create (never seeded — design D11). */
  B4: '0199a3f2-0000-7000-8001-0000000000b4',
} as const;

const company = (code: string): Grant => ({ code, scope_type: ScopeType.COMPANY, branch_ids: [] });
const at = (code: string, ...branchIds: string[]): Grant => ({
  code,
  scope_type: ScopeType.BRANCHES,
  branch_ids: branchIds,
});

const summary = (code: 'B1' | 'B2' | 'B3', mm: string, en: string): BranchSummary => ({
  id: BRANCH_IDS[code],
  code,
  name_mm: mm,
  name_en: en,
  phone: null,
  status: BranchStatus.ACTIVE,
  is_public: true,
});

export const SUMMARIES = {
  B1: summary('B1', 'ပွိုင့် ၁.၀', 'Point 1.0'),
  B2: summary('B2', 'ပွိုင့် ၂.၀', 'Point 2.0'),
  B3: summary('B3', 'ပွိုင့် ၃.၀', 'Point 3.0'),
} as const;

export const PEOPLE: Readonly<Record<'kyawZin' | 'hnin' | 'aung', MeResponse>> = {
  kyawZin: meOf({
    employee: {
      id: FIXTURE_IDS.employees.E001,
      employee_code: 'E001',
      name_mm: 'ဦးကျော်ဇင်',
      name_en: 'U Kyaw Zin',
      photo_url: null,
      status: EmployeeStatus.ACTIVE,
    },
    grants: ['branch.view', 'branch.create', 'branch.update', 'branch.delete', 'sale.create'].map(
      company,
    ),
    branches_in_scope: [SUMMARIES.B1, SUMMARIES.B2, SUMMARIES.B3],
    assigned_branch_ids: [BRANCH_IDS.B1, BRANCH_IDS.B2, BRANCH_IDS.B3],
  }),
  hnin: meOf({
    employee: {
      id: FIXTURE_IDS.employees.E002,
      employee_code: 'E002',
      name_mm: 'မနှင်း',
      name_en: 'Ma Hnin',
      photo_url: null,
      status: EmployeeStatus.ACTIVE,
    },
    grants: [at('branch.view', BRANCH_IDS.B3), at('sale.create', BRANCH_IDS.B3)],
    branches_in_scope: [SUMMARIES.B3],
    assigned_branch_ids: [BRANCH_IDS.B3],
  }),
  aung: meOf({ grants: [at('sale.create', BRANCH_IDS.B3), at('sale.late_entry', BRANCH_IDS.B3)] }),
};

/** A whole `Branch` as P1.BR.03 answers it — B3 of the fixture unless overridden. */
export function branchOf(overrides: Partial<Branch> = {}): Branch {
  return branchSchema.parse({
    ...SUMMARIES.B3,
    email: null,
    address_mm: null,
    address_en: null,
    website_url: null,
    social_links: {},
    latitude: null,
    longitude: null,
    location_radius_meters: null,
    map_url: null,
    active_employees: 5,
    created_at: '2026-09-01T09:00:00.000+06:30',
    updated_at: '2026-10-05T09:30:00.123+06:30',
    ...overrides,
  });
}
