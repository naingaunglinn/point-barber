import { z } from 'zod';

import { ProductStatus } from '../constants/status.js';
import { optionalText, requiredName } from './inventory-fields.js';
import { listQuerySchema } from './list-query.js';
import { codeOf, repeated, wireAmount, wireDateTime } from './wire.js';

// add-product-catalogue — the products, P6.PRD.01 / 03 – 07 (API Part 6 v1.2 §3 · §14 · OpenAPI Part 6
// 1.1.0 `Product*` · design D5 / D6 / D8 · task 2.2 / 2.3). A product is counted in pieces — it has no
// unit field (D-STK-01).

/** DB Part 6 `products` columns and the list search text. */
export const ProductLimits = { NAME_MAX: 200, SKU_MAX: 50, QUERY_MAX: 255 } as const;

export const PRODUCT_SORTS = ['category', 'name', '-updated_at'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** The `state` of a branch's stock of a product (P6-RULE-04 · research E6): at or below the threshold is low. */
export const StockState = { NEGATIVE: 'negative', LOW: 'low', OK: 'ok' } as const;
export type StockState = (typeof StockState)[keyof typeof StockState];

/**
 * P6.PRD.01 query (PC7 ★): `q` is trimmed text matched on the names and the SKU; `status` repeatable,
 * default ACTIVE; `include_archived`; `sellable` true / false; `branch_id` adds the stock part; `sort`
 * default `category`; `cursor`; `limit` 1 – 100, default 25.
 */
export const productListQuerySchema = listQuerySchema.extend({
  q: z.string().trim().max(ProductLimits.QUERY_MAX).optional(),
  category_id: z.uuid().optional(),
  sellable: z.stringbool({ truthy: ['true'], falsy: ['false'] }).optional(),
  status: repeated(z.string().regex(/^\d+$/).transform(Number).pipe(codeOf(ProductStatus))).default(
    [ProductStatus.ACTIVE],
  ),
  include_archived: z.stringbool({ truthy: ['true'], falsy: ['false'] }).default(false),
  branch_id: z.uuid().optional(),
  sort: z.enum(PRODUCT_SORTS).default('category'),
});

/** A whole number of kyats ≥ 0 as a JSON integer (D-PLT-04): 9,999.5 is `invalid_type`, -1 `too_small`. */
const sellPrice = wireAmount.nullable().optional();
/** Low-stock threshold: a whole number ≥ 0 or null (DB `products_threshold_chk`). */
const threshold = z.int().min(0).nullable().optional();

/** The price rule of P6-RULE-05 · D-PAY-03: `is_sellable` ⇔ a price. */
export interface PriceRuleRow {
  readonly is_sellable: boolean;
  readonly sell_price_amount?: unknown;
}

/** The field a failed price rule is reported on: 400 `validation`, `errors[0].field` (design D8). */
export const PRICE_RULE_FIELD = 'sell_price_amount';

/**
 * The price rule on a whole row — a create body, or the merged row of a PATCH (design D8): a product
 * sold to customers carries a price (0 is a price), a shop-use product carries none. Used by the create
 * schema and by `ProductWrites.update`, so both answer alike (task 2.3).
 */
export function checkPriceRule(row: PriceRuleRow): boolean {
  const hasPrice = row.sell_price_amount !== null && row.sell_price_amount !== undefined;
  return row.is_sellable === hasPrice;
}

/**
 * The row a PATCH would leave (P6.PRD.05): a member sent replaces the stored one; switching to shop use
 * without sending a price clears the stored price. Rule check afterwards with `checkPriceRule`.
 */
export function mergeSellPrice<P>(
  stored: { readonly is_sellable: boolean; readonly sell_price_amount: P | null },
  patch: { readonly is_sellable?: boolean; readonly sell_price_amount?: P | null },
): { readonly is_sellable: boolean; readonly sell_price_amount: P | null } {
  const isSellable = patch.is_sellable ?? stored.is_sellable;
  if (patch.sell_price_amount !== undefined) {
    return { is_sellable: isSellable, sell_price_amount: patch.sell_price_amount };
  }
  return {
    is_sellable: isSellable,
    sell_price_amount: patch.is_sellable === false ? null : stored.sell_price_amount,
  };
}

/** P6.PRD.03 body (OpenAPI `ProductCreate`); the price rule is a 400 on `sell_price_amount`. */
export const productCreateSchema = z
  .object({
    category_id: z.uuid(),
    name_mm: requiredName(ProductLimits.NAME_MAX),
    name_en: optionalText(ProductLimits.NAME_MAX),
    sku: optionalText(ProductLimits.SKU_MAX),
    is_sellable: z.boolean(),
    sell_price_amount: sellPrice,
    default_low_stock_threshold: threshold,
  })
  .check((ctx) => {
    if (!checkPriceRule(ctx.value)) {
      ctx.issues.push({
        code: 'custom',
        message: 'price rule',
        input: ctx.value.sell_price_amount,
        path: [PRICE_RULE_FIELD],
      });
    }
  });

/**
 * P6.PRD.05 body: every member optional except `expected_updated_at`. The price rule needs the stored
 * row, so `ProductWrites.update` checks it on the merged row (`mergeSellPrice` · `checkPriceRule`).
 */
export const productUpdateSchema = z.object({
  category_id: z.uuid().optional(),
  name_mm: requiredName(ProductLimits.NAME_MAX).optional(),
  name_en: optionalText(ProductLimits.NAME_MAX),
  sku: optionalText(ProductLimits.SKU_MAX),
  is_sellable: z.boolean().optional(),
  sell_price_amount: sellPrice,
  default_low_stock_threshold: threshold,
  status: codeOf(ProductStatus).optional(),
  expected_updated_at: wireDateTime,
});

/** OpenAPI Part 6 `BranchStockSummary` (P6-RULE-04): one product at one branch. */
export const branchStockSummarySchema = z.strictObject({
  branch_id: z.uuid(),
  quantity_on_hand: z.int(),
  low_stock_threshold: z.int().min(0).nullable(),
  effective_threshold: z.int().min(0).nullable(),
  state: z.enum([StockState.NEGATIVE, StockState.LOW, StockState.OK]),
  incoming_quantity: z.int().min(0),
  outgoing_in_transit_quantity: z.int().min(0),
});

/** OpenAPI Part 6 `ProductListItem`; `stock` only when a `branch_id` in the caller's read scope was sent. */
export const productListItemSchema = z.strictObject({
  id: z.uuid(),
  category_id: z.uuid(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  sku: z.string().nullable(),
  is_sellable: z.boolean(),
  sell_price_amount: wireAmount.nullable(),
  default_low_stock_threshold: z.int().min(0).nullable(),
  status: codeOf(ProductStatus),
  archived_at: wireDateTime.nullable(),
  stock: branchStockSummarySchema.nullable(),
  updated_at: wireDateTime,
});

/** OpenAPI Part 6 `Product` (P6.PRD.03 – 07): the list item plus its category, branches and transit. */
export const productSchema = z.strictObject({
  ...productListItemSchema.shape,
  category: z.strictObject({ id: z.uuid(), name_mm: z.string(), name_en: z.string().nullable() }),
  branches: z.array(branchStockSummarySchema),
  in_transit_quantity: z.int().min(0),
  /** Always null until `add-purchases` (#58) — PC4 ★. */
  last_unit_cost_amount: wireAmount.nullable(),
  created_at: wireDateTime,
});

/** P6.PRD.01 answer: a keyset page with the filtered `total` (design D5). */
export const productListSchema = z.strictObject({
  items: z.array(productListItemSchema),
  next_cursor: z.string().nullable(),
  total: z.int().min(0).nullable(),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type BranchStockSummary = z.infer<typeof branchStockSummarySchema>;
export type ProductListItem = z.infer<typeof productListItemSchema>;
export type Product = z.infer<typeof productSchema>;
export type ProductList = z.infer<typeof productListSchema>;
