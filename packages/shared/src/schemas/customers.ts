import { z } from 'zod';

import { CustomerStatus } from '../constants/status.js';
import { normalizeDigits } from '../text/digits.js';
import { listQuerySchema } from './list-query.js';
import { codeOf, wireDateTime } from './wire.js';

// The customer lookup DTO of add-walkin-visit-checkout (task 2.4) — point-sdd
// docs/api/openapi/part3-customers-booking.yaml v1.1 `CustomerLookup` (P3.CUS.02 · API-ERR-03).

/** `UpcomingBooking` — a BOOKED booking of the customer from now on. */
export const upcomingBookingSchema = z.strictObject({
  id: z.uuid(),
  starts_at: wireDateTime,
  branch_id: z.uuid(),
  booked_employee_id: z.uuid().optional(),
});

/** `CustomerLookup` — P3.CUS.02, the phone lookup of the Finish step. */
export const customerLookupSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  phone: z.string(),
  status: codeOf(CustomerStatus),
  notes: z.string().nullable(),
  last_visit_at: wireDateTime.nullable(),
  upcoming_bookings: z.array(upcomingBookingSchema),
});

/** P3.CUS.02 query: the phone as typed; the service normalises it (400 `phone_invalid`). */
export const customerLookupQuerySchema = z.object({ phone: z.string().max(50) });

export type CustomerLookupDto = z.infer<typeof customerLookupSchema>;
export type CustomerLookupQuery = z.infer<typeof customerLookupQuerySchema>;

// add-customer-management — P3.CUS.01 / 03 – 09 (API Part 3 v1.2 · owner CM1 – CM5 · design D4).
// Request bodies are plain z.object, so an unknown member is stripped (CG-API-03); they hold no default
// or transform, so absent and null stay apart and the OpenAPI document reads them as they are —
// normalizeCustomerMembers() and archiveNoteOf() run after parsing.

/** Customer limits: DB Part 3 v3 `customers`, OpenAPI Part 3 `CustomerCreate`, owner CM4. */
export const CustomerLimits = {
  NAME_MAX: 255,
  PHONE_MAX: 50,
  NOTES_MAX: 2000,
  ARCHIVE_NOTE_MAX: 500,
  /** The `name` column's length bounds the search text (proposal reading 18). */
  QUERY_MAX: 255,
} as const;

/** 1 – 255 characters after trimming; blank is `too_small`. */
export const customerNameSchema = z.string().trim().min(1).max(CustomerLimits.NAME_MAX);
/** As typed, ≤ 50; the service normalises it after the schema (400 `phone_invalid`). */
export const customerPhoneSchema = z.string().trim().max(CustomerLimits.PHONE_MAX);
/** ≤ 2,000 after trimming; null or blank clears the notes (normalizeCustomerMembers). */
export const customerNotesSchema = z.string().trim().max(CustomerLimits.NOTES_MAX);

/** P3.CUS.03 body — OpenAPI `CustomerCreate`; no e-mail member (D-CUS-05). */
export const customerCreateSchema = z.object({
  name: customerNameSchema,
  phone: customerPhoneSchema,
  notes: customerNotesSchema.nullable().optional(),
});

/**
 * P3.CUS.05 body — OpenAPI `CustomerUpdate`: every member optional, `name: null` is `invalid_type`,
 * `expected_updated_at` required with its offset (proposal reading 19).
 */
export const customerUpdateSchema = z.object({
  name: customerNameSchema.optional(),
  phone: customerPhoneSchema.optional(),
  notes: customerNotesSchema.nullable().optional(),
  expected_updated_at: wireDateTime,
});

/** P3.CUS.06 body — 0 INACTIVE · 1 ACTIVE. */
export const customerStatusSchema = z.object({ status: codeOf(CustomerStatus) });

/** P3.CUS.07 body — the optional note, stored as the audit `reason` (owner CM4). */
export const customerArchiveSchema = z.object({
  note: z.string().trim().max(CustomerLimits.ARCHIVE_NOTE_MAX).nullable().optional(),
});

export type CustomerCreateBody = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateBody = z.infer<typeof customerUpdateSchema>;
export type CustomerStatusBody = z.infer<typeof customerStatusSchema>;
export type CustomerArchiveBody = z.infer<typeof customerArchiveSchema>;

/** The members of a create or update as they are stored; absent stays absent. */
export interface CustomerMembers {
  readonly name?: string;
  readonly phone?: string;
  readonly notes?: string | null;
}

const blankToNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value === '' ? null : value;

/**
 * The parsed members as stored (P3.CUS.03 / 05 · AD-FMT-10): the phone with Myanmar digits written
 * 0–9, blank or null notes → null; an absent member stays absent.
 */
export function normalizeCustomerMembers(
  body: CustomerCreateBody | CustomerUpdateBody,
): CustomerMembers {
  const { name, phone, notes } = body;
  return {
    ...(name === undefined ? {} : { name }),
    ...(phone === undefined ? {} : { phone: normalizeDigits(phone) }),
    ...(notes === undefined ? {} : { notes: blankToNull(notes) }),
  };
}

/** The archive note as the audit `reason`: blank or absent → null (owner CM4). */
export function archiveNoteOf(body: CustomerArchiveBody): string | null {
  return blankToNull(body.note);
}

/** P3.CUS.01 `sort`: last visit (default), name, newest first (API-DATA-08). */
export const CUSTOMER_SORTS = ['-last_visit_at', 'name', '-created_at'] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

const STATUS_BY_TEXT: ReadonlyMap<string, CustomerStatus> = new Map([
  ['0', CustomerStatus.INACTIVE],
  ['1', CustomerStatus.ACTIVE],
]);

/**
 * `status` once (`status=0`) or repeated (`status=0&status=1`), default ACTIVE only (owner #7); any
 * other value is one `invalid_value` issue at `status` itself.
 */
const statusFilterSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value, ctx) => {
    const texts = typeof value === 'string' ? [value] : value;
    const codes: CustomerStatus[] = [];
    for (const text of texts) {
      const code = STATUS_BY_TEXT.get(text);
      if (code === undefined) {
        ctx.issues.push({
          code: 'invalid_value',
          values: [...STATUS_BY_TEXT.values()],
          input: value,
        });
        return z.NEVER;
      }
      if (!codes.includes(code)) codes.push(code);
    }
    return codes;
  })
  .default([CustomerStatus.ACTIVE]);

/** P3.CUS.01 query (owner CM1 · proposal readings 6 and 18). */
export const customerListQuerySchema = listQuerySchema.extend({
  q: z.string().max(CustomerLimits.QUERY_MAX).optional(),
  status: statusFilterSchema,
  include_archived: z.stringbool({ truthy: ['true'], falsy: ['false'] }).default(false),
  sort: z.enum(CUSTOMER_SORTS).default('-last_visit_at'),
});

/** P3.CUS.09 query — `cursor`, `limit` 1 – 100 (default 25). */
export const customerTimelineQuerySchema = listQuerySchema;

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type CustomerTimelineQuery = z.infer<typeof customerTimelineQuerySchema>;
