import type { BranchSummary } from '../schemas/branches.js';
import type { Grant, MeResponse } from '../schemas/me.js';

// The access slice of `GET /v1/me` (P1.ME.01 · API-AUTH-05) that can() reads (add-shared-ui-components
// design D7). One definition of each shape: `Grant` and `BranchSummary` are the types of the Zod
// schemas in schemas/me.ts and schemas/branches.ts, which the OpenAPI parity test pins to Part 1.

/** `MeResponse.grants`, `.effective` and `.branches_in_scope`; readonly, so any copy is accepted. */
export interface MeGrants {
  readonly grants: readonly Grant[];
  readonly effective: Readonly<MeResponse['effective']>;
  readonly branches_in_scope: readonly BranchSummary[];
}
