// The mail port (ADR-007 decision 1 · CG-ARCH-08 · add-foundation-auth-access design D8): one message
// out through the configured provider — Mailpit (SMTP) outside production, Resend (HTTP API) in
// production. Business code never sees the provider.
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export abstract class MailTransport {
  abstract send(message: MailMessage): Promise<void>;
}

/** External calls time out after 5 seconds (coding guideline — resilience). */
export const MAIL_TIMEOUT_MS = 5_000;
