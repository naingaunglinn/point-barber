import { randomUUID } from 'node:crypto';

import { DailyClosingStatus, ErrorCode, type StatusCode } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type Tx, TransactionRunner } from '../src/common/database/transaction-runner.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { DayLock } from '../src/modules/cash-closing/index.js';
import { createBranch, createPerson, testCompany } from './helpers/people.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-walkin-visit-checkout tasks 3.1 / 3.2 — DayLock, the one gate of a branch-day (P7-RULE-02 ·
// API-IDEM-06 · design D1): a future date is refused before any lock; then the shared advisory lock
// `day:<branch>:<date>` held to commit; then the closing row — CLOSED → 422 day_closed with who closed
// it and when. The clock is fixed at 05/Oct/2026 10:00 AM MMT.
let t: TestApp;
let prisma: PrismaService;
let runner: TransactionRunner;
let dayLock: DayLock;
let branchId: string;
let closer: { userId: string };

beforeAll(async () => {
  t = await startTestApp({ now: new Date('2026-10-05T10:00:00+06:30') });
  prisma = t.app.get(PrismaService);
  runner = t.app.get(TransactionRunner);
  dayLock = t.app.get(DayLock);
  const companyId = await testCompany(prisma);
  branchId = await createBranch(prisma, companyId);
  closer = await createPerson(prisma, companyId);
  await prisma.employees.updateMany({
    where: { user_id: closer.userId },
    data: { name_mm: 'မနှင်း', name_en: 'Ma Hnin' },
  });
});
afterAll(() => t.close());

async function closingRow(date: string, status: StatusCode<'daily_closings'>): Promise<void> {
  const closed = status === DailyClosingStatus.CLOSED;
  await prisma.daily_closings.create({
    data: {
      id: randomUUID(),
      branch_id: branchId,
      business_date: new Date(`${date}T00:00:00Z`),
      status,
      counted_cash_amount: closed ? 0n : null,
      closed_at: closed ? new Date('2026-10-05T21:05:00+06:30') : null,
      closed_by_user_id: closed ? closer.userId : null,
    },
  });
}

/** The advisory locks this transaction holds: mode per lock. */
async function advisoryLocks(tx: Tx): Promise<string[]> {
  const rows = await tx.$queryRaw<{ mode: string }[]>`
    SELECT mode FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()`;
  return rows.map((row) => row.mode);
}

/** assertOpen in a transaction; the locks held right after it (or after its refusal). */
async function assertOpen(date: string): Promise<{ error?: ProblemException; locks: string[] }> {
  return runner.run(async (tx) => {
    try {
      await dayLock.assertOpen(tx, branchId, date);
      return { locks: await advisoryLocks(tx) };
    } catch (error) {
      if (!(error instanceof ProblemException)) throw error;
      return { error, locks: await advisoryLocks(tx) };
    }
  });
}

describe('DayLock.assertOpen (P7-RULE-02)', () => {
  it('no closing row → passes, holding the shared day lock', async () => {
    const result = await assertOpen('2026-10-01');
    expect(result.error).toBeUndefined();
    expect(result.locks).toStrictEqual(['ShareLock']);
  });

  it('an OPEN row → passes', async () => {
    await closingRow('2026-10-02', DailyClosingStatus.OPEN);
    expect((await assertOpen('2026-10-02')).error).toBeUndefined();
  });

  it('a CLOSED row → 422 day_closed with who closed it and when', async () => {
    await closingRow('2026-10-03', DailyClosingStatus.CLOSED);
    const { error } = await assertOpen('2026-10-03');
    expect(error?.code).toBe(ErrorCode.DAY_CLOSED);
    expect(error?.status).toBe(422);
    expect(error?.options.context).toStrictEqual({
      branch_id: branchId,
      business_date: '2026-10-03',
      closed_at: '2026-10-05T21:05:00+06:30',
      // The system default language is Myanmar, so the closer is named by name_mm (AD-L10N-03).
      closed_by: { user_id: closer.userId, display_name: 'မနှင်း' },
      correction_path: 'reopen',
    });
  });

  it('today is not in the future; tomorrow → 422 date_in_future, no lock taken', async () => {
    expect((await assertOpen('2026-10-05')).error).toBeUndefined();
    const tomorrow = await assertOpen('2026-10-06');
    expect(tomorrow.error?.code).toBe(ErrorCode.DATE_IN_FUTURE);
    expect(tomorrow.error?.status).toBe(422);
    expect(tomorrow.locks).toStrictEqual([]);
  });

  it('the day key is per branch and date: another branch on a CLOSED date passes', async () => {
    const other = await createBranch(prisma, await testCompany(prisma));
    await runner.run((tx) => dayLock.assertOpen(tx, other, '2026-10-03'));
  });
});

describe('DayLock.closedDay (read only, for the quote)', () => {
  it('names the closing of a CLOSED day and takes no lock', async () => {
    await closingRow('2026-09-30', DailyClosingStatus.CLOSED);
    const result = await runner.run(async (tx) => ({
      closed: await dayLock.closedDay(tx, branchId, '2026-09-30'),
      locks: await advisoryLocks(tx),
    }));
    expect(result.closed).toStrictEqual({
      closed_at: new Date('2026-10-05T21:05:00+06:30'),
      closed_by: { user_id: closer.userId, display_name: 'မနှင်း' },
    });
    expect(result.locks).toStrictEqual([]);
  });

  it('is null for an OPEN day and a day without a row', async () => {
    expect(await dayLock.closedDay(prisma, branchId, '2026-10-02')).toBeNull();
    expect(await dayLock.closedDay(prisma, branchId, '2026-09-01')).toBeNull();
  });
});
