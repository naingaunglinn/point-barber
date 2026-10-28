import { randomUUID } from 'node:crypto';

import {
  DailyClosingStatus,
  ErrorCode,
  LateEntryReason,
  PayrollRunStatus,
  ReceiptCounterKind,
  SaleStatus,
  VisitStatus,
  type SaleDto,
  type VisitDto,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-late-entry tasks 3.1, 3.3, 3.5, 3.6, 3.8 — COMPLETE, payment add / void and FINISH on a late-entry
// visit (P4.VIS.05 · P4.PAY.02 / .03 · P4.SAL.10 · P4-RULE-09 / 10 / 11 / 13 · P7-RULE-02 · P5-RULE-10 ·
// D-PAY-06 · design D4 · recorded readings 1, 3, 6), through the HTTP endpoints and the guards. The
// clock is fixed at Monday 05/Oct/2026 9:30 AM MMT; Ko Min's Haircut at B3 is 8,000.
const { branches, services, users } = FIXTURE_IDS;
const NOW = '2026-10-05T09:30:00+06:30';
const MIN = 'E005';
const sunday = (time: string) => `2026-10-04T${time}:00+06:30`;

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let cash: string;
let kbzpay: string;

beforeAll(async () => {
  s = await seededApp(new Date(NOW));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
});
afterAll(() => s.close());

/** Ko Min's late entry with a Haircut, started at `startedAt`. */
async function lateVisit(startedAt: string): Promise<VisitDto> {
  const res = await api.post(
    MIN,
    '/visits',
    {
      branch_id: branches.B3,
      items: [{ service_id: services.HAIRCUT }],
      late_entry: { reason: LateEntryReason.INTERNET_OUTAGE, started_at: startedAt },
    },
    randomUUID(),
  );
  if (res.status !== 201) throw new Error(`late START ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as VisitDto;
}
const complete = (visitId: string, body: object = {}) =>
  api.post(MIN, `/visits/${visitId}/complete`, body);
const pay = (saleId: string, body: object) =>
  api.post(
    MIN,
    `/sales/${saleId}/payments`,
    { payment_method_id: cash, amount: 8000, ...body },
    randomUUID(),
  );
const finish = (saleId: string, body: object = {}) =>
  api.post(MIN, `/sales/${saleId}/finish`, { expected_total_amount: 8000, ...body });

/** A late entry completed and paid in cash at the times given, ready for FINISH. */
async function paidLateVisit(times: { started: string; completed: string; received: string }) {
  const visit = await lateVisit(times.started);
  expect((await complete(visit.id, { completed_at: times.completed })).status).toBe(200);
  expect((await pay(visit.sale.id, { received_at: times.received })).status).toBe(201);
  return visit;
}
const saleRow = (id: string) => prisma.sales.findUniqueOrThrow({ where: { id } });

// Ko Htet's live walk-in at B1, carried through the three "a live walk-in ignores …" scenarios: a
// completed, unpaid visit would block his next START.
let htet: VisitDto;

describe('add-late-entry · COMPLETE (task 3.1 · P4-RULE-11 / 13)', () => {
  it('Scenario: completed_at missing on a late entry — 400 validation naming it', async () => {
    const visit = await lateVisit(sunday('15:00'));
    const res = await complete(visit.id);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: ErrorCode.VALIDATION,
      errors: [{ field: 'completed_at' }],
    });
    expect((await prisma.visits.findUniqueOrThrow({ where: { id: visit.id } })).status).toBe(
      VisitStatus.STARTED,
    );
  });

  it('Scenario: 2:55 PM before a 3:00 PM start — 422 late_entry_time', async () => {
    const visit = await lateVisit(sunday('15:00'));
    const res = await complete(visit.id, { completed_at: sunday('14:55') });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.LATE_ENTRY_TIME);
  });

  it('a completion later than now — 422 late_entry_time (LE-1)', async () => {
    const visit = await lateVisit(sunday('15:00'));
    const res = await complete(visit.id, { completed_at: '2026-10-05T09:31:00+06:30' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.LATE_ENTRY_TIME);
  });

  it('Scenario: after a payment received at 3:25 PM, completed_at 3:30 PM — 422 (recorded reading 1)', async () => {
    const visit = await lateVisit(sunday('15:00'));
    expect((await pay(visit.sale.id, { received_at: sunday('15:25') })).status).toBe(201);
    const res = await complete(visit.id, { completed_at: sunday('15:30') });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.LATE_ENTRY_TIME);
    const ok = await complete(visit.id, { completed_at: sunday('15:25') });
    expect(ok.status).toBe(200);
  });

  it('3:30 PM after a 3:00 PM start — 200 with the entered time stored; a repeat needs no time', async () => {
    const visit = await lateVisit(sunday('15:00'));
    const res = await complete(visit.id, { completed_at: sunday('15:30') });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: VisitStatus.COMPLETED,
      completed_at: sunday('15:30'),
    });
    const row = await prisma.visits.findUniqueOrThrow({ where: { id: visit.id } });
    expect(row.updated_at).toStrictEqual(new Date(NOW));
    expect((await complete(visit.id)).status).toBe(200);
  });

  it('Scenario: a live walk-in ignores a sent completed_at', async () => {
    htet = await api.start('E006');
    const res = await api.post('E006', `/visits/${htet.id}/complete`, {
      completed_at: sunday('15:30'),
    });
    expect(res.status).toBe(200);
    expect(res.body.completed_at).toBe(NOW);
  });
});

describe('add-late-entry · payment add (task 3.3 · P4-RULE-09)', () => {
  let visit: VisitDto;
  beforeAll(async () => {
    visit = await lateVisit(sunday('15:00'));
    expect((await complete(visit.id, { completed_at: sunday('15:30') })).status).toBe(200);
  });

  it('Scenario: received_at missing — 400 validation naming it, no payment', async () => {
    const res = await pay(visit.sale.id, {});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: ErrorCode.VALIDATION,
      errors: [{ field: 'received_at' }],
    });
    expect(await prisma.payments.count({ where: { sale_id: visit.sale.id } })).toBe(0);
  });

  it('Scenario: 3:25 PM before a 3:30 PM completion — 422 late_entry_time', async () => {
    const res = await pay(visit.sale.id, { received_at: sunday('15:25') });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.LATE_ENTRY_TIME);
  });

  it('a payment later than now — 422 late_entry_time', async () => {
    const res = await pay(visit.sale.id, { received_at: '2026-10-05T09:31:00+06:30' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.LATE_ENTRY_TIME);
  });

  it('Scenario: equal to the completion, 3:30 PM — 201 with the entered time', async () => {
    const res = await pay(visit.sale.id, { received_at: sunday('15:30') });
    expect(res.status).toBe(201);
    const sale = res.body as SaleDto;
    expect(sale.payments[0]).toMatchObject({ received_at: sunday('15:30'), amount: 8000 });
    const row = await prisma.payments.findFirstOrThrow({ where: { sale_id: visit.sale.id } });
    expect(row.created_at).toStrictEqual(new Date(NOW));
  });

  it('Scenario: a live walk-in ignores a sent received_at', async () => {
    const res = await api.post(
      'E006',
      `/sales/${htet.sale.id}/payments`,
      { payment_method_id: cash, amount: htet.sale.total_amount, received_at: sunday('15:30') },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    expect(res.body.payments[0].received_at).toBe(NOW);
  });
});

describe('add-late-entry · FINISH (task 3.5 · P4-RULE-10 #1 – #3)', () => {
  it('Scenario: finished_at missing — 400, the sale stays OPEN with no number', async () => {
    const visit = await paidLateVisit({
      started: sunday('15:00'),
      completed: sunday('15:30'),
      received: sunday('15:35'),
    });
    const res = await finish(visit.sale.id);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: ErrorCode.VALIDATION,
      errors: [{ field: 'finished_at' }],
    });
    expect(await saleRow(visit.sale.id)).toMatchObject({
      status: SaleStatus.OPEN,
      receipt_number: null,
    });
  });

  it('Scenario: 3:30 PM before a 3:35 PM payment — 422 late_entry_time, no number', async () => {
    const visit = await paidLateVisit({
      started: sunday('15:00'),
      completed: sunday('15:30'),
      received: sunday('15:35'),
    });
    const res = await finish(visit.sale.id, { finished_at: sunday('15:30') });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.LATE_ENTRY_TIME);
    expect((await saleRow(visit.sale.id)).receipt_number).toBeNull();
  });

  it('Scenario: a live walk-in ignores a sent finished_at', async () => {
    const res = await api.post('E006', `/sales/${htet.sale.id}/finish`, {
      expected_total_amount: htet.sale.total_amount,
      finished_at: sunday('15:35'),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ finished_at: NOW, business_date: '2026-10-05' });
    expect(res.body.receipt_number).toMatch(/^B1-2026-OCT-/);
  });
});

describe('add-late-entry · service-day money (task 3.6 · D-PAY-06 · D-PLT-15 · P4-RULE-10 #13 / #15)', () => {
  const counter = (month: number, lastSeq: number) =>
    prisma.receipt_counters.upsert({
      where: {
        branch_id_kind_receipt_year_receipt_month: {
          branch_id: branches.B3,
          kind: ReceiptCounterKind.SALE,
          receipt_year: 2026,
          receipt_month: month,
        },
      },
      create: {
        branch_id: branches.B3,
        kind: ReceiptCounterKind.SALE,
        receipt_year: 2026,
        receipt_month: month,
        last_seq: lastSeq,
      },
      update: { last_seq: lastSeq },
    });

  it('Scenario: October counter at 12 — the late entry is B3-2026-OCT-00013 on 04/Oct, 3:35 PM', async () => {
    await counter(10, 12);
    const visit = await paidLateVisit({
      started: sunday('15:00'),
      completed: sunday('15:30'),
      received: sunday('15:35'),
    });
    const res = await finish(visit.sale.id, { finished_at: sunday('15:35') });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: SaleStatus.FINISHED,
      receipt_number: 'B3-2026-OCT-00013',
      business_date: '2026-10-04',
      finished_at: sunday('15:35'),
    });
    expect((await saleRow(visit.sale.id)).updated_at).toStrictEqual(new Date(NOW));
    const receipt = await api.get(MIN, `/sales/${visit.sale.id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({
      number: 'B3-2026-OCT-00013',
      issued_at: sunday('15:35'),
    });
  });

  it('Scenario: September counter at 87 — B3-2026-SEP-00088; the next October sale is B3-2026-OCT-00014', async () => {
    await counter(9, 87);
    const visit = await paidLateVisit({
      started: '2026-09-30T15:00:00+06:30',
      completed: '2026-09-30T15:30:00+06:30',
      received: '2026-09-30T15:35:00+06:30',
    });
    const res = await finish(visit.sale.id, { finished_at: '2026-09-30T15:35:00+06:30' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      receipt_number: 'B3-2026-SEP-00088',
      business_date: '2026-09-30',
    });
    const live = await api.start(MIN);
    await api.complete(MIN, live.id);
    const paid = await api.pay(MIN, live.sale.id, { payment_method_id: cash, amount: 8000 });
    const done = await api.finish(MIN, live.sale.id, { expected_total_amount: paid.total_amount });
    expect(done.business_date).toBe('2026-10-05');
    expect(done.receipt_number).toBe('B3-2026-OCT-00014');
  });

  it("Scenario: a KBZPay over-transfer on a late entry — the change refund is in the service month's RF series (reading 6)", async () => {
    const visit = await lateVisit(sunday('16:00'));
    expect((await complete(visit.id, { completed_at: sunday('16:30') })).status).toBe(200);
    const paid = await pay(visit.sale.id, {
      payment_method_id: kbzpay,
      amount: 10_000,
      external_reference: 'KBZ0000000413',
      received_at: sunday('16:35'),
    });
    expect(paid.status).toBe(201);
    const res = await finish(visit.sale.id, { finished_at: sunday('16:35') });
    expect(res.status).toBe(200);
    const refund = await prisma.refunds.findFirstOrThrow({ where: { sale_id: visit.sale.id } });
    expect(refund).toMatchObject({
      amount: 2000n,
      business_date: new Date('2026-10-04T00:00:00Z'),
      refunded_at: new Date(sunday('16:35')),
      created_at: new Date(NOW),
    });
    expect(refund.refund_receipt_number).toMatch(/^B3-RF-2026-OCT-\d{5}$/);
  });
});

describe('add-late-entry · reads (task 3.8 · Part 4 §13)', () => {
  it('GET /v1/visits/{id} of a late entry: the flag, reason, note and recorded_at', async () => {
    const res = await api.post(
      MIN,
      '/visits',
      {
        branch_id: branches.B3,
        late_entry: {
          reason: LateEntryReason.OTHER,
          note: 'Generator failed',
          started_at: sunday('17:00'),
        },
      },
      randomUUID(),
    );
    expect(res.status).toBe(201);
    const read = await api.get(MIN, `/visits/${res.body.id}`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      is_late_entry: true,
      late_entry_reason: LateEntryReason.OTHER,
      late_entry_note: 'Generator failed',
      recorded_at: NOW,
      started_at: sunday('17:00'),
      business_date: '2026-10-04',
    });
    expect(
      await prisma.audit_events.count({ where: { action: 'visit.start', entity_id: res.body.id } }),
    ).toBe(1);
  });
});

// Last in the file: the closed days and the FINALIZED September stay for the rest of the run.
describe('add-late-entry · closed days and a finalized period (tasks 3.3 / 3.5 · P7-RULE-02 · P5-RULE-10)', () => {
  const close = (date: string) =>
    prisma.daily_closings.create({
      data: {
        id: randomUUID(),
        branch_id: branches.B3,
        business_date: new Date(`${date}T00:00:00Z`),
        status: DailyClosingStatus.CLOSED,
        counted_cash_amount: 0n,
        closed_at: new Date(`${date}T21:05:00+06:30`),
        closed_by_user_id: users.E002,
      },
    });

  it('Scenario: across midnight — payment and FINISH at 00:00 on a CLOSED 04/Oct, the void on 03/Oct', async () => {
    const visit = await lateVisit('2026-10-03T23:30:00+06:30');
    expect((await complete(visit.id, { completed_at: '2026-10-03T23:50:00+06:30' })).status).toBe(
      200,
    );
    const first = await pay(visit.sale.id, {
      amount: 5000,
      received_at: '2026-10-03T23:55:00+06:30',
    });
    expect(first.status).toBe(201);
    await close('2026-10-04');

    // The payment's day is the Myanmar date of its received time.
    const midnight = await pay(visit.sale.id, {
      amount: 3000,
      received_at: '2026-10-04T00:00:00+06:30',
    });
    expect(midnight.status).toBe(422);
    expect(midnight.body).toMatchObject({
      code: ErrorCode.DAY_CLOSED,
      context: { business_date: '2026-10-04' },
    });

    // FINISH at 00:00 on the 4th takes the closed day's lock.
    const late = await pay(visit.sale.id, {
      amount: 3000,
      received_at: '2026-10-03T23:58:00+06:30',
    });
    expect(late.status).toBe(201);
    const finished = await finish(visit.sale.id, { finished_at: '2026-10-04T00:00:00+06:30' });
    expect(finished.status).toBe(422);
    expect(finished.body).toMatchObject({
      code: ErrorCode.DAY_CLOSED,
      context: { business_date: '2026-10-04' },
    });
    expect((await saleRow(visit.sale.id)).receipt_number).toBeNull();

    // The 23:55 payment is voided on its own day, 03/Oct (recorded reading 3) — closed now too.
    await close('2026-10-03');
    const paymentId = (first.body as SaleDto).payments[0]?.id;
    const voided = await api.post(MIN, `/payments/${paymentId}/void`, { reason: 'Entered twice' });
    expect(voided.status).toBe(422);
    expect(voided.body).toMatchObject({
      code: ErrorCode.DAY_CLOSED,
      context: { business_date: '2026-10-03' },
    });
  });

  it('Scenario: September finalized between START and FINISH — 423 payroll_finalized, no number', async () => {
    const visit = await paidLateVisit({
      started: '2026-09-29T15:00:00+06:30',
      completed: '2026-09-29T15:30:00+06:30',
      received: '2026-09-29T15:35:00+06:30',
    });
    const at = new Date('2026-10-02T09:00:00+06:30');
    await prisma.payroll_runs.create({
      data: {
        id: randomUUID(),
        company_id: (await prisma.companies.findFirstOrThrow()).id,
        period_start: new Date('2026-09-01T00:00:00Z'),
        period_end: new Date('2026-09-30T00:00:00Z'),
        status: PayrollRunStatus.FINALIZED,
        calculated_at: at,
        calculated_by_user_id: users.E001,
        rules_snapshot: {},
        finalized_at: at,
        finalized_by_user_id: users.E001,
        created_by_user_id: users.E001,
      },
    });
    const res = await finish(visit.sale.id, { finished_at: '2026-09-29T15:35:00+06:30' });
    expect(res.status).toBe(423);
    expect(res.body.code).toBe(ErrorCode.PAYROLL_FINALIZED);
    expect(await saleRow(visit.sale.id)).toMatchObject({
      status: SaleStatus.OPEN,
      receipt_number: null,
    });
  });
});
