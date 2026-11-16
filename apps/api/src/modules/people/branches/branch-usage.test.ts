import { describe, expect, it } from 'vitest';

import type { Tx } from '../../../common/database/transaction-runner.js';
import type { BranchesRepository } from '../repositories/branches.repository.js';
import { BranchUsage } from './branch-usage.js';

// add-branch-management task 3.5 — the registry of the counts that stop a deactivation (P1-RULE-09 ·
// owner BR2 · ADR-001 rule 1 · design D1 · R8): booking and sales register their own counter at
// start-up, so people imports neither; a build without one of them cannot start.
const tx = {} as Tx;
const repository = (activeAssignments: number) =>
  ({
    activeAssignments: (_tx: Tx, _id: string, _date: string) => Promise.resolve(activeAssignments),
  }) as unknown as BranchesRepository;

describe('BranchUsage (task 3.5)', () => {
  it('a key without a counter fails the start-up check, naming the key', () => {
    const usage = new BranchUsage(repository(0));
    expect(() => usage.assertComplete()).toThrow(/open_bookings/);
    usage.register('open_bookings', () => Promise.resolve(0));
    expect(() => usage.assertComplete()).toThrow(/open_sales/);
    usage.register('open_sales', () => Promise.resolve(0));
    expect(() => usage.assertComplete()).not.toThrow();
  });

  it('a key is registered once', () => {
    const usage = new BranchUsage(repository(0));
    usage.register('open_sales', () => Promise.resolve(0));
    expect(() => usage.register('open_sales', () => Promise.resolve(1))).toThrow(/open_sales/);
  });

  it('countsFor returns the three counts of the branch on the date', async () => {
    const usage = new BranchUsage(repository(5));
    const seen: string[] = [];
    usage.register('open_bookings', (_tx, branchId) => {
      seen.push(`bookings ${branchId}`);
      return Promise.resolve(1);
    });
    usage.register('open_sales', (_tx, branchId) => {
      seen.push(`sales ${branchId}`);
      return Promise.resolve(2);
    });
    expect(await usage.countsFor(tx, 'b4', '2026-10-05')).toStrictEqual({
      open_bookings: 1,
      open_sales: 2,
      active_assignments: 5,
    });
    expect(seen).toStrictEqual(['bookings b4', 'sales b4']);
  });
});
