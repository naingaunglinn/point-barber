import { ErrorCode } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-payment-collector-picker task 3.3 — a collector change and a FINISH of the same sale from two
// connections (P4-RULE-10 lock order · API-IDEM-06): exactly one order wins and neither deadlocks
// (40P01). A real HTTP server with a pool of 25, as finish-http-concurrency.int.test.ts. Ko Aung at B3,
// Haircut 10,000; today is 05/Oct/2026.
const { employees } = FIXTURE_IDS;
const AUNG = 'E004';

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let cash: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'), { poolSize: 25 });
  prisma = s.app.get(PrismaService);
  api = walkinHttp(s);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
}, 60_000);
afterAll(() => s.close());

describe('a collector change racing a FINISH of the same sale', () => {
  it('ten rounds — FINISH always 200; the change is 200 (before FINISH) or 409 adjustment (after), never a deadlock', async () => {
    const outcomes = new Set<number>();
    for (let round = 0; round < 10; round += 1) {
      const visit = await api.start(AUNG);
      const paid = await api.pay(AUNG, visit.sale.id, { payment_method_id: cash, amount: 10_000 });
      const paymentId = paid.payments[0]?.id ?? '';
      await api.complete(AUNG, visit.id);
      const [finish, changed] = await Promise.all([
        api.post(AUNG, `/sales/${visit.sale.id}/finish`, { expected_total_amount: 10_000 }),
        api.patch(AUNG, `/payments/${paymentId}`, { collected_by_employee_id: employees.E005 }),
      ]);
      expect(finish.status).toBe(200);
      outcomes.add(changed.status);
      const stored = await prisma.payments.findUniqueOrThrow({ where: { id: paymentId } });
      if (changed.status === 200) {
        // The change came first: the receipt shows the sale finished with the new collector.
        expect(stored.collected_by_employee_id).toBe(employees.E005);
        expect(finish.body.payments[0].collected_by.id).toBe(employees.E005);
      } else {
        expect(changed.status).toBe(409);
        expect(changed.body).toMatchObject({
          code: ErrorCode.INVALID_TRANSITION,
          context: { correction_path: 'adjustment' },
        });
        expect(stored.collected_by_employee_id).toBe(employees.E004);
      }
    }
    expect([...outcomes].every((status) => status === 200 || status === 409)).toBe(true);
  }, 120_000);
});
