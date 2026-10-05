import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseProbe } from '../src/common/database/prisma.service.js';
import { HEALTH_PING_TIMEOUT_MS } from '../src/common/limits.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// Spec "Health endpoint is a details-free liveness probe" and "System status endpoint is public"
// (P1.SYS.01 · P1.SYS.02 · ADR-007 · D-PLT-08) — tasks 4.13 and 4.14.
const MMT_10_42 = new Date('2026-10-05T10:42:00+06:30');

class ThrowingProbe extends DatabaseProbe {
  override ping(): Promise<void> {
    return Promise.reject(new Error('connect ECONNREFUSED db.internal:5432'));
  }
}

class HangingProbe extends DatabaseProbe {
  override ping(): Promise<void> {
    return new Promise<void>(() => undefined);
  }
}

describe('add-repo-scaffold · platform-runtime · Health endpoint is a details-free liveness probe', () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  it('Scenario: Database reachable', async () => {
    t = await startTestApp({ now: MMT_10_42 });
    const res = await t.http.get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ status: 'ok', time: '2026-10-05T10:42:00+06:30' });
  });

  it('Scenario: Time is Myanmar time, not UTC', async () => {
    t = await startTestApp({ now: new Date('2026-10-04T17:30:00Z') });
    const res = await t.http.get('/api/v1/health');
    expect(res.body).toMatchObject({ time: '2026-10-05T00:00:00+06:30' });
  });

  it('Scenario: Database stopped', async () => {
    t = await startTestApp({ now: MMT_10_42, probe: new ThrowingProbe() });
    const res = await t.http.get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ status: 'degraded', time: '2026-10-05T10:42:00+06:30' });
    expect(res.text).not.toMatch(/ECONNREFUSED|db\.internal/);
    expect(
      t.logs.some((line) => line.level === 40 && line.msg === 'health: database ping failed'),
    ).toBe(true);
  });

  it('a hanging database answers degraded after the ping timeout', async () => {
    t = await startTestApp({ now: MMT_10_42, probe: new HangingProbe() });
    const started = Date.now();
    const res = await t.http.get('/api/v1/health');
    const elapsed = Date.now() - started;
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ status: 'degraded', time: '2026-10-05T10:42:00+06:30' });
    expect(elapsed).toBeGreaterThanOrEqual(HEALTH_PING_TIMEOUT_MS - 50);
    expect(elapsed).toBeLessThan(HEALTH_PING_TIMEOUT_MS + 3_000);
  });
});

describe('add-repo-scaffold · platform-runtime · System status endpoint is public', () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  it('Scenario: Default status', async () => {
    t = await startTestApp({ now: MMT_10_42 });
    const res = await t.http.get('/api/v1/system/status');
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      maintenance: false,
      until: null,
      message_mm: null,
      message_en: null,
      version: '0.1.0',
      server_time: '2026-10-05T10:42:00+06:30',
    });
  });

  it('Scenario: Readable from the public host without a cookie', async () => {
    t = await startTestApp();
    const res = await t.http.get('/api/v1/system/status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ maintenance: false });
  });
});
