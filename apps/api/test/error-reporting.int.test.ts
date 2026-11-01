import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ErrorReporter } from '../src/common/observability/error-reporter.js';
import { type EnvelopeSink, startEnvelopeSink } from './helpers/envelope-sink.js';
import { requestCode } from './helpers/sign-in.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-staging-deploy tasks 3.6–3.7 — platform-runtime spec "API defects reach Sentry with release,
// environment and request id", "Expected problem answers are not sent to Sentry" and "No secret or
// personal data reaches Sentry" (ADR-007 decision 3 · CG-OBS-03 · CG-OBS-04 · design D9). The SDK
// sends to a local envelope sink; `GET /v1/_fixtures/boom` throws (test application only).
const BOOM = '/api/v1/_fixtures/boom';
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
let sink: EnvelopeSink;

beforeAll(async () => {
  sink = await startEnvelopeSink();
});
afterAll(async () => {
  await sink.close();
});

describe('add-staging-deploy · platform-runtime · API defects reach Sentry with release, environment and request id', () => {
  it('Scenario: No DSN — the API starts and nothing is sent', async () => {
    const t = await startTestApp();
    // No SDK was started at all, not merely an SDK that had nowhere to send.
    expect(t.app.get(ErrorReporter).enabled).toBe(false);
    expect((await t.http.get(BOOM)).status).toBe(500);
    await t.close();
    await pause(300);
    expect(sink.bodies).toHaveLength(0);
  });

  describe('with SENTRY_DSN_API set', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await startTestApp({ env: { SENTRY_DSN_API: sink.dsn } });
      expect(t.app.get(ErrorReporter).enabled).toBe(true);
    });
    afterAll(async () => {
      await t.close();
    });

    it('Scenario: An unexpected failure is one event with release, environment and request id', async () => {
      const res = await t.http.get(BOOM);
      expect(res.status).toBe(500);
      await sink.waitFor(1);
      expect(sink.events).toHaveLength(1);
      expect(sink.events[0]).toMatchObject({
        release: '0.1.0',
        environment: 'test',
        tags: { request_id: (res.body as { request_id: string }).request_id },
        request: { url: 'https://app.point.test/api/v1/_fixtures/boom', method: 'GET' },
      });
    });

    it('Scenario: Four refusals send nothing; the next defect is the only new event', async () => {
      const before = sink.events.length;
      const invalid = await t.http.post('/api/v1/_fixtures/items').send({ name: '' });
      const unauthenticated = await t.http.get('/api/v1/me');
      const unknown = await t.http.get('/api/v1/no-such-route');
      await requestCode(t, 'nobody-sentry@point.test', '203.0.113.20');
      const limited = await requestCode(t, 'nobody-sentry@point.test', '203.0.113.20');
      expect([invalid, unauthenticated, unknown, limited].map((res) => res.status)).toStrictEqual([
        400, 401, 404, 429,
      ]);
      await t.http.get(BOOM);
      await sink.waitFor(before + 1);
      await pause(300);
      expect(sink.events).toHaveLength(before + 1);
    });

    it('Scenario: No cookie, query string, e-mail address, code or client IP reaches Sentry', async () => {
      const before = sink.bodies.length;
      const count = sink.events.length;
      const token = 'A'.repeat(43);
      await t.http
        .get(`${BOOM}?email=aung@point.test&code=48213907`)
        .set('Cookie', `point_session=${token}`)
        .set('X-Forwarded-For', '203.0.113.7');
      await sink.waitFor(count + 1);
      const sent = sink.bodies.slice(before).join('\n');
      for (const secret of [
        'point_session',
        token,
        'aung@point.test',
        '48213907',
        '203.0.113.7',
        'email=',
      ]) {
        expect(sent).not.toContain(secret);
      }
      expect(sink.events.at(-1)?.user).toBeUndefined();
    });
  });
});
