import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runSeed } from '../src/cli/run-seed.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access tasks 3.6–3.8 — `pnpm db:seed` (design D16 · spec-fixtures §1–§3, §9): the
// base seed and the fixture modules on a fresh database; a second run changes no row count.
const FIXTURES = join(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
  'db/seed/fixtures',
);
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

const TABLES = [
  'companies',
  'branches',
  'users',
  'employees',
  'employee_branches',
  'roles',
  'role_permissions',
  'employee_roles',
  'employee_role_branches',
  'service_categories',
  'services',
  'branch_services',
  'service_prices',
  'payment_methods',
  'customers',
  'employee_service_eligibilities',
  'branch_opening_hours',
] as const;

async function counts(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    TABLES.map(async (table) => {
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM ${table}`,
      );
      return [table, Number(rows[0]?.n ?? 0)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

describe('pnpm db:seed (tasks 3.6–3.8)', () => {
  it('writes the base seed and the fixture rows; a second run changes no row count', async () => {
    await runSeed(t.app, FIXTURES);
    const first = await counts();
    expect(first).toStrictEqual({
      companies: 1,
      branches: 3,
      users: 9,
      employees: 9,
      employee_branches: 11,
      roles: 3,
      // Admin every code (43) + Manager 6 Part 1 + 13 Part 4 + Barber 2 Part 4 (add-walkin-visit-checkout).
      role_permissions: 64,
      employee_roles: 8,
      employee_role_branches: 7,
      service_categories: 1,
      services: 3,
      branch_services: 9,
      service_prices: 10,
      payment_methods: 2,
      customers: 1,
      employee_service_eligibilities: 12,
      branch_opening_hours: 21,
    });
    await runSeed(t.app, FIXTURES);
    expect(await counts()).toStrictEqual(first);
  });

  it('gives U Kyaw Zin the Admin role at company scope and Ma Hnin the Manager role for B3', async () => {
    const rows = await prisma.$queryRaw<
      { code: string; role: string; scope: number; branches: string | null }[]
    >`
      SELECT e.employee_code AS code, r.name_en AS role, er.scope_type AS scope,
             string_agg(b.code, ',' ORDER BY b.code) AS branches
      FROM employee_roles er
      JOIN employees e ON e.id = er.employee_id
      JOIN roles r ON r.id = er.role_id
      LEFT JOIN employee_role_branches erb ON erb.employee_role_id = er.id
      LEFT JOIN branches b ON b.id = erb.branch_id
      WHERE e.employee_code IN ('E001', 'E002', 'E009')
      GROUP BY e.employee_code, r.name_en, er.scope_type ORDER BY e.employee_code`;
    expect(rows).toStrictEqual([
      { code: 'E001', role: 'Admin', scope: 1, branches: null },
      { code: 'E002', role: 'Manager', scope: 2, branches: 'B3' },
      { code: 'E009', role: 'Barber', scope: 2, branches: 'B3' },
    ]);
  });

  it('prices Haircut 6,000 / 7,000 / 8,000 and Ko Aung’s Haircut at B3 10,000', async () => {
    const rows = await prisma.$queryRaw<
      { branch: string; employee: string | null; amount: bigint }[]
    >`
      SELECT b.code AS branch, e.employee_code AS employee, p.price_amount AS amount
      FROM service_prices p JOIN branches b ON b.id = p.branch_id
      JOIN services s ON s.id = p.service_id LEFT JOIN employees e ON e.id = p.employee_id
      WHERE s.name_en = 'Haircut' ORDER BY b.code, e.employee_code NULLS FIRST`;
    expect(rows.map((r) => [r.branch, r.employee, r.amount])).toStrictEqual([
      ['B1', null, 6000n],
      ['B2', null, 7000n],
      ['B3', null, 8000n],
      ['B3', 'E004', 10000n],
    ]);
  });

  // add-walkin-visit-checkout tasks 1.7 – 1.9 (fixture modules 050 – 090).
  it('sets the fixture KBZPay pattern ^KBZ[0-9]{10}$ on KBZPAY, CASH untouched', async () => {
    const rows = await prisma.payment_methods.findMany({
      orderBy: { sort_order: 'asc' },
      select: { code: true, reference_regex: true },
    });
    expect(rows).toStrictEqual([
      { code: 'CASH', reference_regex: null },
      { code: 'KBZPAY', reference_regex: '^KBZ[0-9]{10}$' },
    ]);
  });

  it('has Ma Su as 09 7712 3456 → +95977123456', async () => {
    expect(
      await prisma.customers.findMany({
        select: { name: true, phone: true, phone_normalized: true },
      }),
    ).toStrictEqual([{ name: 'Ma Su', phone: '09 7712 3456', phone_normalized: '+95977123456' }]);
  });

  it('makes the four active barbers eligible for the three services at their branch only', async () => {
    const rows = await prisma.$queryRaw<{ code: string; branch: string; service: string }[]>`
      SELECT e.employee_code AS code, b.code AS branch, s.name_en AS service
      FROM employee_service_eligibilities x
      JOIN employees e ON e.id = x.employee_id JOIN branches b ON b.id = x.branch_id
      JOIN services s ON s.id = x.service_id
      WHERE x.effective_to IS NULL AND x.archived_at IS NULL`;
    const by = new Map<string, string[]>();
    for (const row of rows) {
      const key = `${row.code} ${row.branch}`;
      by.set(key, [...(by.get(key) ?? []), row.service]);
    }
    const all = ['Hair wash', 'Haircut', 'Shave'];
    expect(
      Object.fromEntries([...by].map(([key, services]) => [key, [...services].sort()])),
    ).toStrictEqual({ 'E004 B3': all, 'E005 B3': all, 'E006 B1': all, 'E007 B2': all });
  });

  it('opens B1 – B3 9:00 AM – 9:00 PM on all seven days', async () => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM branch_opening_hours
      WHERE NOT is_closed AND opens_at = '09:00' AND closes_at = '21:00'`;
    expect(Number(rows[0]?.n)).toBe(21);
  });

  it('Ma Hnin holds visit.view / update / delete, sale.view and sale.finish_override for B3 only', async () => {
    const rows = await prisma.$queryRaw<{ code: string; branches: string }[]>`
      SELECT p.code, string_agg(DISTINCT b.code, ',') AS branches
      FROM employee_roles er
      JOIN employees e ON e.id = er.employee_id
      JOIN role_permissions rp ON rp.role_id = er.role_id
      JOIN permissions p ON p.id = rp.permission_id
      JOIN employee_role_branches erb ON erb.employee_role_id = er.id
      JOIN branches b ON b.id = erb.branch_id
      WHERE e.employee_code = 'E002' AND er.revoked_at IS NULL
        AND p.code IN ('visit.view', 'visit.update', 'visit.delete', 'sale.view', 'sale.finish_override')
      GROUP BY p.code ORDER BY p.code`;
    expect(rows).toStrictEqual([
      { code: 'sale.finish_override', branches: 'B3' },
      { code: 'sale.view', branches: 'B3' },
      { code: 'visit.delete', branches: 'B3' },
      { code: 'visit.update', branches: 'B3' },
      { code: 'visit.view', branches: 'B3' },
    ]);
  });

  it('module 090 gives the Part 4 codes to roles created before Part 4, once', async () => {
    // A role set as the Part 1 seed left it: drop the Part 4 links of Manager and Barber.
    await prisma.$executeRaw`
      DELETE FROM role_permissions rp USING roles r, permissions p
      WHERE rp.role_id = r.id AND rp.permission_id = p.id AND r.name_en IN ('Manager', 'Barber')
        AND p.module IN ('visit', 'sale', 'payment', 'discount')`;
    await runSeed(t.app, FIXTURES);
    await runSeed(t.app, FIXTURES);
    const rows = await prisma.$queryRaw<{ role: string; n: bigint }[]>`
      SELECT r.name_en AS role, count(*) AS n FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
      WHERE p.module IN ('visit', 'sale', 'payment', 'discount') AND r.name_en IN ('Manager', 'Barber')
      GROUP BY r.name_en ORDER BY r.name_en`;
    expect(rows.map((row) => [row.role, Number(row.n)])).toStrictEqual([
      ['Barber', 2],
      ['Manager', 13],
    ]);
  });
});
