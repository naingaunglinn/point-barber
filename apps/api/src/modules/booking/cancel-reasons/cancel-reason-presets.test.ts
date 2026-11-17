import { CancelReasonStatus, CancelReasonSystemCode } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { CANCEL_REASON_PRESETS, planCancelReasonSeed } from './cancel-reason-presets.js';

// add-booking-cancel-reasons task 1.5 — the seed planner of design D3, written before the seed step:
// spec "Every company starts with the four preset cancel reasons" (D-BKG-14 · D-BKG-17 · D-DB-07 ·
// F-BK-17).
const NO_SHOW = CancelReasonSystemCode.NO_SHOW;
const ARCHIVED = new Date('2026-10-05T10:00:00+06:30');
const row = (
  sort_order: number,
  system_code: number | null = null,
  archived_at: Date | null = null,
) => ({ sort_order, system_code, archived_at });
/** A planned row as [name_mm, name_en, requires_note, system_code, sort_order]. */
const summary = (rows: ReturnType<typeof planCancelReasonSeed>) =>
  rows.map((r) => [r.name_mm, r.name_en, r.requires_note, r.system_code, r.sort_order]);

describe('planCancelReasonSeed', () => {
  it('no rows → the four presets with sort_order 1 … 4, all ACTIVE', () => {
    const rows = planCancelReasonSeed([]);
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
    const rows = planCancelReasonSeed([row(1), row(2), row(4)]);
    expect(summary(rows)).toStrictEqual([['Customer မလာ', 'Customer no-show', false, NO_SHOW, 5]]);
    expect(rows[0]?.status).toBe(CancelReasonStatus.ACTIVE);
  });

  it('the place of the no-show row ignores archived rows; every row archived → 1', () => {
    expect(planCancelReasonSeed([row(2), row(9, null, ARCHIVED)])).toMatchObject([
      { system_code: NO_SHOW, sort_order: 3 },
    ]);
    expect(planCancelReasonSeed([row(7, null, ARCHIVED)])).toMatchObject([
      { system_code: NO_SHOW, sort_order: 1 },
    ]);
  });

  it('all present → nothing (an existing row is never changed)', () => {
    expect(planCancelReasonSeed([row(1), row(2), row(3, NO_SHOW), row(4)])).toStrictEqual([]);
  });

  it('an archived system row still counts — a second one would break the unique index', () => {
    expect(planCancelReasonSeed([row(1), row(3, NO_SHOW, ARCHIVED)])).toStrictEqual([]);
  });
});
