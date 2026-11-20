import { describe, expect, it } from 'vitest';

import { type HaveShift, diffDay } from './shift-diff.js';
import type { PlannedShift } from './shift-planner.js';

// add-schedule-patterns task 4.2 (tests first) — the diff table of design D4 step 5 (P2-RULE-07 · owner
// PT5), one date at a time: keep / archive / insert / convert on an attendance reference / manual day.
const at = (hhmm: string) => new Date(`2026-10-12T${hhmm}:00+06:30`);
const want = (start: string, end: string, pattern = 'p1', branch = 'b3'): PlannedShift => ({
  branch_id: branch,
  shift_date: '2026-10-12',
  starts_at: at(start),
  ends_at: at(end),
  schedule_pattern_id: pattern,
});
const have = (
  id: string,
  start: string,
  end: string,
  pattern = 'p1',
  branch = 'b3',
): HaveShift => ({
  id,
  branch_id: branch,
  starts_at: at(start),
  ends_at: at(end),
  schedule_pattern_id: pattern,
});

describe('add-schedule-patterns · scheduling · Generation keeps unchanged shifts and changes only the difference', () => {
  it('keep — the same branch, times and pattern row: nothing to write', () => {
    const plan = diffDay([want('09:00', '21:00')], [have('s1', '09:00', '21:00')], new Set());
    expect(plan).toStrictEqual({ archive: [], convert: [], insert: [] });
  });

  it('Scenario: Same times, new set — a new pattern row id archives the shift and inserts a new one', () => {
    const plan = diffDay(
      [want('09:00', '21:00', 'p2')],
      [have('s1', '09:00', '21:00', 'p1')],
      new Set(),
    );
    expect(plan.archive).toStrictEqual(['s1']);
    expect(plan.insert.map((shift) => shift.schedule_pattern_id)).toStrictEqual(['p2']);
    expect(plan.convert).toStrictEqual([]);
  });

  it('archive — a shift the set no longer produces; insert — a produced shift that is missing', () => {
    expect(diffDay([], [have('s1', '09:00', '21:00')], new Set())).toStrictEqual({
      archive: ['s1'],
      convert: [],
      insert: [],
    });
    const plan = diffDay([want('10:00', '19:00')], [], new Set());
    expect(plan.insert).toHaveLength(1);
    expect(plan.archive).toStrictEqual([]);
  });

  it('a changed time or branch is an archive plus an insert, never an update', () => {
    for (const changed of [
      want('10:00', '21:00'),
      want('09:00', '19:00'),
      want('09:00', '21:00', 'p1', 'b1'),
    ]) {
      const plan = diffDay([changed], [have('s1', '09:00', '21:00')], new Set());
      expect([plan.archive, plan.insert.length, plan.convert]).toStrictEqual([['s1'], 1, []]);
    }
  });

  it('keeps one of two segments and changes the other', () => {
    const plan = diffDay(
      [want('09:00', '13:00', 'p1'), want('14:00', '18:00', 'p3')],
      [have('s1', '09:00', '13:00', 'p1'), have('s2', '14:00', '18:00', 'p2')],
      new Set(),
    );
    expect(plan.archive).toStrictEqual(['s2']);
    expect(plan.insert.map((shift) => shift.schedule_pattern_id)).toStrictEqual(['p3']);
  });

  it('Scenario: Already clocked in — an attended shift the set drops is converted, and the day gets no insert', () => {
    const plan = diffDay(
      [want('10:00', '19:00', 'p2')],
      [have('s1', '09:00', '21:00')],
      new Set(['s1']),
    );
    expect(plan).toStrictEqual({ archive: [], convert: ['s1'], insert: [] });
  });

  it('an attended shift that the set still produces is kept, not converted', () => {
    const plan = diffDay([want('09:00', '21:00')], [have('s1', '09:00', '21:00')], new Set(['s1']));
    expect(plan).toStrictEqual({ archive: [], convert: [], insert: [] });
  });

  it('a converted day drops every insert but still archives the unattended shifts the set drops', () => {
    const plan = diffDay(
      [want('09:00', '13:00', 'p2'), want('14:00', '18:00', 'p2')],
      [have('s1', '09:00', '21:00'), have('s2', '22:00', '23:00')],
      new Set(['s1']),
    );
    expect(plan).toStrictEqual({ archive: ['s2'], convert: ['s1'], insert: [] });
  });

  it('Scenario: A day with a manual shift — a manual day is skipped entirely', () => {
    const plan = diffDay(
      [want('10:00', '19:00')],
      [have('s1', '09:00', '21:00')],
      new Set(['s1']),
      { manual: true },
    );
    expect(plan).toStrictEqual({ archive: [], convert: [], insert: [] });
  });
});
