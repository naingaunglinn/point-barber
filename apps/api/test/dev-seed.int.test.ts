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
      role_permissions: 27,
      employee_roles: 8,
      employee_role_branches: 7,
      service_categories: 1,
      services: 3,
      branch_services: 9,
      service_prices: 10,
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
    expect(rows.map((r) => [r.branch, r.employee, Number(r.amount)])).toStrictEqual([
      ['B1', null, 6000],
      ['B2', null, 7000],
      ['B3', null, 8000],
      ['B3', 'E004', 10000],
    ]);
  });
});
