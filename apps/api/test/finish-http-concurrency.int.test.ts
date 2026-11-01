import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-walkin-visit-checkout task 8.10 (review of #26) — design D6 (a) and (b) as the staff app sends them:
// a real HTTP server and a pool of 25 connections, so the twenty FINISH transactions are in flight at
// once (pg's default pool of 10 would queue half of them before the counter step). Ko Aung at B3,
// Haircut 10,000; today is 05/Oct/2026.
const { branches } = FIXTURE_IDS;
const AUNG = 'E004';

let s: SeededApp;
let prisma: PrismaService;
let api: WalkinHttp;
let cash: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'), { poolSize: 25 });
  prisma = s.app.get(PrismaService);
  api = walkinHttp(s);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
}, 60_000);
afterAll(() => s.close());

const counter = async () =>
  (
    await prisma.receipt_counters.findFirst({
      where: { branch_id: branches.B3, kind: 1, receipt_year: 2026, receipt_month: 10 },
    })
  )?.last_seq ?? 0;

/** `n` visits of Ko Aung, all started first (a COMPLETED unpaid visit blocks START), then paid and completed. */
async function readySales(n: number): Promise<string[]> {
  const visits = [];
  for (let i = 0; i < n; i += 1) visits.push(await api.start(AUNG));
  for (const visit of visits) {
    await api.pay(AUNG, visit.sale.id, { payment_method_id: cash, amount: 10_000 });
    await api.complete(AUNG, visit.id);
  }
  return visits.map((visit) => visit.sale.id);
}

describe('Receipt numbers are gapless over HTTP (D-PAY-06 · API-IDEM-05 · design D6)', () => {
  it('(a) twenty B3 sales finished at once — B3-2026-OCT-00001 … 00020, last_seq 20', async () => {
    const twenty = await readySales(20);
    const answers = await Promise.all(
      twenty.map((saleId) =>
        api.post(AUNG, `/sales/${saleId}/finish`, { expected_total_amount: 10_000 }),
      ),
    );
    expect(answers.map((res) => res.status)).toStrictEqual(Array<number>(20).fill(200));
    expect(answers.map((res) => res.body.receipt_number as string).sort()).toStrictEqual(
      Array.from({ length: 20 }, (_, i) => `B3-2026-OCT-${String(i + 1).padStart(5, '0')}`),
    );
    expect(await counter()).toBe(20);
    // The pool grew past pg's default of 10: more than ten FINISH transactions were open at once
    // (the job queue's own connection is not counted).
    const [open] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pg_stat_activity
      WHERE datname = current_database() AND application_name NOT LIKE 'pgboss%'`;
    expect(Number(open?.n)).toBeGreaterThan(10);
  }, 120_000);

  it('(b) one sale finished twice at once — both 200, one number, last_seq 21', async () => {
    const [saleId] = await readySales(1);
    const both = await Promise.all(
      [1, 2].map(() =>
        api.post(AUNG, `/sales/${saleId}/finish`, { expected_total_amount: 10_000 }),
      ),
    );
    expect(both.map((res) => [res.status, res.body.receipt_number])).toStrictEqual([
      [200, 'B3-2026-OCT-00021'],
      [200, 'B3-2026-OCT-00021'],
    ]);
    expect(await counter()).toBe(21);
  });
});
