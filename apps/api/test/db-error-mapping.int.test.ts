import { randomUUID } from 'node:crypto';

import type { ArgumentsHost } from '@nestjs/common';
import { ErrorCode, PaymentMethodKind } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppConfig } from '../src/common/config/config.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { LOGGER } from '../src/common/logging/logger.js';
import { ProblemFilter } from '../src/common/http/problem.filter.js';
import { RequestContext } from '../src/common/http/request-context.js';
import { createBranch, createPerson, testCompany } from './helpers/people.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-walkin-visit-checkout task 3.7 — the one constraint-error mapper (CG-DB-12 · API-IDEM-05 ·
// design D9), fed with the real errors of PostgreSQL 16 through Prisma: the partial unique index
// payments_reference_unique → 409 duplicate_reference { receipt_number: null } (the final guard
// behind the reference lock; the service answers with the number first), and the client_request_id
// indexes of visits, sales and payments → 409 idempotency_in_progress, so the client's retry replays.
let t: TestApp;
let prisma: PrismaService;
let filter: ProblemFilter;
let ids: { branch: string; employee: string; user: string; method: string; sale: string };

beforeAll(async () => {
  t = await startTestApp();
  prisma = t.app.get(PrismaService);
  filter = new ProblemFilter(t.app.get(AppConfig), t.app.get(LOGGER));
  const companyId = await testCompany(prisma);
  const branch = await createBranch(prisma, companyId);
  const person = await createPerson(prisma, companyId);
  const method = randomUUID();
  await prisma.payment_methods.create({
    data: {
      id: method,
      company_id: companyId,
      code: `T${method.slice(0, 8)}`,
      name_mm: `Test wallet ${method.slice(0, 8)}`,
      kind: PaymentMethodKind.MOBILE_WALLET,
      requires_reference: true,
      sort_order: 99,
    },
  });
  const sale = randomUUID();
  await prisma.sales.create({
    data: { id: sale, client_request_id: randomUUID(), branch_id: branch },
  });
  ids = { branch, employee: person.employeeId, user: person.userId, method, sale };
});
afterAll(() => t.close());

const payment = (reference: string | null, clientRequestId = randomUUID()) => ({
  id: randomUUID(),
  client_request_id: clientRequestId,
  sale_id: ids.sale,
  payment_method_id: ids.method,
  amount: 6000n,
  external_reference: reference,
  collected_by_employee_id: ids.employee,
  received_at: new Date('2026-10-05T10:41:00+06:30'),
  recorded_by_user_id: ids.user,
});

async function errorOf(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work();
  } catch (error) {
    return error;
  }
  throw new Error('expected the write to fail');
}

/** The status and body the filter sends for an error. */
function sent(error: unknown): { status?: number; body?: Record<string, unknown> } {
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
  return out;
}

describe('payments_reference_unique → 409 duplicate_reference (D-PAY-02 · P4-RULE-09)', () => {
  it('a second non-voided payment with the reference of the same method', async () => {
    await prisma.payments.create({ data: payment('KBZ0001234567') });
    const error = await errorOf(() => prisma.payments.create({ data: payment('KBZ0001234567') }));
    const { status, body } = sent(error);
    expect(status).toBe(409);
    expect(body?.code).toBe(ErrorCode.DUPLICATE_REFERENCE);
    expect(body?.context).toStrictEqual({ receipt_number: null });
  });

  it('the same refusal through a raw insert (SQLSTATE 23505 in a raw query)', async () => {
    await prisma.payments.create({ data: payment('KBZ0001234568') });
    const row = payment('KBZ0001234568');
    const error = await errorOf(
      () => prisma.$executeRaw`
        INSERT INTO payments (id, client_request_id, sale_id, payment_method_id, amount,
          external_reference, collected_by_employee_id, received_at, recorded_by_user_id)
        VALUES (${row.id}::uuid, ${row.client_request_id}::uuid, ${row.sale_id}::uuid,
          ${row.payment_method_id}::uuid, ${row.amount}, ${row.external_reference},
          ${row.collected_by_employee_id}::uuid, ${row.received_at}, ${row.recorded_by_user_id}::uuid)`,
    );
    expect(sent(error).body?.code).toBe(ErrorCode.DUPLICATE_REFERENCE);
  });
});

describe('client_request_id indexes → 409 idempotency_in_progress (API-IDEM-05 · design D7)', () => {
  it('payments_client_request_id_key', async () => {
    const key = randomUUID();
    await prisma.payments.create({ data: payment(null, key) });
    const error = await errorOf(() => prisma.payments.create({ data: payment(null, key) }));
    expect(sent(error)).toMatchObject({
      status: 409,
      body: { code: ErrorCode.IDEMPOTENCY_IN_PROGRESS },
    });
  });

  it('sales_client_request_id_key', async () => {
    const key = randomUUID();
    const sale = () =>
      prisma.sales.create({
        data: { id: randomUUID(), client_request_id: key, branch_id: ids.branch },
      });
    await sale();
    expect(sent(await errorOf(sale)).body?.code).toBe(ErrorCode.IDEMPOTENCY_IN_PROGRESS);
  });

  it('visits_client_request_id_key', async () => {
    const key = randomUUID();
    const visit = () =>
      prisma.visits.create({
        data: {
          id: randomUUID(),
          client_request_id: key,
          branch_id: ids.branch,
          performed_by_employee_id: ids.employee,
          started_by_user_id: ids.user,
          started_at: new Date('2026-10-05T10:05:00+06:30'),
          business_date: new Date('2026-10-05T00:00:00Z'),
        },
      });
    await visit();
    expect(sent(await errorOf(visit)).body?.code).toBe(ErrorCode.IDEMPOTENCY_IN_PROGRESS);
  });

  it('another unique index is still a 500 (a bug — the API refuses bad input first)', async () => {
    const method = await prisma.payment_methods.findUniqueOrThrow({ where: { id: ids.method } });
    const error = await errorOf(() =>
      prisma.payment_methods.create({
        data: {
          id: randomUUID(),
          company_id: method.company_id,
          code: method.code,
          name_mm: `Duplicate code ${randomUUID().slice(0, 8)}`,
          kind: PaymentMethodKind.CASH,
          sort_order: 98,
        },
      }),
    );
    expect(sent(error).status).toBe(500);
  });
});
