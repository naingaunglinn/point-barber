import { randomUUID } from 'node:crypto';

import {
  AuditSource,
  CustomerStatus,
  DailyClosingStatus,
  ErrorCode,
  RefundKind,
  SaleStatus,
  VisitStatus,
  finishRequestSchema,
  paymentCreateSchema,
  saleItemCreateSchema,
  saleSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { Visits } from '../src/modules/delivery/index.js';
import { Payments, SaleLines, SalesFinish } from '../src/modules/sales/index.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type FixturePerson, KO_AUNG, KO_HTET, KO_MIN, MA_HNIN, as } from './helpers/walkin.js';

// add-walkin-visit-checkout tasks 8.1, 8.3, 8.6 – 8.10, 8.14 (service part) — sales-checkout spec
// "FINISH needs a completed visit and full payment", "FINISH refuses a total the screen did not show",
// "Receipt numbers are gapless…", "FINISH is idempotent by state", the payments spec's change return and
// the customers spec's FINISH cases (P4.SAL.10 · P4-RULE-10 · D-PAY-05 / 06 · design D5 / D6). Today is
// 05/Oct/2026, the clock at 10:42 AM MMT; the tests run in order on one seeded database.
const { branches, services, users, employees } = FIXTURE_IDS;

let s: SeededApp;
let prisma: PrismaService;
let visits: Visits;
let lines: SaleLines;
let payments: Payments;
let finisher: SalesFinish;
let cash: string;
let kbzpay: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'));
  prisma = s.app.get(PrismaService);
  visits = s.app.get(Visits);
  lines = s.app.get(SaleLines);
  payments = s.app.get(Payments);
  finisher = s.app.get(SalesFinish);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
}, 60_000);
afterAll(() => s.close());

async function refusal(work: () => Promise<unknown>): Promise<ProblemException> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ProblemException) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

const branchOf = (who: FixturePerson) => (who === KO_HTET ? branches.B1 : branches.B3);

async function start(who: FixturePerson, items: string[]) {
  const { visit } = await as(who, () =>
    visits.start(
      who.viewer,
      who.scope,
      { branch_id: branchOf(who), items: items.map((service_id) => ({ service_id })) },
      randomUUID(),
    ),
  );
  return { saleId: visit.sale.id, visitId: visit.id };
}
const pay = (who: FixturePerson, saleId: string, body: Record<string, unknown>) =>
  as(who, () => payments.add(who.viewer, saleId, paymentCreateSchema.parse(body), randomUUID()));
const complete = (who: FixturePerson, visitId: string) =>
  as(who, () => visits.complete(who.viewer, visitId));
const finish = (who: FixturePerson, saleId: string, body: Record<string, unknown>) =>
  as(who, () => finisher.finish(who.viewer, saleId, finishRequestSchema.parse(body))).then((sale) =>
    saleSchema.parse(sale),
  );

/** A completed visit of `who` paid in full in cash, ready to finish. */
async function ready(who: FixturePerson, items: string[], total: number) {
  const ids = await start(who, items);
  await pay(who, ids.saleId, { payment_method_id: cash, amount: total });
  await complete(who, ids.visitId);
  return ids;
}

const counter = async (branchId: string, kind: number) =>
  (
    await prisma.receipt_counters.findFirst({
      where: { branch_id: branchId, kind, receipt_year: 2026, receipt_month: 10 },
    })
  )?.last_seq ?? 0;
const jobsFor = async (entityId: string) =>
  (
    await prisma.$queryRaw<{ data: { entity_type: string } }[]>`
      SELECT data FROM pgboss.job
      WHERE name = 'receipt.render' AND data->>'entity_id' = ${entityId}`
  ).map((row) => row.data.entity_type);
const finishAudits = (saleId: string) =>
  prisma.audit_events.findMany({
    where: { entity_id: saleId, action: 'sale.finish', source: AuditSource.APP },
    select: { actor_user_id: true, reason: true },
  });

describe('FINISH needs a completed visit and full payment (P4.SAL.10)', () => {
  let first: { saleId: string; visitId: string };

  it('Scenario: Walk-in, one service, cash — B3-2026-OCT-00001, the visit 3 FINISHED', async () => {
    first = await ready(KO_AUNG, [services.HAIRCUT], 10000);
    const sale = await finish(KO_AUNG, first.saleId, { expected_total_amount: 10000 });
    expect(sale).toMatchObject({
      status: SaleStatus.FINISHED,
      receipt_number: 'B3-2026-OCT-00001',
      business_date: '2026-10-05',
      finished_at: '2026-10-05T10:42:00+06:30',
      finished_by: { user_id: users.E004 },
      customer: null,
      refunds: [],
    });
    expect(Object.values(sale.actions).every((flag) => !flag)).toBe(true);
    const visit = await prisma.visits.findUniqueOrThrow({ where: { id: first.visitId } });
    expect([visit.status, visit.finished_at?.toISOString()]).toStrictEqual([
      VisitStatus.FINISHED,
      new Date('2026-10-05T10:42:00+06:30').toISOString(),
    ]);
    // One render job for the sale and one sale.finish row, both written with the FINISH.
    expect(await jobsFor(first.saleId)).toStrictEqual(['sales']);
    expect(await finishAudits(first.saleId)).toStrictEqual([
      { actor_user_id: users.E004, reason: null },
    ]);
  });

  it('START is unblocked after FINISH (P4-RULE-02)', async () => {
    const { visitId } = await start(KO_AUNG, []);
    await as(KO_AUNG, () => visits.incomplete(KO_AUNG.viewer, visitId, 'Test clean-up'));
  });

  it('Scenario: FINISH twice — 200, the same number, the counter still 1, nothing written twice', async () => {
    const again = await finish(KO_AUNG, first.saleId, { expected_total_amount: 10000 });
    expect(again.receipt_number).toBe('B3-2026-OCT-00001');
    expect(await counter(branches.B3, 1)).toBe(1);
    expect(await jobsFor(first.saleId)).toHaveLength(1);
    expect(await finishAudits(first.saleId)).toHaveLength(1);
  });

  it('Scenario: Paid less than the total — 422 amount_mismatch, remaining 6,000; no number, no job', async () => {
    const { saleId, visitId } = await start(KO_MIN, [services.HAIRCUT, services.SHAVE]);
    await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 5000 });
    await complete(KO_MIN, visitId);
    const before = await counter(branches.B3, 1);
    const error = await refusal(() => finish(KO_MIN, saleId, { expected_total_amount: 11000 }));
    expect([error.code, error.status, error.options.context]).toStrictEqual([
      ErrorCode.AMOUNT_MISMATCH,
      422,
      { remaining_amount: 6000 },
    ]);
    expect(await counter(branches.B3, 1)).toBe(before);
    expect(await jobsFor(saleId)).toStrictEqual([]);
    expect(await finishAudits(saleId)).toStrictEqual([]);
    // Scenario: A refused FINISH takes no number — the next success gets the next number.
    await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 6000 });
    const sale = await finish(KO_MIN, saleId, { expected_total_amount: 11000 });
    expect(sale.receipt_number).toBe(`B3-2026-OCT-${String(before + 1).padStart(5, '0')}`);
  });

  it('Scenario: Visit not completed — 422 visit_not_completed', async () => {
    const { saleId, visitId } = await start(KO_MIN, [services.HAIRCUT]);
    await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 });
    const error = await refusal(() => finish(KO_MIN, saleId, { expected_total_amount: 8000 }));
    expect([error.code, error.status]).toStrictEqual([ErrorCode.VISIT_NOT_COMPLETED, 422]);
    await complete(KO_MIN, visitId);
    expect((await finish(KO_MIN, saleId, { expected_total_amount: 8000 })).status).toBe(
      SaleStatus.FINISHED,
    );
  });

  it('Scenario: Cash excess after a line was removed — 422 with remaining 0; void and re-pay, then 200', async () => {
    const { saleId, visitId } = await start(KO_MIN, [services.HAIRCUT, services.SHAVE]);
    const paid = await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 11000 });
    const shave = paid.sale.items.find((item) => item.service_id === services.SHAVE);
    await as(KO_MIN, () =>
      lines.remove(KO_MIN.viewer.actor, saleId, shave?.id ?? '', 'Customer changed his mind'),
    );
    await complete(KO_MIN, visitId);
    const error = await refusal(() => finish(KO_MIN, saleId, { expected_total_amount: 8000 }));
    expect([error.code, error.options.context]).toStrictEqual([
      ErrorCode.AMOUNT_MISMATCH,
      { remaining_amount: 0 },
    ]);
    await as(KO_MIN, () =>
      payments.void(KO_MIN.viewer, paid.sale.payments[0]?.id ?? '', 'Take 8,000 instead'),
    );
    await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 });
    expect((await finish(KO_MIN, saleId, { expected_total_amount: 8000 })).status).toBe(
      SaleStatus.FINISHED,
    );
  });

  it('Scenario: Excess exactly equal to the non-cash payments — 200 and a change return of 2,000', async () => {
    const { saleId, visitId } = await start(KO_MIN, [services.HAIRCUT]);
    await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 });
    await pay(KO_MIN, saleId, {
      payment_method_id: kbzpay,
      amount: 2000,
      external_reference: 'KBZ0001234569',
    });
    await complete(KO_MIN, visitId);
    const sale = await finish(KO_MIN, saleId, { expected_total_amount: 8000 });
    expect(sale.status).toBe(SaleStatus.FINISHED);
    expect(sale.total_amount).toBe(8000);
    expect(sale.refunds).toMatchObject([
      {
        kind: RefundKind.OVERPAYMENT_RETURN,
        amount: 2000,
        refund_receipt_number: 'B3-RF-2026-OCT-00001',
        refunded_at: '2026-10-05T10:42:00+06:30',
        automatic_change: true,
      },
    ]);
    const row = await prisma.refunds.findFirstOrThrow({ where: { sale_id: saleId } });
    expect([row.payment_method_id, row.reason, row.refunded_by_user_id]).toStrictEqual([
      cash,
      'Change returned for over-transfer',
      users.E005,
    ]);
    expect(row.client_request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect((await jobsFor(saleId)).sort()).toStrictEqual(['sales']);
    expect(await jobsFor(row.id)).toStrictEqual(['refunds']);
    // Scenario: FINISH repeated — still one refund row.
    await finish(KO_MIN, saleId, { expected_total_amount: 8000 });
    expect(await prisma.refunds.count({ where: { sale_id: saleId } })).toBe(1);
  });

  it('Scenario: Exact payment by KBZPay — no refund row, the RF counter unchanged', async () => {
    const { saleId, visitId } = await start(KO_MIN, [services.HAIRCUT]);
    await pay(KO_MIN, saleId, {
      payment_method_id: kbzpay,
      amount: 8000,
      external_reference: 'KBZ0001234570',
    });
    await complete(KO_MIN, visitId);
    const before = await counter(branches.B3, 2);
    await finish(KO_MIN, saleId, { expected_total_amount: 8000 });
    expect(await prisma.refunds.count({ where: { sale_id: saleId } })).toBe(0);
    expect(await counter(branches.B3, 2)).toBe(before);
  });
});

describe('FINISH refuses a total the screen did not show (P4.SAL.10)', () => {
  it('Scenario: A line was added on another device — 409 total_changed 11,000; then 200', async () => {
    const { saleId, visitId } = await ready(KO_MIN, [services.HAIRCUT], 8000);
    await as(KO_MIN, () =>
      lines.add(
        KO_MIN.viewer.actor,
        saleId,
        saleItemCreateSchema.parse({
          line_type: 1,
          service_id: services.SHAVE,
          added_reason: 'Customer asked for a shave at the counter',
        }),
      ),
    );
    const error = await refusal(() => finish(KO_MIN, saleId, { expected_total_amount: 8000 }));
    expect([error.code, error.status, error.options.context]).toStrictEqual([
      ErrorCode.TOTAL_CHANGED,
      409,
      { total_amount: 11000 },
    ]);
    expect((await prisma.sales.findUniqueOrThrow({ where: { id: saleId } })).status).toBe(
      SaleStatus.OPEN,
    );
    await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 3000 });
    expect((await finish(KO_MIN, saleId, { expected_total_amount: 11000 })).total_amount).toBe(
      11000,
    );
    expect(visitId).toBeTruthy();
  });

  it('Scenario: Field missing — the request schema refuses {} on expected_total_amount', () => {
    expect(finishRequestSchema.safeParse({}).error?.issues.map((i) => i.path)).toStrictEqual([
      ['expected_total_amount'],
    ]);
  });
});

describe('FINISH is idempotent by state (P4-RULE-22)', () => {
  it('Scenario: Double tap on Finish — both 200 with one receipt number', async () => {
    const { saleId } = await ready(KO_MIN, [services.HAIRCUT], 8000);
    const before = await counter(branches.B3, 1);
    const [a, b] = await Promise.all([
      finish(KO_MIN, saleId, { expected_total_amount: 8000 }),
      finish(KO_MIN, saleId, { expected_total_amount: 8000 }),
    ]);
    expect(a.receipt_number).toBe(b.receipt_number);
    expect(await counter(branches.B3, 1)).toBe(before + 1);
    expect(await finishAudits(saleId)).toHaveLength(1);
  });

  it('Scenario: FINISH on a cancelled sale — 409 invalid_transition, status 0', async () => {
    const { saleId, visitId } = await start(KO_MIN, []);
    await as(KO_MIN, () => visits.incomplete(KO_MIN.viewer, visitId, 'Started by mistake'));
    const error = await refusal(() => finish(KO_MIN, saleId, { expected_total_amount: 0 }));
    expect([error.code, error.status, error.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
      { status: SaleStatus.CANCELLED },
    ]);
  });
});

describe('FINISH finds or creates the customer by phone (P3-RULE-01)', () => {
  it('Scenario: Returning customer attached — Ma Su, no new row', async () => {
    const { saleId } = await ready(KO_AUNG, [services.HAIRCUT], 10000);
    const before = await prisma.customers.count();
    const sale = await finish(KO_AUNG, saleId, {
      expected_total_amount: 10000,
      customer: { phone: '09 7712 3456' },
    });
    expect(sale.customer).toStrictEqual({
      id: FIXTURE_IDS.customers.MA_SU,
      name: 'Ma Su',
      phone: '09 7712 3456',
    });
    expect(await prisma.customers.count()).toBe(before);
  });

  it('Scenario: New phone without a name — 400 naming customer.name, the sale stays OPEN, no number', async () => {
    const { saleId } = await ready(KO_AUNG, [services.HAIRCUT], 10000);
    const before = await counter(branches.B3, 1);
    const error = await refusal(() =>
      finish(KO_AUNG, saleId, {
        expected_total_amount: 10000,
        customer: { phone: '09 4500 1122' },
      }),
    );
    expect([error.code, error.options.errors?.[0]?.field]).toStrictEqual([
      ErrorCode.VALIDATION,
      'customer.name',
    ]);
    expect(await counter(branches.B3, 1)).toBe(before);
    // Scenario: New customer created — Ko Phyo, without customer.create.
    const sale = await finish(KO_AUNG, saleId, {
      expected_total_amount: 10000,
      customer: { phone: '09 4500 1122', name: 'Ko Phyo' },
    });
    expect(sale.customer).toMatchObject({ name: 'Ko Phyo', phone: '09 4500 1122' });
  });

  it('Scenario: Skip — finished with customer null', async () => {
    const { saleId } = await ready(KO_AUNG, [services.HAIRCUT], 10000);
    expect(
      (await finish(KO_AUNG, saleId, { expected_total_amount: 10000, customer: null })).customer,
    ).toBeNull();
  });

  it('Scenario: Archived customer returns — restored, warnings customer_restored', async () => {
    await prisma.customers.update({
      where: { id: FIXTURE_IDS.customers.MA_SU },
      data: { archived_at: new Date(), status: CustomerStatus.INACTIVE },
    });
    const { saleId } = await ready(KO_AUNG, [services.HAIRCUT], 10000);
    const sale = await finish(KO_AUNG, saleId, {
      expected_total_amount: 10000,
      customer: { phone: '09 7712 3456' },
    });
    expect(sale.warnings).toStrictEqual([{ code: 'customer_restored' }]);
  });
});

describe('Finish for an absent barber (sale.finish_override · P4-RULE-03 / 10)', () => {
  it('Scenarios: without override_reason → 400 reason_required; with it → finished_by Ma Hnin, reason audited', async () => {
    const { saleId } = await ready(KO_AUNG, [services.HAIRCUT], 10000);
    const error = await refusal(() => finish(MA_HNIN, saleId, { expected_total_amount: 10000 }));
    expect([error.code, error.status]).toStrictEqual([ErrorCode.REASON_REQUIRED, 400]);
    expect((await prisma.sales.findUniqueOrThrow({ where: { id: saleId } })).status).toBe(
      SaleStatus.OPEN,
    );
    const sale = await finish(MA_HNIN, saleId, {
      expected_total_amount: 10000,
      override_reason: 'Ko Aung went home',
    });
    expect(sale.finished_by?.user_id).toBe(users.E002);
    expect(sale.items[0]?.performed_by?.id).toBe(employees.E004);
    expect(await finishAudits(saleId)).toStrictEqual([
      { actor_user_id: users.E002, reason: 'Ko Aung went home' },
    ]);
  });
});

describe('Receipt numbers are gapless (D-PAY-06 · design D6)', () => {
  it('Scenario: Twenty sales finished at the same instant — B1-2026-OCT-00001 … 00020', async () => {
    // All twenty are started first: a COMPLETED unpaid visit would block the next START.
    const started: { saleId: string; visitId: string }[] = [];
    for (let i = 0; i < 20; i += 1) started.push(await start(KO_HTET, [services.HAIRCUT]));
    for (const { saleId, visitId } of started) {
      await pay(KO_HTET, saleId, { payment_method_id: cash, amount: 6000 });
      await complete(KO_HTET, visitId);
    }
    const twenty = started.map(({ saleId }) => saleId);
    const sales = await Promise.all(
      twenty.map((saleId) => finish(KO_HTET, saleId, { expected_total_amount: 6000 })),
    );
    expect(sales.map((sale) => sale.receipt_number).sort()).toStrictEqual(
      Array.from({ length: 20 }, (_, i) => `B1-2026-OCT-${String(i + 1).padStart(5, '0')}`),
    );
    expect(await counter(branches.B1, 1)).toBe(20);
  }, 60_000);
});

describe('The day lock gates FINISH (P7-RULE-02) — last, it closes B3 today', () => {
  it('Scenario: FINISH on a closed day — 422 day_closed; a FINISHED sale still answers 200', async () => {
    const { saleId } = await ready(KO_MIN, [services.HAIRCUT], 8000);
    const finished = await prisma.sales.findFirstOrThrow({
      where: { branch_id: branches.B3, status: SaleStatus.FINISHED },
      orderBy: { receipt_seq: 'asc' },
    });
    await prisma.daily_closings.create({
      data: {
        id: randomUUID(),
        branch_id: branches.B3,
        business_date: new Date('2026-10-05T00:00:00Z'),
        status: DailyClosingStatus.CLOSED,
        counted_cash_amount: 0n,
        closed_at: new Date('2026-10-05T21:05:00+06:30'),
        closed_by_user_id: users.E002,
      },
    });
    const before = await counter(branches.B3, 1);
    const error = await refusal(() => finish(KO_MIN, saleId, { expected_total_amount: 8000 }));
    expect([error.code, error.status]).toStrictEqual([ErrorCode.DAY_CLOSED, 422]);
    expect(await counter(branches.B3, 1)).toBe(before);
    // Scenario: Repeat after the day was closed — the current sale, not day_closed.
    const again = await finish(KO_AUNG, finished.id, { expected_total_amount: 10000 });
    expect(again.receipt_number).toBe('B3-2026-OCT-00001');
  });
});
