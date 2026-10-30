import { randomUUID } from 'node:crypto';

import { AuditSource, PERMISSIONS, type PermissionEntry } from '@point/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { PermissionCatalogue } from '../src/modules/people/index.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 3.1 — access spec "The catalogue is synchronised to the database at
// every start" (D-ROLE-08 · P1-RULE-10 · design D10): PermissionCatalogue.sync on a fresh database.
let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;
let runner: TransactionRunner;
let catalogue: PermissionCatalogue;

beforeEach(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url });
  prisma = t.app.get(PrismaService);
  runner = t.app.get(TransactionRunner);
  catalogue = t.app.get(PermissionCatalogue);
});
afterEach(async () => {
  await t.close();
  await db.drop();
});

const sync = (entries: readonly PermissionEntry[]) =>
  runner.run((tx) => catalogue.sync(tx, entries));
const syncRows = () =>
  prisma.audit_events.findMany({ where: { action: 'permission.sync' }, orderBy: { id: 'asc' } });
const permissionRows = () => prisma.permissions.findMany({ orderBy: { code: 'asc' } });
const without = (code: string) => PERMISSIONS.filter((entry) => entry.code !== code);

describe('PermissionCatalogue.sync (task 3.1)', () => {
  it('on a fresh database creates the 21 codes and one permission.sync row', async () => {
    const result = await sync(PERMISSIONS);
    expect(result.created).toHaveLength(21);
    const rows = await permissionRows();
    expect(rows).toHaveLength(21);
    expect(rows.every((row) => row.archived_at === null)).toBe(true);
    expect(rows.find((row) => row.code === 'role.assign')).toMatchObject({
      module: 'role',
      action: 'assign',
      description: 'role · assign — P1.EMP.11/11b',
    });
    const audit = await syncRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      source: AuditSource.SYSTEM_JOB,
      entity_type: 'permissions',
      actor_user_id: null,
      branch_id: null,
    });
    expect((audit[0]?.after_data as { created: string[] }).created).toHaveLength(21);
  });

  it('an unchanged second run changes no row and writes no audit row', async () => {
    await sync(PERMISSIONS);
    const before = await permissionRows();
    const result = await sync(PERMISSIONS);
    expect(result).toStrictEqual({ created: [], updated: [], archived: [], restored: [] });
    expect(await permissionRows()).toStrictEqual(before);
    expect(await syncRows()).toHaveLength(1);
  });

  it('a changed description updates that row only', async () => {
    await sync(PERMISSIONS);
    const before = await permissionRows();
    const changed = PERMISSIONS.map((entry) =>
      entry.code === 'branch.view' ? { ...entry, description: 'changed' } : entry,
    );
    expect((await sync(changed)).updated).toStrictEqual(['branch.view']);
    const after = await permissionRows();
    for (const row of after) {
      const old = before.find((b) => b.code === row.code);
      if (row.code === 'branch.view') {
        expect(row.description).toBe('changed');
        expect(row.updated_at.getTime()).toBeGreaterThan(old?.updated_at.getTime() ?? 0);
      } else {
        expect(row).toStrictEqual(old);
      }
    }
  });

  it('a removed code is archived, not deleted; its role_permissions row stays', async () => {
    await sync(PERMISSIONS);
    const permission = await prisma.permissions.findUniqueOrThrow({
      where: { code: 'employee.earnings_update' },
    });
    const company = randomUUID();
    const role = randomUUID();
    await prisma.companies.create({ data: { id: company, name_mm: 'x' } });
    await prisma.roles.create({ data: { id: role, company_id: company, name_mm: 'r' } });
    await prisma.role_permissions.create({
      data: { id: randomUUID(), role_id: role, permission_id: permission.id },
    });

    const result = await sync(without('employee.earnings_update'));
    expect(result.archived).toStrictEqual(['employee.earnings_update']);
    const row = await prisma.permissions.findUniqueOrThrow({
      where: { code: 'employee.earnings_update' },
    });
    expect(row.archived_at).not.toBeNull();
    expect(await prisma.role_permissions.count({ where: { permission_id: permission.id } })).toBe(
      1,
    );
    const audit = await syncRows();
    expect((audit.at(-1)?.after_data as { archived: string[] }).archived).toStrictEqual([
      'employee.earnings_update',
    ]);
  });

  it('a code back in the file is restored', async () => {
    await sync(PERMISSIONS);
    await sync(without('employee.earnings_update'));
    expect((await sync(PERMISSIONS)).restored).toStrictEqual(['employee.earnings_update']);
    const row = await prisma.permissions.findUniqueOrThrow({
      where: { code: 'employee.earnings_update' },
    });
    expect(row.archived_at).toBeNull();
  });

  it('two runs at once do not race (advisory lock): 21 rows, one creating run', async () => {
    const results = await Promise.all([sync(PERMISSIONS), sync(PERMISSIONS)]);
    expect(results.map((result) => result.created.length).sort()).toStrictEqual([0, 21]);
    expect(await permissionRows()).toHaveLength(21);
    expect(await syncRows()).toHaveLength(1);
  });
});
