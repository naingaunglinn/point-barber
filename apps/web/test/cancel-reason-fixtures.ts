import {
  type CancelReason,
  CancelReasonStatus,
  CancelReasonSystemCode,
  type Grant,
  type MeResponse,
  ScopeType,
  cancelReasonSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import { meOf } from './pos-fixtures';

// add-booking-cancel-reasons — the people and cancel reasons of the Settings › Cancel reasons tests
// (spec-fixtures §2 / §10.5): U Kyaw Zin is Admin at company scope (the four codes), Ko Zaw holds the test
// roles "Reasons viewer" (view) and "Reasons editor" (the four codes) at B1 only, Ma Hnin is the seed
// Manager of B3 and Ko Aung a Barber of B3 — neither holds a cancel-reason code (D-ROLE-09). Each reason
// is parsed with the strict response schema, so a test never feeds the screen a shape the API cannot send.

const CODES = [
  'booking_cancel_reason.view',
  'booking_cancel_reason.create',
  'booking_cancel_reason.update',
  'booking_cancel_reason.delete',
] as const;
const company = (code: string): Grant => ({ code, scope_type: ScopeType.COMPANY, branch_ids: [] });
const at = (code: string, branch: string): Grant => ({
  code,
  scope_type: ScopeType.BRANCHES,
  branch_ids: [branch],
});

export const REASON_PEOPLE: Readonly<
  Record<'kyawZin' | 'viewer' | 'editor' | 'hnin' | 'aung', MeResponse>
> = {
  kyawZin: meOf({ grants: CODES.map(company) }),
  /** "Reasons viewer" at B1: `booking_cancel_reason.view` only. */
  viewer: meOf({ grants: [at('booking_cancel_reason.view', FIXTURE_IDS.branches.B1)] }),
  /** "Reasons editor" at B1: the four codes, but through a branch-scope assignment. */
  editor: meOf({ grants: CODES.map((code) => at(code, FIXTURE_IDS.branches.B1)) }),
  hnin: meOf({ grants: [at('branch.view', FIXTURE_IDS.branches.B3), at('sale.create', FIXTURE_IDS.branches.B3)] }),
  aung: meOf({ grants: [at('sale.create', FIXTURE_IDS.branches.B3)] }),
};

const reason = (
  id: string,
  members: Pick<CancelReason, 'name_mm' | 'name_en' | 'sort_order'> & Partial<CancelReason>,
): CancelReason =>
  cancelReasonSchema.parse({
    id,
    requires_note: false,
    system_code: null,
    status: CancelReasonStatus.ACTIVE,
    archived_at: null,
    updated_at: '2026-10-05T09:00:00.000+06:30',
    ...members,
  });

const idOf = (n: number) => `0199a3f2-0000-7000-8020-00000000000${n}`;

export const REASONS = {
  change: reason(idOf(1), {
    name_mm: 'Customer ပြောင်းချင်',
    name_en: 'Customer wants to change',
    sort_order: 1,
  }),
  barber: reason(idOf(2), { name_mm: 'Barber မအား', name_en: 'Barber not available', sort_order: 2 }),
  noShow: reason(idOf(3), {
    name_mm: 'Customer မလာ',
    name_en: 'Customer no-show',
    sort_order: 3,
    system_code: CancelReasonSystemCode.NO_SHOW,
  }),
  other: reason(idOf(4), {
    name_mm: 'Other',
    name_en: 'Other',
    sort_order: 4,
    requires_note: true,
  }),
  sick: reason(idOf(5), {
    name_mm: 'Customer နေမကောင်း',
    name_en: 'Customer is sick',
    sort_order: 5,
  }),
} as const;

export const SEEDED = [REASONS.change, REASONS.barber, REASONS.noShow, REASONS.other] as const;
