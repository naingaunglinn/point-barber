import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { activeShifts, generateUnit, shiftsOf } from './helpers/schedule-shifts.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-schedule-patterns task 4.6 (tests first) — the own-save guard of P2.PAT.02 (D-ATT-05 · P2-RULE-07 ·
// owner C11 · owner PT5 · design D3 step 9): when the employee of the save is the caller's own employee and
// the regeneration would archive, insert or convert a shift dated today → 422 `self_action` and nothing is
// saved. Ma Hnin (E002, Manager at B3, set Mon – Fri 09:00 – 18:00 from 01/Sep) on Monday 05/Oct/2026 at
// 10:00 AM; her shift of today exists after the nightly run.
const { B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const save = async (who: FixturePerson, employeeId: string, body: object) =>
  s.http
    .put(`/api/v1/employees/${employeeId}/schedule-pattern`)
    .set('Cookie', (await s.signIn(who)).cookie)
    .send(body);
const week = (days: number[], start: string, end: string) =>
  days.map((day_of_week) => ({
    day_of_week,
    segments: [{ branch_id: B3, start_time: start, end_time: end }],
  }));
const patternRows = async () =>
  s.prisma.$queryRaw<{ id: string; archived_at: Date | null; effective_to: string | null }[]>`
    SELECT id, archived_at, effective_to::text AS effective_to FROM schedule_patterns
    WHERE employee_id = ${E.E002}::uuid ORDER BY id`;
const MON_FRI_09_17 = week([1, 2, 3, 4, 5], '09:00', '17:00');

describe('add-schedule-patterns · scheduling · An own pattern save may not change one’s own shifts of today', () => {
  beforeAll(async () => {
    s = await seededApp(mmt('2026-10-05T10:00:00'));
    await generateUnit(s, E.E002);
  });
  afterAll(() => s.close());

  it('Scenario: Changing her own hours from today — 422 self_action; her set and shifts are unchanged', async () => {
    const rows = await patternRows();
    const shifts = await shiftsOf(s, E.E002);
    expect(await activeShifts(s, E.E002)).toHaveLength(shifts.length);
    const res = await save('E002', E.E002, { effective_from: '2026-10-05', days: MON_FRI_09_17 });
    expect([res.status, res.body.code]).toStrictEqual([422, 'self_action']);
    expect(await patternRows()).toStrictEqual(rows);
    expect(await shiftsOf(s, E.E002)).toStrictEqual(shifts);
  });

  it('Scenario: Same Monday hours in a new set from today — 422 self_action, because today’s shift would be replaced', async () => {
    const rows = await patternRows();
    const shifts = await shiftsOf(s, E.E002);
    const res = await save('E002', E.E002, {
      effective_from: '2026-10-05',
      days: [...week([1], '09:00', '18:00'), ...week([5], '09:00', '15:00')],
    });
    expect([res.status, res.body.code]).toStrictEqual([422, 'self_action']);
    expect(await patternRows()).toStrictEqual(rows);
    expect(await shiftsOf(s, E.E002)).toStrictEqual(shifts);
  });

  it('Scenario: Another manager does it — U Kyaw Zin saves Ma Hnin’s set from today → 200, her shift of today is 9:00 AM – 5:00 PM', async () => {
    const res = await save('E001', E.E002, { effective_from: '2026-10-05', days: MON_FRI_09_17 });
    expect(res.status).toBe(200);
    const today = (await activeShifts(s, E.E002)).filter((row) => row.date === '2026-10-05');
    expect(today.map((row) => row.hours)).toStrictEqual(['09:00-17:00']);
  });
});

describe('add-schedule-patterns · scheduling · An own pattern save from tomorrow', () => {
  beforeAll(async () => {
    s = await seededApp(mmt('2026-10-05T10:00:00'));
    await generateUnit(s, E.E002);
  });
  afterAll(() => s.close());

  it('Scenario: From tomorrow — 200, and her shift of 05/Oct keeps its id and times', async () => {
    const [before] = (await shiftsOf(s, E.E002)).filter((row) => row.date === '2026-10-05');
    const res = await save('E002', E.E002, { effective_from: '2026-10-06', days: MON_FRI_09_17 });
    expect(res.status).toBe(200);
    expect((await shiftsOf(s, E.E002)).filter((row) => row.date === '2026-10-05')).toStrictEqual([
      before,
    ]);
    const tuesday = (await activeShifts(s, E.E002)).filter((row) => row.date === '2026-10-06');
    expect(tuesday.map((row) => row.hours)).toStrictEqual(['09:00-17:00']);
  });

  it('an own save that leaves every shift of today in place is allowed (same set, a later end date)', async () => {
    const res = await save('E002', E.E002, {
      effective_from: '2026-10-06',
      effective_to: '2026-12-31',
      days: MON_FRI_09_17,
    });
    expect(res.status).toBe(200);
  });
});
