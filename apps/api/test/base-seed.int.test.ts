import { randomUUID } from 'node:crypto';

import { AuditSource, EmployeeStatus, PERMISSIONS, ScopeType, UserStatus } from '@point/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { BaseSeed, CompanyAdmin, PermissionCatalogue } from '../src/modules/people/index.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access tasks 3.3 and 3.4 — access spec "The first start creates the seed roles
// Admin, Manager and Barber" (D-ROLE-09 · D-ORG-03) and "A company admin holds all five role codes at
// company scope and receives every new code" (P1-RULE-12 · ADR-011), on a fresh database each.
let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;
let runner: TransactionRunner;

beforeEach(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url });
  prisma = t.app.get(PrismaService);
  runner = t.app.get(TransactionRunner);
});
afterEach(async () => {
  await t.close();
  await db.drop();
});

const MANAGER = [
  'branch.view',
  'employee.view',
  'employee.rating_update',
  'role.assign',
  'settings.view',
  'settings.update',
];

/** The job's two steps: the catalogue, then the base seed. */
async function firstStart(entries = PERMISSIONS) {
  await runner.run((tx) => t.app.get(PermissionCatalogue).sync(tx, entries));
  await runner.run((tx) => t.app.get(BaseSeed).run(tx));
}

async function roleCodes() {
  const roles = await prisma.roles.findMany({
    select: {
      id: true,
      name_en: true,
      name_mm: true,
      status: true,
      role_permissions: { select: { permissions: { select: { code: true } } } },
    },
  });
  return Object.fromEntries(
    roles.map((role) => [
      role.name_en ?? '',
      { ...role, codes: role.role_permissions.map((link) => link.permissions.code).sort() },
    ]),
  );
}

/** An ACTIVE employee holding `roleId` at company scope, or at branch scope for `branchId`. */
async function assign(roleId: string, scope: { branchId?: string } = {}) {
  const company = await prisma.companies.findFirstOrThrow();
  const userId = randomUUID();
  const employeeId = randomUUID();
  await prisma.users.create({
    data: { id: userId, email: `${userId}@point.test`, status: UserStatus.ACTIVE },
  });
  await prisma.employees.create({
    data: {
      id: employeeId,
      company_id: company.id,
      user_id: userId,
      employee_code: userId.slice(0, 8),
      name_mm: 'x',
      status: EmployeeStatus.ACTIVE,
    },
  });
  const assignment = randomUUID();
  await prisma.employee_roles.create({
    data: {
      id: assignment,
      employee_id: employeeId,
      role_id: roleId,
      scope_type: scope.branchId === undefined ? ScopeType.COMPANY : ScopeType.BRANCHES,
      assigned_at: new Date(),
    },
  });
  if (scope.branchId !== undefined) {
    await prisma.employee_role_branches.create({
      data: { id: randomUUID(), employee_role_id: assignment, branch_id: scope.branchId },
    });
  }
  return employeeId;
}

describe('add-foundation-auth-access · access · The first start creates the seed roles Admin, Manager and Barber', () => {
  it('Scenario: Fresh database · The Manager set is the six codes', async () => {
    await firstStart();
    const roles = await roleCodes();
    expect(Object.keys(roles).sort()).toStrictEqual(['Admin', 'Barber', 'Manager']);
    expect(roles.Admin).toMatchObject({ name_mm: 'အက်ဒမင်', status: 1 });
    expect(roles.Manager).toMatchObject({ name_mm: 'မန်နေဂျာ', status: 1 });
    expect(roles.Barber).toMatchObject({ name_mm: 'ဘာဘာ', status: 1, codes: [] });
    expect(roles.Admin?.codes).toHaveLength(21);
    expect(roles.Manager?.codes).toStrictEqual([...MANAGER].sort());
    expect(roles.Manager?.codes).not.toContain('employee.update');
    expect(roles.Manager?.codes).not.toContain('employee.branch_assign');
  });

  it('creates the one company row from COMPANY_NAME_MM / COMPANY_NAME_EN', async () => {
    await firstStart();
    expect(
      await prisma.companies.findMany({ select: { name_mm: true, name_en: true } }),
    ).toStrictEqual([{ name_mm: 'ပွိုင့် ဘာဘာရှော့', name_en: 'Point Barbershop' }]);
  });

  it('writes one role.create row per seed role, source 3, no actor', async () => {
    await firstStart();
    const rows = await prisma.audit_events.findMany({ where: { action: 'role.create' } });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({
        source: AuditSource.SYSTEM_JOB,
        actor_user_id: null,
        branch_id: null,
        entity_type: 'roles',
      });
    }
  });

  it('a second run creates nothing', async () => {
    await firstStart();
    await firstStart();
    expect(await prisma.roles.count()).toBe(3);
    expect(await prisma.companies.count()).toBe(1);
    expect(await prisma.audit_events.count({ where: { action: 'role.create' } })).toBe(3);
  });

  it('Scenario: A changed role is left alone', async () => {
    await firstStart();
    const manager = (await roleCodes()).Manager;
    const update = await prisma.permissions.findUniqueOrThrow({
      where: { code: 'settings.update' },
    });
    await prisma.role_permissions.deleteMany({
      where: { role_id: manager?.id, permission_id: update.id },
    });
    await firstStart();
    expect((await roleCodes()).Manager?.codes).toHaveLength(5);
    expect(await prisma.roles.count()).toBe(3);
  });
});

describe('add-foundation-auth-access · access · A company admin holds all five role codes at company scope and receives every new code', () => {
  it('Scenario: The seed admin qualifies · A manager with one role code does not qualify', async () => {
    await firstStart();
    const roles = await roleCodes();
    const admin = t.app.get(CompanyAdmin);
    expect(admin.isCompanyAdminRole(roles.Admin?.codes ?? [])).toBe(true);
    expect(admin.isCompanyAdminRole(roles.Manager?.codes ?? [])).toBe(false);
    expect(await admin.isCompanyAdmin(await assign(roles.Admin?.id ?? ''))).toBe(true);
    const b3 = randomUUID();
    const company = await prisma.companies.findFirstOrThrow();
    await prisma.branches.create({
      data: { id: b3, company_id: company.id, code: 'B3', name_mm: 'B3' },
    });
    expect(
      await admin.isCompanyAdmin(await assign(roles.Manager?.id ?? '', { branchId: b3 })),
    ).toBe(false);
  });

  it('Scenario: Four of the five codes are not enough', async () => {
    await firstStart();
    const company = await prisma.companies.findFirstOrThrow();
    const role = randomUUID();
    await prisma.roles.create({ data: { id: role, company_id: company.id, name_mm: 'four' } });
    const four = await prisma.permissions.findMany({
      where: { code: { in: ['role.view', 'role.create', 'role.update', 'role.assign'] } },
    });
    await prisma.role_permissions.createMany({
      data: four.map((p) => ({ id: randomUUID(), role_id: role, permission_id: p.id })),
    });
    const admin = t.app.get(CompanyAdmin);
    expect(admin.isCompanyAdminRole(four.map((p) => p.code))).toBe(false);
    expect(await admin.isCompanyAdmin(await assign(role))).toBe(false);
  });

  it('Scenario: All five codes at branch scope are not enough', async () => {
    await firstStart();
    const company = await prisma.companies.findFirstOrThrow();
    const b1 = randomUUID();
    await prisma.branches.create({
      data: { id: b1, company_id: company.id, code: 'B1', name_mm: 'B1' },
    });
    const zaw = await assign((await roleCodes()).Admin?.id ?? '', { branchId: b1 });
    expect(await t.app.get(CompanyAdmin).isCompanyAdmin(zaw)).toBe(false);
  });

  it('Scenario: A newly deployed code reaches the admin role only', async () => {
    await firstStart();
    const extra = {
      code: 'fixture.view',
      module: 'fixture',
      action: 'view',
      kind: 'crud' as const,
      level: 'branch' as const,
      label_key: 'permission.fixture.view',
      description: 'fixture · view',
    };
    await runner.run((tx) => t.app.get(PermissionCatalogue).sync(tx, [...PERMISSIONS, extra]));
    const roles = await roleCodes();
    expect(roles.Admin?.codes).toHaveLength(22);
    expect(roles.Admin?.codes).toContain('fixture.view');
    expect(roles.Manager?.codes).toHaveLength(6);
    const rows = await prisma.audit_events.findMany({ where: { action: 'role.permissions_set' } });
    expect(rows).toMatchObject([
      {
        source: AuditSource.SYSTEM_JOB,
        actor_user_id: null,
        entity_id: roles.Admin?.id,
        after_data: { added: ['fixture.view'] },
      },
    ]);
  });
});
