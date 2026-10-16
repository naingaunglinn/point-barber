import { ErrorCode } from '@point/shared';

import type { CanDeclaration, CanViewDeclaration } from './declarations.js';
import { type GrantSet, reaches } from './grant-set.js';

// The access decision of design D11 — a pure function, so its table is tested row by row without a
// request (task 4.6). AccessGuard resolves the target and calls it; nothing else decides access.

/** What the declaration points at, as AccessGuard resolved it from the request. */
export type Target = (
  | { readonly kind: 'none' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'missing' }
  | {
      readonly kind: 'branches';
      readonly branchIds: readonly string[];
      readonly match: 'all' | 'any';
    }
) & {
  /** The orSelf path or resolver matched the caller (false when the declaration has none). */
  readonly self?: boolean;
};

export type Decision =
  | { readonly allow: true }
  | {
      readonly allow: false;
      readonly status: 403 | 404;
      readonly code: ErrorCode;
      /** `context.required` of a 403 forbidden for a caller who does not hold the code. */
      readonly required?: string;
    };

const ALLOW: Decision = { allow: true };
const READS = new Set(['GET', 'HEAD']);

/**
 * `decide(declaration, grants, target, method)` — the rows of the D11 table in order, first match
 * wins. A changing request outside the caller's branches is 403; a read is 404, the answer for an id
 * that does not exist (API-PERM-03).
 */
export function decide(
  declaration: CanDeclaration | CanViewDeclaration,
  grants: GrantSet,
  target: Target,
  method: string,
): Decision {
  const view = declaration.kind === 'canView';
  const holds = view ? grants.anyOf(declaration.module) : grants.has(declaration.code);
  const company = view
    ? grants.isCompanyInModule(declaration.module)
    : grants.isCompany(declaration.code);
  const self = target.self === true;

  // Rows 1–2: the own-record rule, then the code itself. Not holding the code is answered the same
  // whether or not the target exists.
  if (!holds) {
    if (self) return ALLOW;
    const required = view ? `${declaration.module}.view` : declaration.code;
    return { allow: false, status: 403, code: ErrorCode.FORBIDDEN, required };
  }
  // Row 3: company-master writes and private data need company scope.
  if ((declaration.level === 'company' || declaration.level === 'private') && !company) {
    return { allow: false, status: 403, code: ErrorCode.COMPANY_SCOPE_REQUIRED };
  }
  // Row 4: shared data — any assignment.
  if (declaration.level === 'shared') return ALLOW;

  switch (target.kind) {
    case 'none':
      return ALLOW;
    // Row 5: an optional branch left empty is the company-master target.
    case 'empty':
      return company
        ? ALLOW
        : { allow: false, status: 403, code: ErrorCode.COMPANY_SCOPE_REQUIRED };
    // Row 6.
    case 'missing':
      return { allow: false, status: 404, code: ErrorCode.NOT_FOUND };
    case 'branches': {
      // Row 7: the subject of the record.
      if (self) return ALLOW;
      const reach = (branchId: string): boolean =>
        view
          ? reaches(grants.branchesOfModule(declaration.module), branchId)
          : grants.covers(declaration.code, branchId);
      const { branchIds } = target;
      // An empty set is reachable at company scope only (P1-RULE-11).
      const covered =
        branchIds.length === 0
          ? company
          : target.match === 'all'
            ? branchIds.every(reach)
            : branchIds.some(reach);
      if (covered) return ALLOW;
      // Rows 8–9.
      if (READS.has(method.toUpperCase())) {
        return { allow: false, status: 404, code: ErrorCode.NOT_FOUND };
      }
      const scopeError = view ? undefined : declaration.scopeError;
      return {
        allow: false,
        status: 403,
        code: scopeError === 'out_of_scope' ? ErrorCode.OUT_OF_SCOPE : ErrorCode.FORBIDDEN,
      };
    }
  }
}
