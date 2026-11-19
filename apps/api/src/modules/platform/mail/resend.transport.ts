import type { AppConfig } from '../../../common/config/config.js';
import { MAIL_TIMEOUT_MS, type MailMessage, MailTransport } from './mail-transport.js';

// Resend's HTTP API (ADR-007 decision 1 · design D8): production only, or another environment with
// MAIL_ALLOW_REAL=true (start-up check). No SDK — one POST. An answer outside 2xx fails the job,
// so pg-boss retries it; the API key never reaches an error message.
const ENDPOINT = 'https://api.resend.com/emails';

export class ResendTransport extends MailTransport {
  constructor(
    private readonly config: AppConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    const res = await this.fetchFn(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.env.RESEND_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  }
}
