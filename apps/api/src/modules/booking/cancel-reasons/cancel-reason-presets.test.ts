import { CancelReasonStatus, CancelReasonSystemCode } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { CANCEL_REASON_PRESETS, planCancelReasonSeed } from './cancel-reason-presets.js';

// add-booking-cancel-reasons task 1.5 — the seed planner of design D3, written before the seed step:
// spec "Every company starts with the four preset cancel reasons" (D-BKG-14 · D-BKG-17 · D-DB-07 ·
// F-BK-17). The state is what CancelReasonsRepository.seedState counts (archived rows ignored for the
// place: cancel-reason-seed.int.test.ts).
const NO_SHOW = CancelReasonSystemCode.NO_SHOW;
const state = (rows: number, hasNoShow: boolean, lastSortOrder: number) => ({
  rows,
  hasNoShow,
  lastSortOrder,
});
/** A planned row as [name_mm, name_en, requires_note, system_code, sort_order]. */
const summary = (rows: ReturnType<typeof planCancelReasonSeed>) =>
  rows.map((r) => [r.name_mm, r.name_en, r.requires_note, r.system_code, r.sort_order]);

describe('planCancelReasonSeed', () => {
  it('no rows → the four presets with sort_order 1 … 4, all ACTIVE', () => {
    const rows = planCancelReasonSeed(state(0, false, 0));
    expect(summary(rows)).toStrictEqual([
      ['Customer ပြောင်းချင်', 'Customer wants to change', false, null, 1],
      ['Barber မအား', 'Barber not available', false, null, 2],
      ['Customer မလာ', 'Customer no-show', false, NO_SHOW, 3],
      ['Other', 'Other', true, null, 4],
    ]);
    expect(rows.every((r) => r.status === CancelReasonStatus.ACTIVE)).toBe(true);
    expect(CANCEL_REASON_PRESETS.filter((r) => r.system_code !== null)).toHaveLength(1);
  });

  it('rows without a system row → the no-show row only, after the highest sort_order', () => {
    const rows = planCancelReasonSeed(state(3, false, 4));
    expect(summary(rows)).toStrictEqual([['Customer မလာ', 'Customer no-show', false, NO_SHOW, 5]]);
    expect(rows[0]?.status).toBe(CancelReasonStatus.ACTIVE);
  });

  it('every row archived (no non-archived sort_order) → the no-show row at 1', () => {
    expect(planCancelReasonSeed(state(2, false, 0))).toMatchObject([
      { system_code: NO_SHOW, sort_order: 1 },
    ]);
  });

  it('a system row present, archived or not → nothing (an existing row is never changed)', () => {
    expect(planCancelReasonSeed(state(4, true, 4))).toStrictEqual([]);
    expect(planCancelReasonSeed(state(1, true, 0))).toStrictEqual([]);
  });
});
