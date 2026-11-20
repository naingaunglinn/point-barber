import { FIXTURE_IDS } from '@point/shared/testing';
import { describe, expect, it } from 'vitest';

import {
  type PatternAssignment,
  type PatternCheckContext,
  type PatternCheckSet,
  PatternValidator,
} from './pattern-validator.js';

// add-schedule-patterns task 3.1 — the business checks of a pattern save, before any write (design D3
// step 5): the cross-branch gap from the setting `schedule.cross_branch_gap_minutes` (D-SCH-02 ·
// P2-RULE-07) and an assignment of each segment's branch effective on `effective_from` (owner PT4). Pure:
// the caller passes the setting and the employee's assignments on that date.
const { B1, B2, B3 } = FIXTURE_IDS.branches;
const validator = new PatternValidator();

/** U Kyaw Zin's assignments: B1, B2 and B3 from 01/Sep/2026, open (fixture 030). */
const KYAW_ZIN: readonly PatternAssignment[] = [B1, B2, B3].map((branch_id) => ({
  branch_id,
  effective_from: '2026-09-01',
  effective_to: null,
}));

const context = (gap: number, assignments = KYAW_ZIN): PatternCheckContext => ({
  gap_minutes: gap,
  assignments,
});

type Segments = PatternCheckSet['days'][number]['segments'];

/** A set from `effective_from` (default `2026-10-12`) whose day 1 holds `segments`. */
const monday = (segments: Segments, effective_from = '2026-10-12'): PatternCheckSet => ({
  effective_from,
  days: [{ day_of_week: 1, segments }],
});

const seg = (branch_id: string, start_time: string, end_time: string) => ({
  branch_id,
  start_time,
  end_time,
});

const gapAt = (field: string, actual: number, after_segment: number, needed = 60) => ({
  field,
  code: 'cross_branch_gap',
  params: { needed, actual, after_segment },
});

describe('add-schedule-patterns · scheduling · A branch change within a day needs the travel gap', () => {
  it('Scenario: No gap — B1 until 13:00, B3 from 13:00 (setting 60)', () => {
    expect(
      validator.check(monday([seg(B1, '09:00', '13:00'), seg(B3, '13:00', '20:00')]), context(60)),
    ).toStrictEqual([gapAt('days[0].segments[1]', 0, 0)]);
  });

  it('Scenario: One minute short — B3 from 13:59 (actual 59)', () => {
    expect(
      validator.check(monday([seg(B1, '09:00', '13:00'), seg(B3, '13:59', '20:00')]), context(60)),
    ).toStrictEqual([gapAt('days[0].segments[1]', 59, 0)]);
  });

  it('Scenario: Exactly the gap — B3 from 14:00 (actual 60 = needed)', () => {
    expect(
      validator.check(monday([seg(B1, '09:00', '13:00'), seg(B3, '14:00', '20:00')]), context(60)),
    ).toStrictEqual([]);
  });

  it('Scenario: A smaller company setting — 30 minutes, B3 from 13:30', () => {
    expect(
      validator.check(monday([seg(B1, '09:00', '13:00'), seg(B3, '13:30', '20:00')]), context(30)),
    ).toStrictEqual([]);
  });

  it('Scenario: Same branch — B3 until 13:00 and B3 from 13:00 may touch', () => {
    expect(
      validator.check(monday([seg(B3, '09:00', '13:00'), seg(B3, '13:00', '20:00')]), context(60)),
    ).toStrictEqual([]);
  });

  it('a setting of 0 lets two branches touch', () => {
    expect(
      validator.check(monday([seg(B1, '09:00', '13:00'), seg(B3, '13:00', '20:00')]), context(0)),
    ).toStrictEqual([]);
  });

  it('reads the day in start_time order, but names segments by their index as sent', () => {
    // Sent B3 first: B3 is the later segment in time, at index 0; B1 is index 1.
    expect(
      validator.check(monday([seg(B3, '13:30', '20:00'), seg(B1, '09:00', '13:00')]), context(60)),
    ).toStrictEqual([gapAt('days[0].segments[0]', 30, 1)]);
  });

  it('checks each pair of consecutive segments: B1 → B3 → B2', () => {
    const set = monday([
      seg(B1, '08:00', '10:00'),
      seg(B3, '10:30', '12:00'),
      seg(B2, '13:00', '15:00'),
    ]);
    expect(validator.check(set, context(60))).toStrictEqual([gapAt('days[0].segments[1]', 30, 0)]);
  });

  it('checks every day, naming the day by its index as sent', () => {
    const set: PatternCheckSet = {
      effective_from: '2026-10-12',
      days: [
        { day_of_week: 2, segments: [seg(B3, '09:00', '18:00')] },
        { day_of_week: 1, segments: [seg(B1, '09:00', '13:00'), seg(B3, '13:00', '18:00')] },
      ],
    };
    expect(validator.check(set, context(60))).toStrictEqual([gapAt('days[1].segments[1]', 0, 0)]);
  });
});

describe('add-schedule-patterns · scheduling · Every segment needs a branch assignment on the start date', () => {
  /** Ko Aung: B3 from 01/Sep/2026, open (fixture 030). */
  const KO_AUNG: readonly PatternAssignment[] = [
    { branch_id: B3, effective_from: '2026-09-01', effective_to: null },
  ];
  const notAssigned = (field: string) => ({ field, code: 'not_assigned_to_branch' });

  it('Scenario: A branch the barber does not work at — a day-6 segment at B1', () => {
    const set: PatternCheckSet = {
      effective_from: '2026-10-12',
      days: [1, 2, 3, 4, 5, 6].map((day_of_week) => ({
        day_of_week,
        segments: [seg(day_of_week === 6 ? B1 : B3, '09:00', '21:00')],
      })),
    };
    expect(validator.check(set, context(60, KO_AUNG))).toStrictEqual([
      notAssigned('days[5].segments[0].branch_id'),
    ]);
  });

  it('Scenario: An ended assignment — Ko Naing at B3 until 30/Sep/2026, set from 06/Oct', () => {
    const naing: readonly PatternAssignment[] = [
      { branch_id: B3, effective_from: '2026-09-01', effective_to: '2026-09-30' },
    ];
    expect(
      validator.check(
        monday([seg(B3, '09:00', '13:00'), seg(B3, '14:00', '18:00')], '2026-10-06'),
        context(60, naing),
      ),
    ).toStrictEqual([
      notAssigned('days[0].segments[0].branch_id'),
      notAssigned('days[0].segments[1].branch_id'),
    ]);
  });

  it('Scenario: An assignment that ends later — Ko Min at B3 until 20/Oct, set from 12/Oct', () => {
    const min: readonly PatternAssignment[] = [
      { branch_id: B3, effective_from: '2026-09-01', effective_to: '2026-10-20' },
    ];
    expect(validator.check(monday([seg(B3, '10:00', '20:00')]), context(60, min))).toStrictEqual(
      [],
    );
  });

  it('an assignment from a later date does not count; one ending on effective_from does', () => {
    const later: readonly PatternAssignment[] = [
      { branch_id: B3, effective_from: '2026-10-13', effective_to: null },
    ];
    const endingThatDay: readonly PatternAssignment[] = [
      { branch_id: B3, effective_from: '2026-09-01', effective_to: '2026-10-12' },
    ];
    expect(validator.check(monday([seg(B3, '10:00', '20:00')]), context(60, later))).toStrictEqual([
      notAssigned('days[0].segments[0].branch_id'),
    ]);
    expect(
      validator.check(monday([seg(B3, '10:00', '20:00')]), context(60, endingThatDay)),
    ).toStrictEqual([]);
  });

  it('collects every failure, day and segment in the order sent: the gap before the branch', () => {
    const onlyB3: readonly PatternAssignment[] = [
      { branch_id: B3, effective_from: '2026-09-01', effective_to: null },
    ];
    expect(
      validator.check(
        monday([seg(B3, '09:00', '13:00'), seg(B1, '13:00', '18:00')]),
        context(60, onlyB3),
      ),
    ).toStrictEqual([
      gapAt('days[0].segments[1]', 0, 0),
      notAssigned('days[0].segments[1].branch_id'),
    ]);
  });

  it('every day off (days = []) passes', () => {
    expect(
      validator.check({ effective_from: '2026-10-19', days: [] }, context(60, [])),
    ).toStrictEqual([]);
  });
});
