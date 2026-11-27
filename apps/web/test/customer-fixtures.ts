import {
  type CustomerDto,
  type CustomerListItemDto,
  type Grant,
  type MeResponse,
  CustomerStatus,
  EmployeeStatus,
  ScopeType,
  customerListItemSchema,
  customerSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import { BRANCH_IDS, SUMMARIES } from './branch-fixtures';
import { meOf } from './pos-fixtures';

// add-customer-management — the people and customers of the customer screens' tests (spec-fixtures §2 ·
// the brief's fixture additions): Ma Su, Ko Phyo, Daw Mya (Inactive) and U Ba (archived); Ko Aung the seed
// Barber of B3 (customer.view + create), Ma Hnin the seed Manager of B3 (+ update), U Kyaw Zin the Admin
// (all four codes, company scope). The builders parse their result with the strict response schema, so a
// test never feeds the screens a shape the API cannot answer.

export const CUSTOMER_IDS = {
  MA_SU: FIXTURE_IDS.customers.MA_SU,
  KO_PHYO: '0199a3f2-0000-7000-800b-000000000002',
  DAW_MYA: '0199a3f2-0000-7000-800b-000000000003',
  U_BA: '0199a3f2-0000-7000-800b-000000000004',
} as const;

const at = (code: string, ...branchIds: string[]): Grant => ({
  code,
  scope_type: ScopeType.BRANCHES,
  branch_ids: branchIds,
});
const company = (code: string): Grant => ({ code, scope_type: ScopeType.COMPANY, branch_ids: [] });

const B3 = BRANCH_IDS.B3;

export const PEOPLE = {
  /** Ko Aung — Barber of B3: view and create. */
  aung: meOf({ grants: [at('customer.view', B3), at('customer.create', B3)] }),
  /** Ma Hnin — Manager of B3: view, create and update. */
  hnin: meOf({
    employee: {
      id: FIXTURE_IDS.employees.E002,
      employee_code: 'E002',
      name_mm: 'မနှင်း',
      name_en: 'Ma Hnin',
      photo_url: null,
      status: EmployeeStatus.ACTIVE,
    },
    grants: [at('customer.view', B3), at('customer.create', B3), at('customer.update', B3)],
    branches_in_scope: [SUMMARIES.B3],
    assigned_branch_ids: [B3],
  }),
  /** U Kyaw Zin — Admin: all four codes, every branch. */
  kyawZin: meOf({
    employee: {
      id: FIXTURE_IDS.employees.E001,
      employee_code: 'E001',
      name_mm: 'ဦးကျော်ဇင်',
      name_en: 'U Kyaw Zin',
      photo_url: null,
      status: EmployeeStatus.ACTIVE,
    },
    grants: ['customer.view', 'customer.create', 'customer.update', 'customer.delete'].map(company),
    branches_in_scope: [SUMMARIES.B1, SUMMARIES.B2, SUMMARIES.B3],
    assigned_branch_ids: [BRANCH_IDS.B1, BRANCH_IDS.B2, BRANCH_IDS.B3],
  }),
  /** A user whose role holds no customer code. */
  nobody: meOf({ grants: [at('sale.create', B3)] }),
} as const satisfies Record<string, MeResponse>;

const STAMP = '2026-09-01T09:00:00.000+06:30';

/** A list item as P3.CUS.01 answers it — Ma Su as Ma Hnin reads her unless overridden. */
export function listItemOf(overrides: Partial<CustomerListItemDto> = {}): CustomerListItemDto {
  return customerListItemSchema.parse({
    id: CUSTOMER_IDS.MA_SU,
    name: 'Ma Su',
    phone: '09 7712 3456',
    phone_normalized: '+95977123456',
    status: CustomerStatus.ACTIVE,
    archived_at: null,
    last_visit_at: '2026-09-28T15:30:00+06:30',
    visit_count: 6,
    ...overrides,
  });
}

/** A whole `Customer` as P3.CUS.04 answers it — Ma Su as Ma Hnin reads her unless overridden. */
export function customerOf(
  overrides: Partial<Omit<CustomerDto, 'stats'>> & { stats?: Partial<CustomerDto['stats']> } = {},
): CustomerDto {
  const { stats, ...rest } = overrides;
  return customerSchema.parse({
    ...listItemOf(),
    notes: 'Prefers a short fade.',
    stats: {
      visit_count: 6,
      total_spent_amount: 59_000,
      last_visit_at: '2026-09-28T15:30:00+06:30',
      no_show_count: 2,
      cancelled_count: 3,
      preferred_employee: { id: FIXTURE_IDS.employees.E004, display_name: 'Ko Aung' },
      scope_note: 'read_scope',
      ...stats,
    },
    upcoming_bookings: [],
    created_at: STAMP,
    updated_at: '2026-10-05T09:30:00.123+06:30',
    ...rest,
  });
}

/** Ma Su as U Kyaw Zin reads her: every branch, no caption, no preferred barber. */
export const maSuForAdmin = () =>
  customerOf({
    stats: {
      visit_count: 7,
      total_spent_amount: 65_000,
      last_visit_at: '2026-10-03T11:00:00+06:30',
      preferred_employee: null,
      scope_note: 'company',
    },
    visit_count: 7,
    last_visit_at: '2026-10-03T11:00:00+06:30',
  });
