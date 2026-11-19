import { Inject, Injectable } from '@nestjs/common';
import { type Locale, UiLanguage } from '@point/shared';
import type { Logger } from 'pino';

import { Clock } from '../../../common/clock/clock.js';
import { AppConfig } from '../../../common/config/config.js';
import { LOGGER } from '../../../common/logging/logger.js';
import { SettingsReader } from '../settings/settings-reader.js';
import { MailTemplates } from './mail-templates.js';
import { MailTransport } from './mail-transport.js';
import { decryptParams } from './payload-cipher.js';

// The `email.send` job handler (ADR-002 · ADR-007 · add-foundation-auth-access design D8). A job
// started at or after `expires_at` sends nothing and completes (a code is useless after 5 minutes).
// A payload that cannot be decrypted (MAIL_PAYLOAD_KEY rotated) completes with a warning. A
// transport error fails the job, so pg-boss retries it. The address and the parameters are never
// logged. A recipient without a language (users.ui_language NULL) gets the effective
// `system.default_language` at the time the job sends (D-PLT-03 · add-settings-store design D1).

export interface EmailSendData {
  readonly template: string;
  readonly to: string;
  /** users.ui_language as a locale; null → the effective `system.default_language`. */
  readonly locale: Locale | null;
  readonly expires_at: string;
  readonly params_enc: string;
}

@Injectable()
export class EmailSendJob {
  constructor(
    private readonly transport: MailTransport,
    private readonly templates: MailTemplates,
    private readonly settings: SettingsReader,
    private readonly clock: Clock,
    private readonly config: AppConfig,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  async handle(data: EmailSendData): Promise<void> {
    if (this.clock.now().getTime() >= Date.parse(data.expires_at)) {
      this.log.info({ template: data.template }, 'email.send expired — not sent');
      return;
    }
    let params: Record<string, string>;
    try {
      params = decryptParams(data.params_enc, this.config.env.MAIL_PAYLOAD_KEY);
    } catch {
      this.log.warn(
        { template: data.template },
        'email.send payload cannot be decrypted — not sent',
      );
      return;
    }
    const message = this.templates.render(
      data.template,
      data.locale ?? (await this.systemLocale()),
      params,
    );
    await this.transport.send({ to: data.to, ...message });
  }

  /** The effective `system.default_language` (1 MY · 2 EN — D-PLT-03). */
  private async systemLocale(): Promise<Locale> {
    const { 'system.default_language': language } = await this.settings.effective([
      'system.default_language',
    ]);
    return language === UiLanguage.EN ? 'en' : 'my';
  }
}
