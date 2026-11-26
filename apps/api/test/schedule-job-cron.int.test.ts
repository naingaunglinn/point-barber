import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-schedule-patterns task 5.4 — the cron of `shifts.generate` (ADR-002 · design D5): scheduled at 00:30
// Asia/Yangon every day. pg-boss keeps the schedule in `pgboss.schedule` once the workers run, so this one
// file starts the application with JOBS_IN_API on (the other files leave the workers off).
let t: TestApp;

beforeAll(async () => {
  t = await startTestApp({ jobs: true });
});
afterAll(() => t.close());

describe('add-schedule-patterns · scheduling · Generation runs every night at 00:30 Myanmar time', () => {
  it('registers the cron 30 0 * * * in Asia/Yangon', async () => {
    const rows = await t.app.get(PrismaService).$queryRaw<{ cron: string; timezone: string }[]>`
      SELECT cron, timezone FROM pgboss.schedule WHERE name = 'shifts.generate'`;
    expect(rows).toStrictEqual([{ cron: '30 0 * * *', timezone: 'Asia/Yangon' }]);
  });
});
