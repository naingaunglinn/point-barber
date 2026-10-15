import { z } from 'zod';

import { ErrorCode } from '../constants/error-codes.js';
import {
  LocationType,
  PriceSource,
  ServicePricingMode,
  ServiceStatus,
} from '../constants/status.js';
import { codeOf, wireAmount, wireDate, wireDateTime } from './wire.js';

// The service list and price quote DTOs of add-walkin-visit-checkout (tasks 2.4, 2.6), one per schema
// of point-sdd docs/api/openapi/part2-catalogue-scheduling.yaml v1.4 (API-ERR-03). The quote is built
// whole (design D12): BRANCH and HOME, the variant key, price sources 1 – 4.

/** `QuoteItem` — `sold` = false carries the reason and no price (P2-RULE-05). */
export const quoteItemSchema = z.strictObject({
  service_id: z.uuid(),
  service_variant_id: z.uuid().nullable(),
  sold: z.boolean(),
  reason: z
    .enum([
      ErrorCode.NOT_SOLD_HERE,
      ErrorCode.VARIANT_REQUIRED,
      ErrorCode.SERVICE_INACTIVE,
      ErrorCode.CATEGORY_INACTIVE,
    ])
    .nullable(),
  unit_price_amount: wireAmount.nullable(),
  duration_minutes: z.int().nullable(),
  buffer_minutes: z.int().nullable(),
  price_source: codeOf(PriceSource).nullable(),
});

/** `Quote` — P2.PRC.06, the only price calculator (D-SVC-03 · API-DATA-07). */
export const quoteSchema = z.strictObject({
  branch_id: z.uuid(),
  location_type: codeOf(LocationType),
  date: wireDate,
  employee_id: z.uuid().nullable(),
  complete: z.boolean(),
  items: z.array(quoteItemSchema),
  transport_fee_amount: wireAmount,
  subtotal_amount: wireAmount,
  duration_minutes: z.int(),
  block_minutes: z.int(),
});

/** `DurationRange` — the shortest and longest duration of a service's variants. */
export const durationRangeSchema = z.strictObject({ min: z.int(), max: z.int() });

/**
 * `ServiceListItem` — P2.SVC.01. `unpriced_branch_ids` and `sold_here` belong to the management
 * filters (`sold=all`), which this change does not read.
 */
export const serviceListItemSchema = z.strictObject({
  id: z.uuid(),
  category_id: z.uuid(),
  name_mm: z.string().max(200),
  name_en: z.string().max(200).nullable(),
  pricing_mode: codeOf(ServicePricingMode),
  buffer_minutes: z.int().min(0).max(120),
  status: codeOf(ServiceStatus),
  show_on_website: z.boolean(),
  sort_order: z.int(),
  branch_ids: z.array(z.uuid()),
  unpriced_branch_ids: z.array(z.uuid()).optional(),
  duration_range: durationRangeSchema,
  archived_at: wireDateTime.nullable(),
  updated_at: wireDateTime,
  sold_here: z.boolean().optional(),
});

/** P2.PRC.06 request — 1 to 20 items, each with its variant key (task 2.6). */
export const quoteRequestSchema = z.object({
  branch_id: z.uuid(),
  location_type: codeOf(LocationType),
  date: wireDate,
  employee_id: z.uuid().nullish(),
  items: z
    .array(z.object({ service_id: z.uuid(), service_variant_id: z.uuid().nullish() }))
    .min(1)
    .max(20),
});

export type QuoteItemDto = z.infer<typeof quoteItemSchema>;
export type QuoteDto = z.infer<typeof quoteSchema>;
export type ServiceListItemDto = z.infer<typeof serviceListItemSchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
