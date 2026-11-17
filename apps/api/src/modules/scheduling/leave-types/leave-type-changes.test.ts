import { LeaveTypeStatus } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { changedMembers, sameMillisecond } from './leave-type-changes.js';
import type { LeaveTypeRow } from './leave-type-mapper.js';

// add-leave-types task 2.5 — design D6 (the stale check to the millisecond) and D7 (what "changed"
// means: text and booleans by equality, numbers by value; only the changed members are audited).
const training: LeaveTypeRow = {
  id: '0199a3f2-0000-7000-8010-000000000004',
  name_mm: 'သင်တန်းခွင့်',
  name_en: 'Training',
  is_paid: true,
  sort_order: 4,
  status: LeaveTypeStatus.ACTIVE,
  archived_at: null,
  updated_at: new Date('2026-10-05T03:00:00.123Z'),
};

describe('add-leave-types · leave · sameMillisecond (task 2.5)', () => {
  it('stored …00.123(456) equals a sent …00.123 in any offset; …00.124 does not', () => {
    expect(sameMillisecond(training.updated_at, '2026-10-05T09:30:00.123+06:30')).toBe(true);
    expect(sameMillisecond(training.updated_at, '2026-10-05T03:00:00.123Z')).toBe(true);
    expect(sameMillisecond(training.updated_at, '2026-10-05T09:30:00.124+06:30')).toBe(false);
    expect(sameMillisecond(training.updated_at, '2026-10-05T09:30:00+06:30')).toBe(false);
  });
});

describe('add-leave-types · leave · changedMembers (task 2.5)', () => {
  it('names each changed member with its stored and sent value', () => {
    expect(
      changedMembers(training, {
        name_mm: 'သင်တန်း',
        name_en: null,
        is_paid: false,
        status: LeaveTypeStatus.INACTIVE,
        sort_order: 1,
      }),
    ).toStrictEqual({
      before: {
        name_mm: 'သင်တန်းခွင့်',
        name_en: 'Training',
        is_paid: true,
        status: 1,
        sort_order: 4,
      },
      after: { name_mm: 'သင်တန်း', name_en: null, is_paid: false, status: 0, sort_order: 1 },
    });
  });

  it('equal values and members not sent are unchanged', () => {
    expect(
      changedMembers(training, {
        name_mm: 'သင်တန်းခွင့်',
        name_en: 'Training',
        is_paid: true,
        sort_order: 4,
        status: 1,
      }),
    ).toStrictEqual({ before: {}, after: {} });
    expect(changedMembers(training, {})).toStrictEqual({ before: {}, after: {} });
    expect(changedMembers({ ...training, name_en: null }, { name_en: null })).toStrictEqual({
      before: {},
      after: {},
    });
  });
});
