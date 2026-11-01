import { randomUUID } from 'node:crypto';

import { AuditSource, DailyClosingStatus, ErrorCode, SaleStatus, saleSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-walkin-visit-checkout tasks 7.1 – 7.3, 7.6, 7.7, 7.9 — payments spec through GET /v1/payment-methods,
// POST /v1/sales/{id}/payments and POST /v1/payments/{id}/void (P4.PMT.01 · P4.PAY.02 / .03 · P4-RULE-09 ·
// API-IDEM-01 / 02 · API-AUD-01). The money rules themselves are proven on the services in
// payments.int.test.ts; here the wire: statuses, headers, validation, the replay and the audit rows.
// 05/Oct/2026 10:41 AM at B3; Ko Min's Haircut 8,000 and Shave 3,000, Ko Aung's Haircut 10,000.
const { branches, services, users } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let cash: string;
let kbzpay: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:41:00+06:30'));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
});
afterAll(() => s.close());

const walkIn = async (who: 'E004' | 'E005', items: string[]) => (await api.start(who, items)).sale;
const payments = (saleId: string) => prisma.payments.count({ where: { sale_id: saleId } });
const appAudits = (action: string, saleId: string) =>
  prisma.audit_events.count({ where: { action, entity_id: saleId, source: AuditSource.APP } });

describe('GET /v1/payment-methods (P4.PMT.01)', () => {
  it('Scenario: The two system methods at checkout — CASH then KBZPAY, for a barber', async () => {
    const res = await api.get(AUNG, '/payment-methods');
    expect(res.status).toBe(200);
    expect((res.body.items as { code: string }[]).map((m) => m.code)).toStrictEqual([
      'CASH',
      'KBZPAY',
    ]);
  });
});

describe('POST /v1/sales/{id}/payments (P4.PAY.02)', () => {
  it('Scenario: One tap, full cash — 201 Sale, received_at 10:41, remaining 0', async () => {
    const sale = await walkIn(AUNG, [services.HAIRCUT]);
    const res = await api.post(
      AUNG,
      `/sales/${sale.id}/payments`,
      { payment_method_id: cash, amount: 10_000 },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    const after = saleSchema.parse(res.body);
    expect(after).toMatchObject({ paid_amount: 10_000, remaining_amount: 0 });
    expect(after.payments[0]).toMatchObject({
      amount: 10_000,
      received_at: '2026-10-05T10:41:00+06:30',
      recorded_by: { user_id: users.E004 },
    });
  });

  it('Scenario: Split Cash + KBZPay — remaining 6,000 (11,000 − 5,000), then paid 11,000, change 0', async () => {
    const sale = await walkIn(MIN, [services.HAIRCUT, services.SHAVE]);
    const first = await api.pay(MIN, sale.id, { payment_method_id: cash, amount: 5_000 });
    expect(first.remaining_amount).toBe(6_000);
    const second = await api.pay(MIN, sale.id, {
      payment_method_id: kbzpay,
      amount: 6_000,
      external_reference: 'KBZ0001234567',
    });
    expect(second).toMatchObject({
      paid_amount: 11_000,
      remaining_amount: 0,
      change_due_amount: 0,
    });
  });

  it('Scenario: Amount zero — 400 validation naming amount, no row', async () => {
    const sale = await walkIn(MIN, [services.HAIRCUT]);
    const res = await api.post(
      MIN,
      `/sales/${sale.id}/payments`,
      { payment_method_id: cash, amount: 0 },
      randomUUID(),
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: ErrorCode.VALIDATION, errors: [{ field: 'amount' }] });
    expect(await payments(sale.id)).toBe(0);
  });

  it('Scenarios: Exactly the remaining amount — 201; one kyat more — 422 amount_exceeds_remaining', async () => {
    const sale = await walkIn(MIN, [services.HAIRCUT]);
    const over = await api.post(
      MIN,
      `/sales/${sale.id}/payments`,
      { payment_method_id: cash, amount: 8_001 },
      randomUUID(),
    );
    expect(over.status).toBe(422);
    expect(over.body.code).toBe(ErrorCode.AMOUNT_EXCEEDS_REMAINING);
    expect(await payments(sale.id)).toBe(0);
    const exact = await api.pay(MIN, sale.id, { payment_method_id: cash, amount: 8_000 });
    expect(exact.remaining_amount).toBe(0);
  });

  it('Scenarios: Reference missing — 422 reference_required; Wrong format — 422 reference_format; spaces trimmed', async () => {
    const sale = await walkIn(MIN, [services.HAIRCUT]);
    const send = (body: object) =>
      api.post(
        MIN,
        `/sales/${sale.id}/payments`,
        { payment_method_id: kbzpay, amount: 6_000, ...body },
        randomUUID(),
      );
    const missing = await send({});
    expect([missing.status, missing.body.code]).toStrictEqual([422, ErrorCode.REFERENCE_REQUIRED]);
    const wrong = await send({ external_reference: 'KBZ123' });
    expect([wrong.status, wrong.body.code]).toStrictEqual([422, ErrorCode.REFERENCE_FORMAT]);
    expect(await payments(sale.id)).toBe(0);
    const trimmed = await send({ external_reference: ' KBZ0001234568 ' });
    expect(trimmed.status).toBe(201);
    expect(trimmed.body.payments[0].external_reference).toBe('KBZ0001234568');
  });
});

describe('payment add is idempotent on its Idempotency-Key (API-IDEM-01 / 02)', () => {
  it('Scenario: Key missing — 400 idempotency_key_required', async () => {
    const sale = await walkIn(MIN, [services.HAIRCUT]);
    const res = await api.post(MIN, `/sales/${sale.id}/payments`, {
      payment_method_id: cash,
      amount: 8_000,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.IDEMPOTENCY_KEY_REQUIRED);
  });

  it('Scenarios: Double tap on Cash, lost reply — 200 Idempotent-Replayed, one payment, one audit row', async () => {
    const sale = await walkIn(AUNG, [services.HAIRCUT]);
    const key = randomUUID();
    const body = { payment_method_id: cash, amount: 10_000 };
    const first = await api.post(AUNG, `/sales/${sale.id}/payments`, body, key);
    expect(first.status).toBe(201);
    const again = await api.post(AUNG, `/sales/${sale.id}/payments`, body, key);
    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.paid_amount).toBe(10_000);
    expect(await payments(sale.id)).toBe(1);
    expect(await appAudits('payment.add', sale.id)).toBe(1);
  });

  it('Scenario: Second request while the first is still running — 409, the sale ends with one payment', async () => {
    const sale = await walkIn(MIN, [services.HAIRCUT]);
    const key = randomUUID();
    const body = { payment_method_id: cash, amount: 8_000 };
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`idem:${key}`}, 0))`;
      const second = await api.post(MIN, `/sales/${sale.id}/payments`, body, key);
      expect(second.status).toBe(409);
      expect(second.body.code).toBe(ErrorCode.IDEMPOTENCY_IN_PROGRESS);
    });
    expect((await api.post(MIN, `/sales/${sale.id}/payments`, body, key)).status).toBe(201);
    expect(await payments(sale.id)).toBe(1);
  });

  it('Scenario: Same key, different amount — 422 idempotency_mismatch, nothing changes', async () => {
    const sale = await walkIn(MIN, [services.HAIRCUT, services.SHAVE]);
    const key = randomUUID();
    const body = { payment_method_id: kbzpay, amount: 6_000, external_reference: 'KBZ0001234569' };
    expect((await api.post(MIN, `/sales/${sale.id}/payments`, body, key)).status).toBe(201);
    const other = await api.post(
      MIN,
      `/sales/${sale.id}/payments`,
      { ...body, amount: 5_000 },
      key,
    );
    expect(other.status).toBe(422);
    expect(other.body.code).toBe(ErrorCode.IDEMPOTENCY_MISMATCH);
    expect(await payments(sale.id)).toBe(1);
  });
});

describe('POST /v1/payments/{id}/void (P4.PAY.03)', () => {
  it('Scenario: Wrong method recorded — 200, row kept, paid 0, remaining 8,000; a repeat writes no audit row', async () => {
    const sale = await walkIn(MIN, [services.HAIRCUT]);
    const paid = await api.pay(MIN, sale.id, { payment_method_id: cash, amount: 8_000 });
    const paymentId = paid.payments[0]?.id;
    for (let i = 0; i < 2; i += 1) {
      const res = await api.post(MIN, `/payments/${paymentId}/void`, {
        reason: 'Customer pays by KBZPay instead',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ paid_amount: 0, remaining_amount: 8_000 });
      expect(res.body.payments[0]).toMatchObject({
        voided_by: { user_id: users.E005 },
        void_reason: 'Customer pays by KBZPay instead',
      });
    }
    expect(await payments(sale.id)).toBe(1);
    expect(await appAudits('payment.void', sale.id)).toBe(1);
  });

  it('Scenarios: Void without a reason — 400 reason_required; Reason length limit — 1,000 → 200, 1,001 → 400 validation', async () => {
    const sale = await walkIn(MIN, [services.HAIRCUT, services.SHAVE]);
    const first = await api.pay(MIN, sale.id, { payment_method_id: cash, amount: 5_000 });
    const second = await api.pay(MIN, sale.id, { payment_method_id: cash, amount: 6_000 });
    const [a] = first.payments;
    const b = second.payments.find((p) => p.id !== a?.id);
    const blank = await api.post(MIN, `/payments/${a?.id}/void`, { reason: '' });
    expect([blank.status, blank.body.code]).toStrictEqual([400, ErrorCode.REASON_REQUIRED]);
    const tooLong = await api.post(MIN, `/payments/${b?.id}/void`, { reason: 'x'.repeat(1001) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body).toMatchObject({
      code: ErrorCode.VALIDATION,
      errors: [{ field: 'reason' }],
    });
    expect((await api.get(MIN, `/sales/${sale.id}`)).body.paid_amount).toBe(11_000);
    const atLimit = await api.post(MIN, `/payments/${a?.id}/void`, { reason: 'r'.repeat(1000) });
    expect(atLimit.status).toBe(200);
    expect(atLimit.body.paid_amount).toBe(6_000);
  });

  it('a FINISHED sale — 409 invalid_transition with status 2 and correction_path refund', async () => {
    const sale = await walkIn(AUNG, [services.HAIRCUT]);
    const paid = await api.pay(AUNG, sale.id, { payment_method_id: cash, amount: 10_000 });
    await api.complete(AUNG, (await api.get(AUNG, `/sales/${sale.id}`)).body.visit_id as string);
    await api.finish(AUNG, sale.id, { expected_total_amount: 10_000 });
    const res = await api.post(AUNG, `/payments/${paid.payments[0]?.id}/void`, { reason: 'Late' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: ErrorCode.INVALID_TRANSITION,
      context: { status: SaleStatus.FINISHED, correction_path: 'refund' },
    });
  });
});

describe('the day lock gates payment add and void (P7-RULE-02) — last, it closes B3 today', () => {
  it('add and void on a closed day — 422 day_closed', async () => {
    const sale = await walkIn(MIN, [services.HAIRCUT]);
    const paid = await api.pay(MIN, sale.id, { payment_method_id: cash, amount: 5_000 });
    await prisma.daily_closings.create({
      data: {
        id: randomUUID(),
        branch_id: branches.B3,
        business_date: new Date('2026-10-05T00:00:00Z'),
        status: DailyClosingStatus.CLOSED,
        counted_cash_amount: 0n,
        closed_at: new Date('2026-10-05T10:41:00+06:30'),
        closed_by_user_id: users.E002,
      },
    });
    const add = await api.post(
      MIN,
      `/sales/${sale.id}/payments`,
      { payment_method_id: cash, amount: 1_000 },
      randomUUID(),
    );
    expect([add.status, add.body.code]).toStrictEqual([422, ErrorCode.DAY_CLOSED]);
    const remove = await api.post(MIN, `/payments/${paid.payments[0]?.id}/void`, {
      reason: 'Wrong',
    });
    expect([remove.status, remove.body.code]).toStrictEqual([422, ErrorCode.DAY_CLOSED]);
  });
});
