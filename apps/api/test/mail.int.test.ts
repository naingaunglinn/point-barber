import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppConfig } from '../src/common/config/config.js';
import { MailpitTransport } from '../src/modules/platform/mail/mailpit.transport.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 2.10 — ADR-007 · CG-TEST-04 · design D8: one message delivered to
// Mailpit over SMTP and read back through Mailpit's API (CI job `integration` runs a mailpit
// service; locally MAILPIT_API_URL points at one).
let t: TestApp;
let transport: MailpitTransport;
const api = process.env.MAILPIT_API_URL ?? `http://${process.env.SMTP_HOST ?? 'localhost'}:8025`;

beforeAll(async () => {
  t = await startTestApp();
  transport = new MailpitTransport(t.app.get(AppConfig));
});
afterAll(async () => {
  transport.close();
  await t.close();
});

interface Summary {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly { Address: string }[];
}

async function messagesTo(address: string): Promise<Summary[]> {
  const res = await fetch(`${api}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await res.json()) as { messages: Summary[] }).messages;
}

describe('MailpitTransport (task 2.10)', () => {
  it('delivers one message that Mailpit returns with its subject and both bodies', async () => {
    const to = `m-${randomBytes(4).toString('hex')}@point.test`;
    await transport.send({
      to,
      subject: 'Point Barbershop sign-in code',
      text: 'Your sign-in code is:\n48291735\n',
      html: '<p>Your sign-in code is:</p><p>48291735</p>',
    });
    const found = await messagesTo(to);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      Subject: 'Point Barbershop sign-in code',
      To: [{ Address: to }],
    });
    const full = (await (await fetch(`${api}/api/v1/message/${found[0]?.ID}`)).json()) as {
      From: { Address: string };
      Text: string;
      HTML: string;
    };
    expect(full.From.Address).toBe('no-reply@point.test');
    expect(full.Text).toContain('48291735');
    expect(full.HTML).toContain('<p>48291735</p>');
  });
});
