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
  // Part 2 §12 (add-service-catalogue task 1.3).
  'service.view',
  'service.update',
  // Part 3 §7 (add-customer-management task 1.3).
  'customer.view',
  'customer.create',
  'customer.update',
  // Part 4 §9 (add-walkin-visit-checkout task 1.4).
  'visit.view',
  'visit.update',
  'visit.delete',
  'sale.view',
  'sale.create',
  'sale.delete',
  'sale.finish_override',
  'sale.override_price',
  'sale.late_entry',
  'payment.view',
  'payment.verify',
  'discount.view',
  'discount.approve',
  // Part 2 §12 (add-schedule-patterns task 1.3).
  'schedule.view',
  'schedule.update',
  // Part 8 §14 (add-website-management task 1.2).
  'website.view',
  'website.update',
];
// Part 3 §7 (add-customer-management task 1.3) and Part 4 §9, sorted as roleCodes() reads them.
const BARBER = ['customer.create', 'customer.view', 'sale.create', 'sale.late_entry'];

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
    expect(roles.Barber).toMatchObject({ name_mm: 'ဘာဘာ', status: 1, codes: BARBER });
    expect(roles.Admin?.codes).toHaveLength(PERMISSIONS.length);
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
    expect((await roleCodes()).Manager?.codes).toHaveLength(MANAGER.length - 1);
    expect(await prisma.roles.count()).toBe(3);
  });
});

// add-schedule-patterns task 1.3 — spec "Two schedule codes exist" (Part 2 §12 · ADR-011 · ADR-012 ·
// D-ROLE-09 · P1-RULE-12).
describe('add-schedule-patterns · scheduling · Two schedule codes exist', () => {
  it('Scenario: After the catalogue sync', async () => {
    await firstStart();
    const roles = await roleCodes();
    const schedule = (role: string) =>
      (roles[role]?.codes ?? []).filter((code) => code.startsWith('schedule.'));
    expect(schedule('Admin')).toStrictEqual(['schedule.update', 'schedule.view']);
    expect(schedule('Manager')).toStrictEqual(['schedule.update', 'schedule.view']);
    expect(schedule('Barber')).toStrictEqual([]);
  });
});

// add-website-management task 1.2 — spec "Website has two permission codes with the mixed level"
// (Part 8 §14 · P8-RULE-01 · ADR-011 · ADR-012 · D-ROLE-09).
describe('add-website-management · website · Website has two permission codes with the mixed level', () => {
  it('Scenario: The seed roles (the role rows of a fresh database)', async () => {
    await firstStart();
    const roles = await roleCodes();
    const website = (role: string) =>
      (roles[role]?.codes ?? []).filter((code) => code.startsWith('website.'));
    expect(website('Admin')).toStrictEqual(['website.update', 'website.view']);
    expect(website('Manager')).toStrictEqual(['website.update', 'website.view']);
    expect(website('Barber')).toStrictEqual([]);
  });
});

// add-leave-types task 1.2 — spec "The leave-type module has four permission codes" (Part 2 §12 ·
// ADR-011 · ADR-012 · D-ROLE-09 · P1-RULE-12 · design D3): the catalogue sync gives the four codes to
// the company-admin role; the seed Manager and Barber get none.
describe('add-leave-types · leave · The leave-type module has four permission codes', () => {
  it('Scenario: After the catalogue sync, Admin holds the four codes, Manager and Barber none', async () => {
    await firstStart();
    const roles = await roleCodes();
    const leaveType = (role: string) =>
      (roles[role]?.codes ?? []).filter((code) => code.startsWith('leave_type.'));
    expect(leaveType('Admin')).toStrictEqual([
      'leave_type.create',
      'leave_type.delete',
      'leave_type.update',
      'leave_type.view',
    ]);
    expect(leaveType('Manager')).toStrictEqual([]);
    expect(leaveType('Barber')).toStrictEqual([]);
  });
});

// add-booking-cancel-reasons task 1.2 — spec "Four cancel-reason permission codes exist at company
// level" (Part 3 §7 · ADR-011 · ADR-012 · D-ROLE-09 · P1-RULE-12): the sync gives all four to the
// company-admin role; the Manager and Barber seed sets hold none. GET /v1/me: me.int.test.ts.
describe('add-booking-cancel-reasons · booking · Four cancel-reason permission codes exist at company level', () => {
  it('Scenario: The admin holds the four codes · Manager and barber hold none', async () => {
    await firstStart();
    const roles = await roleCodes();
    const reasons = (role: string) =>
      (roles[role]?.codes ?? []).filter((code) => code.startsWith('booking_cancel_reason.'));
    expect(reasons('Admin')).toStrictEqual([
      'booking_cancel_reason.create',
      'booking_cancel_reason.delete',
      'booking_cancel_reason.update',
      'booking_cancel_reason.view',
    ]);
    expect(reasons('Manager')).toStrictEqual([]);
    expect(reasons('Barber')).toStrictEqual([]);
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
    expect(roles.Admin?.codes).toHaveLength(PERMISSIONS.length + 1);
    expect(roles.Admin?.codes).toContain('fixture.view');
    expect(roles.Manager?.codes).toHaveLength(MANAGER.length);
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

// add-service-catalogue tasks 1.2 / 1.3 — services-pricing "The service module has four permission
// codes" (Part 2 §12 · API-PERM-06 #7 c · D-ROLE-09 · design D3).
describe('add-service-catalogue · services-pricing · The service module has four permission codes', () => {
  const SERVICE_CODES = ['service.create', 'service.delete', 'service.update', 'service.view'];
  const serviceCodes = (codes: readonly string[] | undefined) =>
    (codes ?? []).filter((code) => code.startsWith('service.'));

  it('Scenario: The Manager seed — a database without roles', async () => {
    await firstStart();
    const roles = await roleCodes();
    expect(serviceCodes(roles.Admin?.codes)).toStrictEqual(SERVICE_CODES);
    expect(serviceCodes(roles.Manager?.codes)).toStrictEqual(['service.update', 'service.view']);
    expect(serviceCodes(roles.Barber?.codes)).toStrictEqual([]);
  });

  it('the catalogue sync gives the four codes to a company-admin role created before them', async () => {
    await firstStart();
    // The database as a deploy before this change left it: no service code, no link to one.
    const before = { permissions: { module: 'service' } };
    await prisma.role_permissions.deleteMany({ where: before });
    await prisma.permissions.deleteMany({ where: { module: 'service' } });
    expect(serviceCodes((await roleCodes()).Admin?.codes)).toStrictEqual([]);
    await runner.run((tx) => t.app.get(PermissionCatalogue).sync(tx, PERMISSIONS));
    const roles = await roleCodes();
    expect(serviceCodes(roles.Admin?.codes)).toStrictEqual(SERVICE_CODES);
    expect(serviceCodes(roles.Manager?.codes)).toStrictEqual([]);
    expect(serviceCodes(roles.Barber?.codes)).toStrictEqual([]);
  });
});
