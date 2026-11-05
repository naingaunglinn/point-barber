import { Module, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { PERMISSIONS } from '@point/shared';

import { GrantSource } from '../../common/access/grant-set.js';
import { EMPLOYEE_TARGET, TargetResolvers } from '../../common/access/resolvers.js';
import { TransactionRunner } from '../../common/database/transaction-runner.js';
import {
  Audit,
  CodeTables,
  CompanyOfSettings,
  PlatformModule,
  RegisteredGrantSource,
  SettingBranches,
  UserNames,
} from '../platform/index.js';
import { PeopleGrantSource } from './access/people-grant-source.js';
import { BranchUsage } from './branches/branch-usage.js';
import { BranchesController } from './branches/branches.controller.js';
import { Branches } from './branches/branches.js';
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
import { BranchesRepository } from './repositories/branches.repository.js';
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
import { PeopleSeedLock, PilotPeople } from './pilot/pilot-people.js';

// Bounded context `people` (ADR-001 · docs/engineering/module-map.md): company, branches, employees,
// branch assignments, roles and permissions. It builds on platform (audit writer, jobs); what platform
// needs from people — the primary-branch rule of the audit writer, the steps of sync.code_tables, the
// company, user names, branches and grant rows of the settings store (add-settings-store design D1 /
// D9) — is registered here at start-up, so the two modules never import each other. The access
// guard's port GrantSource and the `employee` target of P1-RULE-11 are supplied the same way (design
// D11).
@Module({
  imports: [PlatformModule],
  controllers: [OrganizationController, BranchesController],
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
    PeopleSeedLock,
    PilotPeople,
    // add-branch-management (design D1).
    BranchesRepository,
    BranchUsage,
    Branches,
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
    PeopleSeedLock,
    PilotPeople,
    BranchUsage,
  ],
})
export class PeopleModule implements OnModuleInit, OnApplicationBootstrap {
  constructor(
    private readonly audit: Audit,
    private readonly directory: PeopleDirectory,
    private readonly codeTables: CodeTables,
    private readonly runner: TransactionRunner,
    private readonly catalogue: PermissionCatalogue,
    private readonly baseSeed: BaseSeed,
    private readonly targets: TargetResolvers,
    private readonly usage: BranchUsage,
    private readonly companies: CompanyRepository,
    private readonly names: DisplayNameRepository,
    private readonly companyOfSettings: CompanyOfSettings,
    private readonly userNames: UserNames,
    private readonly settingBranches: SettingBranches,
    private readonly gateGrants: RegisteredGrantSource,
    private readonly grantSource: GrantSource,
  ) {}

  onModuleInit(): void {
    this.audit.usePrimaryBranchOf((employeeId) => this.directory.primaryBranchId(employeeId));
    this.targets.register(EMPLOYEE_TARGET, (id) => this.directory.employeeTarget(id));
    // The settings store: the one company (null before the base seed), the names behind a value
    // or a history line, and whether a branch exists (add-settings-store design D1).
    this.companyOfSettings.use(() => this.companies.companyId());
    this.userNames.use((userIds) => this.names.namesOfUsers(userIds));
    this.settingBranches.use(
      async (branchId) => (await this.directory.branchSummaries([branchId])).length === 1,
    );
    // The maintenance gate decides on the same grant rows as the access guard (design D9).
    this.gateGrants.use(this.grantSource);
    // sync.code_tables (design D10): the catalogue first, then the base seed that reads it.
    this.codeTables.contribute('permission catalogue', 10, async () => {
      await this.runner.run((tx) => this.catalogue.sync(tx, PERMISSIONS));
    });
    this.codeTables.contribute('base seed', 20, () =>
      this.runner.run((tx) => this.baseSeed.run(tx)),
    );
  }

  /**
   * After every module's onModuleInit: booking and sales have registered their counts of a branch's
   * use; a build without one of them does not start (add-branch-management design D1 · R8).
   */
  onApplicationBootstrap(): void {
    this.usage.assertComplete();
  }
}
