import { randomUUID } from 'node:crypto';

import { DailyClosingStatus, ErrorCode } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { checkout } from './helpers/checkout.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { MovableClock } from './helpers/test-app.js';
import { KO_AUNG, KO_MIN } from './helpers/walkin.js';

// add-walkin-visit-checkout task 8.2 — sales-checkout spec "Business dates and the receipt month follow
// Myanmar time" (D-PLT-15 · D-PAY-06 · CG-TIME-03) with the injected clock: the last minute of October,
// midnight starting November, and a visit that crosses midnight.
const { branches, services, users } = FIXTURE_IDS;
const clock = new MovableClock(new Date('2026-10-05T23:58:00+06:30'));

let s: SeededApp;
let prisma: PrismaService;
let walkin: ReturnType<typeof checkout>;
let cash: string;

beforeAll(async () => {
  s = await seededApp(clock);
  prisma = s.app.get(PrismaService);
  walkin = checkout(s.app);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
}, 60_000);
afterAll(() => s.close());

describe('Business dates follow Myanmar time (D-PLT-15)', () => {
  it('Scenario: A visit that crosses midnight — visit 05/Oct, sale 06/Oct; FINISH checks the day lock of 06/Oct', async () => {
    clock.set(new Date('2026-10-05T23:59:00+06:30'));
    const { saleId, visitId } = await walkin.start(KO_AUNG, [services.HAIRCUT]);
    await walkin.pay(KO_AUNG, saleId, { payment_method_id: cash, amount: 10000 });
    await walkin.complete(KO_AUNG, visitId);
    clock.set(new Date('2026-10-06T00:00:00+06:30'));
    const closing = randomUUID();
    await prisma.daily_closings.create({
      data: {
        id: closing,
        branch_id: branches.B3,
        business_date: new Date('2026-10-06T00:00:00Z'),
        status: DailyClosingStatus.CLOSED,
        counted_cash_amount: 0n,
        closed_at: new Date('2026-10-06T00:00:00+06:30'),
        closed_by_user_id: users.E002,
      },
    });
    const closed = await walkin
      .finish(KO_AUNG, saleId, { expected_total_amount: 10000 })
      .catch((error: unknown) => error);
    expect((closed as ProblemException).code).toBe(ErrorCode.DAY_CLOSED);
    expect((closed as ProblemException).options.context?.business_date).toBe('2026-10-06');
    // Reopened (as a reopen leaves it), the same FINISH passes.
    await prisma.daily_closings.update({
      where: { id: closing },
      data: { status: DailyClosingStatus.OPEN, closed_at: null, closed_by_user_id: null },
    });
    const sale = await walkin.finish(KO_AUNG, saleId, { expected_total_amount: 10000 });
    expect([sale.business_date, sale.finished_at, sale.receipt_number]).toStrictEqual([
      '2026-10-06',
      '2026-10-06T00:00:00+06:30',
      'B3-2026-OCT-00001',
    ]);
    const visit = await prisma.visits.findUniqueOrThrow({ where: { id: visitId } });
    expect(visit.business_date.toISOString().slice(0, 10)).toBe('2026-10-05');
  });

  it('Scenarios: One minute before midnight on 31/Oct → B3-2026-OCT-00125; midnight → B3-2026-NOV-00001', async () => {
    clock.set(new Date('2026-10-31T23:50:00+06:30'));
    const october = await walkin.start(KO_MIN, [services.HAIRCUT]);
    const november = await walkin.start(KO_MIN, [services.HAIRCUT]);
    for (const { saleId, visitId } of [october, november]) {
      await walkin.pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 });
      await walkin.complete(KO_MIN, visitId);
    }
    // The October counter of B3 stands at 124 (whatever the test before left).
    await prisma.receipt_counters.upsert({
      where: {
        branch_id_kind_receipt_year_receipt_month: {
          branch_id: branches.B3,
          kind: 1,
          receipt_year: 2026,
          receipt_month: 10,
        },
      },
      update: { last_seq: 124 },
      create: {
        branch_id: branches.B3,
        kind: 1,
        receipt_year: 2026,
        receipt_month: 10,
        last_seq: 124,
      },
    });
    clock.set(new Date('2026-10-31T23:59:00+06:30'));
    const last = await walkin.finish(KO_MIN, october.saleId, { expected_total_amount: 8000 });
    expect([last.business_date, last.receipt_number]).toStrictEqual([
      '2026-10-31',
      'B3-2026-OCT-00125',
    ]);
    // 2026-11-01T00:00:00+06:30 is 2026-10-31T17:30:00Z.
    clock.set(new Date('2026-10-31T17:30:00Z'));
    const first = await walkin.finish(KO_MIN, november.saleId, { expected_total_amount: 8000 });
    expect([first.business_date, first.receipt_number]).toStrictEqual([
      '2026-11-01',
      'B3-2026-NOV-00001',
    ]);
  });
});
