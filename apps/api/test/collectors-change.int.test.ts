import { randomUUID } from 'node:crypto';

import {
  AuditSource,
  DailyClosingStatus,
  ErrorCode,
  SaleStatus,
  saleSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-payment-collector-picker tasks 2.3, 3.1, 3.2 — PATCH /v1/payments/{id} (P4.PAY.04 · D-VIS-06 ·
// P4-RULE-01 / 09 / 21 / 22 · P7-RULE-02 · API-AUD-01 · API-PERM-02), through the HTTP endpoint and the
// guards. 05/Oct/2026 10:41 AM at B3; Ko Aung's Haircut is 10,000. The closed-day scenario is last.
const { branches, employees, users } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';
const HNIN = 'E002';

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let cash: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:41:00+06:30'));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
});
afterAll(() => s.close());

/** Ko Aung's OPEN sale with Cash 10,000 collected by him: the sale and its payment id. */
async function paidSale(): Promise<{ saleId: string; visitId: string; paymentId: string }> {
  const visit = await api.start(AUNG);
  const sale = await api.pay(AUNG, visit.sale.id, { payment_method_id: cash, amount: 10_000 });
  return { saleId: sale.id, visitId: visit.id, paymentId: sale.payments[0]?.id ?? '' };
}
const change = (who: 'E002' | 'E004' | 'E005', paymentId: string, to: string) =>
  api.patch(who, `/payments/${paymentId}`, { collected_by_employee_id: to });
const collectorOf = async (paymentId: string) =>
  (await prisma.payments.findUniqueOrThrow({ where: { id: paymentId } })).collected_by_employee_id;
const audits = (saleId: string, source: number, action?: string) =>
  prisma.audit_events.count({
    where: { entity_id: saleId, source, ...(action === undefined ? {} : { action }) },
  });

describe('PATCH /v1/payments/{id} (P4.PAY.04)', () => {
  it('Scenario: Ko Aung hands the cash to Ko Min — 200, only the collector changes, paid 10,000, remaining 0', async () => {
    const { saleId, paymentId } = await paidSale();
    const before = await prisma.payments.findUniqueOrThrow({ where: { id: paymentId } });
    const res = await change(AUNG, paymentId, employees.E005);
    expect(res.status).toBe(200);
    const sale = saleSchema.parse(res.body);
    expect(sale).toMatchObject({ id: saleId, paid_amount: 10_000, remaining_amount: 0 });
    expect(sale.payments[0]).toMatchObject({
      amount: 10_000,
      collected_by: { id: employees.E005, display_name: 'Ko Min' },
      effective_collected_by: { id: employees.E005 },
    });
    const after = await prisma.payments.findUniqueOrThrow({ where: { id: paymentId } });
    expect({ ...after, collected_by_employee_id: null }).toStrictEqual({
      ...before,
      collected_by_employee_id: null,
    });
    expect(after.collected_by_employee_id).toBe(employees.E005);
  });

  it('Scenarios: Ko Htet (another branch) and Ko Naing (left) — 422 not_assigned_to_branch, unchanged', async () => {
    const { paymentId } = await paidSale();
    for (const collector of [employees.E006, employees.E009]) {
      const res = await change(AUNG, paymentId, collector);
      expect([res.status, res.body.code]).toStrictEqual([422, ErrorCode.NOT_ASSIGNED_TO_BRANCH]);
    }
    expect(await collectorOf(paymentId)).toBe(employees.E004);
  });

  it('Scenario: The same collector again — 200, nothing written, no audit row', async () => {
    const { saleId, paymentId } = await paidSale();
    const dbRows = await prisma.audit_events.count({
      where: { entity_id: paymentId, source: AuditSource.DB_TRIGGER },
    });
    const res = await change(AUNG, paymentId, employees.E004);
    expect(res.status).toBe(200);
    expect(await audits(saleId, AuditSource.APP, 'payment.collector_change')).toBe(0);
    expect(await prisma.audit_events.count({ where: { entity_id: paymentId, source: AuditSource.DB_TRIGGER } })).toBe(
      dbRows,
    );
  });

  it('Scenario: A finished sale — 409 invalid_transition, status 2, correction_path adjustment', async () => {
    const { saleId, visitId, paymentId } = await paidSale();
    await api.complete(AUNG, visitId);
    await api.finish(AUNG, saleId, { expected_total_amount: 10_000 });
    const res = await change(AUNG, paymentId, employees.E005);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: ErrorCode.INVALID_TRANSITION,
      context: { status: SaleStatus.FINISHED, correction_path: 'adjustment' },
    });
    expect(await collectorOf(paymentId)).toBe(employees.E004);
  });

  it('Scenarios: A cancelled sale — 409 status 0 with no path, even for a voided payment; A voided payment on an open sale — 200, no write', async () => {
    const { saleId, visitId, paymentId } = await paidSale();
    // A voided payment of an OPEN sale: 200, the collector stays, no audit row (owner CL2).
    expect((await api.post(AUNG, `/payments/${paymentId}/void`, { reason: 'Wrong' })).status).toBe(
      200,
    );
    const open = await change(AUNG, paymentId, employees.E005);
    expect(open.status).toBe(200);
    expect(await collectorOf(paymentId)).toBe(employees.E004);
    expect(await audits(saleId, AuditSource.APP, 'payment.collector_change')).toBe(0);
    // INCOMPLETE cancels the sale: the same call is now a 409 with no correction path.
    expect(
      (await api.post(AUNG, `/visits/${visitId}/incomplete`, { reason: 'Customer left' })).status,
    ).toBe(200);
    const res = await change(AUNG, paymentId, employees.E005);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: ErrorCode.INVALID_TRANSITION,
      context: { status: SaleStatus.CANCELLED },
    });
    expect(res.body.context).not.toHaveProperty('correction_path');
  });

  it('Scenario: Who may change it — Ko Min 403 sale.finish_override; Ma Hnin 200 without a reason', async () => {
    const { paymentId } = await paidSale();
    const min = await change(MIN, paymentId, employees.E005);
    expect(min.status).toBe(403);
    expect(min.body).toMatchObject({
      code: ErrorCode.FORBIDDEN,
      context: { required: 'sale.finish_override' },
    });
    expect(await collectorOf(paymentId)).toBe(employees.E004);
    const hnin = await change(HNIN, paymentId, employees.E005);
    expect(hnin.status).toBe(200);
    expect(await collectorOf(paymentId)).toBe(employees.E005);
  });

  it('Scenarios: A body without a collector — 400 validation naming it; a non-UUID too; no payment — 404', async () => {
    const { paymentId } = await paidSale();
    const none = await api.patch(AUNG, `/payments/${paymentId}`, {});
    expect(none.status).toBe(400);
    expect(none.body).toMatchObject({
      code: ErrorCode.VALIDATION,
      errors: [{ field: 'collected_by_employee_id' }],
    });
    expect((await change(AUNG, paymentId, 'Ko Min')).status).toBe(400);
    expect((await change(HNIN, randomUUID(), employees.E005)).status).toBe(404);
  });
});

describe('the audit of a collector change (P4-RULE-21 · API-AUD-01 · D-AUD-01 / 02)', () => {
  it('Scenarios: The handover is audited — one APP row with before / after, one database row; A repeat adds nothing', async () => {
    const { saleId, paymentId } = await paidSale();
    const dbBefore = await prisma.audit_events.count({
      where: { entity_id: paymentId, entity_type: 'payments', source: AuditSource.DB_TRIGGER },
    });
    for (let i = 0; i < 2; i += 1) expect((await change(AUNG, paymentId, employees.E005)).status).toBe(200);
    const rows = await prisma.audit_events.findMany({
      where: { entity_id: saleId, action: 'payment.collector_change' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: AuditSource.APP,
      entity_type: 'sales',
      branch_id: branches.B3,
      actor_user_id: users.E004,
      before: { payment_id: paymentId, collected_by_employee_id: employees.E004 },
      after: { payment_id: paymentId, collected_by_employee_id: employees.E005 },
    });
    const dbRows = await prisma.audit_events.count({
      where: { entity_id: paymentId, entity_type: 'payments', source: AuditSource.DB_TRIGGER },
    });
    // The repeat changed nothing, so the trigger fired once for the one update.
    expect(dbRows - dbBefore).toBe(1);
  });
});

describe('the two routes over HTTP (API-PERM-02 · API-AUTH-02)', () => {
  it('Scenario: no session — 401; no app header — 403 csrf; and the list needs a session too', async () => {
    const { saleId, paymentId } = await paidSale();
    const body = { collected_by_employee_id: employees.E005 };
    const anon = await s.http.patch(`/api/v1/payments/${paymentId}`).send(body);
    expect(anon.status).toBe(401);
    expect((await s.http.get(`/api/v1/sales/${saleId}/collectors`)).status).toBe(401);
    const raw = await s.raw
      .patch(`/api/v1/payments/${paymentId}`)
      .set('Cookie', await api.cookie(AUNG))
      .send(body);
    expect([raw.status, raw.body.code]).toStrictEqual([403, 'csrf']);
    expect(await collectorOf(paymentId)).toBe(employees.E004);
  });
});

describe('the day lock gates the change (P7-RULE-02) — last, it closes B3 today', () => {
  it('Scenario: A closed day — 422 day_closed with correction_path reopen, the payment unchanged', async () => {
    const { paymentId } = await paidSale();
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
    const res = await change(AUNG, paymentId, employees.E005);
    expect([res.status, res.body.code]).toStrictEqual([422, ErrorCode.DAY_CLOSED]);
    expect(res.body.context).toMatchObject({ correction_path: 'reopen' });
    expect(await collectorOf(paymentId)).toBe(employees.E004);
  });
});

