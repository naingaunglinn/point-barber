import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-schedule-patterns task 1.5 — the queue `shifts.generate` (ADR-002 · design D5): created by the one
// migrate step (db/scripts/migrate.mjs → QUEUES) with the ADR-002 job policy — 3 retries with backoff,
// completed jobs kept 30 days. Its handler and the 00:30 cron come with the job part of the change.
let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;

beforeAll(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url });
  prisma = t.app.get(PrismaService);
});
afterAll(async () => {
  await t.close();
  await db.drop();
});

describe('add-schedule-patterns · scheduling · the queue shifts.generate (ADR-002 · design D5)', () => {
  it('is created by the migrate step with 3 retries, backoff and 30 days of completed jobs', async () => {
    const queues = await prisma.$queryRaw<
      { retry_limit: number; retry_backoff: boolean; deletion_seconds: number }[]
    >`
      SELECT retry_limit, retry_backoff, deletion_seconds
      FROM pgboss.queue WHERE name = 'shifts.generate'`;
    expect(queues).toStrictEqual([
      { retry_limit: 3, retry_backoff: true, deletion_seconds: 30 * 86_400 },
    ]);
  });
});
