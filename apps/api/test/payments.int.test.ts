import { randomUUID } from 'node:crypto';

import {
  DailyClosingStatus,
  EmployeeStatus,
  ErrorCode,
  PaymentMethodKind,
  SaleStatus,
  paymentCreateSchema,
  paymentMethodSchema,
  saleSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { Visits } from '../src/modules/delivery/index.js';
import { Payments } from '../src/modules/sales/index.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type FixturePerson, KO_AUNG, KO_MIN, as } from './helpers/walkin.js';

// add-walkin-visit-checkout tasks 7.1 – 7.9 (service part) — the payments spec on the fixture data
// (P4.PAY.02 / .03 · P4.PMT.01 · P4-RULE-09 · D-PAY-01 / 02 / 05 · design D4 / D7): CASH and KBZPAY with
// the fixture pattern ^KBZ[0-9]{10}$. Today is 05/Oct/2026, the clock at 10:41 AM MMT. The endpoints,
// the Idempotency-Key header and the guards come with the controllers.
const { branches, services, employees, users } = FIXTURE_IDS;

let s: SeededApp;
let prisma: PrismaService;
let visits: Visits;
let payments: Payments;
let cash: string;
let kbzpay: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:41:00+06:30'));
  prisma = s.app.get(PrismaService);
  visits = s.app.get(Visits);
  payments = s.app.get(Payments);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
});
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

/** A walk-in of `who` at B3 with these services; its sale id and visit id. */
async function walkIn(who: FixturePerson, items: string[]) {
  const { visit } = await as(who, () =>
    visits.start(
      who.viewer,
      who.scope,
      { branch_id: branches.B3, items: items.map((service_id) => ({ service_id })) },
      randomUUID(),
    ),
  );
  return { saleId: visit.sale.id, visitId: visit.id };
}

const pay = (
  who: FixturePerson,
  saleId: string,
  body: Record<string, unknown>,
  key: string = randomUUID(),
) =>
  as(who, () => payments.add(who.viewer, saleId, paymentCreateSchema.parse(body), key)).then(
    (result) => ({ ...result, sale: saleSchema.parse(result.sale) }),
  );
const voidPayment = (who: FixturePerson, paymentId: string, reason: string) =>
  as(who, () => payments.void(who.viewer, paymentId, reason));

describe('Checkout offers the active payment methods, Cash first (P4.PMT.01)', () => {
  it('Scenario: The two system methods at checkout — CASH then KBZPAY', async () => {
    const { items } = await payments.activeMethods();
    expect(items.map((item) => paymentMethodSchema.parse(item))).toStrictEqual(items);
    expect(items.map((item) => [item.code, item.is_system, item.kind])).toStrictEqual([
      ['CASH', true, PaymentMethodKind.CASH],
      ['KBZPAY', true, PaymentMethodKind.MOBILE_WALLET],
    ]);
    expect(items[1]?.reference_regex).toBe('^KBZ[0-9]{10}$');
  });

  it('Scenarios: a third active method comes after KBZPay; an inactive one is not offered', async () => {
    const company = await prisma.companies.findFirstOrThrow();
    for (const [code, status] of [
      ['WAVE', 1],
      ['OLD', 0],
    ] as const) {
      await prisma.payment_methods.create({
        data: {
          id: randomUUID(),
          company_id: company.id,
          code,
          name_mm: code,
          kind: PaymentMethodKind.MOBILE_WALLET,
          sort_order: 3,
          status,
        },
      });
    }
    const { items } = await payments.activeMethods();
    expect(items.map((item) => [item.code, item.is_system])).toStrictEqual([
      ['CASH', true],
      ['KBZPAY', true],
      ['WAVE', false],
    ]);
  });
});

describe('Payments are added to an OPEN sale until nothing remains (P4.PAY.02)', () => {
  it('Scenario: One tap, full cash — 10,000 at 10:41 AM, remaining 0', async () => {
    const { saleId } = await walkIn(KO_AUNG, [services.HAIRCUT]);
    const { sale, replayed } = await pay(KO_AUNG, saleId, {
      payment_method_id: cash,
      amount: 10000,
    });
    expect(replayed).toBe(false);
    expect(sale.payments[0]).toMatchObject({
      amount: 10000,
      received_at: '2026-10-05T10:41:00+06:30',
      payment_method: { code: 'CASH' },
      recorded_by: { user_id: users.E004 },
      collected_by: { id: employees.E004 },
    });
    expect([sale.paid_amount, sale.remaining_amount]).toStrictEqual([10000, 0]);
  });

  it('Scenario: Split Cash + KBZPay — 11,000 = 5,000 + 6,000', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT, services.SHAVE]);
    const first = await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 5000 });
    expect(first.sale.remaining_amount).toBe(6000);
    const second = await pay(KO_MIN, saleId, {
      payment_method_id: kbzpay,
      amount: 6000,
      external_reference: 'KBZ0001234567',
    });
    expect([
      second.sale.paid_amount,
      second.sale.remaining_amount,
      second.sale.change_due_amount,
    ]).toStrictEqual([11000, 0, 0]);
    expect(
      second.sale.payments.find((payment) => payment.payment_method.code === 'KBZPAY')
        ?.external_reference,
    ).toBe('KBZ0001234567');
  });

  it('Scenario: Amount zero — refused by the request schema (400 validation on amount)', () => {
    const result = paymentCreateSchema.safeParse({ payment_method_id: cash, amount: 0 });
    expect(result.error?.issues.map((issue) => issue.path)).toStrictEqual([['amount']]);
  });

  it('an inactive method — 422 method_inactive, no row', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const old = await prisma.payment_methods.findFirstOrThrow({ where: { code: 'OLD' } });
    const error = await refusal(() =>
      pay(KO_MIN, saleId, { payment_method_id: old.id, amount: 1000 }),
    );
    expect([error.code, error.status]).toStrictEqual([ErrorCode.METHOD_INACTIVE, 422]);
    expect(await prisma.payments.count({ where: { sale_id: saleId } })).toBe(0);
  });
});

describe('A cash payment never exceeds the remaining amount (P4-RULE-09)', () => {
  it('Scenario: Exactly the remaining amount — 8,000 on 8,000', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    expect(
      (await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 })).sale.remaining_amount,
    ).toBe(0);
  });

  it('Scenario: One kyat more than the remaining amount — 8,001 → 422 amount_exceeds_remaining', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const error = await refusal(() =>
      pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8001 }),
    );
    expect([error.code, error.status]).toStrictEqual([ErrorCode.AMOUNT_EXCEEDS_REMAINING, 422]);
    expect(await prisma.payments.count({ where: { sale_id: saleId } })).toBe(0);
  });

  it('two Cash 5,000 at once on 8,000 — one row; the other 422 amount_exceeds_remaining (review of #26)', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    // Two devices: the cap is checked under the sale lock, so the second sees remaining 3,000.
    const both = await Promise.allSettled([
      pay(KO_MIN, saleId, { payment_method_id: cash, amount: 5000 }),
      pay(KO_MIN, saleId, { payment_method_id: cash, amount: 5000 }),
    ]);
    expect(both.map((result) => result.status).sort()).toStrictEqual(['fulfilled', 'rejected']);
    const refused = both.find((result) => result.status === 'rejected');
    expect(refused?.reason).toBeInstanceOf(ProblemException);
    expect((refused?.reason as ProblemException).code).toBe(ErrorCode.AMOUNT_EXCEEDS_REMAINING);
    expect(await prisma.payments.count({ where: { sale_id: saleId } })).toBe(1);
    expect((await prisma.payments.findFirstOrThrow({ where: { sale_id: saleId } })).amount).toBe(
      5000n,
    );
  });
});

describe('KBZPay needs a reference in the method format (D-PAY-02)', () => {
  it('Scenarios: reference missing or blank → reference_required; KBZ123 → reference_format', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    for (const external_reference of [undefined, '   ']) {
      const error = await refusal(() =>
        pay(KO_MIN, saleId, { payment_method_id: kbzpay, amount: 6000, external_reference }),
      );
      expect([error.code, error.status]).toStrictEqual([ErrorCode.REFERENCE_REQUIRED, 422]);
    }
    const format = await refusal(() =>
      pay(KO_MIN, saleId, {
        payment_method_id: kbzpay,
        amount: 6000,
        external_reference: 'KBZ123',
      }),
    );
    expect([format.code, format.status]).toStrictEqual([ErrorCode.REFERENCE_FORMAT, 422]);
  });

  it('Scenario: Spaces around the reference — stored trimmed', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const { sale } = await pay(KO_MIN, saleId, {
      payment_method_id: kbzpay,
      amount: 8000,
      external_reference: ' KBZ0001234570 ',
    });
    expect(sale.payments[0]?.external_reference).toBe('KBZ0001234570');
  });

  it('Scenario: No pattern set — KBZ123 is accepted', async () => {
    await prisma.payment_methods.update({ where: { id: kbzpay }, data: { reference_regex: null } });
    try {
      const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
      const { sale } = await pay(KO_MIN, saleId, {
        payment_method_id: kbzpay,
        amount: 8000,
        external_reference: 'KBZ123',
      });
      expect(sale.payments[0]?.external_reference).toBe('KBZ123');
    } finally {
      // Restored even when an assertion fails, so the reference tests after it keep the pattern.
      await prisma.payment_methods.update({
        where: { id: kbzpay },
        data: { reference_regex: '^KBZ[0-9]{10}$' },
      });
    }
  });

  it('Myanmar digits in a reference are read as 0–9 — stored KBZ0001234575 (AD-FMT-10)', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const { sale } = await pay(KO_MIN, saleId, {
      payment_method_id: kbzpay,
      amount: 8000,
      external_reference: 'KBZ၀၀၀၁၂၃၄၅၇၅',
    });
    expect(sale.payments[0]?.external_reference).toBe('KBZ0001234575');
  });
});

describe('A reference is used only once per payment method (D-PAY-02 · API-IDEM-05)', () => {
  it('a holder still OPEN → 409 duplicate_reference with receipt_number null', async () => {
    const one = await walkIn(KO_MIN, [services.HAIRCUT]);
    await pay(KO_MIN, one.saleId, {
      payment_method_id: kbzpay,
      amount: 8000,
      external_reference: 'KBZ0001234580',
    });
    const two = await walkIn(KO_MIN, [services.HAIRCUT]);
    const error = await refusal(() =>
      pay(KO_MIN, two.saleId, {
        payment_method_id: kbzpay,
        amount: 8000,
        external_reference: 'KBZ0001234580',
      }),
    );
    expect([error.code, error.status, error.options.context]).toStrictEqual([
      ErrorCode.DUPLICATE_REFERENCE,
      409,
      { receipt_number: null },
    ]);
  });

  it('the same reference typed in Myanmar digits → 409 duplicate_reference (AD-FMT-10)', async () => {
    const one = await walkIn(KO_MIN, [services.HAIRCUT]);
    await pay(KO_MIN, one.saleId, {
      payment_method_id: kbzpay,
      amount: 8000,
      external_reference: 'KBZ0001234585',
    });
    const two = await walkIn(KO_MIN, [services.HAIRCUT]);
    const error = await refusal(() =>
      pay(KO_MIN, two.saleId, {
        payment_method_id: kbzpay,
        amount: 8000,
        external_reference: 'KBZ၀၀၀1234585',
      }),
    );
    expect([error.code, error.status]).toStrictEqual([ErrorCode.DUPLICATE_REFERENCE, 409]);
  });

  it('Scenario: Reference already on a finished sale — the holder receipt number', async () => {
    const one = await walkIn(KO_AUNG, [services.HAIRCUT]);
    await pay(KO_AUNG, one.saleId, {
      payment_method_id: kbzpay,
      amount: 10000,
      external_reference: 'KBZ0001234600',
    });
    // FINISH is group 8; the holder is finished by hand here.
    await prisma.sales.update({
      where: { id: one.saleId },
      data: {
        status: SaleStatus.FINISHED,
        receipt_number: 'B3-2026-OCT-00002',
        receipt_year: 2026,
        receipt_month: 10,
        receipt_seq: 2,
        finished_at: new Date('2026-10-05T10:41:00+06:30'),
        finished_by_user_id: users.E004,
        business_date: new Date('2026-10-05T00:00:00Z'),
      },
    });
    const two = await walkIn(KO_AUNG, [services.HAIRCUT]);
    const error = await refusal(() =>
      pay(KO_AUNG, two.saleId, {
        payment_method_id: kbzpay,
        amount: 10000,
        external_reference: 'KBZ0001234600',
      }),
    );
    expect([error.code, error.options.context]).toStrictEqual([
      ErrorCode.DUPLICATE_REFERENCE,
      { receipt_number: 'B3-2026-OCT-00002' },
    ]);
  });

  it('Scenario: A voided payment frees its reference', async () => {
    const one = await walkIn(KO_MIN, [services.HAIRCUT]);
    const { sale } = await pay(KO_MIN, one.saleId, {
      payment_method_id: kbzpay,
      amount: 8000,
      external_reference: 'KBZ0001234569',
    });
    await voidPayment(KO_MIN, sale.payments[0]?.id ?? '', 'Wrong reference');
    const two = await walkIn(KO_MIN, [services.HAIRCUT]);
    const again = await pay(KO_MIN, two.saleId, {
      payment_method_id: kbzpay,
      amount: 8000,
      external_reference: 'KBZ0001234569',
    });
    expect(again.replayed).toBe(false);
  });

  it('Scenario: Same reference at the same moment — exactly one 201, the other 409 with null', async () => {
    const one = await walkIn(KO_MIN, [services.HAIRCUT]);
    const two = await walkIn(KO_MIN, [services.HAIRCUT]);
    const results = await Promise.allSettled(
      [one.saleId, two.saleId].map((saleId) =>
        pay(KO_MIN, saleId, {
          payment_method_id: kbzpay,
          amount: 8000,
          external_reference: 'KBZ0001234590',
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    const reason = (rejected as PromiseRejectedResult).reason as ProblemException;
    expect([reason.code, reason.options.context]).toStrictEqual([
      ErrorCode.DUPLICATE_REFERENCE,
      { receipt_number: null },
    ]);
  });
});

describe('A non-cash over-transfer shows the change (D-PAY-05 · owner B5)', () => {
  it('Scenario: KBZPay 10,000 for a haircut of 8,000 — change 2,000', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const { sale } = await pay(KO_MIN, saleId, {
      payment_method_id: kbzpay,
      amount: 10000,
      external_reference: 'KBZ0001234568',
    });
    expect([sale.paid_amount, sale.remaining_amount, sale.change_due_amount]).toStrictEqual([
      10000, 0, 2000,
    ]);
  });
});

describe('Payment add is idempotent (API-IDEM-01 / 02 · design D7)', () => {
  it('Scenario: Double tap on Cash — one payment, paid 8,000 not 16,000', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const key = randomUUID();
    await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 }, key);
    const again = await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 }, key);
    expect(again.replayed).toBe(true);
    expect(again.sale.paid_amount).toBe(8000);
    expect(await prisma.payments.count({ where: { sale_id: saleId } })).toBe(1);
    expect(
      await prisma.audit_events.count({ where: { entity_id: saleId, action: 'payment.add' } }),
    ).toBe(1);
  });

  it('Scenario: Same key, different amount — 422 idempotency_mismatch', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const key = randomUUID();
    await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 6000 }, key);
    const error = await refusal(() =>
      pay(KO_MIN, saleId, { payment_method_id: cash, amount: 5000 }, key),
    );
    expect([error.code, error.status]).toStrictEqual([ErrorCode.IDEMPOTENCY_MISMATCH, 422]);
  });

  it('Scenario: Second request while the first is still running — 409 idempotency_in_progress', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const key = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`idem:${key}`}, 0))`;
      const error = await refusal(() =>
        pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 }, key),
      );
      expect([error.code, error.status]).toStrictEqual([ErrorCode.IDEMPOTENCY_IN_PROGRESS, 409]);
    });
    expect(await prisma.payments.count({ where: { sale_id: saleId } })).toBe(0);
  });

  it('the request lookup finds the payment for its recorder only (P4.REQ.01)', async () => {
    const { saleId, visitId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const key = randomUUID();
    const { sale } = await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 }, key);
    expect(await payments.createdBy(users.E005, key)).toStrictEqual({
      id: sale.payments[0]?.id,
      sale_id: saleId,
      visit_id: visitId,
    });
    expect(await payments.createdBy(users.E004, key)).toBeNull();
    expect(await visits.lookupRequest(users.E005, key)).toStrictEqual({
      client_request_id: key,
      resource_type: 'payment',
      id: sale.payments[0]?.id,
      sale_id: saleId,
      visit_id: visitId,
    });
  });

  it('Scenarios: START was saved and the reply was lost, a key of another user, nothing saved (P4.REQ.01)', async () => {
    const key = randomUUID();
    const { visit } = await as(KO_MIN, () =>
      visits.start(KO_MIN.viewer, KO_MIN.scope, { branch_id: branches.B3 }, key),
    );
    expect(await visits.lookupRequest(users.E005, key)).toStrictEqual({
      client_request_id: key,
      resource_type: 'visit',
      id: visit.id,
      sale_id: visit.sale.id,
      visit_id: null,
    });
    expect(await visits.lookupRequest(users.E004, key)).toBeNull();
    expect(await visits.lookupRequest(users.E005, randomUUID())).toBeNull();
  });
});

describe('"Collected by" defaults to the performer (D-VIS-06)', () => {
  it('Scenarios: default collector; a B3 colleague accepted; Ko Htet (B1) → 422 not_assigned_to_branch', async () => {
    const { saleId } = await walkIn(KO_AUNG, [services.HAIRCUT, services.SHAVE]);
    const own = await pay(KO_AUNG, saleId, { payment_method_id: cash, amount: 5000 });
    expect(own.sale.payments[0]?.collected_by.id).toBe(employees.E004);
    const colleague = await pay(KO_AUNG, saleId, {
      payment_method_id: cash,
      amount: 3000,
      collected_by_employee_id: employees.E005,
    });
    // The clock is fixed, so both payments share created_at: find the second by its amount.
    expect(
      colleague.sale.payments.find((payment) => payment.amount === 3000)?.collected_by.id,
    ).toBe(employees.E005);
    const error = await refusal(() =>
      pay(KO_AUNG, saleId, {
        payment_method_id: cash,
        amount: 1000,
        collected_by_employee_id: employees.E006,
      }),
    );
    expect([error.code, error.status]).toStrictEqual([ErrorCode.NOT_ASSIGNED_TO_BRANCH, 422]);
  });

  it('a B3 colleague who is INACTIVE → 422 not_assigned_to_branch, no row (review of #26)', async () => {
    const { saleId } = await walkIn(KO_AUNG, [services.HAIRCUT]);
    // Ko Min keeps his B3 assignment; only his status changes.
    await prisma.employees.update({
      where: { id: employees.E005 },
      data: { status: EmployeeStatus.INACTIVE },
    });
    try {
      const error = await refusal(() =>
        pay(KO_AUNG, saleId, {
          payment_method_id: cash,
          amount: 10000,
          collected_by_employee_id: employees.E005,
        }),
      );
      expect([error.code, error.status]).toStrictEqual([ErrorCode.NOT_ASSIGNED_TO_BRANCH, 422]);
      expect(await prisma.payments.count({ where: { sale_id: saleId } })).toBe(0);
    } finally {
      await prisma.employees.update({
        where: { id: employees.E005 },
        data: { status: EmployeeStatus.ACTIVE },
      });
    }
  });
});

describe('A wrong payment is voided, never deleted (P4.PAY.03)', () => {
  it('Scenario: Wrong method recorded — row kept, paid 0, remaining 8,000; a repeat writes nothing', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const { sale } = await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 });
    const paymentId = sale.payments[0]?.id ?? '';
    const after = saleSchema.parse(
      await voidPayment(KO_MIN, paymentId, 'Customer pays by KBZPay instead'),
    );
    expect(after.payments[0]).toMatchObject({
      voided_by: { user_id: users.E005 },
      void_reason: 'Customer pays by KBZPay instead',
    });
    expect(after.payments[0]?.voided_at).not.toBeNull();
    expect([after.paid_amount, after.remaining_amount]).toStrictEqual([0, 8000]);
    await voidPayment(KO_MIN, paymentId, 'Customer pays by KBZPay instead');
    expect(
      await prisma.audit_events.count({ where: { entity_id: saleId, action: 'payment.void' } }),
    ).toBe(1);
  });

  it('Scenario: Void without a reason — 400 reason_required, the payment still counts', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const { sale } = await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 8000 });
    const error = await refusal(() => voidPayment(KO_MIN, sale.payments[0]?.id ?? '', ''));
    expect([error.code, error.status]).toStrictEqual([ErrorCode.REASON_REQUIRED, 400]);
  });

  it('Scenario: Void, then incomplete — INCOMPLETE answers 200 (task 7.8)', async () => {
    const { saleId, visitId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const { sale } = await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 5000 });
    const blocked = await refusal(() =>
      as(KO_MIN, () => visits.incomplete(KO_MIN.viewer, visitId, 'Customer left')),
    );
    expect(blocked.code).toBe(ErrorCode.PAYMENTS_EXIST);
    await voidPayment(KO_MIN, sale.payments[0]?.id ?? '', 'Customer left');
    const visit = await as(KO_MIN, () =>
      visits.incomplete(KO_MIN.viewer, visitId, 'Customer left'),
    );
    expect(visit.status).toBe(0);
  });

  it('a payment on a CANCELLED sale — 409 invalid_transition with status 0 and no path', async () => {
    const { saleId, visitId } = await walkIn(KO_MIN, []);
    await as(KO_MIN, () => visits.incomplete(KO_MIN.viewer, visitId, 'Started by mistake'));
    const error = await refusal(() => pay(KO_MIN, saleId, { payment_method_id: cash, amount: 1 }));
    expect([error.code, error.status, error.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
      { status: SaleStatus.CANCELLED },
    ]);
  });
});

describe('The day lock gates payment add and void (P7-RULE-02) — last, it closes B3 today', () => {
  it('add and void on a closed day — 422 day_closed', async () => {
    const { saleId } = await walkIn(KO_MIN, [services.HAIRCUT]);
    const { sale } = await pay(KO_MIN, saleId, { payment_method_id: cash, amount: 5000 });
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
    const add = await refusal(() => pay(KO_MIN, saleId, { payment_method_id: cash, amount: 1000 }));
    expect([add.code, add.status]).toStrictEqual([ErrorCode.DAY_CLOSED, 422]);
    const remove = await refusal(() => voidPayment(KO_MIN, sale.payments[0]?.id ?? '', 'Wrong'));
    expect([remove.code, remove.status]).toStrictEqual([ErrorCode.DAY_CLOSED, 422]);
  });
});
