import { setTimeout as sleep } from 'node:timers/promises';

import { SaleStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sqlStateOf } from '../src/common/database/errors.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { Visits } from '../src/modules/delivery/index.js';
import { Payments, type VisitsPort, VisitsRegistry } from '../src/modules/sales/index.js';
import { checkout } from './helpers/checkout.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { KO_AUNG, KO_MIN, as } from './helpers/walkin.js';

// add-walkin-visit-checkout tasks 8.4, 8.10 (c, d), 8.15 — the concurrency tests of design D6 and the
// deadlock soak of the risk table: the counter row held by another connection (one retry after the
// 5 s lock timeout; a second timeout is a 500 and loses no number), a fault after the counter step
// gives the number back, the RF series without a gap under concurrency, and 50 mixed writes on 10
// sales without SQLSTATE 40P01.
const { branches, services } = FIXTURE_IDS;

let s: SeededApp;
let prisma: PrismaService;
let walkin: ReturnType<typeof checkout>;
let cash: string;
let kbzpay: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'));
  prisma = s.app.get(PrismaService);
  walkin = checkout(s.app);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
  // The first sale creates the October counter row of B3.
  const first = await ready(KO_AUNG, 10000);
  await walkin.finish(KO_AUNG, first.saleId, { expected_total_amount: 10000 });
}, 60_000);
afterAll(() => s.close());

/** Started, paid in cash and completed; several may be open at once (all started first). */
async function ready(who: typeof KO_AUNG, total: number) {
  const ids = await walkin.start(who, [services.HAIRCUT]);
  await walkin.pay(who, ids.saleId, { payment_method_id: cash, amount: total });
  await walkin.complete(who, ids.visitId);
  return ids;
}

const counter = async (kind: number) =>
  (
    await prisma.receipt_counters.findFirstOrThrow({
      where: { branch_id: branches.B3, kind, receipt_year: 2026, receipt_month: 10 },
    })
  ).last_seq;

/** Holds the B3 sale counter row FOR UPDATE in another transaction for `ms`. */
function holdCounter(ms: number): Promise<void> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT last_seq FROM receipt_counters
        WHERE branch_id = ${branches.B3}::uuid AND kind = 1 AND receipt_year = 2026 AND receipt_month = 10
        FOR UPDATE`;
      await sleep(ms);
    },
    { timeout: ms + 10_000 },
  );
}

describe('The counter step under a lock timeout (design D6 · system design §3.5)', () => {
  it('the counter row held for 6 s: one timeout, one retry, then the next number', async () => {
    const { saleId } = await ready(KO_AUNG, 10000);
    const before = await counter(1);
    const holder = holdCounter(6_000);
    await sleep(200);
    const started = Date.now();
    const sale = await walkin.finish(KO_AUNG, saleId, { expected_total_amount: 10000 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(5_000);
    expect(sale.receipt_number).toBe(`B3-2026-OCT-${String(before + 1).padStart(5, '0')}`);
    await holder;
  }, 40_000);

  it('the counter row held for 12 s: two timeouts → an error (500), the number is not lost', async () => {
    const { saleId } = await ready(KO_AUNG, 10000);
    const before = await counter(1);
    const holder = holdCounter(12_000);
    await sleep(200);
    const failed = await walkin
      .finish(KO_AUNG, saleId, { expected_total_amount: 10000 })
      .catch((error: unknown) => error);
    // Not a problem answer: the filter turns it into 500 internal_error.
    expect(failed).not.toBeInstanceOf(ProblemException);
    expect(sqlStateOf(failed)).toBe('55P03');
    await holder;
    expect(await counter(1)).toBe(before);
    expect((await prisma.sales.findUniqueOrThrow({ where: { id: saleId } })).status).toBe(
      SaleStatus.OPEN,
    );
    const sale = await walkin.finish(KO_AUNG, saleId, { expected_total_amount: 10000 });
    expect(sale.receipt_number).toBe(`B3-2026-OCT-${String(before + 1).padStart(5, '0')}`);
  }, 60_000);
});

describe('No gap after a failure (D-PAY-06)', () => {
  it('Scenario: A rolled-back FINISH takes no number — a fault after the counter step', async () => {
    const registry = s.app.get(VisitsRegistry);
    const real = registry.visits;
    const { saleId } = await ready(KO_AUNG, 10000);
    const before = await counter(1);
    let fail = true;
    const faulty: VisitsPort = {
      read: (db, id) => real.read(db, id),
      lockForUpdate: (tx, id) => real.lockForUpdate(tx, id),
      markFinished: async (tx, id, at) => {
        if (fail) {
          fail = false;
          throw new Error('fault injected after the counter step');
        }
        return real.markFinished(tx, id, at);
      },
    };
    registry.use(faulty);
    try {
      await expect(
        walkin.finish(KO_AUNG, saleId, { expected_total_amount: 10000 }),
      ).rejects.toThrow(/fault injected/);
      expect(await counter(1)).toBe(before);
      const sale = await walkin.finish(KO_AUNG, saleId, { expected_total_amount: 10000 });
      expect(sale.receipt_number).toBe(`B3-2026-OCT-${String(before + 1).padStart(5, '0')}`);
    } finally {
      registry.use(real);
    }
  });

  it('the RF series has no gap under concurrency — 5 over-transfers finished at once', async () => {
    const five: string[] = [];
    // All five started first (a COMPLETED unpaid visit blocks START), then paid and completed.
    const started = [];
    for (let i = 0; i < 5; i += 1) started.push(await walkin.start(KO_MIN, [services.HAIRCUT]));
    for (const [i, { saleId, visitId }] of started.entries()) {
      await walkin.pay(KO_MIN, saleId, {
        payment_method_id: kbzpay,
        amount: 10000,
        external_reference: `KBZ00099900${String(i).padStart(2, '0')}`,
      });
      await walkin.complete(KO_MIN, visitId);
      five.push(saleId);
    }
    const sales = await Promise.all(
      five.map((saleId) => walkin.finish(KO_MIN, saleId, { expected_total_amount: 8000 })),
    );
    expect(sales.map((sale) => sale.refunds[0]?.refund_receipt_number).sort()).toStrictEqual(
      Array.from({ length: 5 }, (_, i) => `B3-RF-2026-OCT-${String(i + 1).padStart(5, '0')}`),
    );
    expect(await counter(2)).toBe(5);
  });
});

describe('Deadlock soak (API-IDEM-06 · CG-IDEM-05)', () => {
  it('50 mixed payment / void / FINISH / INCOMPLETE calls on 10 sales — no 40P01', async () => {
    const visits = s.app.get(Visits);
    const payments = s.app.get(Payments);
    const ten = [];
    for (let i = 0; i < 10; i += 1) ten.push(await walkin.start(KO_AUNG, [services.HAIRCUT]));
    for (const { visitId } of ten) await walkin.complete(KO_AUNG, visitId);
    const calls: (() => Promise<unknown>)[] = [];
    for (const [i, { saleId, visitId }] of ten.entries()) {
      calls.push(() => walkin.pay(KO_AUNG, saleId, { payment_method_id: cash, amount: 4000 }));
      calls.push(() => walkin.pay(KO_AUNG, saleId, { payment_method_id: cash, amount: 6000 }));
      calls.push(() => walkin.finish(KO_AUNG, saleId, { expected_total_amount: 10000 }));
      calls.push(async () => {
        const sale = await prisma.payments.findFirst({ where: { sale_id: saleId } });
        if (sale !== null)
          await as(KO_AUNG, () => payments.void(KO_AUNG.viewer, sale.id, 'Soak test'));
      });
      calls.push(() =>
        i % 3 === 0
          ? as(KO_AUNG, () => visits.incomplete(KO_AUNG.viewer, visitId, 'Soak test'))
          : walkin.finish(KO_AUNG, saleId, { expected_total_amount: 10000 }),
      );
    }
    expect(calls).toHaveLength(50);
    const results = await Promise.allSettled(calls.map((call) => call()));
    const unexpected = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as unknown)
      .filter((reason) => !(reason instanceof ProblemException));
    expect(unexpected.map((reason) => sqlStateOf(reason) ?? String(reason))).toStrictEqual([]);
    // Every finished sale holds a distinct number.
    const numbers = (
      await prisma.sales.findMany({
        where: { id: { in: ten.map((sale) => sale.saleId) }, status: SaleStatus.FINISHED },
        select: { receipt_number: true },
      })
    ).map((row) => row.receipt_number);
    expect(new Set(numbers).size).toBe(numbers.length);
  }, 60_000);
});
