import { z } from 'zod';

import { BranchStatus } from '../constants/status.js';

// P1.BR.01 `GET /v1/branches` — optional filter `status` 0 / 1, read from the query string.
export const branchesQuerySchema = z.object({
  status: z.coerce
    .number()
    .pipe(z.union([z.literal(BranchStatus.INACTIVE), z.literal(BranchStatus.ACTIVE)]))
    .optional(),
});

/**
 * OpenAPI Part 1 `BranchSummary` — reference data every staff member may read; it has no sensitive
 * member (P1.BR.01). The API builds it with one mapper that names all seven members (design D15).
 */
export const branchSummarySchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.literal([BranchStatus.INACTIVE, BranchStatus.ACTIVE]),
  is_public: z.boolean(),
});

/** OpenAPI Part 1 `BranchAssignment` — one item of P1.EMP.06 (Myanmar calendar dates). */
export const branchAssignmentSchema = z.strictObject({
  id: z.uuid(),
  branch: branchSummarySchema,
  effective_from: z.iso.date(),
  effective_to: z.iso.date().nullable(),
});

export type BranchesQuery = z.infer<typeof branchesQuerySchema>;
export type BranchSummary = z.infer<typeof branchSummarySchema>;
export type BranchAssignment = z.infer<typeof branchAssignmentSchema>;
