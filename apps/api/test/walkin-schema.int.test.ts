import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-walkin-visit-checkout task 1.1 — no migration: the baseline of add-repo-scaffold already holds
// every table this change writes or reads (design D3), and the guard and audit triggers of the money
// tables (P4-RULE-01 · D-AUD-02).
let t: TestApp;
let prisma: PrismaService;

beforeAll(async () => {
  t = await startTestApp();
  prisma = t.app.get(PrismaService);
});
afterAll(() => t.close());

const WRITTEN = [
  'visits',
  'sales',
  'sale_items',
  'payments',
  'receipt_counters',
  'refunds',
  'customers',
  'attachments',
  'audit_events',
  'payment_methods',
];
const READ = [
  'branches',
  'employees',
  'employee_branches',
  'services',
  'service_categories',
  'branch_services',
  'service_prices',
  'employee_service_eligibilities',
  'daily_closings',
  'payroll_runs',
  'branch_opening_hours',
];

describe('add-walkin-visit-checkout · the baseline holds the tables and triggers of design D3', () => {
  it('has every table the change writes or reads', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY(${[...WRITTEN, ...READ]})`;
    expect(rows.map((row) => row.table_name).sort()).toStrictEqual([...WRITTEN, ...READ].sort());
  });

  it('has the four guard triggers and the four audit triggers of the money tables', async () => {
    const rows = await prisma.$queryRaw<{ name: string; table: string }[]>`
      SELECT t.tgname AS name, c.relname AS table
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND t.tgname = ANY(${[
        'sales_finished_guard',
        'sale_items_finished_guard',
        'payments_finished_guard',
        'visits_final_guard',
        'audit_sales',
        'audit_sale_items',
        'audit_payments',
        'audit_refunds',
      ]})`;
    expect(Object.fromEntries(rows.map((row) => [row.name, row.table]))).toStrictEqual({
      sales_finished_guard: 'sales',
      sale_items_finished_guard: 'sale_items',
      payments_finished_guard: 'payments',
      visits_final_guard: 'visits',
      audit_sales: 'sales',
      audit_sale_items: 'sale_items',
      audit_payments: 'payments',
      audit_refunds: 'refunds',
    });
  });
});
