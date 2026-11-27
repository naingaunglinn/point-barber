import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DomainEvent, DomainEvents } from '../src/common/events/domain-events.js';
import { BackgroundTasks } from '../src/common/http/background-tasks.js';
import { generateUnit } from './helpers/schedule-shifts.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-schedule-patterns task 5.3 (tests first) — the events and the website touch of a save (P2-RULE-12 ·
// API-AUD-01 · API-RT-03 · API-PUB-03 · design D3 step 10; its audit row was written with task 3.9).
// `schedule.changed` per changed (employee, branch) for `branch:<id>` and once for `user:<user id>` — a user
// id, never the employee id — with the top-level `rooms`; `site.revalidate ['barbers']` only when a shift of
// today changed; the identical repeat writes no row and collects nothing. Clock 05/Oct/2026 11:00 AM.
const { B1, B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
const U = FIXTURE_IDS.users;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const received: DomainEvent[] = [];
const save = async (who: FixturePerson, employeeId: string, body: object) =>
  s.http
    .put(`/api/v1/employees/${employeeId}/schedule-pattern`)
    .set('Cookie', (await s.signIn(who)).cookie)
    .send(body);
const week = (days: number[], start: string, end: string, branch = B3) =>
  days.map((day_of_week) => ({
    day_of_week,
    segments: [{ branch_id: branch, start_time: start, end_time: end }],
  }));
const settle = async () => {
  await s.app.get(BackgroundTasks).drain();
  return received.filter((event) => event.name === 'schedule.changed');
};
const barbersTouches = async () =>
  Number(
    (
      await s.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM pgboss.job WHERE name = 'site.revalidate'`
    )[0]?.n,
  );
const auditCount = () => s.prisma.audit_events.count({ where: { action: 'schedule.pattern_set' } });

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T11:00:00'));
  s.app.get(DomainEvents).on('schedule.changed', (event) => {
    received.push(event);
  });
  await generateUnit(s, E.E004);
  await generateUnit(s, E.E001);
});
afterAll(() => s.close());
beforeEach(async () => {
  await s.app.get(BackgroundTasks).drain();
  received.length = 0;
});

describe('add-schedule-patterns · scheduling · Each save is announced', () => {
  it('Scenario: Ko Aung’s new hours — one copy for branch:B3 and one for user:<Ko Aung’s user id>, B3 on both', async () => {
    const touches = await barbersTouches();
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1, 2, 3, 4, 5], '09:00', '21:00'),
    });
    expect(res.status).toBe(200);
    const payload = { branch_id: B3, employee_id: E.E004, dates: ['2026-10-12', '2026-10-26'] };
    expect(await settle()).toStrictEqual([
      { name: 'schedule.changed', payload, rooms: [`branch:${B3}`] },
      { name: 'schedule.changed', payload, rooms: [`user:${U.E004}`] },
    ]);
    expect(await barbersTouches()).toBe(touches);
  });

  it('Scenario: Saving the same set again — 200, no audit row and no event', async () => {
    const audits = await auditCount();
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-12',
      days: week([1, 2, 3, 4, 5], '09:00', '21:00'),
    });
    expect(res.status).toBe(200);
    expect(await auditCount()).toBe(audits);
    expect(await settle()).toStrictEqual([]);
  });

  it('a save that touches B1 and B3 sends each branch its dates; the user copy has no branch_id', async () => {
    const res = await save('E001', E.E001, {
      effective_from: '2026-10-12',
      days: [
        {
          day_of_week: 1,
          segments: [
            { branch_id: B1, start_time: '09:00', end_time: '12:00' },
            { branch_id: B3, start_time: '14:00', end_time: '19:00' },
          ],
        },
      ],
    });
    expect(res.status).toBe(200);
    const dates = ['2026-10-12', '2026-10-26'];
    expect(await settle()).toStrictEqual([
      {
        name: 'schedule.changed',
        payload: { branch_id: B1, employee_id: E.E001, dates },
        rooms: [`branch:${B1}`],
      },
      {
        name: 'schedule.changed',
        payload: { branch_id: B3, employee_id: E.E001, dates },
        rooms: [`branch:${B3}`],
      },
      {
        name: 'schedule.changed',
        payload: { employee_id: E.E001, dates },
        rooms: [`user:${U.E001}`],
      },
    ]);
  });
});

describe('add-schedule-patterns · scheduling · The website tag barbers', () => {
  it('is queued once when a shift of today changes (Ma Hnin changes Ko Aung’s hours from today)', async () => {
    const touches = await barbersTouches();
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-05',
      days: week([1, 2, 3, 4, 5, 6], '10:00', '20:00'),
    });
    expect(res.status).toBe(200);
    expect(await barbersTouches()).toBe(touches + 1);
  });

  it('is not queued when only later days change', async () => {
    const touches = await barbersTouches();
    const res = await save('E002', E.E004, {
      effective_from: '2026-10-20',
      days: week([1, 2, 3, 4, 5, 6], '11:00', '20:00'),
    });
    expect(res.status).toBe(200);
    expect(await barbersTouches()).toBe(touches);
  });
});
