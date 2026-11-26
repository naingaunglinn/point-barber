import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  PRICE_RULE_FIELD,
  ProductLimits,
  branchStockSummarySchema,
  checkPriceRule,
  mergeSellPrice,
  productCreateSchema as create,
  productListQuerySchema as listQuery,
  productListSchema,
  productSchema,
  productUpdateSchema as update,
} from './products.js';

// add-product-catalogue tasks 2.2 / 2.3 — the P6.PRD schemas at each bound (P6.PRD.01 / 03 – 07 · Part 6 §14 ·
// API-ERR-03 · design D5 / D8) and the price rule of P6-RULE-05 on its six cases.

/** The issues of a refused value as `<path>:<code>`. */
function fails(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues.map(({ code, path }) => `${path.join('.')}:${code}`);
}

const AT = '2026-10-05T10:00:00.000+06:30';
const ID = '0199b2a4-6c00-7000-8000-000000000001';
const STYLING = '0199b2a4-6c00-7000-8000-000000000002';
const wax = {
  category_id: STYLING,
  name_mm: 'ဆံပင်ဖယောင်း',
  name_en: 'Hair wax',
  sku: 'WAX-001',
  is_sellable: true,
  sell_price_amount: 10000,
  default_low_stock_threshold: 2,
};

describe('productCreateSchema (P6.PRD.03)', () => {
  it('Scenario: Hair wax — parses as sent', () => {
    expect(create.parse(wax)).toStrictEqual(wax);
  });

  it('Scenario: Myanmar name 200 passes, 201 is too_big with its bound; blank is too_small', () => {
    expect(create.parse({ ...wax, name_mm: 'မ'.repeat(200) }).name_mm).toHaveLength(200);
    const result = create.safeParse({ ...wax, name_mm: 'မ'.repeat(201) });
    expect(result.error?.issues[0]).toMatchObject({
      code: 'too_big',
      maximum: 200,
      path: ['name_mm'],
    });
    expect(fails(create, { ...wax, name_mm: '  ' })).toStrictEqual(['name_mm:too_small']);
    expect(ProductLimits.NAME_MAX).toBe(200);
  });

  it('name_en: 200 passes, 201 is too_big, blank is null', () => {
    expect(create.parse({ ...wax, name_en: 'P'.repeat(200) }).name_en).toHaveLength(200);
    expect(fails(create, { ...wax, name_en: 'P'.repeat(201) })).toStrictEqual(['name_en:too_big']);
    expect(create.parse({ ...wax, name_en: '' }).name_en).toBeNull();
  });

  it('Scenario: SKU at the limit 50 passes, 51 is too_big; blank is null; absent stays absent', () => {
    expect(create.parse({ ...wax, sku: 'S'.repeat(50) }).sku).toHaveLength(50);
    expect(fails(create, { ...wax, sku: 'S'.repeat(51) })).toStrictEqual(['sku:too_big']);
    expect(create.parse({ ...wax, sku: '' }).sku).toBeNull();
    expect(create.parse({ ...wax, sku: '  ' }).sku).toBeNull();
    const { sku: _omitted, ...withoutSku } = wax;
    expect(create.parse(withoutSku).sku).toBeUndefined();
  });

  it('Scenario: Threshold −1 is too_small on the member, 0 and null pass', () => {
    expect(fails(create, { ...wax, default_low_stock_threshold: -1 })).toStrictEqual([
      'default_low_stock_threshold:too_small',
    ]);
    expect(
      create.parse({ ...wax, default_low_stock_threshold: 0 }).default_low_stock_threshold,
    ).toBe(0);
    expect(
      create.parse({ ...wax, default_low_stock_threshold: null }).default_low_stock_threshold,
    ).toBeNull();
    expect(fails(create, { ...wax, default_low_stock_threshold: 1.5 })).toStrictEqual([
      'default_low_stock_threshold:invalid_type',
    ]);
  });

  it('category_id must be a uuid; is_sellable is required', () => {
    expect(fails(create, { ...wax, category_id: 'styling' })).toStrictEqual([
      'category_id:invalid_format',
    ]);
    const { is_sellable: _omitted, ...withoutFlag } = wax;
    expect(fails(create, withoutFlag)).toStrictEqual(['is_sellable:invalid_type']);
  });

  it('has no unit field: a unit sent is stripped (D-STK-01)', () => {
    expect(create.parse({ ...wax, unit: 'bottle' })).toStrictEqual(wax);
  });

  describe('the price rule (P6-RULE-05 · D-PAY-03)', () => {
    it('Scenario: A sold product without a price — 400 on sell_price_amount', () => {
      const { sell_price_amount: _omitted, ...noPrice } = wax;
      expect(fails(create, noPrice)).toStrictEqual([`${PRICE_RULE_FIELD}:custom`]);
      expect(fails(create, { ...wax, sell_price_amount: null })).toStrictEqual([
        'sell_price_amount:custom',
      ]);
    });

    it('Scenario: A shop-use product with a price — 400 on sell_price_amount', () => {
      expect(fails(create, { ...wax, is_sellable: false, sell_price_amount: 8000 })).toStrictEqual([
        'sell_price_amount:custom',
      ]);
    });

    it('Scenario: Price zero is a price', () => {
      expect(create.parse({ ...wax, sell_price_amount: 0 }).sell_price_amount).toBe(0);
    });

    it('Scenario: A price with a decimal is invalid_type; −1 is too_small', () => {
      expect(fails(create, { ...wax, sell_price_amount: 9999.5 })).toStrictEqual([
        'sell_price_amount:invalid_type',
      ]);
      expect(fails(create, { ...wax, sell_price_amount: -1 })).toStrictEqual([
        'sell_price_amount:too_small',
      ]);
    });

    it('a shop-use product without a price (null or absent) passes', () => {
      expect(
        create.parse({ ...wax, is_sellable: false, sell_price_amount: null }).is_sellable,
      ).toBe(false);
      const { sell_price_amount: _omitted, ...noPrice } = wax;
      expect(create.parse({ ...noPrice, is_sellable: false }).sell_price_amount).toBeUndefined();
    });
  });
});

describe('productUpdateSchema (P6.PRD.05)', () => {
  it('every member is optional but expected_updated_at', () => {
    expect(update.parse({ expected_updated_at: AT })).toStrictEqual({ expected_updated_at: AT });
    expect(fails(update, { name_en: 'x' })).toStrictEqual(['expected_updated_at:invalid_type']);
  });

  it('keeps the bounds of the create: names, sku, threshold, price, status', () => {
    expect(fails(update, { name_mm: 'မ'.repeat(201), expected_updated_at: AT })).toStrictEqual([
      'name_mm:too_big',
    ]);
    expect(fails(update, { sku: 'S'.repeat(51), expected_updated_at: AT })).toStrictEqual([
      'sku:too_big',
    ]);
    expect(
      fails(update, { default_low_stock_threshold: -1, expected_updated_at: AT }),
    ).toStrictEqual(['default_low_stock_threshold:too_small']);
    expect(fails(update, { sell_price_amount: 9999.5, expected_updated_at: AT })).toStrictEqual([
      'sell_price_amount:invalid_type',
    ]);
    expect(fails(update, { status: 2, expected_updated_at: AT })).toStrictEqual([
      'status:invalid_value',
    ]);
    expect(
      update.parse({ sku: null, sell_price_amount: null, expected_updated_at: AT }),
    ).toMatchObject({
      sku: null,
      sell_price_amount: null,
    });
  });

  it('does not check the price rule alone — the merged row does (checkPriceRule)', () => {
    expect(update.parse({ is_sellable: true, expected_updated_at: AT }).is_sellable).toBe(true);
  });
});

describe('checkPriceRule · mergeSellPrice — the six cases of the spec (task 2.3)', () => {
  const pomade = { is_sellable: true, sell_price_amount: 12000 };
  const shampoo = { is_sellable: false, sell_price_amount: null };

  it('1. a sold product without a price fails', () => {
    expect(checkPriceRule({ is_sellable: true, sell_price_amount: null })).toBe(false);
    expect(checkPriceRule({ is_sellable: true, sell_price_amount: undefined })).toBe(false);
  });

  it('2. a shop-use product with a price fails', () => {
    expect(checkPriceRule({ is_sellable: false, sell_price_amount: 8000 })).toBe(false);
  });

  it('3. a sold product with price 0 passes', () => {
    expect(checkPriceRule({ is_sellable: true, sell_price_amount: 0 })).toBe(true);
    expect(checkPriceRule({ is_sellable: true, sell_price_amount: 10000 })).toBe(true);
  });

  it('4. a shop-use product without a price passes', () => {
    expect(checkPriceRule({ is_sellable: false, sell_price_amount: null })).toBe(true);
    expect(checkPriceRule({ is_sellable: false, sell_price_amount: undefined })).toBe(true);
  });

  it('5. Pomade to shop use without a price: the merged row has no price and passes', () => {
    const merged = mergeSellPrice(pomade, { is_sellable: false });
    expect(merged).toStrictEqual({ is_sellable: false, sell_price_amount: null });
    expect(checkPriceRule(merged)).toBe(true);
  });

  it('6. Shampoo to sold without a price: the merged row has none and fails', () => {
    const merged = mergeSellPrice(shampoo, { is_sellable: true });
    expect(merged).toStrictEqual({ is_sellable: true, sell_price_amount: null });
    expect(checkPriceRule(merged)).toBe(false);
  });

  it('a price change alone keeps the flag; a price on a shop-use row fails; a sent price wins', () => {
    expect(mergeSellPrice(pomade, { sell_price_amount: 13000 })).toStrictEqual({
      is_sellable: true,
      sell_price_amount: 13000,
    });
    expect(checkPriceRule(mergeSellPrice(shampoo, { sell_price_amount: 5000 }))).toBe(false);
    expect(mergeSellPrice(pomade, { is_sellable: false, sell_price_amount: 7000 })).toStrictEqual({
      is_sellable: false,
      sell_price_amount: 7000,
    });
    expect(mergeSellPrice(pomade, {})).toStrictEqual(pomade);
  });

  it('carries the stored type through: a bigint price is not turned into a number', () => {
    const merged = mergeSellPrice(
      { is_sellable: true, sell_price_amount: 12000n },
      { sell_price_amount: 13000n },
    );
    expect(merged.sell_price_amount).toBe(13000n);
  });
});

describe('productListQuerySchema (P6.PRD.01)', () => {
  it('defaults: ACTIVE, no archived rows, sort category, limit 25', () => {
    expect(listQuery.parse({})).toStrictEqual({
      limit: 25,
      status: [1],
      include_archived: false,
      sort: 'category',
    });
  });

  it('Scenario: limit 1 and 100 pass, 0 and 101 are refused', () => {
    expect(listQuery.parse({ limit: '1' }).limit).toBe(1);
    expect(listQuery.parse({ limit: '100' }).limit).toBe(100);
    expect(fails(listQuery, { limit: '0' })).toStrictEqual(['limit:too_small']);
    expect(fails(listQuery, { limit: '101' })).toStrictEqual(['limit:too_big']);
  });

  it('takes q (trimmed), category_id, sellable, status, branch_id, sort, cursor', () => {
    const parsed = listQuery.parse({
      q: '  hc-blk ',
      category_id: ID,
      sellable: 'false',
      status: ['0', '1'],
      include_archived: 'true',
      branch_id: ID,
      sort: '-updated_at',
      cursor: 'abc',
    });
    expect(parsed).toStrictEqual({
      q: 'hc-blk',
      category_id: ID,
      sellable: false,
      status: [0, 1],
      include_archived: true,
      branch_id: ID,
      sort: '-updated_at',
      cursor: 'abc',
      limit: 25,
    });
  });

  it('refuses an unknown sort, a bad sellable, a non-uuid category and an over-long q', () => {
    expect(fails(listQuery, { sort: 'price' })).toStrictEqual(['sort:invalid_value']);
    expect(fails(listQuery, { sellable: 'yes' })).toStrictEqual(['sellable:invalid_value']);
    expect(fails(listQuery, { category_id: 'x' })).toStrictEqual(['category_id:invalid_format']);
    expect(fails(listQuery, { q: 'q'.repeat(256) })).toStrictEqual(['q:too_big']);
    expect(fails(listQuery, { status: '' }).every((issue) => issue.startsWith('status'))).toBe(
      true,
    );
  });
});

describe('the Product DTOs', () => {
  const stock = {
    branch_id: ID,
    quantity_on_hand: 3,
    low_stock_threshold: null,
    effective_threshold: 3,
    state: 'low',
    incoming_quantity: 2,
    outgoing_in_transit_quantity: 0,
  };
  const item = {
    id: ID,
    category_id: STYLING,
    name_mm: 'ပိုမိတ်',
    name_en: 'Pomade',
    sku: 'PMD-001',
    is_sellable: true,
    sell_price_amount: 12000,
    default_low_stock_threshold: 3,
    status: 1,
    archived_at: null,
    stock,
    updated_at: AT,
  };

  it('BranchStockSummary: the three states only; negative quantity is allowed', () => {
    expect(
      branchStockSummarySchema.parse({ ...stock, quantity_on_hand: -1, state: 'negative' }),
    ).toBeDefined();
    expect(branchStockSummarySchema.safeParse({ ...stock, state: 'empty' }).success).toBe(false);
  });

  it('ProductListItem and the page: strict, stock null without a branch', () => {
    expect(
      productListSchema.parse({ items: [{ ...item, stock: null }], next_cursor: null, total: 1 })
        .total,
    ).toBe(1);
    expect(
      productListSchema.safeParse({
        items: [{ ...item, unit: 'pcs' }],
        next_cursor: null,
        total: 1,
      }).success,
    ).toBe(false);
  });

  it('Product adds the category, the branches, the transit quantity and no cost until #58', () => {
    const product = {
      ...item,
      category: { id: STYLING, name_mm: 'ဆံပင်ပုံသွင်း', name_en: 'Styling' },
      branches: [stock],
      in_transit_quantity: 2,
      last_unit_cost_amount: null,
      created_at: AT,
    };
    expect(productSchema.parse(product)).toStrictEqual(product);
  });
});
