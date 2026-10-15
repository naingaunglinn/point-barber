import { randomUUID } from 'node:crypto';

import { ErrorCode, PayrollRunStatus } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type Tx, TransactionRunner } from '../src/common/database/transaction-runner.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import { PayrollLock } from '../src/modules/payroll/index.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { createPerson, testCompany } from './helpers/people.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-walkin-visit-checkout task 3.3 — PayrollLock.assertNotFinalized (P5-RULE-10 · API-IDEM-06 ·
// design D1): the shared advisory lock `payroll:<company>` held to commit, then the runs covering the
// dates — FINALIZED / PUBLISHED / PAID → 423 payroll_finalized. A fresh database: a finalized October
// run in the shared one would refuse every other test's FINISH on 05/Oct.
let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;
let runner: TransactionRunner;
let payrollLock: PayrollLock;
let runId: string;
let admin: { userId: string; employeeId: string };

beforeAll(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url, now: new Date('2026-11-02T10:00:00+06:30') });
  prisma = t.app.get(PrismaService);
  runner = t.app.get(TransactionRunner);
  payrollLock = t.app.get(PayrollLock);
  const companyId = await testCompany(prisma);
  admin = await createPerson(prisma, companyId);
  runId = randomUUID();
  await prisma.payroll_runs.create({
    data: {
      id: runId,
      company_id: companyId,
      period_start: new Date('2026-10-01T00:00:00Z'),
      period_end: new Date('2026-10-31T00:00:00Z'),
      status: PayrollRunStatus.DRAFT,
      created_by_user_id: admin.userId,
    },
  });
});
afterAll(async () => {
  await t.close();
  await db.drop();
});

const at = new Date('2026-11-01T09:00:00+06:30');

/** The fields payroll_runs_status_fields_chk asks for each status. */
async function setStatus(status: number): Promise<void> {
  const by = admin.userId;
  const calculated = { calculated_at: at, calculated_by_user_id: by, rules_snapshot: {} };
  const finalized = { finalized_at: at, finalized_by_user_id: by };
  const published = { published_at: at, published_by_user_id: by };
  const paid = { paid_at: at, paid_by_user_id: by };
  const none = {
    calculated_at: null,
    finalized_at: null,
    published_at: null,
    paid_at: null,
    cancelled_at: null,
  };
  const fields: Record<number, object> = {
    [PayrollRunStatus.DRAFT]: none,
    [PayrollRunStatus.CALCULATED]: { ...none, ...calculated },
    [PayrollRunStatus.FINALIZED]: { ...none, ...calculated, ...finalized },
    [PayrollRunStatus.PUBLISHED]: { ...none, ...calculated, ...finalized, ...published },
    [PayrollRunStatus.PAID]: { ...none, ...calculated, ...finalized, ...published, ...paid },
  };
  await prisma.payroll_runs.update({ where: { id: runId }, data: { status, ...fields[status] } });
}

async function advisoryLocks(tx: Tx): Promise<string[]> {
  const rows = await tx.$queryRaw<{ mode: string }[]>`
    SELECT mode FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()`;
  return rows.map((row) => row.mode);
}

async function check(
  dates: string[],
  employeeIds?: string[],
): Promise<{ error?: ProblemException; locks: string[] }> {
  return runner.run(async (tx) => {
    try {
      await payrollLock.assertNotFinalized(tx, { employee_ids: employeeIds, dates });
      return { locks: await advisoryLocks(tx) };
    } catch (error) {
      if (!(error instanceof ProblemException)) throw error;
      return { error, locks: await advisoryLocks(tx) };
    }
  });
}

describe('PayrollLock.assertNotFinalized (P5-RULE-10)', () => {
  it('run 01 – 31/Oct/2026 FINALIZED → 423 on 05/Oct and 31/Oct, passes on 01/Nov', async () => {
    await setStatus(PayrollRunStatus.FINALIZED);
    const october5 = await check(['2026-10-05'], [admin.employeeId]);
    expect(october5.error?.code).toBe(ErrorCode.PAYROLL_FINALIZED);
    expect(october5.error?.status).toBe(423);
    expect(october5.error?.options.context).toStrictEqual({
      employee_id: admin.employeeId,
      run_id: runId,
      period: { start: '2026-10-01', end: '2026-10-31' },
      status: PayrollRunStatus.FINALIZED,
    });
    expect((await check(['2026-10-31'])).error?.code).toBe(ErrorCode.PAYROLL_FINALIZED);
    const november = await check(['2026-11-01']);
    expect(november.error).toBeUndefined();
    expect(november.locks).toStrictEqual(['ShareLock']);
  });

  it('employee_id is null when no employee was passed', async () => {
    const { error } = await check(['2026-10-05']);
    expect(error?.options.context?.employee_id).toBeNull();
  });

  it('one finalized date among several refuses', async () => {
    const { error } = await check(['2026-11-01', '2026-10-31']);
    expect(error?.code).toBe(ErrorCode.PAYROLL_FINALIZED);
  });

  it.each([
    ['PUBLISHED', PayrollRunStatus.PUBLISHED],
    ['PAID', PayrollRunStatus.PAID],
  ])('%s refuses too', async (_, status) => {
    await setStatus(status);
    expect((await check(['2026-10-05'])).error?.status).toBe(423);
  });

  it.each([
    ['CALCULATED', PayrollRunStatus.CALCULATED],
    ['DRAFT', PayrollRunStatus.DRAFT],
  ])('%s passes, holding the shared payroll lock', async (_, status) => {
    await setStatus(status);
    const result = await check(['2026-10-05']);
    expect(result.error).toBeUndefined();
    expect(result.locks).toStrictEqual(['ShareLock']);
  });
});
