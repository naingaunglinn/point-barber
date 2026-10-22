import { Module, type OnModuleInit } from '@nestjs/common';
import { PERMISSIONS } from '@point/shared';

import { GrantSource } from '../../common/access/grant-set.js';
import { EMPLOYEE_TARGET, TargetResolvers } from '../../common/access/resolvers.js';
import { TransactionRunner } from '../../common/database/transaction-runner.js';
import { Audit, CodeTables, PlatformModule } from '../platform/index.js';
import { PeopleGrantSource } from './access/people-grant-source.js';
import { PermissionCatalogue } from './catalogue/permission-catalogue.js';
import { CurrentCompany } from './company/current-company.js';
import { Assignments } from './directory/assignments.js';
import { BranchCodes } from './directory/branch-codes.js';
import { BranchHeaders } from './directory/branch-headers.js';
import { DisplayNames } from './directory/display-names.js';
import { PeopleDirectory } from './directory/people-directory.js';
import { OrganizationController } from './organization/organization.controller.js';
import { AccessRepository } from './repositories/access.repository.js';
import { AssignmentsRepository } from './repositories/assignments.repository.js';
import { BranchCodesRepository } from './repositories/branch-codes.repository.js';
import { BranchHeaderRepository } from './repositories/branch-header.repository.js';
import { CatalogueRepository } from './repositories/catalogue.repository.js';
import { CompanyRepository } from './repositories/company.repository.js';
import { DisplayNameRepository } from './repositories/display-name.repository.js';
import { EmployeeRepository } from './repositories/employee.repository.js';
import { PeopleRepository } from './repositories/people.repository.js';
import { RoleRepository } from './repositories/role.repository.js';
import { CompanyAdmin } from './roles/company-admin.js';
import { FirstAdmin } from './roles/first-admin.js';
import { SeedRoles } from './roles/seed-roles.js';
import { BaseSeed } from './seed/base-seed.js';

// Bounded context `people` (ADR-001 · docs/engineering/module-map.md): company, branches, employees,
// branch assignments, roles and permissions. It builds on platform (audit writer, jobs); what platform
// needs from people — the primary-branch rule of the audit writer, the steps of sync.code_tables —
// is registered here at start-up, so the two modules never import each other. The access guard's
// port GrantSource and the `employee` target of P1-RULE-11 are supplied the same way (design D11).
@Module({
  imports: [PlatformModule],
  controllers: [OrganizationController],
  providers: [
    PeopleRepository,
    AccessRepository,
    AssignmentsRepository,
    BranchCodesRepository,
    BranchHeaderRepository,
    PeopleGrantSource,
    { provide: GrantSource, useExisting: PeopleGrantSource },
    CatalogueRepository,
    CompanyRepository,
    DisplayNameRepository,
    EmployeeRepository,
    RoleRepository,
    PeopleDirectory,
    DisplayNames,
    Assignments,
    BranchCodes,
    BranchHeaders,
    CurrentCompany,
    CompanyAdmin,
    PermissionCatalogue,
    SeedRoles,
    BaseSeed,
    FirstAdmin,
  ],
  exports: [
    GrantSource,
    PeopleDirectory,
    DisplayNames,
    Assignments,
    BranchCodes,
    BranchHeaders,
    CurrentCompany,
    CompanyAdmin,
    PermissionCatalogue,
    BaseSeed,
    FirstAdmin,
  ],
})
export class PeopleModule implements OnModuleInit {
  constructor(
    private readonly audit: Audit,
    private readonly directory: PeopleDirectory,
    private readonly codeTables: CodeTables,
    private readonly runner: TransactionRunner,
    private readonly catalogue: PermissionCatalogue,
    private readonly baseSeed: BaseSeed,
    private readonly targets: TargetResolvers,
  ) {}

  onModuleInit(): void {
    this.audit.usePrimaryBranchOf((employeeId) => this.directory.primaryBranchId(employeeId));
    this.targets.register(EMPLOYEE_TARGET, (id) => this.directory.employeeTarget(id));
    // sync.code_tables (design D10): the catalogue first, then the base seed that reads it.
    this.codeTables.contribute('permission catalogue', 10, async () => {
      await this.runner.run((tx) => this.catalogue.sync(tx, PERMISSIONS));
    });
    this.codeTables.contribute('base seed', 20, () =>
      this.runner.run((tx) => this.baseSeed.run(tx)),
    );
  }
}
