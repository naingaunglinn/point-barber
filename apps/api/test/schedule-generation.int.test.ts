import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  activeShifts,
  generateUnit,
  insertAttendance,
  insertShift,
  shiftsOf,
} from './helpers/schedule-shifts.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';
import { storeSetting } from './helpers/settings.js';

// add-schedule-patterns tasks 4.4 and 4.5 (tests first) — the generator and the regeneration a save runs
// (P2-RULE-07 · D-DB-06 · owner PT4 / PT5), on the fixture database (spec-fixtures §10.1), clock 05/Oct/2026
// 11:00 AM MMT unless a scenario moves it. Fixture 300 seeds no shift, so each group starts with the
// nightly run of 05/Oct for the employees it counts (19 shifts for Ko Aung: 05 … 26 Oct without Sundays).
const { B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();
const save = async (who: FixturePerson, employeeId: string, body: object) => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  return s.http
    .put(`/api/v1/employees/${employeeId}/schedule-pattern`)
    .set('Cookie', cookie)
    .send(body);
};
const week = (days: number[], start: string, end: string) =>
  days.map((day_of_week) => ({
    day_of_week,
    segments: [{ branch_id: B3, start_time: start, end_time: end }],
  }));
const datesOf = (rows: { date: string }[]) => rows.map((row) => row.date);
const range = (from: number, to: number, skip: number[] = []) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .filter((day) => !skip.includes(day))
    .map((day) => `2026-10-${String(day).padStart(2, '0')}`);

const start = async (now = '2026-10-05T11:00:00') => {
  s = await seededApp(mmt(now));
  cookies.clear();
};

describe('add-schedule-patterns · scheduling · Generation runs from today to the horizon and never on past dates', () => {
  beforeAll(() => start());
  afterAll(() => s.close());

  it('Scenario: The horizon on 05/Oct/2026 — window 14 covers 05 … 26 Oct and inserts 19 shifts', async () => {
    const past = await insertShift(s, {
      employee_id: E.E004,
      branch_id: B3,
      date: '2026-10-03',
      start: '09:00',
      end: '21:00',
      source: 1,
    });
    const result = await generateUnit(s, E.E004);
    expect(result.warnings).toStrictEqual([]);
    const rows = (await activeShifts(s, E.E004)).filter((row) => row.id !== past);
    expect(rows).toHaveLength(19);
    expect(datesOf(rows)).toStrictEqual(range(5, 26, [11, 18, 25]));
    expect(result.changed_dates).toStrictEqual(datesOf(rows));
    expect(rows.every((row) => row.hours === '09:00-21:00' && row.source === 1)).toBe(true);
  });

  it('Scenario: The shift’s instants — Tuesday 06/Oct starts 09:00+06:30 and is dated 06/Oct, at B3', async () => {
    const [row] = await s.prisma.$queryRaw<{ starts: string; ends: string; branch_id: string }[]>`
      SELECT to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS starts,
             to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS ends, branch_id
      FROM schedule_shifts WHERE employee_id = ${E.E004}::uuid AND shift_date = '2026-10-06'::date`;
    expect(row).toStrictEqual({
      starts: '2026-10-06T02:30',
      ends: '2026-10-06T14:30',
      branch_id: B3,
    });
  });

  it('Scenario: The nightly run twice — the second run writes nothing, ids and updated_at unchanged', async () => {
    const before = await shiftsOf(s, E.E004);
    const result = await generateUnit(s, E.E004);
    expect(result).toStrictEqual({ changed_dates: [], changed: [], warnings: [] });
    expect(await shiftsOf(s, E.E004)).toStrictEqual(before);
  });

  it('Scenario: Yesterday is left alone — a save from 05/Oct keeps the Saturday 03/Oct shift', async () => {
    const before = (await shiftsOf(s, E.E004)).filter((row) => row.date === '2026-10-03');
    expect(before).toHaveLength(1);
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-05',
      days: week([1, 2, 3, 4, 5, 6], '10:00', '19:00'),
    });
    expect(res.status).toBe(200);
    expect((await shiftsOf(s, E.E004)).filter((row) => row.date <= '2026-10-04')).toStrictEqual(
      before,
    );
    expect(await activeShifts(s, E.E004)).toHaveLength(20);
  });
});

describe('add-schedule-patterns · scheduling · A save regenerates the employee’s shifts in the same request', () => {
  beforeAll(async () => {
    await start();
    await generateUnit(s, E.E004);
  });
  afterAll(() => s.close());

  it('Scenario: New hours from next week — 13 shifts of 12 … 26 Oct archived, 11 inserted; 05 … 10 Oct untouched', async () => {
    const before = await shiftsOf(s, E.E004);
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1, 2, 3, 4, 5], '10:00', '19:00'),
    });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toStrictEqual([]);

    const after = await shiftsOf(s, E.E004);
    const untouched = after.filter((row) => row.date <= '2026-10-10');
    expect(untouched).toStrictEqual(before.filter((row) => row.date <= '2026-10-10'));
    expect(untouched).toHaveLength(6);

    const late = after.filter((row) => row.date >= '2026-10-12');
    const archived = late.filter((row) => row.archived);
    const inserted = late.filter((row) => !row.archived);
    expect(datesOf(archived)).toStrictEqual(range(12, 26, [11, 18, 25]));
    expect(archived).toHaveLength(13);
    expect(archived.every((row) => row.hours === '09:00-21:00')).toBe(true);
    expect(datesOf(inserted)).toStrictEqual(range(12, 26, [11, 17, 18, 24, 25]));
    expect(inserted).toHaveLength(11);
    expect(inserted.every((row) => row.hours === '10:00-19:00' && row.source === 1)).toBe(true);
  });

  it('every inserted shift points at a row of the new set; the old set’s rows stay on the archived shifts', async () => {
    const newRows = await s.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM schedule_patterns
      WHERE employee_id = ${E.E004}::uuid AND effective_from = '2026-10-12'::date`;
    const ids = new Set(newRows.map((row) => row.id));
    const late = (await shiftsOf(s, E.E004)).filter((row) => row.date >= '2026-10-12');
    expect(late.filter((row) => !row.archived).every((row) => ids.has(row.pattern ?? ''))).toBe(
      true,
    );
    expect(late.filter((row) => row.archived).every((row) => !ids.has(row.pattern ?? ''))).toBe(
      true,
    );
  });
});

describe('add-schedule-patterns · scheduling · A segment becomes a shift only for an active employee assigned on that date', () => {
  beforeAll(async () => {
    await start();
    await generateUnit(s, E.E005);
    await generateUnit(s, E.E004);
  });
  afterAll(() => s.close());

  it('Scenario: An inactive employee — Ko Min inactive on 06/Oct: his active shifts of 06 … 26 Oct are archived, none inserted', async () => {
    await s.prisma.$executeRaw`UPDATE employees SET status = 0 WHERE id = ${E.E005}::uuid`;
    s.clock?.set(mmt('2026-10-06T11:00:00'));
    const result = await generateUnit(s, E.E005);
    const rows = await shiftsOf(s, E.E005);
    const archived = rows.filter((row) => row.archived);
    expect(datesOf(archived)).toStrictEqual(range(6, 26, [11, 18, 25]));
    expect(archived).toHaveLength(18);
    expect(datesOf(rows.filter((row) => !row.archived))).toStrictEqual(['2026-10-05']);
    expect(result.changed_dates).toStrictEqual(datesOf(archived));
  });

  it('Scenario: An assignment ending 20/Oct — a save from 12/Oct produces 8 shifts: 12 … 17 and 19, 20 Oct', async () => {
    s.clock?.set(mmt('2026-10-05T11:00:00'));
    await s.prisma.$executeRaw`
      UPDATE employee_branches SET effective_to = '2026-10-20'::date
      WHERE employee_id = ${E.E004}::uuid AND branch_id = ${B3}::uuid`;
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1, 2, 3, 4, 5, 6], '09:00', '21:00'),
    });
    expect(res.status).toBe(200);
    const late = (await activeShifts(s, E.E004)).filter((row) => row.date >= '2026-10-12');
    expect(datesOf(late)).toStrictEqual([...range(12, 17), '2026-10-19', '2026-10-20']);
  });
});

describe('add-schedule-patterns · scheduling · A shorter window', () => {
  beforeAll(async () => {
    await start();
    await storeSetting(s, 'booking.advance_window_days', 7);
  });
  afterAll(() => s.close());

  it('Scenario: A shorter window — window 7 covers 05 … 19 Oct (05 + 7 + 7)', async () => {
    await generateUnit(s, E.E004);
    expect(datesOf(await activeShifts(s, E.E004))).toStrictEqual(range(5, 19, [11, 18]));
  });
});

describe('add-schedule-patterns · scheduling · Generation keeps unchanged shifts and changes only the difference', () => {
  beforeAll(async () => {
    await start();
    await generateUnit(s, E.E004);
  });
  afterAll(() => s.close());

  it('Scenario: Same times, new set — 13 shifts of 12 … 26 Oct archived and 13 inserted with the new rows’ ids (PT5)', async () => {
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1, 2, 3, 4, 5, 6], '09:00', '21:00'),
    });
    expect(res.status).toBe(200);
    const late = (await shiftsOf(s, E.E004)).filter((row) => row.date >= '2026-10-12');
    expect(late.filter((row) => row.archived)).toHaveLength(13);
    const inserted = late.filter((row) => !row.archived);
    expect(inserted).toHaveLength(13);
    expect(inserted.every((row) => row.hours === '09:00-21:00')).toBe(true);
    const archivedPatterns = new Set(late.filter((row) => row.archived).map((row) => row.pattern));
    expect(inserted.some((row) => archivedPatterns.has(row.pattern))).toBe(false);
  });
});

describe('add-schedule-patterns · scheduling · Generation never touches a manual day', () => {
  beforeAll(async () => {
    await start();
    await generateUnit(s, E.E004);
  });
  afterAll(() => s.close());

  it('Scenario: A day with a manual shift, and a removed day — 07/Oct stays the MANUAL 12:00 – 21:00, 08/Oct stays without a shift', async () => {
    const regenerate = await shiftsOf(s, E.E004);
    const aungOn = (date: string) => regenerate.filter((row) => row.date === date && !row.archived);
    for (const date of ['2026-10-07', '2026-10-08']) {
      for (const row of aungOn(date)) {
        await s.prisma
          .$executeRaw`UPDATE schedule_shifts SET archived_at = now() WHERE id = ${row.id}::uuid`;
      }
    }
    const manual = await insertShift(s, {
      employee_id: E.E004,
      branch_id: B3,
      date: '2026-10-07',
      start: '12:00',
      end: '21:00',
      source: 2,
    });
    const removed = await insertShift(s, {
      employee_id: E.E004,
      branch_id: B3,
      date: '2026-10-08',
      start: '09:00',
      end: '21:00',
      source: 2,
      archived: true,
    });

    const res = await save('E002', E.E004, {
      effective_from: '2026-10-05',
      days: week([1, 2, 3, 4, 5, 6], '10:00', '19:00'),
    });
    expect(res.status).toBe(200);

    const rows = await shiftsOf(s, E.E004);
    expect(rows.filter((row) => row.date === '2026-10-07' && !row.archived)).toMatchObject([
      { id: manual, hours: '12:00-21:00', source: 2 },
    ]);
    expect(rows.filter((row) => row.date === '2026-10-08' && !row.archived)).toStrictEqual([]);
    expect(rows.find((row) => row.id === removed)).toMatchObject({ archived: true, source: 2 });
    const others = rows.filter(
      (row) =>
        !row.archived &&
        row.date >= '2026-10-05' &&
        !['2026-10-07', '2026-10-08'].includes(row.date),
    );
    expect(others).toHaveLength(17);
    expect(others.every((row) => row.hours === '10:00-19:00' && row.source === 1)).toBe(true);
  });
});

describe('add-schedule-patterns · scheduling · A shift that attendance points at is kept and converted', () => {
  beforeAll(async () => {
    await start();
    await generateUnit(s, E.E004);
  });
  afterAll(() => s.close());

  it('Scenario: Already clocked in — S1 of today becomes MANUAL with its times; the 06 … 26 Oct shifts are regenerated', async () => {
    const [s1] = (await activeShifts(s, E.E004)).filter((row) => row.date === '2026-10-05');
    expect(s1?.hours).toBe('09:00-21:00');
    await insertAttendance(s, {
      shift_id: s1?.id ?? '',
      employee_id: E.E004,
      branch_id: B3,
      date: '2026-10-05',
    });

    const res = await save('E001', E.E004, {
      effective_from: '2026-10-05',
      days: week([1, 2, 3, 4, 5, 6], '10:00', '19:00'),
    });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toStrictEqual([
      { code: 'shift_kept_attendance', items: [{ shift_id: s1?.id, shift_date: '2026-10-05' }] },
    ]);

    const rows = await shiftsOf(s, E.E004);
    expect(rows.filter((row) => row.date === '2026-10-05' && !row.archived)).toMatchObject([
      { id: s1?.id, hours: '09:00-21:00', source: 2 },
    ]);
    const later = rows.filter((row) => !row.archived && row.date >= '2026-10-06');
    expect(later).toHaveLength(18);
    expect(later.every((row) => row.hours === '10:00-19:00' && row.source === 1)).toBe(true);
  });

  it('the next run leaves the manual day alone and writes nothing', async () => {
    const before = await shiftsOf(s, E.E004);
    expect(await generateUnit(s, E.E004)).toStrictEqual({
      changed_dates: [],
      changed: [],
      warnings: [],
    });
    expect(await shiftsOf(s, E.E004)).toStrictEqual(before);
  });
});
