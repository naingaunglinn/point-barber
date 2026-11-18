import { FIXTURE_IDS } from '@point/shared/testing';
import { describe, expect, it } from 'vitest';

import { type StoredSegment, planSave } from './pattern-plan.js';

// add-schedule-patterns task 3.8 (the rows, as a pure plan — the HTTP scenarios are in
// schedule-pattern-save.int.test.ts) — spec "A save replaces the set it starts in and never edits
// history" (P2-RULE-04 · P2-RULE-07 · D-DB-06 · owner PT2 · design D3 steps 6 – 7).
const { B3 } = FIXTURE_IDS.branches;

/** Ko Aung's fixture set: days 1 … 6 at B3 09:00 – 21:00 from 01/Sep/2026, open (§10.1). */
const KO_AUNG: StoredSegment[] = [1, 2, 3, 4, 5, 6].map((day) => ({
  id: `aung-${day}`,
  branch_id: B3,
  day_of_week: day,
  start_time: '09:00',
  end_time: '21:00',
  effective_from: '2026-09-01',
  effective_to: null,
}));

const day = (dayOfWeek: number, start: string, end: string) => ({
  day_of_week: dayOfWeek,
  segments: [{ branch_id: B3, start_time: start, end_time: end }],
});

/** Days 1 … 5 at B3 10:00 – 19:00, stored from 12/Oct/2026. */
const FROM_12_OCT: StoredSegment[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  id: `oct-${dayOfWeek}`,
  branch_id: B3,
  day_of_week: dayOfWeek,
  start_time: '10:00',
  end_time: '19:00',
  effective_from: '2026-10-12',
  effective_to: null,
}));

describe('add-schedule-patterns · scheduling · A save replaces the set it starts in and never edits history', () => {
  it('Scenario: A new set from next week — the old set ends the day before; 5 new rows', () => {
    const plan = planSave({
      old: KO_AUNG,
      nextFrom: null,
      from: '2026-10-12',
      to: undefined,
      days: [1, 2, 3, 4, 5].map((d) => day(d, '10:00', '19:00')),
    });
    expect(plan.effective_to).toBeNull();
    expect(plan.close).toStrictEqual({
      ids: KO_AUNG.map((row) => row.id),
      effective_to: '2026-10-11',
    });
    expect(plan.insert.map((s) => `${s.day_of_week} ${s.start_time}-${s.end_time}`)).toStrictEqual([
      '1 10:00-19:00',
      '2 10:00-19:00',
      '3 10:00-19:00',
      '4 10:00-19:00',
      '5 10:00-19:00',
    ]);
    expect([plan.archive, plan.retime, plan.changed]).toStrictEqual([[], [], true]);
  });

  it('Scenario: Editing a scheduled set in place — 4 rows kept, day 5 archived and inserted', () => {
    const plan = planSave({
      old: FROM_12_OCT,
      nextFrom: null,
      from: '2026-10-12',
      to: undefined,
      days: [
        day(1, '10:00', '19:00'),
        day(2, '10:00', '19:00'),
        day(3, '10:00', '19:00'),
        day(4, '10:00', '19:00'),
        day(5, '10:00', '17:00'),
      ],
    });
    expect(plan.close).toBeNull();
    expect(plan.archive).toStrictEqual(['oct-5']);
    expect(plan.insert).toStrictEqual([
      { day_of_week: 5, branch_id: B3, start_time: '10:00', end_time: '17:00' },
    ]);
    expect([plan.retime, plan.changed]).toStrictEqual([[], true]);
  });

  it('Scenario: An end date — the stored set ends on 18/Oct', () => {
    const plan = planSave({
      old: KO_AUNG,
      nextFrom: null,
      from: '2026-10-12',
      to: '2026-10-18',
      days: [day(1, '10:00', '20:00')],
    });
    expect(plan.effective_to).toBe('2026-10-18');
  });

  it('Scenario: An end date reaching a scheduled set — capped at 25/Oct (26/Oct − 1, owner PT2)', () => {
    const plan = planSave({
      old: KO_AUNG,
      nextFrom: '2026-10-26',
      from: '2026-10-12',
      to: '2026-10-31',
      days: [day(1, '10:00', '20:00')],
    });
    expect(plan.effective_to).toBe('2026-10-25');
    // An open end is capped the same way; an end before the next set stays.
    expect(
      planSave({ old: KO_AUNG, nextFrom: '2026-10-26', from: '2026-10-12', to: null, days: [] })
        .effective_to,
    ).toBe('2026-10-25');
    expect(
      planSave({
        old: KO_AUNG,
        nextFrom: '2026-10-26',
        from: '2026-10-12',
        to: '2026-10-20',
        days: [],
      }).effective_to,
    ).toBe('2026-10-20');
  });

  it('Scenario: Every day off — the old set ends on 18/Oct and nothing is inserted', () => {
    const plan = planSave({
      old: KO_AUNG,
      nextFrom: null,
      from: '2026-10-19',
      to: undefined,
      days: [],
    });
    expect(plan.close).toStrictEqual({
      ids: KO_AUNG.map((row) => row.id),
      effective_to: '2026-10-18',
    });
    expect([plan.insert, plan.changed]).toStrictEqual([[], true]);
  });

  it('the identical set again changes nothing (design D3 step 7)', () => {
    const plan = planSave({
      old: FROM_12_OCT,
      nextFrom: null,
      from: '2026-10-12',
      to: null,
      days: [1, 2, 3, 4, 5].map((d) => day(d, '10:00', '19:00')),
    });
    expect([plan.close, plan.archive, plan.insert, plan.retime, plan.changed]).toStrictEqual([
      null,
      [],
      [],
      [],
      false,
    ]);
  });

  it('in place, only a new end date: every kept row gets it', () => {
    const plan = planSave({
      old: FROM_12_OCT,
      nextFrom: null,
      from: '2026-10-12',
      to: '2026-10-31',
      days: [1, 2, 3, 4, 5].map((d) => day(d, '10:00', '19:00')),
    });
    expect(plan.retime).toStrictEqual(FROM_12_OCT.map((row) => row.id));
    expect([plan.effective_to, plan.changed]).toStrictEqual(['2026-10-31', true]);
  });

  it('no set yet and every day off: nothing to write', () => {
    const plan = planSave({ old: [], nextFrom: null, from: '2026-10-06', to: undefined, days: [] });
    expect([plan.close, plan.insert, plan.changed]).toStrictEqual([null, [], false]);
  });

  it('two equal segments sent for one stored row: one is kept, one inserted', () => {
    const plan = planSave({
      old: [FROM_12_OCT[0] as StoredSegment],
      nextFrom: null,
      from: '2026-10-12',
      to: null,
      days: [
        {
          day_of_week: 1,
          segments: [
            { branch_id: B3, start_time: '10:00', end_time: '19:00' },
            { branch_id: B3, start_time: '10:00', end_time: '19:00' },
          ],
        },
      ],
    });
    expect([plan.archive, plan.insert.length]).toStrictEqual([[], 1]);
  });
});
