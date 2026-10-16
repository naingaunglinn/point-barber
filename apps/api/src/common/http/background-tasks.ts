import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Logger } from 'pino';

import { TransactionScope } from '../database/transaction-scope.js';
import { LOGGER } from '../logging/logger.js';
import { RequestContext } from './request-context.js';

// Work the answer does not wait for (add-foundation-auth-access design D1 · D4): the issuing work of a
// code request, the handlers of in-process events. Each task keeps the request context (its log
// lines and its own transaction carry the request id) but runs outside the caller's transaction.
// A failure is logged with the request id, never thrown to the caller; drain() and the shutdown
// hook wait for every task, so tests and a stopping process lose nothing silently.
@Injectable()
export class BackgroundTasks implements OnApplicationShutdown {
  private readonly pending = new Set<Promise<void>>();

  constructor(@Inject(LOGGER) private readonly log: Logger) {}

  run(work: () => Promise<void> | void): void {
    const requestId = RequestContext.current()?.request_id;
    const task: Promise<void> = TransactionScope.exit(() =>
      Promise.resolve()
        .then(work)
        .catch((err: unknown) => {
          this.log.error({ request_id: requestId, err }, 'background task failed');
        })
        .finally(() => {
          this.pending.delete(task);
        }),
    );
    this.pending.add(task);
  }

  /** Resolves when every task has settled, including tasks started by running tasks. */
  async drain(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.drain();
  }
}
