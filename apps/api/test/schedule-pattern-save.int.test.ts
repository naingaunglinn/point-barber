import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-schedule-patterns tasks 3.6 – 3.8 (tests first) and the audit row of 3.9 — P2.PAT.02 on the fixture
// database (spec-fixtures §10.1), clock 05/Oct/2026 11:00 AM MMT unless a scenario moves it:
// - "Saving needs the update code over every branch the save touches" · "A save starts today or later"
//   (P2-RULE-11 · P2-RULE-04 · D-PLT-15 · API-PERM-02 / 07);
// - "Segment times and dates are checked before the business rules" · "A branch change within a day
//   needs the travel gap" · "Every segment needs a branch assignment on the start date" (owner PT4);
// - "A save replaces the set it starts in and never edits history" (P2-RULE-04 · D-DB-06 · owner PT2).
const { B1, B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();

const cookieOf = async (who: FixturePerson) => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  return cookie;
};
const save = async (who: FixturePerson, employeeId: string, body: object) =>
  s.http
    .put(`/api/v1/employees/${employeeId}/schedule-pattern`)
    .set('Cookie', await cookieOf(who))
    .send(body);

const seg = (branch_id: string, start_time: string, end_time: string) => ({
  branch_id,
  start_time,
  end_time,
});
/** Days `days` with one segment each. */
const week = (days: number[], branch: string, start: string, end: string) =>
  days.map((day_of_week) => ({ day_of_week, segments: [seg(branch, start, end)] }));

interface Row {
  id: string;
  day: number;
  hours: string;
  from: string;
  to: string | null;
  archived: boolean;
}
const rowsOf = async (employeeId: string): Promise<Row[]> =>
  s.prisma.$queryRaw<Row[]>`
    SELECT id, day_of_week AS day,
           to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI') AS hours,
           effective_from::text AS "from", effective_to::text AS "to", archived_at IS NOT NULL AS archived
    FROM schedule_patterns WHERE employee_id = ${employeeId}::uuid
    ORDER BY effective_from, day_of_week, start_time`;
const rowCount = async () =>
  Number((await s.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM schedule_patterns`)[0]?.n);
const auditRows = async (employeeId: string) =>
  s.prisma.audit_events.findMany({
    where: { action: 'schedule.pattern_set', entity_id: employeeId },
    orderBy: { occurred_at: 'asc' },
  });

describe('add-schedule-patterns · scheduling · access and dates of a save', () => {
  beforeAll(async () => {
    s = await seededApp(mmt('2026-10-05T11:00:00'));
    cookies.clear();
  });
  afterAll(() => s.close());

  it('Scenario: Branch manager, branch barber — Ma Hnin saves Ko Aung with B3 segments', async () => {
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1, 2, 3, 4, 5], B3, '10:00', '19:00'),
    });
    expect(res.status).toBe(200);
  });

  it('Scenario: A multi-branch employee — Ma Hnin keeps U Kyaw Zin’s B1 segment → 403', async () => {
    const before = await rowCount();
    const res = await save('E002', E.E001, {
      effective_from: '2026-10-12',
      days: [{ day_of_week: 1, segments: [seg(B1, '09:00', '13:00'), seg(B3, '14:00', '18:00')] }],
    });
    expect([res.status, res.body.code]).toStrictEqual([403, 'forbidden']);
    expect(await rowCount()).toBe(before);
  });

  it('Scenario: Another branch’s manager — Ko Zaw saves Ko Aung → 403', async () => {
    const before = await rowCount();
    const res = await save('E003', E.E004, {
      effective_from: '2026-10-19',
      days: week([1], B3, '10:00', '19:00'),
    });
    expect([res.status, res.body.code]).toStrictEqual([403, 'forbidden']);
    expect(await rowCount()).toBe(before);
  });

  it('Scenario: No code — Ko Aung saves his own set → 403 with context.required', async () => {
    const res = await save('E004', E.E004, {
      effective_from: '2026-10-19',
      days: week([1], B3, '10:00', '19:00'),
    });
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      403,
      'forbidden',
      { required: 'schedule.update' },
    ]);
  });

  it('Scenario: Yesterday — 04/Oct → 422 effective_date_past, nothing written', async () => {
    const before = await rowCount();
    const res = await save('E002', E.E005, {
      effective_from: '2026-10-04',
      days: week([1], B3, '10:00', '19:00'),
    });
    expect([res.status, res.body.code]).toStrictEqual([422, 'effective_date_past']);
    expect(await rowCount()).toBe(before);
  });

  it('Scenario: Date boundary at midnight — 23:59 passes, 00:00 of the next day is refused', async () => {
    s.clock?.set(mmt('2026-10-05T23:59:00'));
    const first = await save('E002', E.E005, {
      effective_from: '2026-10-05',
      days: week([1, 2, 3, 4, 5, 6], B3, '10:00', '20:00'),
    });
    expect(first.status).toBe(200);
    s.clock?.set(mmt('2026-10-06T00:00:00'));
    const second = await save('E002', E.E005, {
      effective_from: '2026-10-05',
      days: week([1, 2, 3, 4, 5, 6], B3, '10:00', '19:00'),
    });
    expect([second.status, second.body.code]).toStrictEqual([422, 'effective_date_past']);
    s.clock?.set(mmt('2026-10-05T11:00:00'));
  });

  it('an unknown employee → 404', async () => {
    const res = await save('E001', '0199a3f2-0000-7000-8003-00000000ffff', {
      effective_from: '2026-10-12',
      days: [],
    });
    expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
  });
});

describe('add-schedule-patterns · scheduling · the checks of a save', () => {
  beforeAll(async () => {
    s = await seededApp(mmt('2026-10-05T11:00:00'));
    cookies.clear();
  });
  afterAll(() => s.close());

  it('Scenario: A segment that ends when it starts — 400 end_before_start on its end_time', async () => {
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1], B3, '13:00', '13:00'),
    });
    expect([res.status, res.body.code, res.body.errors[0]]).toStrictEqual([
      400,
      'validation',
      { field: 'days[0].segments[0].end_time', code: 'end_before_start' },
    ]);
  });

  it('Scenario: Overlapping segments — 400 segment_overlap on the later one; nothing written', async () => {
    const before = await rowCount();
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: [{ day_of_week: 1, segments: [seg(B3, '09:00', '13:00'), seg(B3, '12:00', '20:00')] }],
    });
    expect([res.status, res.body.errors]).toStrictEqual([
      400,
      [{ field: 'days[0].segments[1]', code: 'segment_overlap' }],
    ]);
    expect(await rowCount()).toBe(before);
  });

  it('Scenario: End date before start date — 400 end_before_start on effective_to', async () => {
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      effective_to: '2026-10-11',
      days: week([1], B3, '09:00', '21:00'),
    });
    expect([res.status, res.body.errors]).toStrictEqual([
      400,
      [{ field: 'effective_to', code: 'end_before_start' }],
    ]);
  });

  it('Scenario: No gap — U Kyaw Zin B1 until 13:00, B3 from 13:00 → 422 cross_branch_gap', async () => {
    const before = await rowCount();
    const res = await save('E001', E.E001, {
      effective_from: '2026-10-12',
      days: [{ day_of_week: 1, segments: [seg(B1, '09:00', '13:00'), seg(B3, '13:00', '20:00')] }],
    });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      code: 'cross_branch_gap',
      context: { needed: 60, actual: 0, after_segment: 0 },
      errors: [
        {
          field: 'days[0].segments[1]',
          code: 'cross_branch_gap',
          params: { needed: 60, actual: 0, after_segment: 0 },
        },
      ],
    });
    expect(await rowCount()).toBe(before);
  });

  it('Scenario: A branch the barber does not work at — day 6 at B1 → 422 not_assigned_to_branch', async () => {
    const res = await save('E001', E.E004, {
      effective_from: '2026-10-12',
      days: [...week([1, 2, 3, 4, 5], B3, '09:00', '21:00'), ...week([6], B1, '09:00', '21:00')],
    });
    expect([res.status, res.body.code, res.body.errors]).toStrictEqual([
      422,
      'not_assigned_to_branch',
      [{ field: 'days[5].segments[0].branch_id', code: 'not_assigned_to_branch' }],
    ]);
  });

  it('Scenario: An ended assignment — Ko Naing from 06/Oct at B3 → 422 not_assigned_to_branch', async () => {
    const res = await save('E001', E.E009, {
      effective_from: '2026-10-06',
      days: [{ day_of_week: 1, segments: [seg(B3, '09:00', '13:00'), seg(B3, '14:00', '18:00')] }],
    });
    expect([res.status, res.body.code]).toStrictEqual([422, 'not_assigned_to_branch']);
  });

  it('Scenario: Touching segments at one branch pass', async () => {
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: [{ day_of_week: 1, segments: [seg(B3, '09:00', '13:00'), seg(B3, '13:00', '20:00')] }],
    });
    expect(res.status).toBe(200);
  });
});

describe('add-schedule-patterns · scheduling · A save replaces the set it starts in and never edits history', () => {
  beforeAll(async () => {
    s = await seededApp(mmt('2026-10-05T11:00:00'));
    cookies.clear();
  });
  afterAll(() => s.close());

  it('Scenario: A new set from next week — the old set keeps its 6 rows and ends on 11/Oct', async () => {
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1, 2, 3, 4, 5], B3, '10:00', '19:00'),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      effective_from: '2026-10-12',
      effective_to: null,
      warnings: [],
    });
    expect(res.body.days).toHaveLength(5);
    const rows = await rowsOf(E.E004);
    expect(rows.filter((row) => row.from === '2026-09-01').map((row) => [row.day, row.to])).toStrictEqual(
      [1, 2, 3, 4, 5, 6].map((day) => [day, '2026-10-11']),
    );
  });

  it('the save writes one schedule.pattern_set row at B3 with the set before and after', async () => {
    const [row, ...rest] = await auditRows(E.E004);
    expect(rest).toStrictEqual([]);
    expect(row).toMatchObject({ branch_id: B3, entity_type: 'employees' });
    expect(row?.before_data).toMatchObject({ effective_from: '2026-09-01', effective_to: null });
    expect((row?.before_data as { days: unknown[] }).days).toHaveLength(6);
    expect(row?.after_data).toMatchObject({ effective_from: '2026-10-12', effective_to: null });
    expect((row?.after_data as { days: unknown[] }).days).toHaveLength(5);
  });

  it('Scenario: Editing a scheduled set in place — 4 rows keep their ids, day 5 archived and inserted', async () => {
    const kept = (await rowsOf(E.E004)).filter((row) => row.from === '2026-10-12' && row.day < 5);
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: [...week([1, 2, 3, 4], B3, '10:00', '19:00'), ...week([5], B3, '10:00', '17:00')],
    });
    expect(res.status).toBe(200);
    const rows = (await rowsOf(E.E004)).filter((row) => row.from === '2026-10-12');
    expect(rows.filter((row) => row.day < 5).map((row) => row.id)).toStrictEqual(kept.map((row) => row.id));
    expect(rows.filter((row) => row.day === 5).map((row) => [row.hours, row.archived])).toStrictEqual([
      ['10:00-17:00', false],
      ['10:00-19:00', true],
    ]);
    expect((await rowsOf(E.E004)).filter((row) => row.from === '2026-09-01').every((row) => row.to === '2026-10-11')).toBe(true);
  });

  it('Saving the same set again — 200, no row changed and no audit row added', async () => {
    const before = await rowsOf(E.E004);
    const audits = (await auditRows(E.E004)).length;
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: [...week([1, 2, 3, 4], B3, '10:00', '19:00'), ...week([5], B3, '10:00', '17:00')],
    });
    expect(res.status).toBe(200);
    expect(await rowsOf(E.E004)).toStrictEqual(before);
    expect(await auditRows(E.E004)).toHaveLength(audits);
  });

  it('Scenario: An end date — Ko Min from 12/Oct ends on 18/Oct', async () => {
    const res = await save('E002', E.E005, {
      effective_from: '2026-10-12',
      effective_to: '2026-10-18',
      days: week([1, 2, 3, 4, 5, 6], B3, '10:00', '20:00'),
    });
    expect([res.status, res.body.effective_to]).toStrictEqual([200, '2026-10-18']);
  });

  it('Scenario: An end date reaching a scheduled set — capped at 25/Oct; the set from 26/Oct unchanged (PT2)', async () => {
    // Ma Thida (no set) gets a scheduled set from 26/Oct, then a set from 12/Oct until 31/Oct.
    const later = await save('E002', E.E008, {
      effective_from: '2026-10-26',
      days: week([1, 2, 3, 4, 5], B3, '11:00', '19:00'),
    });
    expect(later.status).toBe(200);
    const laterRows = (await rowsOf(E.E008)).filter((row) => row.from === '2026-10-26');
    const res = await save('E002', E.E008, {
      effective_from: '2026-10-12',
      effective_to: '2026-10-31',
      days: week([1, 2, 3, 4, 5, 6], B3, '10:00', '20:00'),
    });
    expect([res.status, res.body.effective_to]).toStrictEqual([200, '2026-10-25']);
    expect((await rowsOf(E.E008)).filter((row) => row.from === '2026-10-26')).toStrictEqual(laterRows);
  });

  it('Scenario: Every day off — Ko Htet from 19/Oct with days = []; his set ends on 18/Oct', async () => {
    const res = await save('E001', E.E006, { effective_from: '2026-10-19', days: [] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ effective_from: null, effective_to: null, days: [] });
    const rows = await rowsOf(E.E006);
    expect(rows.every((row) => row.from === '2026-09-01' && row.to === '2026-10-18')).toBe(true);
    expect(rows).toHaveLength(6);
  });
});
