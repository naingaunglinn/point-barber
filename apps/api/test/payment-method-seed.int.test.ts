import { AuditSource, PaymentMethodKind, PaymentMethodStatus } from '@point/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { CodeTables } from '../src/modules/platform/index.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-walkin-visit-checkout tasks 1.5 / 1.6 — payments spec "Checkout offers the active payment
// methods, Cash first", scenario "A fresh database without fixtures" (P4-RULE-19 · D-PAY-01 ·
// D-PAY-02): the base seed — the steps of sync.code_tables — leaves exactly CASH and KBZPAY, and a
// second run adds nothing. No fixture module runs here.
let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;

beforeEach(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url });
  prisma = t.app.get(PrismaService);
});
afterEach(async () => {
  await t.close();
  await db.drop();
});

const methods = () =>
  prisma.payment_methods.findMany({
    orderBy: { sort_order: 'asc' },
    select: {
      code: true,
      name_mm: true,
      name_en: true,
      kind: true,
      is_cash: true,
      requires_reference: true,
      requires_verification: true,
      reference_regex: true,
      sort_order: true,
      status: true,
      archived_at: true,
    },
  });

describe('add-walkin-visit-checkout · payments · Checkout offers the active payment methods, Cash first', () => {
  it('Scenario: A fresh database without fixtures', async () => {
    await t.app.get(CodeTables).runAll();
    expect(await methods()).toStrictEqual([
      {
        code: 'CASH',
        name_mm: 'ငွေသား',
        name_en: 'Cash',
        kind: PaymentMethodKind.CASH,
        is_cash: true,
        requires_reference: false,
        requires_verification: false,
        reference_regex: null,
        sort_order: 1,
        status: PaymentMethodStatus.ACTIVE,
        archived_at: null,
      },
      {
        code: 'KBZPAY',
        name_mm: 'KBZPay',
        name_en: 'KBZPay',
        kind: PaymentMethodKind.MOBILE_WALLET,
        is_cash: false,
        requires_reference: true,
        requires_verification: true,
        reference_regex: null,
        sort_order: 2,
        status: PaymentMethodStatus.ACTIVE,
        archived_at: null,
      },
    ]);

    // A second run of the base seed leaves two rows.
    await t.app.get(CodeTables).runAll();
    expect(await prisma.payment_methods.count()).toBe(2);
  });

  it('writes one system audit row per created method, none on a second run', async () => {
    await t.app.get(CodeTables).runAll();
    await t.app.get(CodeTables).runAll();
    const rows = await prisma.audit_events.findMany({
      where: { action: 'payment_method.create' },
      orderBy: { id: 'asc' },
    });
    // The audit deny-list drops every key named `code` (the sign-in code — foundation design D12), so
    // the row names its method through entity_id.
    const codeOf = new Map(
      (await prisma.payment_methods.findMany()).map((method) => [method.id, method.code]),
    );
    // Both rows are written in one transaction, so neither the time nor the UUIDv7 id orders them:
    // compare by method code.
    const created = rows
      .map((row) => ({
        source: row.source,
        code: codeOf.get(row.entity_id ?? '') ?? '',
        kind: (row.after_data as { kind: number }).kind,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
    expect(created).toStrictEqual([
      { source: AuditSource.SYSTEM_JOB, code: 'CASH', kind: 1 },
      { source: AuditSource.SYSTEM_JOB, code: 'KBZPAY', kind: 2 },
    ]);
    expect(rows.every((row) => row.actor_user_id === null)).toBe(true);
  });

  it('never changes an existing row (the owner set the KBZPay pattern, renamed Cash)', async () => {
    await t.app.get(CodeTables).runAll();
    await prisma.payment_methods.update({
      where: {
        company_id_code: {
          company_id: (await prisma.companies.findFirstOrThrow()).id,
          code: 'KBZPAY',
        },
      },
      data: { reference_regex: '^KBZ[0-9]{10}$' },
    });
    await prisma.payment_methods.updateMany({
      where: { code: 'CASH' },
      data: { name_en: 'Cash in hand' },
    });
    await t.app.get(CodeTables).runAll();
    const rows = await methods();
    expect(rows.map((row) => [row.code, row.name_en, row.reference_regex])).toStrictEqual([
      ['CASH', 'Cash in hand', null],
      ['KBZPAY', 'KBZPay', '^KBZ[0-9]{10}$'],
    ]);
  });
});
