import { ErrorCode, type FieldError } from '@point/shared';

import type {
  AccessCode,
  CanDeclaration,
  CanFieldsDeclaration,
  CanViewDeclaration,
} from './declarations.js';
import { type GrantSet, reaches } from './grant-set.js';
import { parseBranchPath } from './paths.js';

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
      /**
       * `context.required` of a 403 forbidden: the code the caller does not hold (row 2), or holds
       * but not for the target branch (row 9 — API-PERM-03 v1.6).
       */
      readonly required?: string;
      /**
       * `errors[]` of the refusal, absent for every other one: one item per member whose field group
       * failed (`decideFields`, add-employee-management D2), or one per uncovered element of a `[]` path
       * with `scopeError: 'out_of_scope'`, named `items[<n>].branch_id` or, for a list of ids,
       * `branch_ids[<n>]` (P2.SVC.06 · API-ERR-01).
       */
      readonly errors?: readonly FieldError[];
    };

const ALLOW: Decision = { allow: true };

/** The elements of a `[]` path the caller does not reach, as field errors; none for any other path. */
function uncovered(
  declaration: CanDeclaration,
  branchIds: readonly string[],
  reach: (branchId: string) => boolean,
): readonly FieldError[] {
  if (declaration.branch === undefined) return [];
  const path = parseBranchPath(declaration.branch);
  if (path.kind !== 'list') return [];
  // A list of ids (`body.branch_ids[]`) has no member after the brackets: `branch_ids[0]`, not `branch_ids[0].`.
  const name = (index: number) =>
    path.field === '' ? `${path.list}[${index}]` : `${path.list}[${index}].${path.field}`;
  return branchIds.flatMap((branchId, index) =>
    reach(branchId) ? [] : [{ field: name(index), code: ErrorCode.OUT_OF_SCOPE }],
  );
}
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
      // Row 9: `forbidden` names the code, as for a caller without it (API-PERM-03 v1.6: "403
      // `forbidden` (`context.required`)"); `out_of_scope` only where a part's endpoint names it.
      if (!view && declaration.scopeError === 'out_of_scope') {
        const errors = uncovered(declaration, branchIds, reach);
        return {
          allow: false,
          status: 403,
          code: ErrorCode.OUT_OF_SCOPE,
          ...(errors.length === 0 ? {} : { errors }),
        };
      }
      const required = view ? `${declaration.module}.view` : declaration.code;
      return { allow: false, status: 403, code: ErrorCode.FORBIDDEN, required };
    }
  }
}

const FORBIDDEN_CODE = ErrorCode.FORBIDDEN;

/**
 * `@CanFields` (add-employee-management design D2 · P1.EMP.04): `decide()` once per member group
 * present in `body`, each with its own code and the employee target. One failing group refuses the
 * whole request; `errors[]` names every member of every failed group. An unknown employee is 404
 * before any group is decided — except for a caller who holds none of the codes, who gets the
 * row-2 answer whether or not the target exists. A body with no member of any group passes when the
 * caller holds any of the codes (and the target is in the scope of one of them).
 */
export function decideFields(
  declaration: CanFieldsDeclaration,
  grants: GrantSet,
  target: Target,
  method: string,
  body: unknown,
): Decision {
  const codes = [...new Set(Object.values(declaration.fields))];
  const forCode = (code: AccessCode): Decision =>
    decide({ kind: 'can', code, target: declaration.target }, grants, target, method);
  const holdsAny = codes.some((code) => grants.has(code));
  const sent =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? Object.keys(body).filter((member) => Object.hasOwn(declaration.fields, member))
      : [];
  if (sent.length === 0) {
    if (!holdsAny) return forCode(codes[0] as AccessCode);
    if (target.kind === 'missing') return { allow: false, status: 404, code: ErrorCode.NOT_FOUND };
    const decisions = codes.filter((code) => grants.has(code)).map(forCode);
    return decisions.find((d) => d.allow) ?? (decisions[0] as Decision);
  }
  // A caller with none of the codes is refused by row 2 below, whether or not the employee exists.
  if (holdsAny && target.kind === 'missing') {
    return { allow: false, status: 404, code: ErrorCode.NOT_FOUND };
  }

  const errors: FieldError[] = [];
  let first: Extract<Decision, { allow: false }> | undefined;
  for (const code of new Set(sent.map((member) => declaration.fields[member] as AccessCode))) {
    const decision = forCode(code);
    if (decision.allow) continue;
    first ??= decision;
    const required = decision.required ?? code;
    for (const member of sent) {
      if (declaration.fields[member] === code) {
        errors.push({ field: member, code: FORBIDDEN_CODE, params: { required } });
      }
    }
  }
  if (first === undefined) return ALLOW;
  return { ...first, errors };
}
