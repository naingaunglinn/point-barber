import { Injectable } from '@nestjs/common';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Audit } from '../../platform/index.js';
import { CatalogueRepository } from '../repositories/catalogue.repository.js';
import { RoleRepository } from '../repositories/role.repository.js';

// The company admin (P1-RULE-12 · ADR-011 · design D10). A company-admin role is a role whose
// permission set holds all five role codes; a company admin is an employee with an unrevoked
// company-scope assignment of such a role — whatever the role is called. Every newly deployed code
// goes to every company-admin role.

export const ROLE_CODES = [
  'role.view',
  'role.create',
  'role.update',
  'role.delete',
  'role.assign',
] as const;

@Injectable()
export class CompanyAdmin {
  constructor(
    private readonly catalogue: CatalogueRepository,
    private readonly roles: RoleRepository,
    private readonly audit: Audit,
    private readonly clock: Clock,
  ) {}

  isCompanyAdminRole(codes: readonly string[]): boolean {
    return ROLE_CODES.every((code) => codes.includes(code));
  }

  /** The employee holds a company-admin role at company scope, unrevoked. */
  async isCompanyAdmin(employeeId: string, tx?: Tx): Promise<boolean> {
    const roles = await this.roles.companyScopeRoleCodes(employeeId, tx);
    return roles.some((codes) => this.isCompanyAdminRole(codes));
  }

  /**
   * An active company admin exists (P1-RULE-14, read as P1-RULE-12 reads it for the last-admin rule):
   * an ACTIVE employee with such an assignment, whatever the user's status — an admin who has not
   * signed in yet (INVITED) counts.
   */
  async activeAdminExists(tx: Tx): Promise<boolean> {
    const holders = await this.roles.activeEmployeesCompanyScopeRoleCodes(tx);
    return holders.some((codes) => this.isCompanyAdminRole(codes));
  }

  /** Adds newly created codes to every company-admin role; one role.permissions_set row each. */
  async grantToAdminRoles(tx: Tx, created: readonly { code: string; id: string }[]): Promise<void> {
    const now = this.clock.now();
    for (const role of await this.catalogue.rolesWithCodes(tx)) {
      if (!this.isCompanyAdminRole(role.codes)) continue;
      const missing = created.filter(({ code }) => !role.codes.includes(code));
      if (missing.length === 0) continue;
      await this.catalogue.addPermissionsToRole(
        tx,
        role.id,
        missing.map(({ id }) => ({ id, linkId: uuidV7(now.getTime()) })),
        now,
      );
      this.audit.emitSystem({
        action: 'role.permissions_set',
        entity_type: 'roles',
        entity_id: role.id,
        after: { added: missing.map(({ code }) => code) },
      });
    }
  }
}
