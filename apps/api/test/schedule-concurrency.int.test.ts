import { setTimeout as sleep } from 'node:timers/promises';

import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { ScheduleLock } from '../src/modules/scheduling/patterns/schedule-lock.js';
import { activeShifts, generateUnit } from './helpers/schedule-shifts.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-schedule-patterns task 4.7 — design D6 · D10: a P2.PAT.02 and a generation unit (the nightly job's
// unit: `ScheduleLock`, then the generator) for Ko Aung at the same time both finish with one consistent
// set of shifts and no 23P01 (`schedule_shifts_no_overlap`), because `ScheduleLock` serialises every
// writer of one employee's schedule. Clock 05/Oct/2026 11:00 AM MMT; Ma Hnin saves.
const { B3 } = FIXTURE_IDS.branches;
const E = FIXTURE_IDS.employees;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const saveWith = (cookie: string, hours: [string, string]) =>
  s.http
    .put(`/api/v1/employees/${E.E004}/schedule-pattern`)
    .set('Cookie', cookie)
    .send({
      effective_from: '2026-10-12',
      days: [1, 2, 3, 4, 5].map((day_of_week) => ({
        day_of_week,
        segments: [{ branch_id: B3, start_time: hours[0], end_time: hours[1] }],
      })),
    });
const save = async (hours: [string, string]) => saveWith((await s.signIn('E002')).cookie, hours);

describe('add-schedule-patterns · scheduling · concurrency of the schedule writers', () => {
  beforeAll(async () => {
    s = await seededApp(mmt('2026-10-05T11:00:00'), { poolSize: 6 });
    await generateUnit(s, E.E004);
  }, 60_000);
  afterAll(() => s.close());

  /** Holds `ScheduleLock` of Ko Aung in an open transaction until `release()`. */
  async function holdLock(): Promise<{ release: () => void; done: Promise<void> }> {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let acquired = (): void => undefined;
    const holding = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const done = s.app.get(TransactionRunner).run(async (tx) => {
      await s.app.get(ScheduleLock).acquire(tx, E.E004);
      acquired();
      await held;
    });
    await holding;
    return { release, done };
  }

  const stateAfter = <T>(work: Promise<T>): Promise<'done' | 'waiting'> =>
    Promise.race([work.then(() => 'done' as const), sleep(400).then(() => 'waiting' as const)]);

  it('a generation unit waits for the schedule lock another writer holds, then runs', async () => {
    const { release, done } = await holdLock();
    const unit = generateUnit(s, E.E004);
    expect(await stateAfter(unit)).toBe('waiting');
    release();
    await done;
    expect(await unit).toStrictEqual({ changed_dates: [], warnings: [] });
  });

  it('a save waits for the schedule lock another writer holds, then answers 200 (design D6)', async () => {
    const cookie = (await s.signIn('E002')).cookie;
    const { release, done } = await holdLock();
    const request = saveWith(cookie, ['10:00', '19:00']).then((res) => res);
    // Without `lock.acquire` in the writer the save would not wait for the open transaction.
    expect(await stateAfter(request)).toBe('waiting');
    release();
    await done;
    expect((await request).status).toBe(200);
  });

  it('Scenario: a save and a generation unit for Ko Aung in parallel — both finish, one consistent shift set, no 23P01', async () => {
    const rounds: [string, string][] = [
      ['10:00', '19:00'],
      ['11:00', '19:00'],
      ['11:00', '20:00'],
      ['09:30', '17:30'],
      ['10:00', '19:00'],
    ];
    for (const hours of rounds) {
      const [saved, generated] = await Promise.allSettled([save(hours), generateUnit(s, E.E004)]);
      expect(saved.status).toBe('fulfilled');
      expect(generated.status).toBe('fulfilled');
      if (saved.status === 'fulfilled') expect(saved.value.status).toBe(200);

      const rows = await activeShifts(s, E.E004);
      // 05 … 10 Oct from the first set, 12 … 26 Oct from the saved one: Mon – Fri and the horizon day 26/Oct.
      expect(rows.filter((row) => row.date <= '2026-10-10')).toHaveLength(6);
      const late = rows.filter((row) => row.date >= '2026-10-12');
      expect(late).toHaveLength(11);
      expect(late.every((row) => row.hours === `${hours[0]}-${hours[1]}`)).toBe(true);
      const overlaps = await s.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM schedule_shifts a JOIN schedule_shifts b
          ON a.employee_id = b.employee_id AND a.id < b.id
         AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
        WHERE a.employee_id = ${E.E004}::uuid AND a.archived_at IS NULL AND b.archived_at IS NULL`;
      expect(Number(overlaps[0]?.n)).toBe(0);
    }
  });
});
