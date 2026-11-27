import { randomUUID } from 'node:crypto';

import { ErrorCode, ProxyReason, SaleStatus, VisitStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-proxy-recording tasks 3.1, 3.3 and 3.5 — who may act on a visit recorded for another barber and
// who collects: visits spec "Own visits need no code; acting on another barber's visit needs the visit
// codes", sales-checkout spec "Own sale needs no code; reading or checking out another barber's sale
// needs the sale codes" and payments spec "Collected by defaults to the performer" (D-VIS-04 / 06 / 12 ·
// P4-RULE-03 / 09 / 10 / 11 · API-PERM-02), through the endpoints and the guards. 05/Oct/2026 10:42 AM
// at B3. Ko Min (E005) records for Ko Aung (E004); the reason decides what Ko Min may do.
const { branches, services, employees, users } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';
const HNIN = 'E002';
const REASON_1 = ProxyReason.PHONE_UNAVAILABLE;
const REASON_2 = ProxyReason.OTHER;

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let cash: string;
let kbzpay: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
});
afterAll(() => s.close());

/** Ko Min's START for Ko Aung with the reason and, optionally, a Haircut. */
async function recorded(reason: number, items: string[] = []) {
  const res = await api.post(
    MIN,
    '/visits',
    {
      branch_id: branches.B3,
      performed_by_employee_id: employees.E004,
      proxy_reason: reason,
      items: items.map((service_id) => ({ service_id })),
    },
    randomUUID(),
  );
  expect(res.status).toBe(201);
  const visit = res.body as { id: string; sale: { id: string } };
  return { visitId: visit.id, saleId: visit.sale.id };
}
const addLine = (who: 'E004' | 'E005', saleId: string, serviceId: string) =>
  api.post(who, `/sales/${saleId}/items`, { line_type: 1, service_id: serviceId });
const cashFor = (who: 'E004' | 'E005', saleId: string, amount: number) =>
  api.post(who, `/sales/${saleId}/payments`, { payment_method_id: cash, amount }, randomUUID());

/** Ko Aung closes a COMPLETED, unpaid visit so that it does not block his next START (D-VIS-07). */
const abandon = async (visitId: string) => {
  const res = await api.post(AUNG, `/visits/${visitId}/incomplete`, { reason: 'Test cleanup' });
  expect(res.status).toBe(200);
};

describe('the visit actors (task 3.1 · P4-RULE-03 / 11)', () => {
  it('Scenario: The reason-1 recorder marks the visit incomplete — 200, incomplete_by Ko Min, mark_incomplete was true', async () => {
    const { visitId } = await recorded(REASON_1, [services.HAIRCUT]);
    const before = await api.get(MIN, `/visits/${visitId}`);
    expect(before.body.sale.actions.mark_incomplete).toBe(true);
    const res = await api.post(MIN, `/visits/${visitId}/incomplete`, {
      reason: 'Customer left before the cut',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: VisitStatus.INCOMPLETE,
      incomplete_by: { user_id: users.E005 },
    });
  });

  it('Scenario: The helper may not mark the visit incomplete — 403 visit.delete, the visit stays STARTED', async () => {
    const { visitId } = await recorded(REASON_2, [services.HAIRCUT]);
    const res = await api.post(MIN, `/visits/${visitId}/incomplete`, { reason: 'Customer left' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: ErrorCode.FORBIDDEN,
      context: { required: 'visit.delete' },
    });
    const row = await prisma.visits.findUniqueOrThrow({ where: { id: visitId } });
    expect(row.status).toBe(VisitStatus.STARTED);
  });

  it('Scenario: The helper adds a line and completes — Shave 3,000 for Ko Aung, completed_by Ko Min', async () => {
    const { visitId, saleId } = await recorded(REASON_2, [services.HAIRCUT]);
    const line = await addLine(MIN, saleId, services.SHAVE);
    expect(line.status).toBe(200);
    const shave = (
      line.body.items as {
        description_en: string;
        performed_by: { id: string };
        unit_price_amount: number;
      }[]
    ).find((item) => item.description_en === 'Shave');
    expect([shave?.performed_by.id, shave?.unit_price_amount]).toStrictEqual([
      employees.E004,
      3_000,
    ]);
    const done = await api.post(MIN, `/visits/${visitId}/complete`);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      status: VisitStatus.COMPLETED,
      completed_by: { user_id: users.E005 },
    });
    await abandon(visitId);
  });

  it('Scenario: The recorder reads the visit he recorded — 200 with the sale', async () => {
    const { visitId } = await recorded(REASON_2);
    const res = await api.get(MIN, `/visits/${visitId}`);
    expect(res.status).toBe(200);
    expect(res.body.sale).toBeDefined();
  });
});

describe('the checkout actors (task 3.3 · D-VIS-06 · P4-RULE-03 / 10)', () => {
  it('Scenarios: The reason-1 recorder takes the payment, voids it, pays again and finishes without a reason', async () => {
    const { visitId, saleId } = await recorded(REASON_1, [services.HAIRCUT]);
    const done = await api.post(MIN, `/visits/${visitId}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.sale.actions).toMatchObject({
      take_payment: true,
      finish: true,
      finish_needs_reason: false,
    });

    const first = await cashFor(MIN, saleId, 10_000);
    expect(first.status).toBe(201);
    const paymentId = first.body.payments[0].id as string;
    const voided = await api.post(MIN, `/payments/${paymentId}/void`, {
      reason: 'Customer pays by KBZPay instead',
    });
    expect(voided.status).toBe(200);
    const paid = await api.pay(MIN, saleId, { payment_method_id: cash, amount: 10_000 });
    expect(paid.remaining_amount).toBe(0);

    const finish = await api.post(MIN, `/sales/${saleId}/finish`, {
      expected_total_amount: 10_000,
    });
    expect(finish.status).toBe(200);
    expect(finish.body).toMatchObject({
      status: SaleStatus.FINISHED,
      finished_by: { user_id: users.E005 },
    });
    expect(finish.body.receipt_number).toMatch(/^B3-2026-OCT-\d{5}$/);
    expect(finish.body.items[0].performed_by.id).toBe(employees.E004);
  });

  it('Scenario: The helper may not take the payment — 403 sale.finish_override, no row, actions false', async () => {
    const { visitId, saleId } = await recorded(REASON_2, [services.HAIRCUT]);
    await api.post(MIN, `/visits/${visitId}/complete`);
    const res = await cashFor(MIN, saleId, 10_000);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: ErrorCode.FORBIDDEN,
      context: { required: 'sale.finish_override' },
    });
    expect(await prisma.payments.count({ where: { sale_id: saleId } })).toBe(0);
    const read = await api.get(MIN, `/visits/${visitId}`);
    expect(read.body.sale.actions).toMatchObject({ take_payment: false, finish: false });
    const finish = await api.post(MIN, `/sales/${saleId}/finish`, {
      expected_total_amount: 10_000,
    });
    expect(finish.status).toBe(403);
    await abandon(visitId);
  });

  it('Scenario: The exception covers the recorded visit only — Ko Min on Ko Aung other visit gets 403', async () => {
    await recorded(REASON_1, [services.HAIRCUT]);
    const own = (await api.start(AUNG, [services.HAIRCUT])).sale;
    const res = await cashFor(MIN, own.id, 8_000);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ context: { required: 'sale.finish_override' } });
    expect(await prisma.payments.count({ where: { sale_id: own.id } })).toBe(0);
  });

  it('Ma Hnin with the codes still finishes for Ko Aung only with a reason, on a reason-1 visit too', async () => {
    const { visitId, saleId } = await recorded(REASON_1, [services.HAIRCUT]);
    await api.post(MIN, `/visits/${visitId}/complete`);
    await api.pay(MIN, saleId, { payment_method_id: cash, amount: 10_000 });
    const res = await api.post(HNIN, `/sales/${saleId}/finish`, { expected_total_amount: 10_000 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.REASON_REQUIRED);
    await api.finish(AUNG, saleId, { expected_total_amount: 10_000 });
  });
});

describe('the default collector (task 3.5 · P4-RULE-09 · D-VIS-06 / 12)', () => {
  const collectorOf = async (saleId: string) =>
    (
      await prisma.payments.findMany({ where: { sale_id: saleId }, orderBy: { created_at: 'asc' } })
    ).map((payment) => payment.collected_by_employee_id);

  it('Scenario: The reason-1 recorder collects by default — Cash by Ko Min is collected by Ko Min', async () => {
    const { saleId } = await recorded(REASON_1, [services.HAIRCUT]);
    expect((await cashFor(MIN, saleId, 10_000)).status).toBe(201);
    expect(await collectorOf(saleId)).toStrictEqual([employees.E005]);
  });

  it('Scenario: The default stays the recorder’s on a reason-1 visit — Ko Aung KBZPay without a collector → Ko Min; naming himself → Ko Aung', async () => {
    const { saleId } = await recorded(REASON_1, [services.HAIRCUT]);
    await api.pay(AUNG, saleId, {
      payment_method_id: kbzpay,
      amount: 4_000,
      external_reference: 'KBZ0001234567',
    });
    await api.pay(AUNG, saleId, {
      payment_method_id: kbzpay,
      amount: 6_000,
      external_reference: 'KBZ0001234568',
      collected_by_employee_id: employees.E004,
    });
    expect(await collectorOf(saleId)).toStrictEqual([employees.E005, employees.E004]);
  });

  it('Scenario: A helper’s visit collects for the performer — Ko Aung Cash → Ko Aung', async () => {
    const { saleId } = await recorded(REASON_2, [services.HAIRCUT]);
    await api.pay(AUNG, saleId, { payment_method_id: cash, amount: 10_000 });
    expect(await collectorOf(saleId)).toStrictEqual([employees.E004]);
  });

  it('a walk-in of Ko Aung without a proxy keeps the performer as the collector', async () => {
    const sale = (await api.start(AUNG, [services.HAIRCUT])).sale;
    await api.pay(AUNG, sale.id, { payment_method_id: cash, amount: 10_000 });
    expect(await collectorOf(sale.id)).toStrictEqual([employees.E004]);
  });
});
