import { z } from 'zod';

import { LeaveTypeStatus } from '../constants/status.js';
import { codeOf, wireDateTime } from './wire.js';

// add-leave-types — P2.LVT.01 – 04 (API Part 2 v1.6 · OpenAPI 1.6.0 `LeaveType*` · design D4). Request
// objects are plain z.object: an unknown member is stripped (CG-API-03). The limits are the DB columns
// (`leave_types.name_mm` / `name_en` varchar(100), `sort_order` integer — Recorded reading 8).

export const LeaveTypeLimits = { NAME_MAX: 100 } as const;

/** Blank after trimming → null (design D4: an empty English name is stored as NULL). */
const blankAsNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** Required, trimmed, 1 – 100 characters (D-DB-04). */
const nameMm = z.string().trim().min(1).max(LeaveTypeLimits.NAME_MAX);
/** Optional, trimmed, at most 100 characters; blank → null; never checked for uniqueness. */
const nameEn = z
  .preprocess(blankAsNull, z.string().trim().max(LeaveTypeLimits.NAME_MAX).nullable())
  .optional();
/** A DB `integer`: any 32-bit integer — anything else is `too_small`, `too_big` or `invalid_type`. */
const sortOrder = z.int32();
const leaveTypeStatus = codeOf(LeaveTypeStatus);

/** P2.LVT.02 body — OpenAPI `LeaveTypeCreate`; without `sort_order` the type is placed last (LT1). */
export const leaveTypeCreateSchema = z.object({
  name_mm: nameMm,
  name_en: nameEn,
  is_paid: z.boolean(),
  sort_order: sortOrder.optional(),
});

/**
 * P2.LVT.03 body — OpenAPI `LeaveTypeUpdate`: every member optional (API-SHAPE-04) plus `status`, and
 * `expected_updated_at` required (Recorded reading 4 — compared to the millisecond, design D6).
 */
export const leaveTypeUpdateSchema = leaveTypeCreateSchema.partial().extend({
  status: leaveTypeStatus.optional(),
  expected_updated_at: wireDateTime,
});

/** A repeatable query member (`status=0&status=1`): one value arrives as a string, several as a list. */
const repeated = <T extends z.ZodType>(item: T) =>
  z.preprocess((value): unknown[] => (Array.isArray(value) ? value : [value]), z.array(item));

/**
 * P2.LVT.01 query: `status` repeatable, default `[1]` ACTIVE — digits only, so `?status=` is a 400, never
 * status 0; `include_archived` exactly `true` or `false`, default false.
 */
export const leaveTypesQuerySchema = z.object({
  status: repeated(z.string().regex(/^\d+$/).transform(Number).pipe(leaveTypeStatus)).default([
    LeaveTypeStatus.ACTIVE,
  ]),
  include_archived: z.stringbool({ truthy: ['true'], falsy: ['false'] }).default(false),
});

/**
 * OpenAPI Part 2 `LeaveType` (P2.LVT.01 – 04), strict: every item carries `archived_at` (spec "Any staff
 * member lists the leave types in their order"). `updated_at` with its milliseconds — the value a client
 * echoes as `expected_updated_at` (`toMmtIsoMillis`); `archived_at` to the second (`toMmtIso`).
 */
export const leaveTypeSchema = z.strictObject({
  id: z.uuid(),
  name_mm: z.string().max(LeaveTypeLimits.NAME_MAX),
  name_en: z.string().max(LeaveTypeLimits.NAME_MAX).nullable(),
  is_paid: z.boolean(),
  sort_order: sortOrder,
  status: leaveTypeStatus,
  archived_at: wireDateTime.nullable(),
  updated_at: wireDateTime,
});

export type LeaveTypeCreateBody = z.infer<typeof leaveTypeCreateSchema>;
export type LeaveTypeUpdateBody = z.infer<typeof leaveTypeUpdateSchema>;
export type LeaveTypesQuery = z.infer<typeof leaveTypesQuerySchema>;
export type LeaveType = z.infer<typeof leaveTypeSchema>;
