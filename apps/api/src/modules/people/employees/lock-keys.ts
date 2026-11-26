// The two advisory-lock keys of add-employee-management (docs/engineering/module-map.md → Advisory lock
// keys · design D1 · CG-DB-08). Each is taken through its one named helper — `EmployeeCodes.lock` and
// `CompanyAdmin.lock` — on `hashtextextended(<key>, 0)`, transaction-level and exclusive.

/** Serialises the creates that read the highest employee number of a company (design D5). */
export const employeeCodeLockKey = (companyId: string): string => `empcode:${companyId}`;

/** Serialises the writes that can remove the last active company admin (P1-RULE-12 · design D7). */
export const companyAdminLockKey = (companyId: string): string => `coadmin:${companyId}`;
