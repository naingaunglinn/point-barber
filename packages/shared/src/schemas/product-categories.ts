import { z } from 'zod';

import { ProductCategoryStatus } from '../constants/status.js';
import { optionalText, requiredName, sortOrderField } from './inventory-fields.js';
import { codeOf, repeated, wireDateTime } from './wire.js';

// add-product-catalogue — the product categories, P6.CAT.01 – 06 (API Part 6 v1.2 §2 · OpenAPI Part 6
// 1.1.0 `ProductCategory*` · design D5 / D7 / D8 · task 2.1). The order body is `IdsOrder`
// (inventory-fields.ts).

/** DB Part 6 `product_categories.name_mm` / `name_en` varchar(150). */
export const ProductCategoryLimits = { NAME_MAX: 150 } as const;

/**
 * P6.CAT.01 query: `status` repeatable (digits only, so `?status=` is a 400 and never status 0), default
 * ACTIVE; `include_archived` true / false, default false. A request with `status=0` or
 * `include_archived=true` is a management read — the handler checks `product.view` (design D2).
 */
export const productCategoryListQuerySchema = z.object({
  status: repeated(
    z.string().regex(/^\d+$/).transform(Number).pipe(codeOf(ProductCategoryStatus)),
  ).default([ProductCategoryStatus.ACTIVE]),
  include_archived: z.stringbool({ truthy: ['true'], falsy: ['false'] }).default(false),
});

/** P6.CAT.02 body: `sort_order` absent = placed last (PC1 — the service), a value sent is stored as sent. */
export const productCategoryCreateSchema = z.object({
  name_mm: requiredName(ProductCategoryLimits.NAME_MAX),
  name_en: optionalText(ProductCategoryLimits.NAME_MAX),
  sort_order: sortOrderField,
});

/** P6.CAT.03 body: every member optional except `expected_updated_at` (API-IDEM-04 — 400 without it). */
export const productCategoryUpdateSchema = z.object({
  name_mm: requiredName(ProductCategoryLimits.NAME_MAX).optional(),
  name_en: optionalText(ProductCategoryLimits.NAME_MAX),
  status: codeOf(ProductCategoryStatus).optional(),
  expected_updated_at: wireDateTime,
});

/** OpenAPI Part 6 `ProductCategory`: the answer of every P6.CAT endpoint, strict. */
export const productCategorySchema = z.strictObject({
  id: z.uuid(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  sort_order: z.int(),
  status: codeOf(ProductCategoryStatus),
  archived_at: wireDateTime.nullable(),
  /** The category's non-archived products (INACTIVE ones included). */
  product_count: z.int().min(0),
  updated_at: wireDateTime,
});

/** P6.CAT.01 / .06 answer: `{ items }`, in `sort_order` (no paging — a short master list). */
export const productCategoryListSchema = z.strictObject({
  items: z.array(productCategorySchema),
});

export type ProductCategoryListQuery = z.infer<typeof productCategoryListQuerySchema>;
export type ProductCategoryCreate = z.infer<typeof productCategoryCreateSchema>;
export type ProductCategoryUpdate = z.infer<typeof productCategoryUpdateSchema>;
export type ProductCategory = z.infer<typeof productCategorySchema>;
export type ProductCategoryList = z.infer<typeof productCategoryListSchema>;
