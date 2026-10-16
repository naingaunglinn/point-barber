import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditSource } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { adminCreate } from '../src/cli/admin-create-command.js';
import { runSeed } from '../src/cli/run-seed.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { CodeTables } from '../src/modules/platform/index.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access tasks 3.9 and 3.10 — access spec "The first company admin of an
// environment is created by an operator command" (P1-RULE-14 · P1-RULE-12 · D-EMP-03 · design D10),
// on a fresh database each: the base seed only, or the development fixture.
const FIXTURES = join(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
  'db/seed/fixtures',
);
let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;

beforeEach(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url });
  prisma = t.app.get(PrismaService);
});
afterEach(async () => {
  await t.close();
  await db.drop();
});

const baseSeedOnly = () => t.app.get(CodeTables).runAll();
const fixtureDatabase = () => runSeed(t.app, FIXTURES);
const run = (...argv: string[]) => adminCreate(t.app, argv, 'node');
const KYAW_ZIN = [
  '--email',
  'kyawzin@point.test',
  '--name-mm',
  'ဦးကျော်ဇင်',
  '--name-en',
  'U Kyaw Zin',
  '--code',
  'E001',
];

async function counts() {
  return {
    users: await prisma.users.count(),
    employees: await prisma.employees.count(),
    audit: await prisma.audit_events.count(),
  };
}

describe('add-foundation-auth-access · access · The first company admin of an environment is created by an operator command', () => {
  it('Scenario: Fresh environment', async () => {
    await baseSeedOnly();
    expect(await run(...KYAW_ZIN)).toMatchObject({ status: 0 });
    expect(await prisma.users.findMany({ select: { email: true, status: true } })).toStrictEqual([
      { email: 'kyawzin@point.test', status: 2 },
    ]);
    expect(
      await prisma.employees.findMany({
        select: { employee_code: true, name_mm: true, name_en: true, status: true },
      }),
    ).toStrictEqual([
      { employee_code: 'E001', name_mm: 'ဦးကျော်ဇင်', name_en: 'U Kyaw Zin', status: 1 },
    ]);
    const roles = await prisma.employee_roles.findMany({
      select: { scope_type: true, revoked_at: true, roles: { select: { name_en: true } } },
    });
    expect(roles).toStrictEqual([{ scope_type: 1, revoked_at: null, roles: { name_en: 'Admin' } }]);
  });

  it('Scenario: The two audit rows name the operator', async () => {
    await baseSeedOnly();
    await run(...KYAW_ZIN);
    const rows = await prisma.audit_events.findMany({
      where: { action: { in: ['employee.create', 'employee.role_assign'] } },
      orderBy: { action: 'asc' },
    });
    expect(rows.map((row) => row.action)).toStrictEqual([
      'employee.create',
      'employee.role_assign',
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({
        source: AuditSource.SYSTEM_JOB,
        actor_user_id: null,
        branch_id: null,
        after_data: expect.objectContaining({ operator: 'node' }),
      });
    }
  });

  // Sign-in arrives with group 5 (P1.AUTH.01 / 02); this scenario is completed there.
  it.todo('Scenario: The first admin signs in like any invited employee');

  it('Scenario: Refused while an active company admin exists', async () => {
    await fixtureDatabase();
    const before = await counts();
    const result = await run(
      '--email',
      'second@point.test',
      '--name-mm',
      'စမ်းသပ်',
      '--code',
      'E010',
    );
    expect(result).toMatchObject({
      status: 1,
      message: expect.stringMatching(/active company admin/),
    });
    expect(await counts()).toStrictEqual(before);
    expect(before).toMatchObject({ users: 9, employees: 9 });
  });

  it('Scenario: Refused before the first admin has signed in', async () => {
    await baseSeedOnly();
    await run(...KYAW_ZIN);
    const result = await run(
      '--email',
      'second@point.test',
      '--name-mm',
      'စမ်းသပ်',
      '--code',
      'E002',
    );
    expect(result).toMatchObject({ status: 1 });
    expect(await counts()).toMatchObject({ users: 1, employees: 1 });
  });

  it('Scenario: E-mail address or employee code already exists', async () => {
    await fixtureDatabase();
    await prisma.employee_roles.updateMany({
      where: { employee_id: FIXTURE_IDS.employees.E001 },
      data: { revoked_at: new Date() },
    });
    const before = await counts();
    expect(
      await run('--email', 'aung@point.test', '--name-mm', 'စမ်းသပ်', '--code', 'E010'),
    ).toMatchObject({ status: 1, message: expect.stringMatching(/e-mail/) });
    expect(
      await run('--email', 'second@point.test', '--name-mm', 'စမ်းသပ်', '--code', 'E004'),
    ).toMatchObject({ status: 1, message: expect.stringMatching(/employee code/) });
    expect(await counts()).toStrictEqual(before);
  });

  it('Scenario: Without an employee code', async () => {
    await baseSeedOnly();
    const result = await run('--email', 'kyawzin@point.test', '--name-mm', 'ဦးကျော်ဇင်');
    expect(result).toMatchObject({ status: 1, message: expect.stringMatching(/--code/) });
    expect(await counts()).toMatchObject({ users: 0, employees: 0 });
  });

  it('refuses before the API has started once (no seed Admin role yet)', async () => {
    const result = await run(...KYAW_ZIN);
    expect(result).toMatchObject({ status: 1, message: expect.stringMatching(/start the API/) });
    expect(await counts()).toMatchObject({ users: 0, employees: 0 });
  });

  it('an address is compared in lower case', async () => {
    await baseSeedOnly();
    expect(
      await run('--email', 'KyawZin@Point.Test', '--name-mm', 'ဦးကျော်ဇင်', '--code', 'E001'),
    ).toMatchObject({ status: 0 });
    expect((await prisma.users.findFirstOrThrow()).email).toBe('kyawzin@point.test');
  });
});
