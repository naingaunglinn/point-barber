import { Injectable } from '@nestjs/common';
import { EmployeeStatus, ScopeType, UserStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { employeeCodeLockKey } from '../employees/lock-keys.js';

// Users and employees as the first-admin command creates them (P1-RULE-14 · design D10).
@Injectable()
export class EmployeeRepository {
  /** `pg_advisory_xact_lock(hashtextextended('empcode:<company_id>', 0))`, held to commit (CG-DB-08). */
  async lockEmployeeCodes(tx: Tx, companyId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${employeeCodeLockKey(companyId)}, 0))`;
  }

  /** Exactly that address in lower case — not an insensitive `equals`, whose ILIKE reads `_` / `%`. */
  async emailExists(tx: Tx, email: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM users WHERE lower(email) = lower(${email})`;
    return Number(rows[0]?.n ?? 0) > 0;
  }

  async codeExists(tx: Tx, companyId: string, code: string): Promise<boolean> {
    return (
      (await tx.employees.count({ where: { company_id: companyId, employee_code: code } })) > 0
    );
  }

  /** An INVITED user, an ACTIVE employee and its company-scope role assignment. */
  async insertInvitedWithRole(
    tx: Tx,
    rows: {
      readonly userId: string;
      readonly employeeId: string;
      readonly assignmentId: string;
      readonly companyId: string;
      readonly roleId: string;
      readonly email: string;
      readonly code: string;
      readonly nameMm: string;
      readonly nameEn: string | null;
    },
    at: Date,
  ): Promise<void> {
    await tx.users.create({
      data: {
        id: rows.userId,
        email: rows.email,
        status: UserStatus.INVITED,
        invited_at: at,
        created_at: at,
        updated_at: at,
      },
    });
    await tx.employees.create({
      data: {
        id: rows.employeeId,
        company_id: rows.companyId,
        user_id: rows.userId,
        employee_code: rows.code,
        name_mm: rows.nameMm,
        name_en: rows.nameEn,
        status: EmployeeStatus.ACTIVE,
        created_at: at,
        updated_at: at,
      },
    });
    await tx.employee_roles.create({
      data: {
        id: rows.assignmentId,
        employee_id: rows.employeeId,
        role_id: rows.roleId,
        scope_type: ScopeType.COMPANY,
        assigned_at: at,
        created_at: at,
        updated_at: at,
      },
    });
  }
}
