// Public surface of the `people` module (CG-ARCH-01 · ADR-001 rule 1): other modules import only
// from here.
export { PermissionCatalogue, type SyncResult } from './catalogue/permission-catalogue.js';
export { CurrentCompany } from './company/current-company.js';
export { DisplayNames } from './directory/display-names.js';
export { PeopleDirectory } from './directory/people-directory.js';
export { PeopleModule } from './people.module.js';
export { CompanyAdmin, ROLE_CODES } from './roles/company-admin.js';
export { FirstAdmin, type FirstAdminInput, FirstAdminRefused } from './roles/first-admin.js';
export { MANAGER_SEED_CODES } from './roles/seed-roles.js';
export { BaseSeed } from './seed/base-seed.js';
