import { EmployeeStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { describe, expect, it } from 'vitest';

import type { StoredSegment } from '../patterns/pattern-plan.js';
import { type PlanContext, planShifts } from './shift-planner.js';

// add-schedule-patterns task 4.1 (tests first) — `ShiftPlanner.plan`, the pure half of the generator
// (design D4 step 4 · P2-RULE-07 · D-PLT-15): the shifts a set produces on one business date, in Myanmar
// Time — weekday 1 = Monday, a weekday without a segment is a day off, and a shift only for an ACTIVE
// employee with an assignment of the segment's branch effective on that date.
const { B1, B3 } = FIXTURE_IDS.branches;

const row = (
  day: number,
  branch: string,
  start: string,
  end: string,
  from = '2026-09-01',
  to: string | null = null,
): StoredSegment => ({
  id: `row-${String(day)}-${branch.slice(-2)}-${start}`,
  branch_id: branch,
  day_of_week: day,
  start_time: start,
  end_time: end,
  effective_from: from,
  effective_to: to,
});

/** Ko Aung's fixture set: days 1 … 6 at B3 09:00 – 21:00 from 01/Sep/2026, open (§10.1). */
const KO_AUNG = [1, 2, 3, 4, 5, 6].map((day) => row(day, B3, '09:00', '21:00'));
const ACTIVE: PlanContext = {
  status: EmployeeStatus.ACTIVE,
  assignments: [{ branch_id: B3, effective_from: '2026-09-01', effective_to: null }],
};
const iso = (value: Date) => value.toISOString();

describe('add-schedule-patterns · scheduling · A segment becomes a shift only for an active employee assigned on that date', () => {
  it('Scenario: The shift’s instants — Tuesday 06/Oct/2026 is 09:00 – 21:00 at +06:30, source of the row', () => {
    const [shift, ...rest] = planShifts(KO_AUNG, '2026-10-06', ACTIVE);
    expect(rest).toStrictEqual([]);
    expect(shift?.branch_id).toBe(B3);
    expect(shift?.shift_date).toBe('2026-10-06');
    expect(shift?.schedule_pattern_id).toBe('row-2-b3-09:00');
    expect(iso(shift?.starts_at ?? new Date(0))).toBe('2026-10-06T02:30:00.000Z');
    expect(iso(shift?.ends_at ?? new Date(0))).toBe('2026-10-06T14:30:00.000Z');
  });

  it('weekday 1 is Monday and 7 is Sunday: 05/Oct is a Monday, 11/Oct a Sunday (day off)', () => {
    expect(planShifts(KO_AUNG, '2026-10-05', ACTIVE)).toHaveLength(1);
    expect(planShifts(KO_AUNG, '2026-10-10', ACTIVE)).toHaveLength(1); // Saturday = 6
    expect(planShifts(KO_AUNG, '2026-10-11', ACTIVE)).toStrictEqual([]);
  });

  it('the Myanmar date, not the UTC date, names the shift: 00:30 on the 6th is still the 5th in UTC', () => {
    const [shift] = planShifts([row(2, B3, '00:30', '08:00')], '2026-10-06', ACTIVE);
    expect(iso(shift?.starts_at ?? new Date(0))).toBe('2026-10-05T18:00:00.000Z');
    expect(shift?.shift_date).toBe('2026-10-06');
  });

  it('Scenario: An inactive employee — status other than ACTIVE produces none', () => {
    for (const status of [
      EmployeeStatus.INACTIVE,
      EmployeeStatus.RESIGNED,
      EmployeeStatus.TERMINATED,
      null,
    ]) {
      expect(planShifts(KO_AUNG, '2026-10-06', { ...ACTIVE, status })).toStrictEqual([]);
    }
  });

  it('assignment effective per date: ended before, ending on, starting after, another branch', () => {
    const at = (effective_from: string, effective_to: string | null, branch_id = B3) =>
      planShifts(KO_AUNG, '2026-10-06', {
        ...ACTIVE,
        assignments: [{ branch_id, effective_from, effective_to }],
      }).length;
    expect(at('2026-09-01', '2026-10-05')).toBe(0);
    expect(at('2026-09-01', '2026-10-06')).toBe(1);
    expect(at('2026-10-06', null)).toBe(1);
    expect(at('2026-10-07', null)).toBe(0);
    expect(at('2026-09-01', null, B1)).toBe(0);
    expect(planShifts(KO_AUNG, '2026-10-06', { ...ACTIVE, assignments: [] })).toStrictEqual([]);
  });

  it('a set effective on the date only: before its start, after its end', () => {
    const set = [row(1, B3, '09:00', '18:00', '2026-10-12', '2026-10-18')];
    expect(planShifts(set, '2026-10-05', ACTIVE)).toStrictEqual([]);
    expect(planShifts(set, '2026-10-12', ACTIVE)).toHaveLength(1);
    expect(planShifts(set, '2026-10-19', ACTIVE)).toStrictEqual([]);
  });

  it('two segments of a day at two branches come back in start order, each with its own assignment', () => {
    const set = [row(1, B3, '14:00', '18:00'), row(1, B1, '09:00', '13:00')];
    const ctx: PlanContext = {
      status: EmployeeStatus.ACTIVE,
      assignments: [
        { branch_id: B1, effective_from: '2026-09-01', effective_to: null },
        { branch_id: B3, effective_from: '2026-09-01', effective_to: null },
      ],
    };
    expect(planShifts(set, '2026-10-05', ctx).map((shift) => shift.branch_id)).toStrictEqual([
      B1,
      B3,
    ]);
    // Only the B3 assignment: the B1 segment is dropped, the B3 one stays.
    expect(
      planShifts(set, '2026-10-05', { ...ctx, assignments: ctx.assignments.slice(1) }).map(
        (shift) => shift.branch_id,
      ),
    ).toStrictEqual([B3]);
  });
});
