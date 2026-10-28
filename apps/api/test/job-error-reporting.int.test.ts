import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type EnvelopeSink, closedPort, startEnvelopeSink } from './helpers/envelope-sink.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';
import { requestCode } from './helpers/sign-in.js';

// add-staging-deploy task 3.8 — a job that fails its last retry is reported once (ADR-002: 3 retries ·
// CG-OBS-04 · design D9). The mail server is down (SMTP_PORT is a port nothing listens on), so Ko
// Aung's `email.send` job fails its first attempt and its 3 retries; an earlier failure may still
// succeed and is not a defect.
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
let sink: EnvelopeSink;
let t: SeededApp;

beforeAll(async () => {
  sink = await startEnvelopeSink();
  t = await startSeededApp({
    jobs: true,
    env: { SENTRY_DSN_API: sink.dsn, SMTP_HOST: '127.0.0.1', SMTP_PORT: await closedPort() },
  });
});
afterAll(async () => {
  await t.close();
  await sink.close();
});

const jobOf = async () => {
  const rows = await t.prisma.$queryRaw<{ state: string; retry_count: number }[]>`
    SELECT state::text AS state, retry_count FROM pgboss.job WHERE name = 'email.send'`;
  return rows[0];
};

describe('add-staging-deploy · platform-runtime · a job that fails its last retry reaches Sentry once', () => {
  it("Ko Aung's email.send fails 4 times with the mail server down: exactly 1 event tagged job", async () => {
    expect((await requestCode(t, 'aung@point.test')).status).toBe(202);
    const end = Date.now() + 50_000;
    while ((await jobOf())?.state !== 'failed') {
      if (Date.now() > end) throw new Error(`job still ${JSON.stringify(await jobOf())}`);
      await pause(250);
    }
    expect(await jobOf()).toStrictEqual({ state: 'failed', retry_count: 3 });
    await sink.waitFor(1);
    await pause(300);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({ tags: { job: 'email.send' }, environment: 'test' });
    expect(sink.bodies.join('\n')).not.toContain('aung@point.test');
  }, 60_000);
});
