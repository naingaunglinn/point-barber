import { z } from 'zod';

import { CancelReasonStatus, CancelReasonSystemCode } from '../constants/status.js';
import { codeOf, repeated, wireDateTime } from './wire.js';

// add-booking-cancel-reasons — the cancel-reason master list, P3.CRS.01 – 05 (API Part 3 v1.2 §3 ·
// OpenAPI Part 3 1.2.0 · design D6 · task 2.1). Request objects are plain z.object: an unknown member
// — `system_code` on a create (P3.CRS.02 "never creates a system row") — is stripped (CG-API-03).
// A failed bound is the Zod issue name (`too_small` / `too_big` / `invalid_type`, API-ERR-03).

/** DB Part 3 v3 `booking_cancel_reasons`: `name_mm` / `name_en` varchar(150), `sort_order` integer. */
export const CancelReasonLimits = {
  NAME_MAX: 150,
  SORT_ORDER_MAX: 2_147_483_647,
} as const;

/** The Myanmar name: required, 1 – 150 characters after trimming (D-DB-04). */
const nameMm = z.string().trim().min(1).max(CancelReasonLimits.NAME_MAX);
/** The English name: optional, at most 150 characters after trimming, or null. */
const nameEn = z.string().trim().max(CancelReasonLimits.NAME_MAX).nullable().optional();

/**
 * P3.CRS.01 query: `status` repeatable (`status=0&status=1`), default ACTIVE only; `include_archived`
 * `true` / `false`, default false (a management read — the handler checks the code).
 */
export const cancelReasonListQuerySchema = z.object({
  // Digits only: `?status=` or a blank is a 400, never status 0 (INACTIVE).
  status: repeated(
    z.string().regex(/^\d+$/).transform(Number).pipe(codeOf(CancelReasonStatus)),
  ).default([CancelReasonStatus.ACTIVE]),
  include_archived: z.stringbool({ truthy: ['true'], falsy: ['false'] }).default(false),
});

/**
 * P3.CRS.02 body. `requires_note` absent = false; `sort_order` absent = placed last (owner CR1 — the
 * service computes it), a sent value is stored as sent.
 */
export const cancelReasonCreateSchema = z.object({
  name_mm: nameMm,
  name_en: nameEn,
  requires_note: z.boolean().default(false),
  sort_order: z.int().min(0).max(CancelReasonLimits.SORT_ORDER_MAX).optional(),
});

/**
 * P3.CRS.03 body: every member optional except `expected_updated_at` (API-IDEM-04); the system row's
 * `status` and `requires_note` are checked by the service (409 `system_row`), not here.
 */
export const cancelReasonUpdateSchema = z.object({
  name_mm: nameMm.optional(),
  name_en: nameEn,
  requires_note: z.boolean().optional(),
  status: codeOf(CancelReasonStatus).optional(),
  expected_updated_at: wireDateTime,
});

/** P3.CRS.05 body: the ids of every non-archived reason in the new order (the service checks the set). */
export const cancelReasonOrderSchema = z.object({ ids: z.array(z.uuid()).min(1) });

/** OpenAPI Part 3 `CancelReason` (§11): the answer of every P3.CRS endpoint, strict. */
export const cancelReasonSchema = z.strictObject({
  id: z.uuid(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  requires_note: z.boolean(),
  system_code: codeOf(CancelReasonSystemCode).nullable(),
  sort_order: z.int(),
  status: codeOf(CancelReasonStatus),
  archived_at: wireDateTime.nullable(),
  updated_at: wireDateTime,
});

/** P3.CRS.01 / .05 answer: `{ items }`, in `sort_order` (no paging — a short master list). */
export const cancelReasonListSchema = z.strictObject({ items: z.array(cancelReasonSchema) });

export type CancelReasonListQuery = z.infer<typeof cancelReasonListQuerySchema>;
export type CancelReasonCreate = z.infer<typeof cancelReasonCreateSchema>;
export type CancelReasonUpdate = z.infer<typeof cancelReasonUpdateSchema>;
export type CancelReasonOrder = z.infer<typeof cancelReasonOrderSchema>;
export type CancelReason = z.infer<typeof cancelReasonSchema>;
export type CancelReasonList = z.infer<typeof cancelReasonListSchema>;
