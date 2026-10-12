import { describe, expect, it } from 'vitest';

import { BranchStatus, STATUS_BY_TABLE } from './status.js';

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

  it('pins branches.status (part1 — not a badge of AD-CMP-05)', () => {
    expect(BranchStatus).toEqual({ INACTIVE: 0, ACTIVE: 1 });
    expect(Object.values(STATUS_BY_TABLE)).not.toContain(BranchStatus);
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
