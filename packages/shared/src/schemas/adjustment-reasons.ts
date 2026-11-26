import { z } from 'zod';

import { AdjustmentReasonStatus } from '../constants/status.js';
import { optionalText, requiredName, sortOrderField } from './inventory-fields.js';
import { codeOf, repeated, wireDateTime } from './wire.js';

// add-product-catalogue — the stock adjustment reasons, P6.RSN.01 – 05 (API Part 6 v1.2 §5 · OpenAPI
// Part 6 1.1.0 `AdjustmentReason*` · design D5 / D7 / D8 · task 2.4 · 🔒 D-STK-05): a company master that is
// disabled and enabled, never deleted and never archived. The order body is `IdsOrder`.

/** DB Part 6 `stock_adjustment_reasons.name_mm` / `name_en` varchar(150). */
export const AdjustmentReasonLimits = { NAME_MAX: 150 } as const;

/** P6.RSN.01 query: `status` repeatable (digits only), default ACTIVE; `status=0` is a management read. */
export const adjustmentReasonListQuerySchema = z.object({
  status: repeated(
    z.string().regex(/^\d+$/).transform(Number).pipe(codeOf(AdjustmentReasonStatus)),
  ).default([AdjustmentReasonStatus.ACTIVE]),
});

/** P6.RSN.02 body: `sort_order` absent = placed last, a value sent is stored as sent. */
export const adjustmentReasonCreateSchema = z.object({
  name_mm: requiredName(AdjustmentReasonLimits.NAME_MAX),
  name_en: optionalText(AdjustmentReasonLimits.NAME_MAX),
  sort_order: sortOrderField,
});

/** P6.RSN.03 body — a rename: `status` is not here, P6.RSN.04 owns it. */
export const adjustmentReasonRenameSchema = z.object({
  name_mm: requiredName(AdjustmentReasonLimits.NAME_MAX).optional(),
  name_en: optionalText(AdjustmentReasonLimits.NAME_MAX),
  expected_updated_at: wireDateTime,
});

/** P6.RSN.04 body: `{ status: 0 | 1 }` — disable or enable. */
export const adjustmentReasonStatusSchema = z.object({ status: codeOf(AdjustmentReasonStatus) });

/** OpenAPI Part 6 `AdjustmentReason`. `used_by_setting` is null until `add-product-lines` (#57) — PC8 ★. */
export const adjustmentReasonSchema = z.strictObject({
  id: z.uuid(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  sort_order: z.int(),
  status: codeOf(AdjustmentReasonStatus),
  used_by_setting: z.string().nullable(),
  updated_at: wireDateTime,
});

/** P6.RSN.01 / .05 answer: `{ items }`, in `sort_order`. */
export const adjustmentReasonListSchema = z.strictObject({
  items: z.array(adjustmentReasonSchema),
});

export type AdjustmentReasonListQuery = z.infer<typeof adjustmentReasonListQuerySchema>;
export type AdjustmentReasonCreate = z.infer<typeof adjustmentReasonCreateSchema>;
export type AdjustmentReasonRename = z.infer<typeof adjustmentReasonRenameSchema>;
export type AdjustmentReasonStatusChange = z.infer<typeof adjustmentReasonStatusSchema>;
export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;
export type AdjustmentReasonList = z.infer<typeof adjustmentReasonListSchema>;
