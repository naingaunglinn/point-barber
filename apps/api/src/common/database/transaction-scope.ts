import { AsyncLocalStorage } from 'node:async_hooks';

import type { DomainEvent } from '../events/domain-events.js';
import type { AuditRow } from './audit-row.js';
import type { Tx } from './transaction-runner.js';

// What one TransactionRunner.run() collects while it is open (add-foundation-auth-access design D3 ·
// D12): the audit rows it writes just before commit and the in-process events it delivers after
// commit, and the transaction itself, so a repository read made inside the run sees the run's own
// rows. Work outside a run() sees no scope.
export interface TransactionScopeData {
  readonly audit: AuditRow[];
  readonly events: DomainEvent[];
  tx?: Tx;
}

const storage = new AsyncLocalStorage<TransactionScopeData>();

export const TransactionScope = {
  create(): TransactionScopeData {
    return { audit: [], events: [] };
  },
  run<T>(scope: TransactionScopeData, fn: () => Promise<T>): Promise<T> {
    return storage.run(scope, fn);
  },
  /** Runs `fn` outside any open transaction scope (work started inside a run() that outlives it). */
  exit<T>(fn: () => T): T {
    return storage.exit(fn);
  },
  current(): TransactionScopeData | undefined {
    return storage.getStore();
  },
  /** The open scope; throws when the caller is not inside a run() — a programming error. */
  require(caller: string): TransactionScopeData {
    const scope = storage.getStore();
    if (scope === undefined)
      throw new Error(`${caller} must be called inside TransactionRunner.run`);
    return scope;
  },
};
