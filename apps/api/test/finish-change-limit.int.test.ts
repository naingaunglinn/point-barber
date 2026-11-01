import { randomUUID } from 'node:crypto';

import { AuditSource, ErrorCode, RefundKind, SaleStatus, type SaleDto } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-walkin-visit-checkout task 15.4 — payments spec "The change of an over-transfer is at most 10,000 Ks"
// over HTTP (owner 01/Nov/2026 sheet WR1 · API Part 4 v1.4 P4-RULE-10 #12 · P4.SAL.10 · P4.PAY.02 ·
// D-PAY-05): FINISH answers 422 `change_too_large { change_due_amount, max_change_amount }` for a change
// above 10,000 Ks — also for a `sale.finish_override` holder — after the two `amount_mismatch` checks and
// before the receipt number, so a refused FINISH writes nothing; payment add is unchanged. 05/Oct/2026 at
// 11:15 AM MMT, B3, on a fresh database; Ko Min's Haircut 8,000, Ko Aung's Haircut 10,000. The tests run in
// order.
const { branches, services, users } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';
const HNIN = 'E002';
const FINISHED_AT = '2026-10-05T11:15:00+06:30';

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let cash: string;
let kbzpay: string;

beforeAll(async () => {
  s = await seededApp(new Date(FINISHED_AT));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
});
afterAll(() => s.close());

const kbz = (amount: number, external_reference: string) => ({
  payment_method_id: kbzpay,
  amount,
  external_reference,
});
const counter = async (kind: number) =>
  (
    await prisma.receipt_counters.findFirst({
      where: { branch_id: branches.B3, kind, receipt_year: 2026, receipt_month: 10 },
    })
  )?.last_seq ?? 0;
const jobsFor = async (entityId: string) =>
  (
    await prisma.$queryRaw<{ data: { entity_type: string } }[]>`
      SELECT data FROM pgboss.job
      WHERE name = 'receipt.render' AND data->>'entity_id' = ${entityId}`
  ).map((row) => row.data.entity_type);
const finishAudits = (saleId: string) =>
  prisma.audit_events.count({
    where: { entity_id: saleId, action: 'sale.finish', source: AuditSource.APP },
  });

/** A completed walk-in of `who` with the given services, nothing paid yet. */
async function completed(who: typeof AUNG | typeof MIN, items: readonly string[]) {
  const visit = await api.start(who, items);
  await api.complete(who, visit.id);
  return visit.sale.id;
}

/** The staff member's correction: void the wrong payment with a reason, then record the right amount. */
async function correct(
  who: typeof AUNG | typeof MIN,
  saleId: string,
  paymentId: string,
  right: Record<string, unknown>,
): Promise<SaleDto> {
  const voided = await api.post(who, `/payments/${paymentId}/void`, {
    reason: 'Wrong amount typed',
  });
  expect(voided.status).toBe(200);
  return api.pay(who, saleId, right);
}

/** The state a refused FINISH must leave untouched. */
async function untouched(saleId: string) {
  const sale = await prisma.sales.findUniqueOrThrow({ where: { id: saleId } });
  return {
    status: sale.status,
    receipt_number: sale.receipt_number,
    refunds: await prisma.refunds.count({ where: { sale_id: saleId } }),
    sale_counter: await counter(1),
    refund_counter: await counter(2),
    jobs: await jobsFor(saleId),
    audits: await finishAudits(saleId),
  };
}

describe('FINISH refuses a change above 10,000 Ks (P4-RULE-10 #12 · P4.SAL.10)', () => {
  let saleId = '';
  let wrongPayment = '';

  it('Scenario: A change above the limit is refused at FINISH — KBZPay 20,000 on 8,000', async () => {
    saleId = await completed(MIN, [services.HAIRCUT]);
    // Payment add is unchanged (P4.PAY.02): 201 with change_due_amount = 12,000 (20,000 − 8,000).
    const paid = await api.post(
      MIN,
      `/sales/${saleId}/payments`,
      kbz(20_000, 'KBZ0001234568'),
      randomUUID(),
    );
    expect(paid.status).toBe(201);
    expect([
      paid.body.paid_amount,
      paid.body.remaining_amount,
      paid.body.change_due_amount,
    ]).toEqual([20_000, 0, 12_000]);
    wrongPayment = (paid.body as SaleDto).payments[0]?.id ?? '';

    const res = await api.post(MIN, `/sales/${saleId}/finish`, { expected_total_amount: 8_000 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.CHANGE_TOO_LARGE);
    expect(res.body.context).toStrictEqual({
      change_due_amount: 12_000,
      max_change_amount: 10_000,
    });
    // Nothing written: the sale stays 1 OPEN without a number; no refund row, no number taken from either
    // series of (B3, 2026, 10), no receipt.render job, no sale.finish audit row.
    expect(await untouched(saleId)).toStrictEqual({
      status: SaleStatus.OPEN,
      receipt_number: null,
      refunds: 0,
      sale_counter: 0,
      refund_counter: 0,
      jobs: [],
      audits: 0,
    });
  });

  it('Scenario: One kyat above the limit — KBZPay 18,001: change 10,001, 422 change_too_large', async () => {
    const paid = await correct(MIN, saleId, wrongPayment, kbz(18_001, 'KBZ0001234569'));
    expect(paid.change_due_amount).toBe(10_001); // 18,001 − 8,000
    wrongPayment = paid.payments.find((p) => p.voided_at === null)?.id ?? '';
    const res = await api.post(MIN, `/sales/${saleId}/finish`, { expected_total_amount: 8_000 });
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      422,
      ErrorCode.CHANGE_TOO_LARGE,
      { change_due_amount: 10_001, max_change_amount: 10_000 },
    ]);
    expect((await untouched(saleId)).receipt_number).toBeNull();
  });

  it('Scenario: A change of exactly 10,000 Ks — KBZPay 18,000: 200, one cash return of 10,000, B3-RF-2026-OCT-00001', async () => {
    const paid = await correct(MIN, saleId, wrongPayment, kbz(18_000, 'KBZ0001234570'));
    expect(paid.change_due_amount).toBe(10_000); // 18,000 − 8,000
    const sale = await api.finish(MIN, saleId, { expected_total_amount: 8_000 });
    // The two refusals took no number: this is the first sale and the first refund of October at B3.
    expect(sale).toMatchObject({
      status: SaleStatus.FINISHED,
      total_amount: 8_000,
      receipt_number: 'B3-2026-OCT-00001',
      refunds: [
        {
          kind: RefundKind.OVERPAYMENT_RETURN,
          amount: 10_000,
          refund_receipt_number: 'B3-RF-2026-OCT-00001',
          refunded_at: FINISHED_AT,
          automatic_change: true,
        },
      ],
    });
    const row = await prisma.refunds.findFirstOrThrow({ where: { sale_id: saleId } });
    expect([row.payment_method_id, row.refunded_by_user_id]).toStrictEqual([cash, users.E005]);
    expect(await finishAudits(saleId)).toBe(1);
  });
});

describe('No override path and the order of the checks (P4-RULE-10 #12)', () => {
  it('Scenario: The override holder is refused too — Ma Hnin, KBZPay 25,000 on 10,000: change 15,000', async () => {
    const saleId = await completed(AUNG, [services.HAIRCUT]);
    const paid = await api.pay(AUNG, saleId, kbz(25_000, 'KBZ0001234571'));
    expect(paid.change_due_amount).toBe(15_000); // 25,000 − 10,000
    const res = await api.post(HNIN, `/sales/${saleId}/finish`, {
      expected_total_amount: 10_000,
      override_reason: 'Barber left, customer paid',
    });
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      422,
      ErrorCode.CHANGE_TOO_LARGE,
      { change_due_amount: 15_000, max_change_amount: 10_000 },
    ]);
    expect(await untouched(saleId)).toMatchObject({
      status: SaleStatus.OPEN,
      receipt_number: null,
      refunds: 0,
      audits: 0,
    });
    // Corrected (Ko Aung's sale may not stay COMPLETED and unpaid for the next START): KBZPay 10,000.
    await correct(AUNG, saleId, paid.payments[0]?.id ?? '', kbz(10_000, 'KBZ0001234572'));
    const finished = await api.finish(HNIN, saleId, {
      expected_total_amount: 10_000,
      override_reason: 'Barber left, customer paid',
    });
    expect([finished.status, finished.refunds]).toStrictEqual([SaleStatus.FINISHED, []]);
  });

  it('Scenario: A cash excess above the limit still answers amount_mismatch — Cash 15,000 + KBZPay 1,000 on 5,000', async () => {
    const saleId = await completed(AUNG, [services.HAIRCUT, services.SHAVE, services.HAIR_WASH]);
    await api.pay(AUNG, saleId, { payment_method_id: cash, amount: 15_000 });
    const paid = await api.pay(AUNG, saleId, kbz(1_000, 'KBZ0001234573'));
    const haircut = paid.items.find((item) => item.service_id === services.HAIRCUT);
    const removed = await api.post(AUNG, `/sales/${saleId}/items/${haircut?.id}/remove`, {
      reason: 'Customer changed his mind',
    });
    // total = 5,000 (3,000 + 2,000); paid = 16,000 (15,000 + 1,000); change = 11,000 (16,000 − 5,000)
    expect([
      removed.body.total_amount,
      removed.body.paid_amount,
      removed.body.change_due_amount,
    ]).toStrictEqual([5_000, 16_000, 11_000]);
    const res = await api.post(AUNG, `/sales/${saleId}/finish`, { expected_total_amount: 5_000 });
    // The excess 11,000 is larger than the non-cash payments (1,000): amount_mismatch is checked first.
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      422,
      ErrorCode.AMOUNT_MISMATCH,
      { remaining_amount: 0 },
    ]);
    expect((await untouched(saleId)).receipt_number).toBeNull();
  });
});
