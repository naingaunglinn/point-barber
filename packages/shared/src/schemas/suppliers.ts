import { z } from 'zod';

import { SupplierStatus } from '../constants/status.js';
import { optionalText, requiredName } from './inventory-fields.js';
import { listQuerySchema } from './list-query.js';
import { codeOf, repeated, wireDateTime } from './wire.js';

// add-product-catalogue — the suppliers, P6.SUP.01 / 03 – 07 (API Part 6 v1.2 §4 · OpenAPI Part 6 1.1.0
// `Supplier*` · design D5 / D8 · task 2.4). The phone is free text — a supplier is not a customer, so no
// E.164 rule (P6.SUP.05).

/** DB Part 6 `suppliers` columns and the OpenAPI maxLength of the free-text members. */
export const SupplierLimits = {
  NAME_MAX: 200,
  PHONE_MAX: 50,
  ADDRESS_MAX: 1000,
  NOTES_MAX: 2000,
  QUERY_MAX: 255,
} as const;

/** P6.SUP.01 query: `q` on name and phone, `status` repeatable (default ACTIVE), `include_archived`, paging. */
export const supplierListQuerySchema = listQuerySchema.extend({
  q: z.string().trim().max(SupplierLimits.QUERY_MAX).optional(),
  status: repeated(
    z.string().regex(/^\d+$/).transform(Number).pipe(codeOf(SupplierStatus)),
  ).default([SupplierStatus.ACTIVE]),
  include_archived: z.stringbool({ truthy: ['true'], falsy: ['false'] }).default(false),
});

/** P6.SUP.03 body (OpenAPI `SupplierCreate`): a blank optional text is stored as null. */
export const supplierCreateSchema = z.object({
  name: requiredName(SupplierLimits.NAME_MAX),
  phone: optionalText(SupplierLimits.PHONE_MAX),
  address: optionalText(SupplierLimits.ADDRESS_MAX),
  notes: optionalText(SupplierLimits.NOTES_MAX),
});

/** P6.SUP.05 body: every member optional except `expected_updated_at`. */
export const supplierUpdateSchema = z.object({
  name: requiredName(SupplierLimits.NAME_MAX).optional(),
  phone: optionalText(SupplierLimits.PHONE_MAX),
  address: optionalText(SupplierLimits.ADDRESS_MAX),
  notes: optionalText(SupplierLimits.NOTES_MAX),
  status: codeOf(SupplierStatus).optional(),
  expected_updated_at: wireDateTime,
});

/** OpenAPI Part 6 `Supplier`: the answer of P6.SUP.01 (items) and 03 – 07. */
export const supplierSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  status: codeOf(SupplierStatus),
  archived_at: wireDateTime.nullable(),
  created_at: wireDateTime,
  updated_at: wireDateTime,
});

/** P6.SUP.01 answer: a keyset page with the filtered `total`. */
export const supplierListSchema = z.strictObject({
  items: z.array(supplierSchema),
  next_cursor: z.string().nullable(),
  total: z.int().min(0).nullable(),
});

export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
export type SupplierCreate = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdate = z.infer<typeof supplierUpdateSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
export type SupplierList = z.infer<typeof supplierListSchema>;
