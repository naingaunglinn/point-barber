import { z } from 'zod';

import { ErrorCode } from '../constants/error-codes.js';
import {
  LocationType,
  PriceSource,
  ServiceCategoryStatus,
  ServicePricingMode,
  ServiceStatus,
} from '../constants/status.js';
import { listQuerySchema } from './list-query.js';
import { codeOf, repeated, wireAmount, wireDate, wireDateTime } from './wire.js';

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
 * `ServiceListItem` — P2.SVC.01. `unpriced_branch_ids` = sold there but no price effective today;
 * `sold_here` belongs to the management filter `sold=all`, which this change does not read.
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

/** `Category` — P2.CAT.01; `service_count` only with `include_counts` (not read by this change). */
export const serviceCategorySchema = z.strictObject({
  id: z.uuid(),
  name_mm: z.string().max(150),
  name_en: z.string().max(150).nullable(),
  sort_order: z.int(),
  status: codeOf(ServiceStatus),
  service_count: z.int().optional(),
  archived_at: wireDateTime.nullable(),
  updated_at: wireDateTime,
});

/** `OptionsView` — P2.SVC.03; empty for a SIMPLE service until `add-option-services` fills it. */
export const optionsViewSchema = z.strictObject({
  groups: z.array(z.never()),
  variants: z.array(z.never()),
});

/** `ServiceBranch` as a response — one `branch_services` row, sold or not (P2.SVC.03 · Recorded reading 8). */
export const serviceBranchViewSchema = z.strictObject({
  branch_id: z.uuid(),
  sold: z.boolean(),
  duration_minutes: z.int().min(1),
});

/**
 * `Service` — P2.SVC.03 (OpenAPI Part 2 v1.6): the list item without `sold_here`, the descriptions, the
 * website fields, the image and the branch rows. `image_url` is `/api/v1/public/media/<id>/original`
 * (P8-RULE-04); null while the service has no image.
 */
export const serviceSchema = serviceListItemSchema.omit({ sold_here: true }).extend({
  description_mm: z.string().nullable(),
  description_en: z.string().nullable(),
  public_description_mm: z.string().nullable(),
  public_description_en: z.string().nullable(),
  image_attachment_id: z.uuid().nullable(),
  image_url: z.string().meta({ format: 'uri-reference' }).nullable(),
  branches: z.array(serviceBranchViewSchema),
  options: optionsViewSchema,
});

/** A boolean query flag (`include_archived=true`): `true` or `false` only; absent = false. */
const queryFlag = z.stringbool({ truthy: ['true'], falsy: ['false'] }).default(false);

/**
 * The repeatable `status` filter of a list (P2.CAT.01 / P2.SVC.01): digits only, so `?status=` is a 400
 * and never status 0. No default here — the default 1 is applied by the read, which must tell the
 * picker request (no `status`) from `status=1` (add-service-catalogue Recorded reading 1).
 */
const statusFilter = <const T extends Record<string, number>>(codes: T) =>
  repeated(z.string().regex(/^\d+$/).transform(Number).pipe(codeOf(codes))).optional();

/**
 * P2.SVC.01 query — the operational filters of add-walkin-visit-checkout and the management filters
 * of add-service-catalogue (task 2.1): `status`, `include_archived`, and `sold=all` with the
 * `branch_id` it needs (400 without — design D5 / D8).
 */
export const servicesQuerySchema = listQuerySchema
  .extend({
    q: z.string().max(100).optional(),
    category_id: z.uuid().optional(),
    branch_id: z.uuid().optional(),
    pricing_mode: z.coerce
      .number()
      .pipe(z.literal([ServicePricingMode.SIMPLE, ServicePricingMode.OPTIONS]))
      .optional(),
    status: statusFilter(ServiceStatus),
    include_archived: queryFlag,
    sold: z.enum(['here', 'all']).default('here'),
  })
  .check((ctx) => {
    if (ctx.value.sold === 'all' && ctx.value.branch_id === undefined)
      ctx.issues.push({
        code: 'invalid_type',
        expected: 'string',
        input: undefined,
        path: ['branch_id'],
      });
  });

/** P2.CAT.01 query — the management filters (add-service-catalogue task 2.1). */
export const serviceCategoriesQuerySchema = z.object({
  status: statusFilter(ServiceCategoryStatus),
  include_archived: queryFlag,
  include_counts: queryFlag,
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

// add-service-catalogue task 2.1 — the request bodies of P2.CAT.02 – 05 and P2.SVC.02 / 04 / 06 / 07
// (API Part 2 v1.6 · OpenAPI part2 1.6.0 · API-ERR-03 · design D8). Request schemas are plain z.object,
// so an unknown member is stripped (CG-API-03): `options` (add-option-services) and
// `image_attachment_id` (task group 9) have no effect until their code exists (design D13). An
// optional text blank after trimming is null (D-DB-04 — `name_en` null shows the Myanmar name).
// `pricing_mode` accepts 1 and 2: the service answers 2 with 422 `options_required` /
// `use_options_endpoint` (P2-RULE-02).

/** The bounds of OpenAPI Part 2 v1.6 and DB Part 2 v1.3 (`services_buffer_chk`). */
export const CatalogueLimits = {
  CATEGORY_NAME_MAX: 150,
  SERVICE_NAME_MAX: 200,
  BUFFER_MAX: 120,
  DURATION_MIN: 1,
  DURATION_MAX: 1440,
} as const;

const blankAsNull = (value: string | null | undefined) => (value === '' ? null : value);

/** Trimmed text, nullable and optional; blank after trimming is null. */
const optionalText = (max?: number) =>
  (max === undefined ? z.string().trim() : z.string().trim().max(max))
    .nullable()
    .optional()
    .transform(blankAsNull);

const categoryName = z.string().trim().min(1).max(CatalogueLimits.CATEGORY_NAME_MAX);
const serviceName = z.string().trim().min(1).max(CatalogueLimits.SERVICE_NAME_MAX);
const bufferMinutes = z.int().min(0).max(CatalogueLimits.BUFFER_MAX);

/** `ServiceBranch` — one branch's sale switch and duration (P2.SVC.02 `branches[]`, P2.SVC.06). */
export const serviceBranchSchema = z.object({
  branch_id: z.uuid(),
  sold: z.boolean(),
  duration_minutes: z.int().min(CatalogueLimits.DURATION_MIN).max(CatalogueLimits.DURATION_MAX),
});

/** A branch named twice in one list → one issue on the list (Recorded reading 4 · design D8). */
const branchItems = z.array(serviceBranchSchema).check((ctx) => {
  const ids = ctx.value.map((item) => item.branch_id);
  if (new Set(ids).size !== ids.length)
    ctx.issues.push({ code: 'custom', message: 'a branch is listed twice', input: ctx.value });
});

/** P2.CAT.02 body — `CategoryCreate`; without `sort_order` the category goes last (SC2 ★). */
export const categoryCreateSchema = z.object({
  name_mm: categoryName,
  name_en: optionalText(CatalogueLimits.CATEGORY_NAME_MAX),
  sort_order: z.int32().optional(),
});

/** P2.CAT.03 body — `CategoryUpdate`; `expected_updated_at` is required (API-IDEM-04). */
export const categoryUpdateSchema = z.object({
  name_mm: categoryName.optional(),
  name_en: optionalText(CatalogueLimits.CATEGORY_NAME_MAX),
  status: codeOf(ServiceCategoryStatus).optional(),
  expected_updated_at: wireDateTime,
});

/** The Details and Website members a create sends and an update may send (`ServiceCreate`). */
const serviceMembers = {
  name_en: optionalText(CatalogueLimits.SERVICE_NAME_MAX),
  description_mm: optionalText(),
  description_en: optionalText(),
  public_description_mm: optionalText(),
  public_description_en: optionalText(),
};

/** P2.SVC.02 body — `ServiceCreate` without `options` / `image_attachment_id` (design D13). */
export const serviceCreateSchema = z.object({
  category_id: z.uuid(),
  name_mm: serviceName,
  ...serviceMembers,
  pricing_mode: codeOf(ServicePricingMode),
  buffer_minutes: bufferMinutes.default(0),
  show_on_website: z.boolean().default(true),
  branches: branchItems.optional(),
});

/** P2.SVC.04 body — `ServiceUpdate` without `image_attachment_id`; every member but the token optional. */
export const serviceUpdateSchema = z.object({
  category_id: z.uuid().optional(),
  name_mm: serviceName.optional(),
  ...serviceMembers,
  pricing_mode: codeOf(ServicePricingMode).optional(),
  buffer_minutes: bufferMinutes.optional(),
  show_on_website: z.boolean().optional(),
  status: codeOf(ServiceStatus).optional(),
  expected_updated_at: wireDateTime,
});

/** P2.SVC.06 body — items not listed stay untouched; a branch listed twice is a 400. */
export const branchesSetSchema = z.object({ items: branchItems });

/** P2.CAT.05 body — every non-archived category once (the set is checked after the locks). */
export const categoryOrderSchema = z.object({ ids: z.array(z.uuid()).min(1) });

/** P2.SVC.07 body — every non-archived service of the category once. */
export const serviceOrderSchema = z.object({
  category_id: z.uuid(),
  ids: z.array(z.uuid()).min(1),
});

export type QuoteItemDto = z.infer<typeof quoteItemSchema>;
export type QuoteDto = z.infer<typeof quoteSchema>;
export type ServiceListItemDto = z.infer<typeof serviceListItemSchema>;
export type ServiceDto = z.infer<typeof serviceSchema>;
export type ServiceCategoryDto = z.infer<typeof serviceCategorySchema>;
export type ServicesQuery = z.infer<typeof servicesQuerySchema>;
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type ServiceCategoriesQuery = z.infer<typeof serviceCategoriesQuerySchema>;
export type ServiceBranchItem = z.infer<typeof serviceBranchSchema>;
export type CategoryCreateBody = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateBody = z.infer<typeof categoryUpdateSchema>;
export type ServiceCreateBody = z.infer<typeof serviceCreateSchema>;
export type ServiceUpdateBody = z.infer<typeof serviceUpdateSchema>;
export type BranchesSetBody = z.infer<typeof branchesSetSchema>;
export type CategoryOrderBody = z.infer<typeof categoryOrderSchema>;
export type ServiceOrderBody = z.infer<typeof serviceOrderSchema>;
