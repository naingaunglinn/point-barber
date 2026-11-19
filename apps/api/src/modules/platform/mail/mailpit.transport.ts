import { createTransport, type Transporter } from 'nodemailer';

import type { AppConfig } from '../../../common/config/config.js';
import { MAIL_TIMEOUT_MS, type MailMessage, MailTransport } from './mail-transport.js';

// SMTP to Mailpit (ADR-007 · D-ARC-02 · design D8): every non-production environment delivers to the
// local inbox, never to a real address (the start-up check refuses Resend outside production unless
// MAIL_ALLOW_REAL=true). Plain SMTP on the Docker network or localhost — Mailpit offers no TLS here.
export class MailpitTransport extends MailTransport {
  private readonly smtp: Transporter;

  constructor(private readonly config: AppConfig) {
    super();
    this.smtp = createTransport({
      host: config.env.SMTP_HOST,
      port: config.env.SMTP_PORT,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: MAIL_TIMEOUT_MS,
      greetingTimeout: MAIL_TIMEOUT_MS,
      socketTimeout: MAIL_TIMEOUT_MS,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.smtp.sendMail({ from: this.config.env.MAIL_FROM, ...message });
  }

  close(): void {
    this.smtp.close();
  }
}
