import { describe, expect, it } from 'vitest';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { EmployeeRepository } from '../repositories/employee.repository.js';
import { RoleRepository } from '../repositories/role.repository.js';
import type { PrismaService } from '../../../common/database/prisma.service.js';
import { CompanyAdmin } from '../roles/company-admin.js';
import { EmployeeCodes } from './employee-codes.js';
import { companyAdminLockKey, employeeCodeLockKey } from './lock-keys.js';

// add-employee-management task 1.9 — the two advisory-lock keys of module-map.md (CG-DB-08 · design D1):
// the key strings are exactly `empcode:<company_id>` and `coadmin:<company_id>`, and each helper runs
// one transaction-level exclusive lock on `hashtextextended(<key>, 0)`.

const COMPANY = '0199a3f2-0000-7000-8000-000000000001';

/** A transaction that records the tagged-template statements it is asked to run. */
function recordingTx() {
  const statements: { sql: string; values: unknown[] }[] = [];
  const tx = {
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ sql: strings.join('?').replace(/\s+/g, ' ').trim(), values });
      return Promise.resolve(1);
    },
  } as unknown as Tx;
  return { tx, statements };
}

describe('advisory-lock keys (task 1.9)', () => {
  it('the key strings are exactly these', () => {
    expect(employeeCodeLockKey(COMPANY)).toBe(`empcode:${COMPANY}`);
    expect(companyAdminLockKey(COMPANY)).toBe(`coadmin:${COMPANY}`);
  });

  it('EmployeeCodes.lock takes empcode:<company_id>, transaction-level and exclusive', async () => {
    const { tx, statements } = recordingTx();
    await new EmployeeCodes(new EmployeeRepository()).lock(tx, COMPANY);
    expect(statements).toEqual([
      {
        sql: 'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
        values: [`empcode:${COMPANY}`],
      },
    ]);
  });

  it('CompanyAdmin.lock takes coadmin:<company_id>, transaction-level and exclusive', async () => {
    const { tx, statements } = recordingTx();
    const roles = new RoleRepository({} as PrismaService);
    const admin = new CompanyAdmin(
      {} as ConstructorParameters<typeof CompanyAdmin>[0],
      roles,
      {} as ConstructorParameters<typeof CompanyAdmin>[2],
      {} as ConstructorParameters<typeof CompanyAdmin>[3],
    );
    await admin.lock(tx, COMPANY);
    expect(statements).toEqual([
      {
        sql: 'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
        values: [`coadmin:${COMPANY}`],
      },
    ]);
  });
});
