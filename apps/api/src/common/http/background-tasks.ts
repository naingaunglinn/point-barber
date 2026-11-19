import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Logger } from 'pino';

import { TransactionScope } from '../database/transaction-scope.js';
import { LOGGER } from '../logging/logger.js';
import { ErrorReporter } from '../observability/error-reporter.js';
import { RequestContext } from './request-context.js';

// Work the answer does not wait for (add-foundation-auth-access design D1 · D4): the issuing work of a
// code request, the handlers of in-process events. Each task keeps the request context (its log
// lines and its own transaction carry the request id) but runs outside the caller's transaction.
// A failure is logged with the request id and reported (CG-OBS-04 — an unhandled error outside any
// answer; add-staging-deploy design D9), never thrown to the caller; drain() and the shutdown hook
// wait for every task, so tests and a stopping process lose nothing silently.
@Injectable()
export class BackgroundTasks implements OnApplicationShutdown {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Inject(LOGGER) private readonly log: Logger,
    private readonly reporter: ErrorReporter = new ErrorReporter(),
  ) {}

  run(work: () => Promise<void> | void): void {
    const requestId = RequestContext.current()?.request_id;
    const task: Promise<void> = TransactionScope.exit(() =>
      Promise.resolve()
        .then(work)
        .catch((err: unknown) => {
          this.log.error({ request_id: requestId, err }, 'background task failed');
          this.reporter.capture(err, requestId === undefined ? {} : { request_id: requestId });
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
