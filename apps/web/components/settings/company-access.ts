import type { useCan } from '../../lib/session/grants';

// Who sees and who edits Settings › Company (AD-NAV-02 · AD-PERM-02 · AD-PERM-03 · ADR-012 ·
// add-company-profile design D8): the entry and the values for any `company.*` grant, at any scope; the
// form only with `company.update` through a company-scope assignment — the API refuses a branch-scope
// one with 403 `company_scope_required`, so such a holder sees the values as text.

type Can = ReturnType<typeof useCan>;

/** Any `company.*` code (`company.view`, `company.update`), at any scope. */
export const seesCompany = (can: Can): boolean => can('company.view') || can('company.update');

/** `company.update` with company scope. */
export const editsCompany = (can: Can): boolean => can('company.update', { level: 'company' });
