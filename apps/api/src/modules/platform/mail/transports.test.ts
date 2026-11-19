import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../../../common/config/config.js';
import { mailTransportFor } from './mail.module.js';
import { MailpitTransport } from './mailpit.transport.js';
import { ResendTransport } from './resend.transport.js';

// add-foundation-auth-access task 2.10 — ADR-007 decision 1 · D-ARC-02 · design D8: the provider is
// chosen by MAIL_TRANSPORT; Resend is called over HTTP with the API key, a 5-second timeout and no
// key in any error.
const config = (env: Record<string, unknown>) =>
  ({
    env: {
      MAIL_FROM: 'Point Barbershop <no-reply@point.test>',
      SMTP_HOST: 'mailpit',
      SMTP_PORT: 1025,
      RESEND_API_KEY: 're_test_secret_key',
      ...env,
    },
  }) as unknown as AppConfig;

const MESSAGE = {
  to: 'aung@point.test',
  subject: 'Point Barbershop sign-in code',
  text: 'Your code:\n48291735',
  html: '<p>48291735</p>',
};

describe('mailTransportFor (task 2.10)', () => {
  it('chooses Mailpit for MAIL_TRANSPORT=mailpit', () => {
    expect(mailTransportFor(config({ MAIL_TRANSPORT: 'mailpit' }))).toBeInstanceOf(
      MailpitTransport,
    );
  });

  it('chooses Resend for MAIL_TRANSPORT=resend', () => {
    expect(mailTransportFor(config({ MAIL_TRANSPORT: 'resend' }))).toBeInstanceOf(ResendTransport);
  });
});

describe('ResendTransport (task 2.10)', () => {
  function recorder(status = 200) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Promise.resolve(new Response('{"id":"x"}', { status }));
    };
    return { calls, fetchFn: fetchFn as typeof fetch };
  }

  it('posts the message to the Resend e-mail endpoint with the API key', async () => {
    const { calls, fetchFn } = recorder();
    await new ResendTransport(config({}), fetchFn).send(MESSAGE);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('https://api.resend.com/emails');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toMatchObject({
      Authorization: 'Bearer re_test_secret_key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(call?.init.body))).toStrictEqual({
      from: 'Point Barbershop <no-reply@point.test>',
      to: ['aung@point.test'],
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('fails on a non-2xx answer without the key in the error', async () => {
    const { fetchFn } = recorder(422);
    const error = await new ResendTransport(config({}), fetchFn)
      .send(MESSAGE)
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Resend answered 422/);
    expect((error as Error).message).not.toContain('re_test_secret_key');
  });
});
