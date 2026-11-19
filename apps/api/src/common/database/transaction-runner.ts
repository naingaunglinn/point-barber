import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { DomainEvents } from '../events/domain-events.js';
import { RequestContext } from '../http/request-context.js';
import { TX_MAX_WAIT_MS, TX_TIMEOUT_MS } from '../limits.js';
import { PrismaService } from './prisma.service.js';
import { TransactionScope } from './transaction-scope.js';

export type Tx = Prisma.TransactionClient;

// One transaction per business action, opened by the service (CG-DB-03 · API-AUD-01 · design
// D4.8 · add-foundation-auth-access D3). Its first statement sets app.user_id, app.session_id and
// app.request_id for this transaction only (`set_config(…, true)`, the parameterised SET LOCAL), so
// the audit triggers know the caller; before sign-in user and session are '' (the Part 8 trigger
// reads '' as NULL). A throw rolls back. The audit rows the work emitted are written as its last
// statements (design D12); the in-process events it collected are delivered after commit and
// dropped on a rollback. A run() inside a run() is refused: it would be a second transaction on
// another connection, not part of the first.
@Injectable()
export class TransactionRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEvents,
  ) {}

  async run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    if (TransactionScope.current() !== undefined) {
      throw new Error('TransactionRunner.run called while already inside TransactionRunner.run');
    }
    const scope = TransactionScope.create();
    const result = await TransactionScope.run(scope, () =>
      this.prisma.$transaction(
        async (tx) => {
          scope.tx = tx;
          const ctx = RequestContext.current();
          await tx.$queryRaw`SELECT set_config('app.user_id', ${ctx?.user_id ?? ''}, true),
                                    set_config('app.session_id', ${ctx?.session_id ?? ''}, true),
                                    set_config('app.request_id', ${ctx?.request_id ?? ''}, true)`;
          const value = await work(tx);
          const rows = scope.audit.splice(0);
          if (rows.length > 0) {
            await tx.audit_events.createMany({
              // The data is plain JSON: the audit writer builds it from objects without secrets.
              data: rows.map((row) => ({
                ...row,
                before_data: (row.before_data as Prisma.InputJsonObject | null) ?? Prisma.DbNull,
                after_data: (row.after_data as Prisma.InputJsonObject | null) ?? Prisma.DbNull,
              })),
            });
          }
          return value;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: TX_MAX_WAIT_MS,
          timeout: TX_TIMEOUT_MS,
        },
      ),
    );
    this.events.deliver(scope.events);
    return result;
  }
}
