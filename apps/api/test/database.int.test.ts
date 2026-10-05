import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppConfig } from '../src/common/config/config.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { RequestContext } from '../src/common/http/request-context.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// Database layer (D-PLT-15 · CG-DB-03 · API-AUD-01 · design D4.7 / D4.8) — tasks 4.9 and 4.10.
const REQUEST_ID = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';

/** The same database, with the session time zone forced by the connection string. */
function urlWithTimeZone(timeZone: string): string {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.searchParams.set('options', `-c TimeZone=${timeZone}`);
  return url.toString();
}

const configFor = (databaseUrl: string): AppConfig =>
  ({ env: { DATABASE_URL: databaseUrl } }) as AppConfig;

describe('API start-up time-zone check (D-PLT-15 · design D4.7)', () => {
  it('a database session in UTC stops the start-up', async () => {
    const prisma = new PrismaService(configFor(urlWithTimeZone('UTC')));
    try {
      await expect(prisma.onModuleInit()).rejects.toThrow(
        /Database session time zone is UTC, expected Asia\/Yangon/,
      );
    } finally {
      await prisma.$disconnect();
    }
  });

  it('the migrated database as point_app passes', async () => {
    const prisma = new PrismaService(configFor(process.env.DATABASE_URL ?? ''));
    try {
      await expect(prisma.onModuleInit()).resolves.toBeUndefined();
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe('TransactionRunner.run (API-AUD-01 · CG-DB-03 · design D4.8)', () => {
  let t: TestApp;
  let runner: TransactionRunner;
  let prisma: PrismaService;

  beforeAll(async () => {
    t = await startTestApp();
    runner = t.app.get(TransactionRunner);
    prisma = t.app.get(PrismaService);
  });
  afterAll(async () => {
    await t.close();
  });

  const xactStatus = async (xid: string): Promise<string> => {
    const rows = await prisma.$queryRaw<
      { s: string }[]
    >`SELECT pg_xact_status(${xid}::xid8)::text AS s`;
    return rows[0]?.s ?? '';
  };

  it('app.request_id inside the transaction equals the request id', async () => {
    const rows = await RequestContext.run({ request_id: REQUEST_ID }, () =>
      runner.run(
        (tx) =>
          tx.$queryRaw<{ v: string | null }[]>`SELECT current_setting('app.request_id', true) AS v`,
      ),
    );
    expect(rows[0]?.v).toBe(REQUEST_ID);
  });

  it('app.user_id and app.session_id are set when the context has them', async () => {
    const rows = await RequestContext.run(
      { request_id: REQUEST_ID, user_id: '42', session_id: '0199a3f2-0000-7000-8000-000000000001' },
      () =>
        runner.run(
          (tx) => tx.$queryRaw<{ u: string | null; s: string | null }[]>`
            SELECT current_setting('app.user_id', true) AS u, current_setting('app.session_id', true) AS s`,
        ),
    );
    expect(rows[0]).toStrictEqual({ u: '42', s: '0199a3f2-0000-7000-8000-000000000001' });
  });

  it('a throw inside run rolls the transaction back', async () => {
    let xid = '';
    await expect(
      RequestContext.run({ request_id: REQUEST_ID }, () =>
        runner.run(async (tx) => {
          const rows = await tx.$queryRaw<{ x: string }[]>`SELECT pg_current_xact_id()::text AS x`;
          xid = rows[0]?.x ?? '';
          throw new Error('business rule failed');
        }),
      ),
    ).rejects.toThrow('business rule failed');
    expect(xid).not.toBe('');
    expect(await xactStatus(xid)).toBe('aborted');
  });

  it('the setting is gone after commit', async () => {
    let xid = '';
    await RequestContext.run({ request_id: REQUEST_ID }, () =>
      runner.run(async (tx) => {
        const rows = await tx.$queryRaw<{ x: string }[]>`SELECT pg_current_xact_id()::text AS x`;
        xid = rows[0]?.x ?? '';
      }),
    );
    expect(await xactStatus(xid)).toBe('committed');
    // A later transaction on the pool — whichever connection it gets — does not see the id.
    for (let i = 0; i < 5; i += 1) {
      const rows = await prisma.$transaction(
        (tx) =>
          tx.$queryRaw<{ v: string | null }[]>`SELECT current_setting('app.request_id', true) AS v`,
      );
      expect([null, '']).toContain(rows[0]?.v ?? null);
    }
  });
});
