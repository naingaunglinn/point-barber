'use client';

import { ScopeType } from '@point/shared';

import { useCan, useGrantsMe } from '../session/grants';

// add-branch-management — who reaches what on the branch screens (AD-PERM-02 · AD-PERM-03 · API-PERM-07 ·
// ADR-012 · design D9): the screens never show a control the API refuses. The UI only mirrors the API,
// which checks every request.

/** The four branch codes (permissions.json): any of them, at any scope, opens Settings › Branches. */
export const BRANCH_CODES = [
  'branch.view',
  'branch.create',
  'branch.update',
  'branch.delete',
] as const;

const isBranchCode = (code: string) => (BRANCH_CODES as readonly string[]).includes(code);

export interface BranchAccess {
  /** Any branch code at any scope (branch.view⁺): the menu item, the list and a detail page. */
  readonly any: boolean;
  /** `branch.create` at company scope (P1-RULE-13): New branch and /settings/branches/new. */
  readonly create: boolean;
  /** `branch.delete` at company scope (P1.BR.05): Deactivate and Re-activate. */
  readonly setStatus: boolean;
  /** `branch.update` for the branch (P1.BR.04): the form; otherwise the values as text. */
  readonly update: (branchId: string) => boolean;
  /** The branch is covered by a branch-code grant — every branch at company scope (API-PERM-07). */
  readonly covers: (branchId: string) => boolean;
}

export function useBranchAccess(): BranchAccess {
  const can = useCan();
  const grants = useGrantsMe().grants.filter((grant) => isBranchCode(grant.code));
  const company = grants.some((grant) => grant.scope_type === ScopeType.COMPANY);
  const covered = new Set(grants.flatMap((grant) => grant.branch_ids));
  return {
    any: BRANCH_CODES.some((code) => can(code)),
    create: can('branch.create', { level: 'company' }),
    setStatus: can('branch.delete', { level: 'company' }),
    update: (branchId) => can('branch.update', { branchId }),
    covers: (branchId) => company || covered.has(branchId),
  };
}
