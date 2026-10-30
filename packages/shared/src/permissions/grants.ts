import type { BranchSummary } from '../schemas/branches.js';
import type { Grant, MeResponse } from '../schemas/me.js';

// The access slice of `GET /v1/me` (P1.ME.01 · API-AUTH-05) that can() reads (add-shared-ui-components
// design D7). One definition of each shape: `Grant` and `BranchSummary` are the types of the Zod
// schemas in schemas/me.ts and schemas/branches.ts, which the OpenAPI parity test pins to Part 1.
// can() only reads, so the slice takes any read-only copy of them — a fixture persona included.

/** A grant as can() reads it. */
export type GrantView = Readonly<Omit<Grant, 'branch_ids'>> & {
  readonly branch_ids: readonly string[];
};

/** A branch of the read scope as can() receives it; a fixture may leave out the optional members. */
export type BranchView = Readonly<Omit<BranchSummary, 'name_en' | 'phone'>> &
  Partial<Readonly<Pick<BranchSummary, 'name_en' | 'phone'>>>;

/** `MeResponse.grants`, `.effective` and `.branches_in_scope`. */
export interface MeGrants {
  readonly grants: readonly GrantView[];
  readonly effective: Readonly<MeResponse['effective']>;
  readonly branches_in_scope: readonly BranchView[];
}
