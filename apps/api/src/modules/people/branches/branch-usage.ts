import { Injectable } from '@nestjs/common';
import type { BranchInUseContext } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { BranchesRepository } from '../repositories/branches.repository.js';

// What still uses a branch, counted when it is deactivated (P1-RULE-09 · P1.BR.05 · owner BR2 · design
// D1). The two outside counts belong to their owners: modules/booking registers `open_bookings`
// (bookings status 1 / 2) and modules/sales `open_sales` (sales status 1) in their onModuleInit — the
// VisitsRegistry pattern — so people imports neither module (sales already imports people). The
// assignments are people's own. PeopleModule checks at start-up that both counters are there (R8).

export type BranchUsageKey = 'open_bookings' | 'open_sales';
export type BranchUsageCounter = (tx: Tx, branchId: string) => Promise<number>;

const KEYS: readonly BranchUsageKey[] = ['open_bookings', 'open_sales'];

@Injectable()
export class BranchUsage {
  private readonly counters = new Map<BranchUsageKey, BranchUsageCounter>();

  constructor(private readonly repository: BranchesRepository) {}

  /** Called once by the owning module at start-up. */
  register(key: BranchUsageKey, count: BranchUsageCounter): void {
    if (this.counters.has(key)) throw new Error(`BranchUsage: ${key} is registered twice`);
    this.counters.set(key, count);
  }

  /** Start-up check (onApplicationBootstrap — after every module's onModuleInit). */
  assertComplete(): void {
    for (const key of KEYS) {
      if (!this.counters.has(key)) {
        throw new Error(`BranchUsage: no counter for ${key} (its module is not loaded)`);
      }
    }
  }

  /** The three counts of P1-RULE-09 inside `tx`, after the caller locked the branch row (design D3). */
  async countsFor(tx: Tx, branchId: string, date: string): Promise<BranchInUseContext> {
    // One statement at a time inside the transaction (CG-TS-07).
    const open_bookings = await this.counter('open_bookings')(tx, branchId);
    const open_sales = await this.counter('open_sales')(tx, branchId);
    const active_assignments = await this.repository.activeAssignments(tx, branchId, date);
    return { open_bookings, open_sales, active_assignments };
  }

  private counter(key: BranchUsageKey): BranchUsageCounter {
    const count = this.counters.get(key);
    if (count === undefined) throw new Error(`BranchUsage: no counter for ${key}`);
    return count;
  }
}
