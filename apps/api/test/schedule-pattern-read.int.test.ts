import { patternSetSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-schedule-patterns task 3.4 — spec "Reading a pattern set" (P2.PAT.01 · P2-RULE-11 · API-PERM-03 ·
// API-PERM-04 · API-PERM-06 · P1-RULE-11 · owner PT1) on the fixture database (spec-fixtures §10.1),
// clock 05/Oct/2026 11:00 AM MMT.
const { B1, B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T11:00:00'));
});
afterAll(() => s.close());

const read = async (who: FixturePerson, employeeId: string, query = '') => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  return s.http
    .get(`/api/v1/employees/${employeeId}/schedule-pattern${query}`)
    .set('Cookie', cookie);
};

const sixDays = (start: string, end: string) =>
  [1, 2, 3, 4, 5, 6].map((day_of_week) => ({
    day_of_week,
    segments: [{ branch_id: B3, start_time: start, end_time: end }],
  }));

describe('add-schedule-patterns · scheduling · Reading a pattern set', () => {
  it("Scenario: A manager reads a barber's pattern", async () => {
    const res = await read('E002', E.E004);
    expect(res.status).toBe(200);
    expect(patternSetSchema.parse(res.body)).toStrictEqual({
      employee_id: E.E004,
      effective_from: '2026-09-01',
      effective_to: null,
      days: sixDays('09:00', '21:00'),
    });
  });

  it('Scenario: Own pattern without a code', async () => {
    const res = await read('E004', E.E004);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      effective_from: '2026-09-01',
      days: sixDays('09:00', '21:00'),
    });
  });

  it('Scenario: No pattern yet — every day off (owner PT1)', async () => {
    const res = await read('E002', E.E008);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      employee_id: E.E008,
      effective_from: null,
      effective_to: null,
      days: [],
    });
  });

  it('Scenario: Who may read — out of scope 404, no code 403 with context.required', async () => {
    const zaw = await read('E003', E.E004);
    expect([zaw.status, zaw.body.code]).toStrictEqual([404, 'not_found']);
    const min = await read('E005', E.E004);
    expect([min.status, min.body.code, min.body.context]).toStrictEqual([
      403,
      'forbidden',
      { required: 'schedule.view' },
    ]);
  });

  it('Scenario: A multi-branch employee is read by a manager of one branch — his B1 segment too', async () => {
    const res = await read('E002', E.E001);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      effective_from: '2026-09-01',
      days: [
        {
          day_of_week: 1,
          segments: [
            { branch_id: B1, start_time: '09:00', end_time: '13:00' },
            { branch_id: B3, start_time: '14:00', end_time: '18:00' },
          ],
        },
      ],
    });
  });

  it('Scenario: History with a scheduled set — Ko Min from 01/Sep (ends 25/Oct) and from 26/Oct', async () => {
    // Ko Min's set from 01/Sep ends on 25/Oct, and a scheduled set Mon – Fri 11:00 – 19:00 starts 26/Oct.
    await s.prisma.$executeRaw`
      UPDATE schedule_patterns SET effective_to = DATE '2026-10-25'
      WHERE employee_id = ${E.E005}::uuid AND effective_from = DATE '2026-09-01'`;
    for (const day of [1, 2, 3, 4, 5]) {
      await s.prisma.$executeRaw`
        INSERT INTO schedule_patterns
          (id, employee_id, branch_id, day_of_week, start_time, end_time, effective_from, effective_to)
        VALUES (gen_random_uuid(), ${E.E005}::uuid, ${B3}::uuid, ${day}, TIME '11:00', TIME '19:00',
                DATE '2026-10-26', NULL)`;
    }
    const res = await read('E002', E.E005, '?include_history=true');
    expect(res.status).toBe(200);
    const body = patternSetSchema.parse(res.body);
    expect([body.effective_from, body.effective_to]).toStrictEqual(['2026-09-01', '2026-10-25']);
    expect(body.history?.map((set) => [set.effective_from, set.effective_to])).toStrictEqual([
      ['2026-09-01', '2026-10-25'],
      ['2026-10-26', null],
    ]);
    // as_of picks the set of that date.
    const later = await read('E002', E.E005, '?as_of=2026-10-27');
    expect(later.body).toMatchObject({ effective_from: '2026-10-26', effective_to: null });
    expect(later.body).not.toHaveProperty('history');
  });

  it('a malformed as_of is refused with 400 validation', async () => {
    const res = await read('E002', E.E004, '?as_of=27/Oct/2026');
    expect([res.status, res.body.code]).toStrictEqual([400, 'validation']);
  });
});
