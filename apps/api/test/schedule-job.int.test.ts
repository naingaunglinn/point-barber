import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type DomainEvent, DomainEvents } from '../src/common/events/domain-events.js';
import { BackgroundTasks } from '../src/common/http/background-tasks.js';
import { ShiftGenerator } from '../src/modules/scheduling/shifts/shift-generator.js';
import { ShiftsGenerateJob } from '../src/modules/scheduling/shifts/shifts-generate.job.js';
import { type ShiftRow, shiftsOf } from './helpers/schedule-shifts.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-schedule-patterns task 5.4 (tests first) — the job `shifts.generate` (ADR-002 · design D5 · reading 11):
// the nightly run moves the horizon one day and inserts that day only; a second run writes nothing; one
// employee failing leaves the others written and the handler throws; one `schedule.generate` row
// (source 3, no branch) only when a shift changed; `barbers` is queued once per run. Clock: 00:30 on
// 04/Oct/2026, then 05/Oct/2026 (window 14 → horizon 25/Oct, then 26/Oct).
const E = FIXTURE_IDS.employees;
const mmt = (local: string) => new Date(`${local}+06:30`);
/** Every fixture person with a set, Ko Aung first as the scenarios name them. */
const WITH_SETS = [E.E001, E.E002, E.E004, E.E005, E.E006, E.E007];

let s: SeededApp;
const received: DomainEvent[] = [];
const run = (data: object = {}) => s.app.get(ShiftsGenerateJob).run(data);
const allShifts = async () => {
  const rows: (ShiftRow & { employee: string })[] = [];
  for (const employee of WITH_SETS) {
    rows.push(...(await shiftsOf(s, employee)).map((row) => ({ ...row, employee })));
  }
  return rows;
};
const generateAudits = () =>
  s.prisma.audit_events.findMany({ where: { action: 'schedule.generate' }, orderBy: { id: 'asc' } });
const barbersTouches = async () =>
  Number(
    (
      await s.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM pgboss.job WHERE name = 'site.revalidate'`
    )[0]?.n,
  );

const start = async () => {
  s = await seededApp(mmt('2026-10-04T00:30:00'));
  received.length = 0;
  s.app.get(DomainEvents).on('schedule.changed', (event) => {
    received.push(event);
  });
};

describe('add-schedule-patterns · scheduling · The nightly run', () => {
  beforeAll(start);
  afterAll(() => s.close());
  beforeEach(() => {
    received.length = 0;
  });

  it('the first run generates today … the horizon (25/Oct) for every employee with a set', async () => {
    await run();
    const rows = (await allShifts()).filter((row) => !row.archived);
    expect(rows.length).toBeGreaterThan(0);
    expect(Math.max(...rows.map((row) => Number(row.date.slice(8))))).toBe(25);
    expect(new Set(rows.map((row) => row.employee))).toStrictEqual(new Set(WITH_SETS));
  });

  it('Scenario: The horizon moves one day — the run of 05/Oct inserts the shifts of 26/Oct only', async () => {
    const before = await allShifts();
    s.clock?.set(mmt('2026-10-05T00:30:00'));
    await run();
    const after = await allShifts();
    const inserted = after.filter((row) => !before.some((old) => old.id === row.id));
    expect(inserted.every((row) => row.date === '2026-10-26' && !row.archived)).toBe(true);
    const perEmployee = (code: string) => inserted.filter((row) => row.employee === code).length;
    // Ko Aung 1, Ko Min 1, Ma Hnin 1, U Kyaw Zin 2 (B1 and B3); Ko Htet and Ko Thura (B1 / B2) 1 each.
    expect([E.E004, E.E005, E.E002, E.E001, E.E006, E.E007].map(perEmployee)).toStrictEqual([
      1, 1, 1, 2, 1, 1,
    ]);
    expect(after.filter((row) => before.some((old) => old.id === row.id))).toStrictEqual(before);
  });

  it('the changing run wrote one schedule.generate row — source 3, no branch — and announced each employee', async () => {
    const [first, second, ...rest] = await generateAudits();
    expect(rest).toStrictEqual([]);
    expect([first, second].map((row) => [row?.source, row?.branch_id, row?.actor_user_id])).toStrictEqual([
      [3, null, null],
      [3, null, null],
    ]);
    await s.app.get(BackgroundTasks).drain();
  });

  it('Scenario: The nightly run twice — a second run writes no shift, no audit row and no event; barbers is queued once more', async () => {
    const before = await allShifts();
    const audits = (await generateAudits()).length;
    const touches = await barbersTouches();
    received.length = 0;
    await run();
    await s.app.get(BackgroundTasks).drain();
    expect(await allShifts()).toStrictEqual(before);
    expect((await generateAudits()).length).toBe(audits);
    expect(received).toStrictEqual([]);
    expect(await barbersTouches()).toBe(touches + 1);
  });

  it('a run queues barbers once, however many employees it generated', async () => {
    const touches = await barbersTouches();
    s.clock?.set(mmt('2026-10-06T00:30:00'));
    await run();
    expect(await barbersTouches()).toBe(touches + 1);
  });
});

describe('add-schedule-patterns · scheduling · A failing employee', () => {
  beforeAll(start);
  afterAll(() => s.close());

  it('Scenario: A failing employee — Ko Min fails: the others are written, the handler throws, the audit row and barbers still happen', async () => {
    const generator = s.app.get(ShiftGenerator);
    const real = generator.run.bind(generator);
    const spy = vi.spyOn(generator, 'run').mockImplementation((tx, input, ...rest) => {
      if (input.employee_id === E.E005) return Promise.reject(new Error('Ko Min fails'));
      return real(tx, input, ...rest);
    });
    const touches = await barbersTouches();
    await expect(run()).rejects.toThrow('1 employee(s) failed');
    const rows = (await allShifts()).filter((row) => !row.archived);
    expect(rows.some((row) => row.employee === E.E005)).toBe(false);
    expect(new Set(rows.map((row) => row.employee))).toStrictEqual(
      new Set(WITH_SETS.filter((id) => id !== E.E005)),
    );
    expect((await generateAudits()).length).toBe(1);
    expect(await barbersTouches()).toBe(touches + 1);
    spy.mockRestore();
  });

  it('the retry finishes Ko Min and leaves the others as they are (no-ops)', async () => {
    const before = (await allShifts()).filter((row) => row.employee !== E.E005);
    await run();
    const after = await allShifts();
    expect(after.some((row) => row.employee === E.E005 && !row.archived)).toBe(true);
    expect(after.filter((row) => row.employee !== E.E005)).toStrictEqual(before);
  });
});

describe('add-schedule-patterns · scheduling · A run P2.SHF.06 asked for', () => {
  beforeAll(start);
  afterAll(() => s.close());

  it('regenerates the employees of its data and writes no row of its own (the request wrote it)', async () => {
    const audits = (await generateAudits()).length;
    await run({
      branch_id: FIXTURE_IDS.branches.B3,
      from: '2026-10-04',
      to: '2026-10-25',
      employee_ids: [E.E004],
      requested_by: FIXTURE_IDS.users.E002,
    });
    expect((await shiftsOf(s, E.E004)).length).toBeGreaterThan(0);
    expect(await shiftsOf(s, E.E005)).toStrictEqual([]);
    expect((await generateAudits()).length).toBe(audits);
  });

  it('refuses data that is neither the nightly {} nor a request', async () => {
    await expect(run({ employee_ids: ['x'] })).rejects.toThrow();
  });
});
