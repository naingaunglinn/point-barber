import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditSource } from '@point/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminCreate } from '../src/cli/admin-create-command.js';
import { type PilotSeedResult, pilotSeed } from '../src/cli/pilot-seed-command.js';
import { runSeed } from '../src/cli/run-seed.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { CodeTables } from '../src/modules/platform/index.js';
import { PilotPaymentMethods } from '../src/modules/sales/index.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-pilot-data-seed tasks 2.1–2.3 and 3.1–3.4 — the operator command on a fresh database each
// (design D1–D8 · brief S1, S3–S7): "the pilot database" = the base seed of this build plus the first
// admin X00, no development fixture. Every value is the brief's invented example set (example.com).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const EXAMPLE = JSON.parse(readFileSync(join(ROOT, 'db/pilot/pilot-data.example.json'), 'utf8'));
const FIXTURES = join(ROOT, 'db/seed/fixtures');
/** Monday 05/Oct/2026 7:30 AM MMT (brief, "Run"). */
const APPLY_AT = new Date('2026-10-05T07:30:00+06:30');

let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;

beforeEach(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url, now: APPLY_AT });
  prisma = t.app.get(PrismaService);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.close();
  await db.drop();
});

const file = (change?: (data: any) => void) => {
  const data = structuredClone(EXAMPLE);
  change?.(data);
  return JSON.stringify(data);
};
const run = (input: string, ...argv: string[]): Promise<PilotSeedResult> =>
  pilotSeed(t.app, argv, input, 'node');
const apply = (input = file()) => run(input, '--apply');

/** Base seed + X00 (brief: "First admin (made earlier by admin-create)"). */
async function pilotDatabase(): Promise<void> {
  await t.app.get(CodeTables).runAll();
  const admin = await adminCreate(
    t.app,
    [
      '--email',
      'owner.one@example.com',
      '--name-mm',
      'နမူနာ ပိုင်ရှင်',
      '--name-en',
      'Example Owner',
      '--code',
      'X00',
    ],
    'node',
  );
  expect(admin.status).toBe(0);
}

async function counts() {
  return {
    branches: await prisma.branches.count(),
    users: await prisma.users.count(),
    employees: await prisma.employees.count(),
    employee_branches: await prisma.employee_branches.count(),
    employee_roles: await prisma.employee_roles.count(),
    employee_role_branches: await prisma.employee_role_branches.count(),
    service_categories: await prisma.service_categories.count(),
    services: await prisma.services.count(),
    branch_services: await prisma.branch_services.count(),
    service_prices: await prisma.service_prices.count(),
    employee_service_eligibilities: await prisma.employee_service_eligibilities.count(),
    kbzpay: (await prisma.payment_methods.findFirst({ where: { code: 'KBZPAY' } }))
      ?.reference_regex,
    audit: await prisma.audit_events.count(),
  };
}

const auditSince = (before: number) =>
  prisma.audit_events.findMany({ orderBy: { id: 'asc' }, skip: before });

describe('add-pilot-data-seed · organization · Without --apply the command changes nothing', () => {
  it('Scenario: Dry run of the example file — exit 0, the plan, nothing written', async () => {
    await pilotDatabase();
    const before = await counts();
    const result = await run(file());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('branches: create 1, unchanged 0');
    expect(result.stdout).toContain('users: create 3, unchanged 0');
    expect(result.stdout).toContain('service_prices: create 3, unchanged 0');
    expect(result.stdout).toContain('employee_service_eligibilities: create 6, unchanged 0');
    expect(result.stdout).toContain('payment_methods: create 0, unchanged 0, update 1');
    expect(await counts()).toStrictEqual(before);
  });
});

describe('add-pilot-data-seed · organization · The pilot data is read from standard input and validated before anything is written', () => {
  it.each([
    ['not JSON', 'branch: PX1', []],
    ['an option other than --apply', file(), ['--file', 'x.json']],
  ])('%s → exit 1', async (_name, input, argv) => {
    await pilotDatabase();
    const before = await counts();
    expect((await run(input, ...argv)).status).toBe(1);
    expect(await counts()).toStrictEqual(before);
  });

  it('a schema error names its JSON path', async () => {
    await pilotDatabase();
    const result = await apply(file((d) => (d.people[1].email = 'not an address')));
    expect(result.status).toBe(1);
    expect(result.stderr.join('\n')).toContain('people[1].email');
  });

  it('Scenario: Admin is not a role the file may give — people[2].role, nothing written', async () => {
    await pilotDatabase();
    const before = await counts();
    const result = await apply(file((d) => (d.people[2].role = 'Admin')));
    expect(result.status).toBe(1);
    expect(result.stderr.join('\n')).toContain('people[2].role');
    expect(await counts()).toStrictEqual(before);
  });
});

describe('add-pilot-data-seed · organization · The pilot database holds exactly one branch; people; audit (brief S1)', () => {
  it('Scenario: The first apply writes the example set', async () => {
    await pilotDatabase();
    const before = await counts();
    const result = await apply();
    expect(result).toMatchObject({ status: 0, stderr: [] });
    expect(await counts()).toStrictEqual({
      branches: 1,
      users: before.users + 3,
      employees: before.employees + 3,
      employee_branches: 3,
      employee_roles: before.employee_roles + 3,
      employee_role_branches: 3,
      service_categories: 1,
      services: 2,
      branch_services: 2,
      service_prices: 3,
      employee_service_eligibilities: 6,
      kbzpay: '^EX[0-9]{8}$',
      audit: before.audit + 19,
    });

    const branch = await prisma.branches.findFirstOrThrow();
    expect(branch).toMatchObject({
      code: 'PX1',
      name_en: 'Example Branch',
      name_mm: 'နမူနာ ဆိုင်ခွဲ',
      address_en: 'No. 1, Example Road',
      status: 1,
      location_radius_meters: 100,
    });

    const people = await prisma.employees.findMany({
      where: { employee_code: { in: ['X01', 'X02', 'X03'] } },
      orderBy: { employee_code: 'asc' },
      select: {
        employee_code: true,
        status: true,
        users: { select: { email: true, status: true } },
        employee_branches: {
          select: { branch_id: true, effective_from: true, effective_to: true },
        },
        employee_roles: {
          select: {
            scope_type: true,
            roles: { select: { name_en: true } },
            employee_role_branches: { select: { branch_id: true } },
          },
        },
      },
    });
    expect(people).toStrictEqual(
      [
        ['X01', 'barber.one@example.com', 'Barber'],
        ['X02', 'barber.two@example.com', 'Barber'],
        ['X03', 'manager.one@example.com', 'Manager'],
      ].map(([code, email, role]) => ({
        employee_code: code,
        status: 1,
        users: { email, status: 2 },
        employee_branches: [
          {
            branch_id: branch.id,
            effective_from: new Date('2026-10-05T00:00:00Z'),
            effective_to: null,
          },
        ],
        employee_roles: [
          {
            scope_type: 2,
            roles: { name_en: role },
            employee_role_branches: [{ branch_id: branch.id }],
          },
        ],
      })),
    );

    const prices = await prisma.service_prices.findMany({
      select: {
        price_amount: true,
        location_type: true,
        effective_from: true,
        services: { select: { name_en: true } },
        employees: { select: { employee_code: true } },
      },
      orderBy: { price_amount: 'asc' },
    });
    expect(
      prices.map((p) => [p.services.name_en, p.employees?.employee_code ?? null, p.price_amount]),
    ).toStrictEqual([
      ['Example Shave', null, 2500n],
      ['Example Cut', null, 5000n],
      ['Example Cut', 'X01', 6000n],
    ]);
    expect(prices.every((p) => p.location_type === 1)).toBe(true);
    expect(
      prices.every((p) => p.effective_from.getTime() === Date.parse('2026-10-05T00:00:00Z')),
    ).toBe(true);

    const services = await prisma.services.findMany({
      orderBy: { sort_order: 'asc' },
      select: { name_en: true, sort_order: true, pricing_mode: true },
    });
    expect(services).toStrictEqual([
      { name_en: 'Example Cut', sort_order: 1, pricing_mode: 1 },
      { name_en: 'Example Shave', sort_order: 2, pricing_mode: 1 },
    ]);
    expect(
      (await prisma.branch_services.findMany({ select: { duration_minutes: true } }))
        .map((row) => row.duration_minutes)
        .sort(),
    ).toStrictEqual([15, 30]);

    // No invite e-mail (P1-RULE-02 · D-ARC-02).
    const jobs = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pgboss.job WHERE name = 'email.send'`;
    expect(Number(jobs[0]?.n)).toBe(0);
  });

  it('Scenario: The rows of the first apply · Scenario: The branch of each row', async () => {
    await pilotDatabase();
    const before = await prisma.audit_events.count();
    await apply();
    const rows = await auditSince(before);
    const actions: Record<string, number> = {};
    for (const row of rows) actions[row.action] = (actions[row.action] ?? 0) + 1;
    expect(actions).toStrictEqual({
      'branch.create': 1,
      'employee.create': 3,
      'employee.branch_assign': 3,
      'employee.role_assign': 3,
      'category.create': 1,
      'service.create': 2,
      'service.branches_set': 2,
      'price.set': 2,
      'eligibility.set': 1,
      'payment_method.update': 1,
    });
    const branch = await prisma.branches.findFirstOrThrow();
    expect(new Set(rows.map((row) => row.request_id)).size).toBe(1);
    expect(rows[0]?.request_id).not.toBeNull();
    for (const row of rows) {
      expect(row).toMatchObject({ source: AuditSource.SYSTEM_JOB, actor_user_id: null });
      expect((row.after_data as { operator?: string }).operator).toBe('node');
    }
    const nullBranch = rows
      .filter((row) => row.branch_id === null)
      .map((row) => row.action)
      .sort();
    expect(nullBranch).toStrictEqual([
      'category.create',
      'payment_method.update',
      'service.create',
      'service.create',
    ]);
    expect(rows.filter((row) => row.branch_id === branch.id)).toHaveLength(15);
  });
});

describe('add-pilot-data-seed · organization · Fixture data is refused (brief S3)', () => {
  it('Scenario: A fixture address in the file', async () => {
    await pilotDatabase();
    const before = await counts();
    const result = await apply(file((d) => (d.people[0].email = 'aung@point.test')));
    expect(result.status).toBe(1);
    expect(await counts()).toStrictEqual(before);
  });

  it('Scenario: A database filled by the fixture seed', async () => {
    await runSeed(t.app, FIXTURES);
    const before = await counts();
    expect((await apply()).status).toBe(1);
    expect(await counts()).toStrictEqual(before);
  });
});

describe('add-pilot-data-seed · organization · The base seed of a build with the walk-in slice must be present (brief S6)', () => {
  it('a database without KBZPAY is refused', async () => {
    await pilotDatabase();
    await prisma.payment_methods.deleteMany({ where: { code: 'KBZPAY' } });
    const before = await counts();
    expect((await apply()).status).toBe(1);
    expect(await counts()).toStrictEqual(before);
  });

  it('Scenario: The Barber role lacks a seed code', async () => {
    await pilotDatabase();
    const barber = await prisma.roles.findFirstOrThrow({ where: { name_en: 'Barber' } });
    const lateEntry = await prisma.permissions.findFirstOrThrow({
      where: { code: 'sale.late_entry' },
    });
    await prisma.role_permissions.deleteMany({
      where: { role_id: barber.id, permission_id: lateEntry.id },
    });
    const before = await counts();
    const result = await apply();
    expect(result.status).toBe(1);
    expect(result.stderr.join('\n')).toContain('sale.late_entry');
    expect(await counts()).toStrictEqual(before);
    expect(
      await prisma.role_permissions.count({
        where: { role_id: barber.id, permission_id: lateEntry.id },
      }),
    ).toBe(0);
  });

  it('a database the API never started on (no company row) is refused', async () => {
    expect((await apply()).status).toBe(1);
    expect(await prisma.branches.count()).toBe(0);
  });
});

describe('add-pilot-data-seed · organization · one branch and identity (brief S6, S7)', () => {
  it('Scenario: Another branch already exists', async () => {
    await pilotDatabase();
    const company = await prisma.companies.findFirstOrThrow();
    await prisma.branches.create({
      data: {
        id: '0199a3f2-0000-7000-8000-0000000000b2',
        company_id: company.id,
        code: 'PX2',
        name_mm: 'အခြား',
      },
    });
    const before = await counts();
    expect((await apply()).status).toBe(1);
    expect(await counts()).toStrictEqual(before);
    expect(await prisma.branches.findMany({ select: { code: true } })).toStrictEqual([
      { code: 'PX2' },
    ]);
  });

  it('Scenario: A code that belongs to another address', async () => {
    await pilotDatabase();
    await apply();
    const before = await counts();
    const result = await apply(file((d) => (d.people[0].email = 'barber.uno@example.com')));
    expect(result.status).toBe(1);
    expect(result.stderr.join('\n')).toContain('people[0]');
    expect(await counts()).toStrictEqual(before);
  });

  it('Scenario: The first admin is also a barber', async () => {
    await pilotDatabase();
    const before = await prisma.audit_events.count();
    const result = await apply(
      file((d) =>
        d.people.unshift({
          employee_code: 'X00',
          email: 'owner.one@example.com',
          name_mm: 'နမူနာ ပိုင်ရှင်',
          name_en: 'Example Owner',
          role: 'Barber',
        }),
      ),
    );
    expect(result).toMatchObject({ status: 0 });
    expect(await prisma.users.count()).toBe(4);
    const x00 = await prisma.employees.findFirstOrThrow({
      where: { employee_code: 'X00' },
      select: {
        id: true,
        employee_branches: { select: { effective_to: true } },
        employee_roles: {
          orderBy: { scope_type: 'asc' },
          select: {
            scope_type: true,
            revoked_at: true,
            roles: { select: { name_en: true } },
            employee_role_branches: { select: { branch_id: true } },
          },
        },
      },
    });
    const branch = await prisma.branches.findFirstOrThrow();
    expect(x00.employee_branches).toStrictEqual([{ effective_to: null }]);
    expect(x00.employee_roles).toStrictEqual([
      { scope_type: 1, revoked_at: null, roles: { name_en: 'Admin' }, employee_role_branches: [] },
      {
        scope_type: 2,
        revoked_at: null,
        roles: { name_en: 'Barber' },
        employee_role_branches: [{ branch_id: branch.id }],
      },
    ]);
    const created = (await auditSince(before)).filter(
      (row) => row.action === 'employee.create' && row.entity_id === x00.id,
    );
    expect(created).toStrictEqual([]);
  });
});

describe('add-pilot-data-seed · services-pricing · eligibility (PD1)', () => {
  it('Scenario: A narrowed person — X02 with Example Cut only gets one eligibility row', async () => {
    await pilotDatabase();
    const cut = EXAMPLE.categories[0].services[0].name_mm;
    expect((await apply(file((d) => (d.people[1].services = [cut])))).status).toBe(0);
    expect(await prisma.employee_service_eligibilities.count()).toBe(5);
  });
});

describe('add-pilot-data-seed · organization · --apply writes everything or nothing', () => {
  it('Scenario: The last write fails', async () => {
    await pilotDatabase();
    const audit = await prisma.audit_events.count();
    vi.spyOn(t.app.get(PilotPaymentMethods), 'setReferenceRegex').mockRejectedValue(
      new Error('forced failure of the KBZPAY update'),
    );
    expect((await apply()).status).toBe(1);
    expect(await prisma.branches.count()).toBe(0);
    expect(await prisma.users.count()).toBe(1);
    expect(await prisma.services.count()).toBe(0);
    expect(await prisma.audit_events.count()).toBe(audit);
  });

  it('two concurrent applies of the same file — one creates, the other finds create 0', async () => {
    await pilotDatabase();
    const results = await Promise.all([apply(), apply()]);
    expect(results.map((r) => r.status)).toStrictEqual([0, 0]);
    const branchLines = results.map((r) => r.stdout.find((line) => line.startsWith('branches:')));
    expect(branchLines.sort()).toStrictEqual([
      'branches: create 0, unchanged 1',
      'branches: create 1, unchanged 0',
    ]);
    expect(await prisma.branches.count()).toBe(1);
    expect(await prisma.service_prices.count()).toBe(3);
    expect(await prisma.employee_service_eligibilities.count()).toBe(6);
  });
});

describe('add-pilot-data-seed · organization · A re-run adds only what is new (brief S4)', () => {
  it('Scenario: The same file again — exit 0, no row, no audit row', async () => {
    await pilotDatabase();
    await apply();
    const before = await counts();
    t.clock?.set(new Date('2026-10-05T07:45:00+06:30'));
    const result = await apply();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('branches: create 0, unchanged 1');
    expect(result.stdout).toContain('payment_methods: create 0, unchanged 1, update 0');
    expect(await counts()).toStrictEqual(before);
  });

  it('Scenario: A new barber joins — on 08/Oct only X04 is added, with 4 audit rows', async () => {
    await pilotDatabase();
    await apply();
    const before = await counts();
    t.clock?.set(new Date('2026-10-08T07:30:00+06:30'));
    const result = await apply(
      file((d) =>
        d.people.push({
          employee_code: 'X04',
          email: 'barber.three@example.com',
          name_mm: 'နမူနာ ဘာဘာ သုံး',
          name_en: 'Example Barber Three',
          role: 'Barber',
        }),
      ),
    );
    expect(result.status).toBe(0);
    expect(await counts()).toStrictEqual({
      ...before,
      users: before.users + 1,
      employees: before.employees + 1,
      employee_branches: before.employee_branches + 1,
      employee_roles: before.employee_roles + 1,
      employee_role_branches: before.employee_role_branches + 1,
      employee_service_eligibilities: before.employee_service_eligibilities + 2,
      audit: before.audit + 4,
    });
    const x04 = await prisma.employees.findFirstOrThrow({
      where: { employee_code: 'X04' },
      select: { employee_branches: { select: { effective_from: true } } },
    });
    expect(x04.employee_branches).toStrictEqual([
      { effective_from: new Date('2026-10-08T00:00:00Z') },
    ]);
  });

  it('Scenario: A changed price is refused — table, service, branch and both values named', async () => {
    await pilotDatabase();
    await apply();
    const before = await counts();
    const result = await apply(file((d) => (d.categories[0].services[0].price = 5500)));
    expect(result.status).toBe(1);
    const stderr = result.stderr.join('\n');
    for (const part of ['service_prices', 'Example Cut', 'PX1', '5000', '5500']) {
      expect(stderr).toContain(part);
    }
    expect(await counts()).toStrictEqual(before);
  });

  it('a different stored KBZPay pattern is refused', async () => {
    await pilotDatabase();
    await apply();
    const before = await counts();
    const result = await apply(
      file((d) => {
        d.kbzpay.reference_regex = '^EX[0-9]{9}$';
        d.kbzpay.examples = ['EX123456789'];
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr.join('\n')).toContain('reference_regex');
    expect(await counts()).toStrictEqual(before);
  });
});
