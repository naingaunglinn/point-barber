import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';

import { LOGGER } from '../../../common/logging/logger.js';
import type { JobAttempt } from '../../platform/index.js';
import { ReceiptFiles } from './receipt-files.js';
import type { ReceiptRenderData } from './receipt-render.job.js';
import { ReceiptViews } from './receipt-views.js';

// The worker of `receipt.render` (ADR-002 · ADR-013 decision 8 · add-walkin-visit-checkout design D10,
// task 9.12): ReceiptFiles.ensure as a background render — nothing to do when both files are stored. A
// failed attempt is thrown back to pg-boss, which retries it (3 attempts in all, backoff — the queue's
// options in db/scripts/migrate.mjs); the last one is logged as an error. The sale is never touched: it
// stays FINISHED with its number, and its receipt still opens because a GET renders it on the fly.
// `job.failed` reaches the admins with add-notifications-inbox.
@Injectable()
export class ReceiptRenderHandler {
  constructor(
    private readonly files: ReceiptFiles,
    private readonly views: ReceiptViews,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  async handle(data: ReceiptRenderData, attempt: JobAttempt): Promise<void> {
    try {
      await this.files.ensure(data, 'background', () => this.views.document(data));
    } catch (error) {
      const context = {
        err: error,
        job_id: attempt.id,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        attempt: attempt.retry_count + 1,
      };
      if (attempt.retry_count >= attempt.retry_limit) {
        this.log.error(context, 'receipt render failed on its last attempt');
      } else {
        this.log.warn(context, 'receipt render failed — pg-boss retries it');
      }
      throw error;
    }
  }
}
