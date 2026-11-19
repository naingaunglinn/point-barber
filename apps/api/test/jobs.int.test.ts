import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { Jobs } from '../src/modules/platform/index.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 2.8 — ADR-002 · design D3 · D9: a job is sent inside the caller's
// transaction (pg-boss's `db` executor bound to the Prisma tx), so a committed transaction's job runs
// once and a rolled-back transaction leaves no job. Through a real pg-boss on the migrated database.
const QUEUE = 'fixture.jobs-test';
let t: TestApp;
let runner: TransactionRunner;
let jobs: Jobs;
let prisma: PrismaService;
const handled: string[] = [];

beforeAll(async () => {
  // This file needs the workers that vitest.int.config.ts switches off for the others.
  process.env.JOBS_IN_API = 'true';
  t = await startTestApp();
  runner = t.app.get(TransactionRunner);
  jobs = t.app.get(Jobs);
  prisma = t.app.get(PrismaService);
  // A test queue: a normal (not partitioned) queue is a row in pgboss.queue, added through pg-boss's
  // own function, which point_app may execute (queue creation is DDL only for partitioned queues).
  await prisma.$executeRaw`SELECT pgboss.create_queue(${QUEUE}, '{"policy":"standard"}'::jsonb)`;
  jobs.register<{ marker: string }>(
    QUEUE,
    async (data) => {
      handled.push(data.marker);
      return Promise.resolve();
    },
    { pollingIntervalSeconds: 0.5 },
  );
});
afterAll(async () => {
  await t.close();
  process.env.JOBS_IN_API = 'false';
});

const jobsWith = async (marker: string) => {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pgboss.job WHERE name = ${QUEUE} AND data->>'marker' = ${marker}`;
  return Number(rows[0]?.n ?? 0);
};

async function until(check: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((done) => setTimeout(done, 100));
  }
}

describe('Jobs (task 2.8)', () => {
  it('a job sent in a committed transaction runs once', async () => {
    const marker = randomUUID();
    await runner.run((tx) => jobs.send(tx, QUEUE, { marker }));
    expect(await jobsWith(marker)).toBe(1);
    await until(() => handled.includes(marker));
    await new Promise((done) => setTimeout(done, 1500));
    expect(handled.filter((m) => m === marker)).toHaveLength(1);
  });

  it('a job sent in a rolled-back transaction does not exist', async () => {
    const marker = randomUUID();
    await expect(
      runner.run(async (tx) => {
        await jobs.send(tx, QUEUE, { marker });
        throw new Error('rule failed');
      }),
    ).rejects.toThrow('rule failed');
    expect(await jobsWith(marker)).toBe(0);
    await new Promise((done) => setTimeout(done, 1500));
    expect(handled).not.toContain(marker);
  });
});
