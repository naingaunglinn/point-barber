import { type Grant, type LeaveType, type MeResponse, ScopeType, leaveTypeSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import { meOf } from './pos-fixtures';

// add-leave-types — the people and leave types of the Settings › Leave types tests (spec-fixtures §2 /
// §10.3): U Kyaw Zin is Admin at company scope (the four leave-type codes), Ma Hnin the seed Manager of
// B3 and Ko Aung a Barber of B3 — neither holds a leave-type code (D-ROLE-09). Each type is parsed with
// the strict response schema, so a test never feeds the screen a shape the API cannot answer.

const company = (code: string): Grant => ({ code, scope_type: ScopeType.COMPANY, branch_ids: [] });
const atB3 = (code: string): Grant => ({
  code,
  scope_type: ScopeType.BRANCHES,
  branch_ids: [FIXTURE_IDS.branches.B3],
});

export const LEAVE_PEOPLE: Readonly<Record<'kyawZin' | 'viewer' | 'hnin' | 'aung', MeResponse>> = {
  kyawZin: meOf({
    grants: ['leave_type.view', 'leave_type.create', 'leave_type.update', 'leave_type.delete'].map(
      company,
    ),
  }),
  /** `leave_type.view` only: the list and the values as text. */
  viewer: meOf({ grants: [company('leave_type.view')] }),
  hnin: meOf({ grants: [atB3('branch.view'), atB3('sale.create')] }),
  aung: meOf({ grants: [atB3('sale.create'), atB3('sale.late_entry')] }),
};

const type = (
  id: string,
  members: Pick<LeaveType, 'name_mm' | 'name_en' | 'is_paid' | 'sort_order'> & Partial<LeaveType>,
): LeaveType =>
  leaveTypeSchema.parse({
    id,
    status: 1,
    archived_at: null,
    updated_at: '2026-10-05T09:00:00.000+06:30',
    ...members,
  });

export const TYPES = {
  paid: type(FIXTURE_IDS.leaveTypes.PAID_LEAVE, {
    name_mm: 'လစာရခွင့်',
    name_en: 'Paid leave',
    is_paid: true,
    sort_order: 1,
  }),
  sick: type(FIXTURE_IDS.leaveTypes.SICK_LEAVE, {
    name_mm: 'ဆေးခွင့်',
    name_en: 'Sick leave',
    is_paid: false,
    sort_order: 2,
  }),
  unpaid: type(FIXTURE_IDS.leaveTypes.UNPAID_LEAVE, {
    name_mm: 'လစာမဲ့ခွင့်',
    name_en: 'Unpaid leave',
    is_paid: false,
    sort_order: 3,
  }),
  training: type('0199a3f2-0000-7000-8010-000000000004', {
    name_mm: 'သင်တန်းခွင့်',
    name_en: 'Training',
    is_paid: true,
    sort_order: 4,
  }),
} as const;
