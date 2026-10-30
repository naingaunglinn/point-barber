import { Injectable } from '@nestjs/common';
import type { Locale } from '@point/shared';

import { AppConfig } from '../../../common/config/config.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { Jobs } from '../jobs/jobs.service.js';
import type { EmailSendData } from './email-send.job.js';
import { encryptParams } from './payload-cipher.js';

// Queues an e-mail (ADR-007 · ADR-002 · add-foundation-auth-access design D3 · D8): the `email.send`
// job is sent inside the caller's transaction, so a rolled-back action sends nothing. The template
// parameters are stored only encrypted; the job is useless after `expiresAt` and sends nothing then.

export const EMAIL_SEND = 'email.send';

/** ADR-002: 3 retries with backoff for `email.send`. */
const RETRY = { retryLimit: 3, retryBackoff: true } as const;

@Injectable()
export class Mail {
  constructor(
    private readonly jobs: Jobs,
    private readonly config: AppConfig,
  ) {}

  async enqueue(
    tx: Tx,
    template: string,
    to: string,
    params: Readonly<Record<string, string>>,
    options: { readonly expiresAt: Date; readonly locale: Locale | null },
  ): Promise<void> {
    const data: EmailSendData = {
      template,
      to,
      locale: options.locale,
      expires_at: options.expiresAt.toISOString(),
      params_enc: encryptParams(params, this.config.env.MAIL_PAYLOAD_KEY),
    };
    await this.jobs.send(tx, EMAIL_SEND, data, RETRY);
  }
}
