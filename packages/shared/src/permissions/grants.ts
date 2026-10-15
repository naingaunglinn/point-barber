import type { BranchStatus } from '../constants/status.js';

// The access slice of `GET /v1/me` (P1.ME.01 · API-AUTH-05), mirrored as types so the session wiring
// of add-foundation-auth-access is a drop-in (add-shared-ui-components design D7).

/** One permission code held at a scope: 1 COMPANY · 2 BRANCHES (with the branch ids). */
export interface Grant {
  readonly code: string;
  readonly scope_type: 1 | 2;
  readonly branch_ids: readonly string[];
}

/** `BranchSummary` of Part 1. */
export interface BranchSummary {
  readonly id: string;
  readonly code: string;
  readonly name_mm: string;
  readonly name_en?: string | null;
  readonly phone?: string | null;
  readonly status: BranchStatus;
  readonly is_public: boolean;
}

/** `MeResponse.grants`, `.effective` and `.branches_in_scope`. */
export interface MeGrants {
  readonly grants: readonly Grant[];
  readonly effective: { readonly show_own_earnings: boolean };
  readonly branches_in_scope: readonly BranchSummary[];
}
