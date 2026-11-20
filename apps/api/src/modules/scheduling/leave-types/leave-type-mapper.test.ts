import { LeaveTypeStatus, leaveTypeSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { describe, expect, it } from 'vitest';

import { type LeaveTypeRow, toLeaveType } from './leave-type-mapper.js';

// add-leave-types task 1.5 — P2.LVT.01 · API-DATA-03 · design D4 / D6: `updated_at` keeps its
// milliseconds (the echo of expected_updated_at), `archived_at` goes out to the second, both in
// Myanmar time; nothing but the eight members of `LeaveType` leaves the API.
const sick: LeaveTypeRow & { readonly company_id: string; readonly created_at: Date } = {
  id: FIXTURE_IDS.leaveTypes.SICK_LEAVE,
  company_id: FIXTURE_IDS.branches.B1,
  name_mm: 'ဆေးခွင့်',
  name_en: 'Sick leave',
  is_paid: false,
  sort_order: 2,
  status: LeaveTypeStatus.ACTIVE,
  archived_at: null,
  created_at: new Date('2026-09-01T00:00:00Z'),
  updated_at: new Date('2026-10-05T03:00:00.123Z'),
};

describe('add-leave-types · leave · toLeaveType (task 1.5)', () => {
  it('answers the eight members of LeaveType, updated_at with its milliseconds', () => {
    const answer = toLeaveType(sick);
    expect(answer).toStrictEqual({
      id: FIXTURE_IDS.leaveTypes.SICK_LEAVE,
      name_mm: 'ဆေးခွင့်',
      name_en: 'Sick leave',
      is_paid: false,
      sort_order: 2,
      status: LeaveTypeStatus.ACTIVE,
      archived_at: null,
      updated_at: '2026-10-05T09:30:00.123+06:30',
    });
    expect(leaveTypeSchema.parse(answer)).toStrictEqual(answer);
  });

  it('an archived, INACTIVE type: archived_at to the second, a null English name kept', () => {
    const answer = toLeaveType({
      ...sick,
      name_en: null,
      status: LeaveTypeStatus.INACTIVE,
      archived_at: new Date('2026-10-05T03:30:00.456Z'),
    });
    expect(answer).toMatchObject({
      name_en: null,
      status: LeaveTypeStatus.INACTIVE,
      archived_at: '2026-10-05T10:00:00+06:30',
    });
    expect(leaveTypeSchema.parse(answer)).toStrictEqual(answer);
  });
});
