import { ScopeType } from '@point/shared';

// The caller's grants and read scope (P1-RULE-05 · D-ROLE-03 / 04 / 05 · design D11), built on every
// request from the rows the people module returns — nothing is cached between requests, so a changed
// role, assignment or scope applies on the next request (D-ROLE-06).

/** One permission of one role assignment of the caller, as the people tables hold it. */
export interface AssignmentRow {
  readonly code: string;
  readonly module: string;
  readonly scope_type: number;
  /** employee_roles.revoked_at — a revoked assignment contributes nothing. */
  readonly revoked_at: Date | null;
  /** permissions.archived_at — an archived permission contributes nothing. */
  readonly permission_archived_at: Date | null;
  /** roles.archived_at — an archived role contributes nothing. */
  readonly role_archived_at: Date | null;
  /** employee_role_branches of the assignment (empty at company scope). */
  readonly branch_ids: readonly string[];
}

/** One employee_branches row of the caller; dates are Myanmar calendar dates `YYYY-MM-DD`. */
export interface BranchAssignmentRow {
  readonly branch_id: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
}

export interface GrantSourceRows {
  readonly assignments: readonly AssignmentRow[];
  readonly branches: readonly BranchAssignmentRow[];
}

/** The port the people module implements (D1): the caller's rows, read fresh on every request. */
export abstract class GrantSource {
  abstract rowsFor(employeeId: string): Promise<GrantSourceRows>;
}

/** A set of branches: every branch of the company, or the listed ones. */
export interface Scope {
  readonly all: boolean;
  readonly branchIds: ReadonlySet<string>;
}

/** One grant per code, as `/me` lists it (API-AUTH-05): merged over the caller's assignments. */
export interface MergedGrant {
  readonly code: string;
  readonly scope_type: ScopeType;
  readonly branch_ids: readonly string[];
}

interface CodeGrant {
  readonly module: string;
  company: boolean;
  readonly branchIds: Set<string>;
}

const NONE: Scope = { all: false, branchIds: new Set() };

const isActiveOn = (row: BranchAssignmentRow, today: string): boolean =>
  row.effective_from <= today && (row.effective_to === null || today <= row.effective_to);

export class GrantSet {
  private constructor(
    private readonly byCode: ReadonlyMap<string, CodeGrant>,
    /** Every signed-in caller's read scope: their branch assignments ∪ every branch a grant covers. */
    readonly readScope: Scope,
  ) {}

  /** Grants only add up; there is no deny (D-ROLE-04). `today` is the Myanmar calendar date. */
  static build(rows: GrantSourceRows, today: string): GrantSet {
    const byCode = new Map<string, CodeGrant>();
    for (const row of rows.assignments) {
      if (row.revoked_at !== null || row.permission_archived_at !== null) continue;
      if (row.role_archived_at !== null) continue;
      const grant = byCode.get(row.code) ?? {
        module: row.module,
        company: false,
        branchIds: new Set(),
      };
      if (row.scope_type === ScopeType.COMPANY) grant.company = true;
      else for (const id of row.branch_ids) grant.branchIds.add(id);
      byCode.set(row.code, grant);
    }
    const company = [...byCode.values()].some((grant) => grant.company);
    const branchIds = new Set(
      rows.branches.filter((row) => isActiveOn(row, today)).map((row) => row.branch_id),
    );
    if (!company)
      for (const grant of byCode.values()) for (const id of grant.branchIds) branchIds.add(id);
    return new GrantSet(byCode, { all: company, branchIds: company ? new Set() : branchIds });
  }

  has(code: string): boolean {
    return this.byCode.has(code);
  }

  /** The code is held through a company-scope assignment. */
  isCompany(code: string): boolean {
    return this.byCode.get(code)?.company ?? false;
  }

  /** The branches the code reaches. */
  branches(code: string): Scope {
    const grant = this.byCode.get(code);
    if (grant === undefined) return NONE;
    return grant.company
      ? { all: true, branchIds: new Set() }
      : { all: false, branchIds: grant.branchIds };
  }

  covers(code: string, branchId: string): boolean {
    const grant = this.byCode.get(code);
    return grant !== undefined && (grant.company || grant.branchIds.has(branchId));
  }

  /** Any code of the module is held — `<module>.view` or more (`view⁺`, API-PERM-03). */
  anyOf(module: string): boolean {
    return [...this.byCode.values()].some((grant) => grant.module === module);
  }

  /** Some code of the module is held at company scope. */
  isCompanyInModule(module: string): boolean {
    return [...this.byCode.values()].some((grant) => grant.module === module && grant.company);
  }

  /** The branches any code of the module reaches: what a `@CanView(module)` list is filtered by. */
  branchesOfModule(module: string): Scope {
    const grants = [...this.byCode.values()].filter((grant) => grant.module === module);
    if (grants.some((grant) => grant.company)) return { all: true, branchIds: new Set() };
    return { all: false, branchIds: new Set(grants.flatMap((grant) => [...grant.branchIds])) };
  }

  /** One grant per code, sorted by code; branch ids sorted (P1.ME.01). */
  merged(): MergedGrant[] {
    return [...this.byCode.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([code, grant]) => ({
        code,
        scope_type: grant.company ? ScopeType.COMPANY : ScopeType.BRANCHES,
        branch_ids: grant.company ? [] : [...grant.branchIds].sort(),
      }));
  }
}

/** A scope reaches the branch. */
export const reaches = (scope: Scope, branchId: string): boolean =>
  scope.all || scope.branchIds.has(branchId);
