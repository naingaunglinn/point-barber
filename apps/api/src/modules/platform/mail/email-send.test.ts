import { randomBytes } from 'node:crypto';

import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import type { Jobs } from '../jobs/jobs.service.js';
import { EmailSendJob, type EmailSendData } from './email-send.job.js';
import { Mail } from './mail.service.js';
import type { MailMessage, MailTransport } from './mail-transport.js';
import type { MailTemplates } from './mail-templates.js';
import type { SettingsReader } from '../settings/settings-reader.js';
import { decryptParams } from './payload-cipher.js';

// add-foundation-auth-access task 2.9 — ADR-002 · ADR-007 · D-AUTH-04 · design D8: the `email.send`
// job. The stored payload holds no readable parameter; a job started at or after `expires_at` sends
// nothing; a transport error fails the job so pg-boss retries it (3 times, with backoff).
const KEY = randomBytes(32).toString('base64');
const CODE = '48291735';
const EXPIRES = '2026-10-05T09:05:00+06:30';

class FixedClock extends Clock {
  constructor(private readonly instant: string) {
    super();
  }
  override now(): Date {
    return new Date(this.instant);
  }
}

const config = { env: { MAIL_PAYLOAD_KEY: KEY } } as never;

/** The settings reader of add-settings-store with `system.default_language` = `language`. */
const settingsWith = (language: 1 | 2) =>
  ({
    effective: () => Promise.resolve({ 'system.default_language': language }),
  }) as unknown as SettingsReader;

function fakeJobs() {
  const sent: { name: string; data: EmailSendData; options: unknown }[] = [];
  const jobs = {
    send: (_tx: Tx, name: string, data: EmailSendData, options: unknown) => {
      sent.push({ name, data, options });
      return Promise.resolve('job-id');
    },
  } as unknown as Jobs;
  return { jobs, sent };
}

async function enqueued() {
  const { jobs, sent } = fakeJobs();
  await new Mail(jobs, config).enqueue(
    {} as Tx,
    'auth.email.otp',
    'aung@point.test',
    { code: CODE },
    { expiresAt: new Date(EXPIRES), locale: 'my' },
  );
  return sent;
}

function job(at: string, transport: MailTransport, language: 1 | 2 = 1) {
  const warnings: string[] = [];
  const locales: (string | null)[] = [];
  const log = {
    info: () => undefined,
    warn: (_fields: unknown, msg: string) => warnings.push(msg),
  } as unknown as Logger;
  const templates = {
    render: (_template: string, locale: string | null, params: Record<string, string>) => {
      locales.push(locale);
      return {
        subject: 'Point Barbershop sign-in code',
        text: `Your code:\n${params.code ?? ''}`,
        html: `<p>${params.code ?? ''}</p>`,
      };
    },
  } as unknown as MailTemplates;
  return {
    handler: new EmailSendJob(
      transport,
      templates,
      settingsWith(language),
      new FixedClock(at),
      config,
      log,
    ),
    warnings,
    locales,
  };
}

function recordingTransport() {
  const messages: MailMessage[] = [];
  const transport: MailTransport = {
    send: (message) => {
      messages.push(message);
      return Promise.resolve();
    },
  };
  return { transport, messages };
}

describe('Mail.enqueue (task 2.9)', () => {
  it('stores no readable parameter: the code exists only inside params_enc', async () => {
    const [job] = await enqueued();
    expect(job?.name).toBe('email.send');
    expect(job?.data).toMatchObject({
      template: 'auth.email.otp',
      to: 'aung@point.test',
      locale: 'my',
      expires_at: new Date(EXPIRES).toISOString(),
    });
    expect(JSON.stringify(job)).not.toContain(CODE);
    expect(decryptParams(job?.data.params_enc ?? '', KEY)).toStrictEqual({ code: CODE });
  });

  it('asks for 3 retries with backoff (ADR-002)', async () => {
    const [job] = await enqueued();
    expect(job?.options).toMatchObject({ retryLimit: 3, retryBackoff: true });
  });

  it('two jobs with the same parameters store different ciphertexts (a fresh IV each)', async () => {
    const [a] = await enqueued();
    const [b] = await enqueued();
    expect(a?.data.params_enc).not.toBe(b?.data.params_enc);
  });
});

describe('email.send handler (task 2.9)', () => {
  it('decrypts, renders in the job locale and sends one message before expiry', async () => {
    const [stored] = await enqueued();
    const { transport, messages } = recordingTransport();
    await job('2026-10-05T09:04:59+06:30', transport).handler.handle(stored!.data);
    expect(messages).toStrictEqual([
      {
        to: 'aung@point.test',
        subject: 'Point Barbershop sign-in code',
        text: `Your code:\n${CODE}`,
        html: `<p>${CODE}</p>`,
      },
    ]);
  });

  // add-settings-store task 2.9 — auth (MODIFIED) "The code e-mail uses the user's language …":
  // a recipient without a language gets the effective system.default_language when the job sends.
  it.each([
    [1, 'my'],
    [2, 'en'],
  ] as const)(
    'a job without a locale renders in system.default_language %i (%s)',
    async (language, locale) => {
      const [stored] = await enqueued();
      const { transport } = recordingTransport();
      const sending = job('2026-10-05T09:01:00+06:30', transport, language);
      await sending.handler.handle({ ...stored!.data, locale: null });
      expect(sending.locales).toStrictEqual([locale]);
    },
  );

  it("a job with the user's own locale keeps it, whatever the system default", async () => {
    const [stored] = await enqueued();
    const { transport } = recordingTransport();
    const sending = job('2026-10-05T09:01:00+06:30', transport, 2);
    await sending.handler.handle(stored!.data);
    expect(sending.locales).toStrictEqual(['my']);
  });

  it.each(['2026-10-05T09:05:00+06:30', '2026-10-05T09:30:00+06:30'])(
    'a job started at %s (at or after expires_at) sends nothing and completes',
    async (at) => {
      const [stored] = await enqueued();
      const { transport, messages } = recordingTransport();
      await expect(job(at, transport).handler.handle(stored!.data)).resolves.toBeUndefined();
      expect(messages).toHaveLength(0);
    },
  );

  it('a transport error fails the job, so pg-boss retries it', async () => {
    const [stored] = await enqueued();
    const failing: MailTransport = { send: () => Promise.reject(new Error('smtp down')) };
    await expect(
      job('2026-10-05T09:01:00+06:30', failing).handler.handle(stored!.data),
    ).rejects.toThrow('smtp down');
  });

  it('a payload that cannot be decrypted (rotated key) completes with a warning and sends nothing', async () => {
    const [stored] = await enqueued();
    const { transport, messages } = recordingTransport();
    const other = randomBytes(32).toString('base64');
    const warnings: string[] = [];
    const log = {
      info: () => undefined,
      warn: (_f: unknown, msg: string) => warnings.push(msg),
    } as unknown as Logger;
    const handler = new EmailSendJob(
      transport,
      { render: () => ({ subject: '', text: '', html: '' }) } as unknown as MailTemplates,
      settingsWith(1),
      new FixedClock('2026-10-05T09:01:00+06:30'),
      { env: { MAIL_PAYLOAD_KEY: other } } as never,
      log,
    );
    await expect(handler.handle(stored!.data)).resolves.toBeUndefined();
    expect(messages).toHaveLength(0);
    expect(warnings).toStrictEqual([expect.stringMatching(/cannot be decrypted/)]);
  });
});
