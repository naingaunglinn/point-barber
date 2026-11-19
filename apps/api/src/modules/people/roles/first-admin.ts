import { Injectable } from '@nestjs/common';
import { ScopeType, UserStatus } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Audit } from '../../platform/index.js';
import { CatalogueRepository } from '../repositories/catalogue.repository.js';
import { CompanyRepository } from '../repositories/company.repository.js';
import { EmployeeRepository } from '../repositories/employee.repository.js';
import { CompanyAdmin } from './company-admin.js';

// The first company admin of an environment (P1-RULE-14 · P1-RULE-12 · P1-RULE-02 · design D10): no
// endpoint creates it; the operator command does, in one transaction, under the code-tables lock so
// two operators cannot race. It succeeds only while no active company admin exists — one still
// INVITED counts — and only after the API has started once (the seed Admin role exists). The person
// then signs in like any invited employee; no e-mail is sent and no branch is assigned (company scope
// reaches every branch). Any refusal changes nothing.

export class FirstAdminRefused extends Error {
  override readonly name = 'FirstAdminRefused';
}

export interface FirstAdminInput {
  readonly email: string;
  readonly nameMm: string;
  readonly nameEn?: string;
  readonly code: string;
  /** The operating-system user that ran the command (audit `after_data.operator`). */
  readonly operator: string;
}

@Injectable()
export class FirstAdmin {
  constructor(
    private readonly catalogue: CatalogueRepository,
    private readonly companies: CompanyRepository,
    private readonly employees: EmployeeRepository,
    private readonly companyAdmin: CompanyAdmin,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  async create(tx: Tx, input: FirstAdminInput): Promise<{ employeeId: string }> {
    await this.catalogue.lockCodeTables(tx);
    if (await this.companyAdmin.activeAdminExists(tx)) {
      throw new FirstAdminRefused(
        'an active company admin exists — further admins are assigned in the app',
      );
    }
    const companyId = await this.companies.companyId(tx);
    const adminRole = (await this.catalogue.rolesWithCodes(tx)).find((role) =>
      this.companyAdmin.isCompanyAdminRole(role.codes),
    );
    if (companyId === null || adminRole === undefined) {
      throw new FirstAdminRefused(
        'the seed Admin role does not exist yet — start the API once first',
      );
    }
    const email = input.email.trim().toLowerCase();
    if (await this.employees.emailExists(tx, email)) {
      throw new FirstAdminRefused('the e-mail address belongs to a user already');
    }
    if (await this.employees.codeExists(tx, companyId, input.code)) {
      throw new FirstAdminRefused('the employee code is taken already');
    }

    const now = this.clock.now();
    const id = () => uuidV7(now.getTime());
    const rows = {
      userId: id(),
      employeeId: id(),
      assignmentId: id(),
      companyId,
      roleId: adminRole.id,
      email,
      code: input.code,
      nameMm: input.nameMm,
      nameEn: input.nameEn ?? null,
    };
    await this.employees.insertInvitedWithRole(tx, rows, now);
    this.audit.emitSystem({
      action: 'employee.create',
      entity_type: 'employees',
      entity_id: rows.employeeId,
      after: {
        employee_code: rows.code,
        email,
        name_mm: rows.nameMm,
        name_en: rows.nameEn,
        user_status: UserStatus.INVITED,
        operator: input.operator,
      },
    });
    this.audit.emitSystem({
      action: 'employee.role_assign',
      entity_type: 'employee_roles',
      entity_id: rows.assignmentId,
      after: {
        employee_id: rows.employeeId,
        role_id: rows.roleId,
        scope_type: ScopeType.COMPANY,
        operator: input.operator,
      },
    });
    return { employeeId: rows.employeeId };
  }
}
