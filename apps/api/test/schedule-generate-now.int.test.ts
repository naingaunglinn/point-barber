import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ShiftsGenerateJob } from '../src/modules/scheduling/shifts/shifts-generate.job.js';
import { activeShifts } from './helpers/schedule-shifts.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-schedule-patterns task 5.5 (tests first) — P2.SHF.06 `POST /v1/schedule/generate` (P2-RULE-07 · ADR-002 ·
// owner PT6 · reading 7): 202 `{ job_id }`, the job queued in the request's transaction with the employees
// the caller's `schedule.update` grants cover; an employee with a segment or shift at another branch is
// skipped; `from` / `to` are clipped; `to` before `from` → 400; the audit row `schedule.generate` at the
// request's branch. Clock Monday 05/Oct/2026 11:00 AM.
const { B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const post = async (who: FixturePerson, body: object) =>
  s.http
    .post('/api/v1/schedule/generate')
    .set('Cookie', (await s.signIn(who)).cookie)
    .send(body);
const jobData = async (jobId: string) =>
  (
    await s.prisma.$queryRaw<{ data: Record<string, unknown> }[]>`
      SELECT data FROM pgboss.job WHERE id = ${jobId}::uuid AND name = 'shifts.generate'`
  )[0]?.data;
const jobCount = async () =>
  Number(
    (
      await s.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM pgboss.job WHERE name = 'shifts.generate'`
    )[0]?.n,
  );
const sorted = (ids: string[]) => [...ids].sort();

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T11:00:00'));
});
afterAll(() => s.close());

describe('add-schedule-patterns · scheduling · Generation can be run now for one branch', () => {
  it('Scenario: Ma Hnin runs B3 — 202; her job covers Ma Hnin, Ko Aung, Ko Min and Ma Thida, not U Kyaw Zin', async () => {
    const res = await post('E002', { branch_id: B3 });
    expect(res.status).toBe(202);
    expect(Object.keys(res.body)).toStrictEqual(['job_id']);
    const data = await jobData(res.body.job_id);
    expect(data).toStrictEqual({
      branch_id: B3,
      from: '2026-10-05',
      to: '2026-10-26',
      employee_ids: sorted([E.E002, E.E004, E.E005, E.E008]),
      requested_by: FIXTURE_IDS.users.E002,
    });
    await s.app.get(ShiftsGenerateJob).run(data);
    expect((await activeShifts(s, E.E004)).length).toBe(19);
    expect(await activeShifts(s, E.E001)).toStrictEqual([]);
  });

  it('writes one schedule.generate audit row at B3, by Ma Hnin, in the request', async () => {
    const rows = await s.prisma.audit_events.findMany({ where: { action: 'schedule.generate' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ branch_id: B3, actor_user_id: FIXTURE_IDS.users.E002, source: 1 });
  });

  it('Scenario: The admin runs B3 — the same four and U Kyaw Zin, his B1 Monday segment included', async () => {
    const res = await post('E001', { branch_id: B3 });
    expect(res.status).toBe(202);
    expect((await jobData(res.body.job_id))?.employee_ids).toStrictEqual(
      sorted([E.E001, E.E002, E.E004, E.E005, E.E008]),
    );
    await s.app.get(ShiftsGenerateJob).run(await jobData(res.body.job_id));
    const mondays = (await activeShifts(s, E.E001)).filter((shift) => shift.date.endsWith('-26'));
    expect(mondays.map((shift) => shift.hours)).toStrictEqual(['09:00-13:00', '14:00-18:00']);
  });

  it('Scenario: Range clipped — from 2026-10-01 and to 2026-11-30 run over 2026-10-05 … 2026-10-26', async () => {
    const res = await post('E002', { branch_id: B3, from: '2026-10-01', to: '2026-11-30' });
    expect(res.status).toBe(202);
    expect(await jobData(res.body.job_id)).toMatchObject({ from: '2026-10-05', to: '2026-10-26' });
  });

  it('a `to` before the raised `from` answers 400 on `to` and queues nothing', async () => {
    const jobs = await jobCount();
    const audits = await s.prisma.audit_events.count({ where: { action: 'schedule.generate' } });
    const res = await post('E002', { branch_id: B3, from: '2026-10-01', to: '2026-10-02' });
    expect([res.status, res.body.code, res.body.errors?.[0]?.field]).toStrictEqual([
      400,
      'validation',
      'to',
    ]);
    expect(await jobCount()).toBe(jobs);
    expect(await s.prisma.audit_events.count({ where: { action: 'schedule.generate' } })).toBe(
      audits,
    );
  });

  it('`employee_id` narrows the run; one who is not at the branch makes an empty run', async () => {
    const one = await post('E002', { branch_id: B3, employee_id: E.E004 });
    expect((await jobData(one.body.job_id))?.employee_ids).toStrictEqual([E.E004]);
    const none = await post('E002', { branch_id: B3, employee_id: E.E006 });
    expect(none.status).toBe(202);
    expect((await jobData(none.body.job_id))?.employee_ids).toStrictEqual([]);
  });

  it('Scenario: Not her branch — Ko Zaw gets 403 forbidden; Ko Aung gets 403 with context.required = schedule.update; no job', async () => {
    const jobs = await jobCount();
    const zaw = await post('E003', { branch_id: B3 });
    const aung = await post('E004', { branch_id: B3 });
    expect([zaw.status, zaw.body.code]).toStrictEqual([403, 'forbidden']);
    expect([aung.status, aung.body.code]).toStrictEqual([403, 'forbidden']);
    expect(aung.body.context).toMatchObject({ required: 'schedule.update' });
    expect(await jobCount()).toBe(jobs);
  });
});
