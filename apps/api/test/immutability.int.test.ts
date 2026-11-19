import { randomUUID } from 'node:crypto';

import type { ArgumentsHost } from '@nestjs/common';
import { ErrorCode, SaleStatus, saleItemCreateSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppConfig } from '../src/common/config/config.js';
import { sqlStateOf } from '../src/common/database/errors.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { ProblemFilter } from '../src/common/http/problem.filter.js';
import { RequestContext } from '../src/common/http/request-context.js';
import { ErrorReporter } from '../src/common/observability/error-reporter.js';
import { Visits } from '../src/modules/delivery/index.js';
import { Payments, SaleLines } from '../src/modules/sales/index.js';
import { checkout } from './helpers/checkout.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { KO_AUNG, KO_MIN, as } from './helpers/walkin.js';

// add-walkin-visit-checkout tasks 8.11 / 8.12 — sales-checkout spec "A finished or cancelled sale is
// immutable" (D-VIS-08 · D-DAT-05 · P4-RULE-01 · design D9): every direct write on a FINISHED or
// CANCELLED sale is 409 invalid_transition with its correction path, never 423; behind it the guard
// triggers of DB Part 4 refuse with SQLSTATE P0001 finished_immutable, which the one mapper answers 423
// locked. The raw SQL runs as the owner role, as a person or a script with database access would.
const { services, users } = FIXTURE_IDS;

let s: SeededApp;
let prisma: PrismaService;
let owner: PrismaService;
let lines: SaleLines;
let payments: Payments;
let walkin: ReturnType<typeof checkout>;
let cash: string;
let finished: { saleId: string; visitId: string; lineId: string; paymentId: string };
let cancelled: { saleId: string; visitId: string; lineId: string; paymentId: string };

async function refusal(work: () => Promise<unknown>): Promise<ProblemException> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ProblemException) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

async function sqlError(sql: string): Promise<{ state: string | null; error: unknown }> {
  try {
    await owner.$executeRawUnsafe(sql);
  } catch (error) {
    return { state: sqlStateOf(error), error };
  }
  return { state: null, error: null };
}

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'));
  prisma = s.app.get(PrismaService);
  owner = new PrismaService({ env: { DATABASE_URL: s.db.ownerUrl } } as AppConfig);
  lines = s.app.get(SaleLines);
  payments = s.app.get(Payments);
  walkin = checkout(s.app);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;

  // B3-2026-OCT-00001: Ko Aung, Haircut 10,000, Cash 10,000.
  const a = await walkin.start(KO_AUNG, [services.HAIRCUT]);
  const paid = await walkin.pay(KO_AUNG, a.saleId, { payment_method_id: cash, amount: 10000 });
  await walkin.complete(KO_AUNG, a.visitId);
  await walkin.finish(KO_AUNG, a.saleId, { expected_total_amount: 10000 });
  finished = {
    ...a,
    lineId: paid.sale.items[0]?.id ?? '',
    paymentId: paid.sale.payments[0]?.id ?? '',
  };
  // A visit marked incomplete: its sale is CANCELLED. Its Cash 8,000 was voided first (no live payment
  // may remain, P4.VIS.06), so the sale keeps a line and a voided payment.
  const b = await walkin.start(KO_MIN, [services.HAIRCUT]);
  const taken = await walkin.pay(KO_MIN, b.saleId, { payment_method_id: cash, amount: 8000 });
  const paymentId = taken.sale.payments[0]?.id ?? '';
  await as(KO_MIN, () => payments.void(KO_MIN.viewer, paymentId, 'Customer left'));
  await as(KO_MIN, () =>
    s.app.get(Visits).incomplete(KO_MIN.viewer, b.visitId, 'Started by mistake'),
  );
  cancelled = { ...b, lineId: taken.sale.items[0]?.id ?? '', paymentId };
}, 60_000);
afterAll(async () => {
  await owner.$disconnect();
  await s.close();
});

const shave = saleItemCreateSchema.parse({ line_type: 1, service_id: services.SHAVE });

describe('Direct writes on a FINISHED sale — 409 with the correction path (P4-RULE-01)', () => {
  it('Scenario: Add a line after FINISH — difference_sale; the total stays 10,000', async () => {
    const error = await refusal(() =>
      as(KO_AUNG, () => lines.add(KO_AUNG.viewer.actor, finished.saleId, shave)),
    );
    expect([error.code, error.status, error.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
      { status: SaleStatus.FINISHED, correction_path: 'difference_sale' },
    ]);
    expect(
      (await prisma.sales.findUniqueOrThrow({ where: { id: finished.saleId } })).total_amount,
    ).toBe(10000n);
  });

  it('Scenario: Remove a line after FINISH — refund', async () => {
    const error = await refusal(() =>
      as(KO_AUNG, () =>
        lines.remove(KO_AUNG.viewer.actor, finished.saleId, finished.lineId, 'Wrong service'),
      ),
    );
    expect(error.options.context).toStrictEqual({
      status: SaleStatus.FINISHED,
      correction_path: 'refund',
    });
  });

  it('Scenario: Void a payment after FINISH — refund', async () => {
    const error = await refusal(() =>
      as(KO_AUNG, () => payments.void(KO_AUNG.viewer, finished.paymentId, 'Wrong method')),
    );
    expect([error.code, error.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      { status: SaleStatus.FINISHED, correction_path: 'refund' },
    ]);
  });

  it('Scenario: Cash on a finished sale — no correction path, no row, paid stays 10,000', async () => {
    const error = await refusal(() =>
      walkin.pay(KO_AUNG, finished.saleId, { payment_method_id: cash, amount: 1000 }),
    );
    expect([error.code, error.status, error.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
      { status: SaleStatus.FINISHED },
    ]);
    expect(await prisma.payments.count({ where: { sale_id: finished.saleId } })).toBe(1);
  });
});

describe('Direct writes on a CANCELLED sale — 409 with status 0 and no path', () => {
  it('Scenarios: add a line, Cash — status 0 only, no row', async () => {
    const add = await refusal(() =>
      as(KO_MIN, () => lines.add(KO_MIN.viewer.actor, cancelled.saleId, shave)),
    );
    expect([add.code, add.status, add.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
      { status: SaleStatus.CANCELLED },
    ]);
    const pay = await refusal(() =>
      walkin.pay(KO_MIN, cancelled.saleId, { payment_method_id: cash, amount: 8000 }),
    );
    expect([pay.code, pay.status, pay.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
      { status: SaleStatus.CANCELLED },
    ]);
    // The voided Cash 8,000 only.
    expect(await prisma.payments.count({ where: { sale_id: cancelled.saleId } })).toBe(1);
  });

  it('remove a line, void a payment — status 0 only (review of #26)', async () => {
    const remove = await refusal(() =>
      as(KO_MIN, () =>
        lines.remove(KO_MIN.viewer.actor, cancelled.saleId, cancelled.lineId, 'Wrong service'),
      ),
    );
    expect([remove.code, remove.status, remove.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
      { status: SaleStatus.CANCELLED },
    ]);
    const voided = await refusal(() =>
      as(KO_MIN, () => payments.void(KO_MIN.viewer, cancelled.paymentId, 'Wrong method')),
    );
    expect([voided.code, voided.status, voided.options.context]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
      { status: SaleStatus.CANCELLED },
    ]);
    expect(
      (await prisma.sale_items.findUniqueOrThrow({ where: { id: cancelled.lineId } })).removed_at,
    ).toBeNull();
  });
});

describe('The second wall — the guard triggers (SQLSTATE P0001 finished_immutable)', () => {
  it('Scenario: Direct database update of a finished sale — refused, the total stays 10,000', async () => {
    const { state } = await sqlError(
      `UPDATE sales SET total_amount = 9000 WHERE id = '${finished.saleId}'`,
    );
    expect(state).toBe('P0001');
    expect(
      (await prisma.sales.findUniqueOrThrow({ where: { id: finished.saleId } })).total_amount,
    ).toBe(10000n);
  });

  it('a finished sale still takes customer_id and updated_at', async () => {
    const { state } = await sqlError(
      `UPDATE sales SET customer_id = '${FIXTURE_IDS.customers.MA_SU}', updated_at = now() WHERE id = '${finished.saleId}'`,
    );
    expect(state).toBeNull();
  });

  it('Scenario: Direct database delete of a payment of a finished sale — refused', async () => {
    expect((await sqlError(`DELETE FROM payments WHERE id = '${finished.paymentId}'`)).state).toBe(
      'P0001',
    );
  });

  it('a payment of a finished sale takes the verification and reference fields only', async () => {
    expect(
      (
        await sqlError(
          `UPDATE payments SET verified_at = now(), verified_by_user_id = '${users.E002}' WHERE id = '${finished.paymentId}'`,
        )
      ).state,
    ).toBeNull();
    expect(
      (await sqlError(`UPDATE payments SET amount = 1 WHERE id = '${finished.paymentId}'`)).state,
    ).toBe('P0001');
  });

  it('lines of a finished sale: INSERT, UPDATE and DELETE refused', async () => {
    expect(
      (
        await sqlError(`
          INSERT INTO sale_items (id, sale_id, sort_order, line_type, service_id, performed_by_employee_id,
            description_mm, quantity, list_price_amount, unit_price_amount)
          VALUES ('${randomUUID()}', '${finished.saleId}', 9, 1, '${services.SHAVE}',
            '${FIXTURE_IDS.employees.E004}', 'Shave', 1, 3000, 3000)`)
      ).state,
    ).toBe('P0001');
    expect(
      (
        await sqlError(
          `UPDATE sale_items SET description_en = 'Cut' WHERE id = '${finished.lineId}'`,
        )
      ).state,
    ).toBe('P0001');
    expect((await sqlError(`DELETE FROM sale_items WHERE id = '${finished.lineId}'`)).state).toBe(
      'P0001',
    );
  });

  it('Scenario: Direct database insert of a line into a cancelled sale — refused', async () => {
    const { state } = await sqlError(`
      INSERT INTO sale_items (id, sale_id, sort_order, line_type, service_id, performed_by_employee_id,
        description_mm, quantity, list_price_amount, unit_price_amount)
      VALUES ('${randomUUID()}', '${cancelled.saleId}', 9, 1, '${services.SHAVE}',
        '${FIXTURE_IDS.employees.E005}', 'Shave', 1, 3000, 3000)`);
    expect(state).toBe('P0001');
  });

  it('a cancelled sale: its UPDATE and the UPDATE and DELETE of its lines refused (review of #26)', async () => {
    expect(
      (await sqlError(`UPDATE sales SET total_amount = 1 WHERE id = '${cancelled.saleId}'`)).state,
    ).toBe('P0001');
    expect(
      (
        await sqlError(
          `UPDATE sale_items SET description_en = 'Cut' WHERE id = '${cancelled.lineId}'`,
        )
      ).state,
    ).toBe('P0001');
    expect((await sqlError(`DELETE FROM sale_items WHERE id = '${cancelled.lineId}'`)).state).toBe(
      'P0001',
    );
  });

  it('a FINISHED or INCOMPLETE visit takes updated_at only', async () => {
    expect(
      (await sqlError(`UPDATE visits SET updated_at = now() WHERE id = '${finished.visitId}'`))
        .state,
    ).toBeNull();
    for (const id of [finished.visitId, cancelled.visitId]) {
      expect(
        (await sqlError(`UPDATE visits SET home_address = 'x' WHERE id = '${id}'`)).state,
      ).toBe('P0001');
    }
  });

  it('the one mapper answers 423 locked for P0001 finished_immutable and logs it as an error', async () => {
    const { error } = await sqlError(
      `UPDATE sales SET total_amount = 9000 WHERE id = '${finished.saleId}'`,
    );
    const logged: unknown[] = [];
    const filter = new ProblemFilter(s.app.get(AppConfig), s.app.get(ErrorReporter), {
      error: (...args: unknown[]) => logged.push(args),
    } as never);
    const out: { status?: number; body?: Record<string, unknown> } = {};
    const res = {
      getHeader: () => undefined,
      setHeader: () => res,
      status(code: number) {
        out.status = code;
        return res;
      },
      type: () => res,
      send(text: string) {
        out.body = JSON.parse(text) as Record<string, unknown>;
        return res;
      },
    };
    const host = {
      switchToHttp: () => ({ getRequest: () => ({ method: 'POST' }), getResponse: () => res }),
    } as unknown as ArgumentsHost;
    RequestContext.run({ request_id: randomUUID() }, () => {
      filter.catch(error, host);
    });
    expect([out.status, out.body?.code]).toStrictEqual([423, ErrorCode.LOCKED]);
    expect(logged).toHaveLength(1);
  });
});
