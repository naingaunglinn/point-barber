import { randomUUID } from 'node:crypto';

import { ErrorCode, PayrollRunStatus, SaleStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { checkout } from './helpers/checkout.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { FixedClock } from './helpers/test-app.js';
import { type FixturePerson, KO_AUNG, KO_MIN } from './helpers/walkin.js';

// add-walkin-visit-checkout task 8.13 — sales-checkout spec "The day lock and the payroll lock gate
// every money write": a FINISH of a sale with SERVICE lines inside a FINALIZED / PUBLISHED / PAID
// payroll period is 423 payroll_finalized (P5-RULE-10 · owner B9); the day after passes; a CALCULATED
// run does not lock. Its own database: the October run would refuse every other test's FINISH.
const { services, users, employees } = FIXTURE_IDS;
const clock = new FixedClock(new Date('2026-10-05T10:00:00+06:30'));

let s: SeededApp;
let prisma: PrismaService;
let walkin: ReturnType<typeof checkout>;
let cash: string;
let runId: string;

beforeAll(async () => {
  s = await seededApp(clock);
  prisma = s.app.get(PrismaService);
  walkin = checkout(s.app);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  runId = randomUUID();
  const at = new Date('2026-11-01T09:00:00+06:30');
  await prisma.payroll_runs.create({
    data: {
      id: runId,
      company_id: (await prisma.companies.findFirstOrThrow()).id,
      period_start: new Date('2026-10-01T00:00:00Z'),
      period_end: new Date('2026-10-31T00:00:00Z'),
      status: PayrollRunStatus.FINALIZED,
      calculated_at: at,
      calculated_by_user_id: users.E001,
      rules_snapshot: {},
      finalized_at: at,
      finalized_by_user_id: users.E001,
      created_by_user_id: users.E001,
    },
  });
}, 60_000);
afterAll(() => s.close());

/** A walk-in of `who` started, paid and completed at `instant` (each visit at its own clock). */
async function readyAt(who: FixturePerson, instant: string, total: number) {
  clock.set(new Date(instant));
  const { saleId, visitId } = await walkin.start(who, [services.HAIRCUT]);
  await walkin.pay(who, saleId, { payment_method_id: cash, amount: total });
  await walkin.complete(who, visitId);
  return { saleId, visitId };
}

describe('FINISH and a finalized payroll period (P5-RULE-10)', () => {
  let fifth: { saleId: string; visitId: string };

  it('Scenarios: 05/Oct and 31/Oct → 423 payroll_finalized; 01/Nov → 200 with B3-2026-NOV-00001', async () => {
    // Ko Aung's visit of 05/Oct and Ko Min's of 31/Oct, each completed at its own clock.
    fifth = await readyAt(KO_AUNG, '2026-10-05T10:00:00+06:30', 10000);
    const last = await readyAt(KO_MIN, '2026-10-31T19:30:00+06:30', 8000);

    clock.set(new Date('2026-10-05T10:42:00+06:30'));
    const october5 = (await walkin
      .finish(KO_AUNG, fifth.saleId, { expected_total_amount: 10000 })
      .catch((error: unknown) => error)) as ProblemException;
    expect([october5.code, october5.status, october5.options.context]).toStrictEqual([
      ErrorCode.PAYROLL_FINALIZED,
      423,
      {
        employee_id: employees.E004,
        run_id: runId,
        period: { start: '2026-10-01', end: '2026-10-31' },
        status: PayrollRunStatus.FINALIZED,
      },
    ]);

    clock.set(new Date('2026-10-31T20:00:00+06:30'));
    const october31 = (await walkin
      .finish(KO_MIN, last.saleId, { expected_total_amount: 8000 })
      .catch((error: unknown) => error)) as ProblemException;
    expect(october31.code).toBe(ErrorCode.PAYROLL_FINALIZED);
    expect((await prisma.sales.findUniqueOrThrow({ where: { id: last.saleId } })).status).toBe(
      SaleStatus.OPEN,
    );

    clock.set(new Date('2026-11-01T09:30:00+06:30'));
    const november = await walkin.finish(KO_MIN, last.saleId, { expected_total_amount: 8000 });
    expect(november.receipt_number).toBe('B3-2026-NOV-00001');
  });

  it('Scenario: A calculated run does not lock — 200 on 05/Oct', async () => {
    await prisma.payroll_runs.update({
      where: { id: runId },
      data: {
        status: PayrollRunStatus.CALCULATED,
        finalized_at: null,
        finalized_by_user_id: null,
      },
    });
    // The 05/Oct sale refused above, finished again on the same day.
    clock.set(new Date('2026-10-05T10:45:00+06:30'));
    const finished = await walkin.finish(KO_AUNG, fifth.saleId, { expected_total_amount: 10000 });
    expect(finished.receipt_number).toBe('B3-2026-OCT-00001');
  });
});
