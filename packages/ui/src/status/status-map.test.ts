import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { STATUS_BY_TABLE } from '@point/shared';

import { DERIVED_STATES, FLAGS, iconsOf, STATUS_MAP, TONE_ICON } from './status-map';

// add-shared-ui-components task 7.8 · ui-foundation "Status badges take tone, icon and label from one
// map" and "Flag chips mark exceptions with a fixed tone and icon" (AD-CMP-05 · AD-CMP-06 · AD-IMPL-04 ·
// design D8). The expected tones below are copied from AD-CMP-05 / AD-CMP-06 (admin-panel.md v1.7).

const tones = (table: Record<string, { tone: string }>) =>
  Object.fromEntries(Object.entries(table).map(([name, style]) => [name, style.tone]));

describe('STATUS_MAP', () => {
  it('has exactly the 71 pairs of the status constants', () => {
    const pairs = (map: Record<string, Record<string, unknown>>) =>
      Object.entries(map)
        .flatMap(([table, names]) => Object.keys(names).map((name) => `${table}.${name}`))
        .sort();
    expect(pairs(STATUS_MAP)).toEqual(pairs(STATUS_BY_TABLE));
    expect(pairs(STATUS_MAP)).toHaveLength(71);
  });

  it('gives every pair the tone of AD-CMP-05', () => {
    expect(
      Object.fromEntries(Object.entries(STATUS_MAP).map(([table, names]) => [table, tones(names)])),
    ).toEqual({
      bookings: { BOOKED: 'neutral', STARTED: 'info', COMPLETED: 'success', CANCELLED: 'muted' },
      visits: { STARTED: 'info', COMPLETED: 'warning', FINISHED: 'success', INCOMPLETE: 'muted' },
      sales: { OPEN: 'info', FINISHED: 'success', CANCELLED: 'muted' },
      discount_requests: {
        PENDING: 'warning',
        APPROVED: 'success',
        REJECTED: 'danger',
        CANCELLED: 'muted',
      },
      leaves: { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'muted' },
      payroll_runs: {
        DRAFT: 'neutral',
        CALCULATED: 'info',
        FINALIZED: 'warning',
        PUBLISHED: 'warning',
        PAID: 'success',
        CANCELLED: 'muted',
      },
      attendance_exceptions: {
        OPEN: 'warning',
        EXCUSED: 'neutral',
        CONFIRMED: 'danger',
        LEAVE: 'info',
        VOID: 'muted',
      },
      purchases: { DRAFT: 'neutral', POSTED: 'success', CANCELLED: 'muted' },
      stock_transfers: { DRAFT: 'neutral', SENT: 'info', RECEIVED: 'success', CANCELLED: 'muted' },
      stock_counts: { IN_PROGRESS: 'info', POSTED: 'success', CANCELLED: 'muted' },
      daily_closings: { OPEN: 'neutral', CLOSED: 'success' },
      expenses: { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' },
      manual_incomes: { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' },
      employee_receivables: { ACTIVE: 'info', SETTLED: 'success', CANCELLED: 'muted' },
      users: { INVITED: 'info', ACTIVE: 'success', DISABLED: 'muted' },
      employees: { ACTIVE: 'success', INACTIVE: 'muted', RESIGNED: 'muted', TERMINATED: 'muted' },
      import_jobs: {
        UPLOADED: 'neutral',
        VALIDATED: 'info',
        CONFIRMED: 'success',
        FAILED: 'danger',
        CANCELLED: 'muted',
      },
      import_job_rows: {
        PENDING: 'neutral',
        VALID: 'success',
        ERROR: 'danger',
        IMPORTED: 'success',
        SKIPPED: 'muted',
      },
      backup_runs: { RUNNING: 'info', SUCCESS: 'success', FAILED: 'danger' },
    });
  });

  it('uses the lock for finished sales, finalized and paid-out payroll, posted purchases and closed days', () => {
    expect(iconsOf(STATUS_MAP.sales.FINISHED)).toEqual(['lock']);
    expect(iconsOf(STATUS_MAP.payroll_runs.FINALIZED)).toEqual(['lock']);
    expect(iconsOf(STATUS_MAP.payroll_runs.PUBLISHED)).toEqual(['lock', 'send']);
    expect(iconsOf(STATUS_MAP.purchases.POSTED)).toEqual(['lock']);
    expect(iconsOf(STATUS_MAP.daily_closings.CLOSED)).toEqual(['lock']);
    expect(iconsOf(STATUS_MAP.sales.OPEN)).toEqual(['circle-dot']);
  });

  it('has one default icon per tone', () => {
    expect(TONE_ICON).toEqual({
      neutral: 'circle',
      info: 'circle-dot',
      success: 'circle-check',
      warning: 'triangle-alert',
      danger: 'circle-x',
      muted: 'circle-slash',
    });
  });
});

describe('DERIVED_STATES', () => {
  it('has the derived states of AD-CMP-05 with their tones', () => {
    expect(
      Object.fromEntries(
        Object.entries(DERIVED_STATES).map(([table, names]) => [table, tones(names)]),
      ),
    ).toEqual({
      payments: { VOIDED: 'muted', KBZPAY_UNVERIFIED: 'warning', KBZPAY_VERIFIED: 'success' },
      cash_outs: {
        OUTSTANDING: 'warning',
        RETURNED: 'success',
        CONVERTED: 'warning',
        CANCELLED: 'muted',
      },
      cash_returns: { CANCELLED: 'muted' },
      expenses: { DELETED: 'muted' },
      manual_incomes: { DELETED: 'muted' },
      daily_closings: { OPEN_PAST: 'warning' },
      master: { INACTIVE: 'muted' },
    });
  });
});

describe('FLAGS', () => {
  it('has the 18 flags with the tone and icon of AD-CMP-06 and design D8', () => {
    expect(
      Object.fromEntries(
        Object.entries(FLAGS).map(([key, flag]) => [key, `${flag.tone} · ${flag.icon}`]),
      ),
    ).toEqual({
      late_entry: 'warning · clock',
      proxy_recorded: 'info · users',
      home_service: 'neutral · home',
      online_booking: 'neutral · globe',
      price_changed: 'warning · pencil',
      discount: 'info · tag',
      negative_stock: 'danger · triangle-alert',
      low_stock: 'warning · package',
      manual_attendance: 'warning · hand',
      attendance_late: 'danger · clock-alert',
      attendance_absent: 'danger · user-x',
      attendance_early_leave: 'warning · log-out',
      pending_leave: 'warning · calendar',
      difference_sale: 'info · receipt',
      change_returned: 'info · coins',
      transfer_short: 'warning · triangle-alert',
      transfer_over: 'warning · triangle-alert',
      reopened: 'neutral · rotate-ccw',
    });
    expect(Object.keys(FLAGS)).toHaveLength(18);
  });

  it('names the parameter of the flags whose label takes one', () => {
    const withParam = Object.entries(FLAGS).flatMap(([key, flag]) =>
      'param' in flag ? [`${key}:${flag.param}`] : [],
    );
    expect(withParam).toEqual([
      'proxy_recorded:name',
      'transfer_short:n',
      'transfer_over:n',
      'reopened:n',
    ]);
  });
});

describe('the language check reads this map', () => {
  // A child Node process (about 1 s alone): 30 s instead of vitest's default 5 s, for the full
  // pre-push run on a loaded machine. The assertions are unchanged.
  it('pnpm i18n:check finds every derived state and flag label', () => {
    const repo = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
    const result = spawnSync(process.execPath, [join(repo, 'tools/guards/check-i18n.mjs')], {
      encoding: 'utf8',
    });
    expect(result.stdout).toMatch(/check-i18n: ok/);
    expect(result.status).toBe(0);
  }, 30_000);
});
