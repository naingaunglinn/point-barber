import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { RequestContext } from '../http/request-context.js';
import { TX_MAX_WAIT_MS, TX_TIMEOUT_MS } from '../limits.js';
import { PrismaService } from './prisma.service.js';

export type Tx = Prisma.TransactionClient;

// One transaction per business action, opened by the service (CG-DB-03 · API-AUD-01 · design
// D4.8). Its first statement sets app.request_id — and app.user_id / app.session_id once the request
// context has them (add-foundation-auth-access) — for this transaction only (`set_config(…, true)`,
// the parameterised SET LOCAL), so the audit triggers know the request. A throw rolls back.
@Injectable()
export class TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const ctx = RequestContext.current();
        const settings: [string, string | undefined][] = [
          ['app.request_id', ctx?.request_id],
          ['app.user_id', ctx?.user_id],
          ['app.session_id', ctx?.session_id],
        ];
        for (const [name, value] of settings) {
          if (value !== undefined) await tx.$queryRaw`SELECT set_config(${name}, ${value}, true)`;
        }
        return work(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: TX_MAX_WAIT_MS,
        timeout: TX_TIMEOUT_MS,
      },
    );
  }
}
