// Only this test reads files (db/source), so only it sees Node; the package itself does no I/O
// (CG-ARCH-07).
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AttachmentKind,
  AuditSource,
  BranchStatus,
  CustomerStatus,
  DiscountType,
  EmployeeStatus,
  LateEntryReason,
  LocationType,
  LoginMethod,
  PaymentMethodKind,
  PaymentMethodStatus,
  PriceSource,
  ProxyReason,
  ReceiptCounterKind,
  RefundKind,
  RevokeReason,
  RoleStatus,
  STATUS_BY_TABLE,
  SaleAdjustmentType,
  SaleItemLineType,
  SaleStatus,
  ScopeType,
  ServicePricingMode,
  ServiceStatus,
  UiLanguage,
  UserStatus,
  VisitStatus,
} from './status.js';

// D-DB-03 · API-DATA-04 · AD-IMPL-04: every status code of the 19 tables of AD-CMP-05 has a named
// constant. The values are the DBML notes of point-sdd/docs/db (parts 1–8); this test pins each one.
describe('status constants', () => {
  it('pins every numeric value of the DBML notes', () => {
    expect(STATUS_BY_TABLE).toEqual({
      bookings: { CANCELLED: 0, BOOKED: 1, STARTED: 2, COMPLETED: 3 },
      visits: { INCOMPLETE: 0, STARTED: 1, COMPLETED: 2, FINISHED: 3 },
      sales: { CANCELLED: 0, OPEN: 1, FINISHED: 2 },
      discount_requests: { CANCELLED: 0, PENDING: 1, APPROVED: 2, REJECTED: 3 },
      leaves: { CANCELLED: 0, PENDING: 1, APPROVED: 2, REJECTED: 3 },
      payroll_runs: { CANCELLED: 0, DRAFT: 1, CALCULATED: 2, FINALIZED: 3, PUBLISHED: 4, PAID: 5 },
      attendance_exceptions: { VOID: 0, OPEN: 1, EXCUSED: 2, CONFIRMED: 3, LEAVE: 4 },
      purchases: { CANCELLED: 0, DRAFT: 1, POSTED: 2 },
      stock_transfers: { CANCELLED: 0, DRAFT: 1, SENT: 2, RECEIVED: 3 },
      stock_counts: { CANCELLED: 0, IN_PROGRESS: 1, POSTED: 2 },
      daily_closings: { OPEN: 1, CLOSED: 2 },
      expenses: { PENDING: 1, APPROVED: 2, REJECTED: 3 },
      manual_incomes: { PENDING: 1, APPROVED: 2, REJECTED: 3 },
      employee_receivables: { CANCELLED: 0, ACTIVE: 1, SETTLED: 2 },
      users: { DISABLED: 0, ACTIVE: 1, INVITED: 2 },
      employees: { INACTIVE: 0, ACTIVE: 1, RESIGNED: 2, TERMINATED: 3 },
      import_jobs: { CANCELLED: 0, UPLOADED: 1, VALIDATED: 2, CONFIRMED: 3, FAILED: 4 },
      import_job_rows: { PENDING: 1, VALID: 2, ERROR: 3, IMPORTED: 4, SKIPPED: 5 },
      backup_runs: { RUNNING: 1, SUCCESS: 2, FAILED: 3 },
    });
  });

  it('holds the 71 (table, code) pairs of AD-CMP-05, codes unique per table', () => {
    const tables = Object.values(STATUS_BY_TABLE);
    expect(tables).toHaveLength(19);
    expect(tables.reduce((sum, codes) => sum + Object.keys(codes).length, 0)).toBe(71);
    for (const codes of tables) {
      const values = Object.values(codes);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

// The sets of add-foundation-auth-access equal the CHECK lists of their columns in the locked
// constraint files (D-DB-03 · AD-IMPL-04) — task 1.2.
const source = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../db/source');
const files = [
  'part1-foundation-v3-constraints.sql',
  'part1b-login-v1-constraints.sql',
  'part8-system-website-v1-constraints.sql',
  'part4-visits-sales-payments-v1-constraints.sql',
  'part2-services-scheduling-v1-constraints.sql',
  'part3-customers-booking-v3-constraints.sql',
].map((name) => readFileSync(join(source, name), 'utf8'));

/** The values of `CHECK (<column> IN (…))` (or `<column> IS NULL OR <column> IN (…)`). */
function checkList(table: string, column: string): number[] {
  const pattern = new RegExp(
    `ALTER TABLE ${table}\\s+ADD CONSTRAINT \\w+\\s+CHECK \\((?:${column} IS NULL OR )?${column} IN \\(([0-9, ]+)\\)\\)`,
  );
  for (const sql of files) {
    const match = pattern.exec(sql);
    if (match?.[1] !== undefined) return match[1].split(',').map((value) => Number(value.trim()));
  }
  throw new Error(`no CHECK list for ${table}.${column}`);
}

const sorted = (set: Record<string, number>) => Object.values(set).sort((a, b) => a - b);

describe('status constants = the CHECK lists of db/source', () => {
  it.each([
    ['UserStatus', UserStatus, 'users', 'status'],
    ['EmployeeStatus', EmployeeStatus, 'employees', 'status'],
    ['RoleStatus', RoleStatus, 'roles', 'status'],
    ['BranchStatus', BranchStatus, 'branches', 'status'],
    ['ScopeType', ScopeType, 'employee_roles', 'scope_type'],
    ['LoginMethod', LoginMethod, 'user_sessions', 'login_method'],
    ['RevokeReason', RevokeReason, 'user_sessions', 'revoke_reason'],
    ['AuditSource', AuditSource, 'audit_events', 'source'],
    ['UiLanguage', UiLanguage, 'users', 'ui_language'],
    // add-walkin-visit-checkout task 2.1
    ['VisitStatus', VisitStatus, 'visits', 'status'],
    ['LocationType', LocationType, 'visits', 'location_type'],
    ['SaleStatus', SaleStatus, 'sales', 'status'],
    ['SaleItemLineType', SaleItemLineType, 'sale_items', 'line_type'],
    ['PaymentMethodKind', PaymentMethodKind, 'payment_methods', 'kind'],
    ['PaymentMethodStatus', PaymentMethodStatus, 'payment_methods', 'status'],
    ['RefundKind', RefundKind, 'refunds', 'kind'],
    ['ReceiptCounterKind', ReceiptCounterKind, 'receipt_counters', 'kind'],
    // add-walkin-visit-checkout tasks 2.2 – 2.4 (the enums of the response DTOs)
    ['ProxyReason', ProxyReason, 'visits', 'proxy_reason'],
    ['LateEntryReason', LateEntryReason, 'visits', 'late_entry_reason'],
    ['DiscountType', DiscountType, 'discount_requests', 'discount_type'],
    ['SaleAdjustmentType', SaleAdjustmentType, 'sale_adjustments', 'adjustment_type'],
    ['ServicePricingMode', ServicePricingMode, 'services', 'pricing_mode'],
    ['ServiceStatus', ServiceStatus, 'services', 'status'],
    ['CustomerStatus', CustomerStatus, 'customers', 'status'],
    // task 3.6 — the receipt files
    ['AttachmentKind', AttachmentKind, 'attachments', 'kind'],
  ] as const)('%s = %s.%s', (_, set, table, column) => {
    expect(sorted(set)).toStrictEqual(checkList(table, column));
  });
});

describe('PriceSource (P2-RULE-03 / 05 — an API value, no column)', () => {
  it('names the four sources 1 – 4', () => {
    expect(PriceSource).toStrictEqual({
      BRANCH: 1,
      BARBER_OVERRIDE: 2,
      HOME: 3,
      HOME_FALLBACK_BRANCH: 4,
    });
  });
});
