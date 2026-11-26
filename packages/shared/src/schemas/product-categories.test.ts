import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { ProductCategoryStatus } from '../constants/status.js';
import { SORT_ORDER_MAX, idsOrderSchema } from './inventory-fields.js';
import {
  ProductCategoryLimits,
  productCategoryCreateSchema as create,
  productCategoryListQuerySchema as listQuery,
  productCategoryListSchema,
  productCategorySchema,
  productCategoryUpdateSchema as update,
} from './product-categories.js';

// add-product-catalogue task 2.1 — the P6.CAT schemas at each bound (P6.CAT.01 – 06 · API-ERR-03 · CG-API-03
// · design D8) and the spec scenarios they decide alone: "Create a product category" (name lengths, blank
// name), "A new category … placed last" (a sort_order sent) and "Edit a category with optimistic
// concurrency" (a missing `expected_updated_at`).

/** The issues of a refused value as `<path>:<code>`. */
function fails(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues.map(({ code, path }) => `${path.join('.')}:${code}`);
}

const AT = '2026-10-05T10:00:00.000+06:30';
const ID = '0199b2a4-6c00-7000-8000-000000000001';

describe('productCategoryCreateSchema (P6.CAT.02)', () => {
  it('Scenario: Shaving — both names, no sort_order left to the service', () => {
    const body = { name_mm: 'မုတ်ဆိတ်ရိတ် ပစ္စည်း', name_en: 'Shaving' };
    expect(create.parse(body)).toStrictEqual(body);
  });

  it('Scenario: Myanmar name at the limit 150 passes, 151 is too_big, blank is too_small', () => {
    expect(create.parse({ name_mm: 'မ'.repeat(150) }).name_mm).toHaveLength(150);
    expect(fails(create, { name_mm: 'မ'.repeat(151) })).toStrictEqual(['name_mm:too_big']);
    expect(fails(create, { name_mm: '   ' })).toStrictEqual(['name_mm:too_small']);
    expect(ProductCategoryLimits.NAME_MAX).toBe(150);
  });

  it('carries the bound of the failure: too_big names its maximum', () => {
    const result = create.safeParse({ name_mm: 'မ'.repeat(151) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ code: 'too_big', maximum: 150 });
  });

  it('trims the names before the bounds', () => {
    expect(create.parse({ name_mm: ` ${'မ'.repeat(150)} ` }).name_mm).toHaveLength(150);
  });

  it('a missing or null Myanmar name is invalid_type', () => {
    expect(fails(create, {})).toStrictEqual(['name_mm:invalid_type']);
    expect(fails(create, { name_mm: null })).toStrictEqual(['name_mm:invalid_type']);
  });

  it('name_en: 150 or null pass, 151 is too_big, blank is null', () => {
    expect(create.parse({ name_mm: 'x', name_en: 'P'.repeat(150) }).name_en).toHaveLength(150);
    expect(create.parse({ name_mm: 'x', name_en: null }).name_en).toBeNull();
    expect(fails(create, { name_mm: 'x', name_en: 'P'.repeat(151) })).toStrictEqual([
      'name_en:too_big',
    ]);
    for (const blank of ['', '   ']) {
      expect(create.parse({ name_mm: 'x', name_en: blank }).name_en).toBeNull();
    }
  });

  it('Scenario: A position sent is kept — sort_order 0 … 2,147,483,647', () => {
    expect(create.parse({ name_mm: 'x', sort_order: 2 }).sort_order).toBe(2);
    expect(create.parse({ name_mm: 'x', sort_order: 0 }).sort_order).toBe(0);
    expect(create.parse({ name_mm: 'x', sort_order: SORT_ORDER_MAX }).sort_order).toBe(
      2_147_483_647,
    );
    expect(fails(create, { name_mm: 'x', sort_order: SORT_ORDER_MAX + 1 })).toStrictEqual([
      'sort_order:too_big',
    ]);
    expect(fails(create, { name_mm: 'x', sort_order: -1 })).toStrictEqual(['sort_order:too_small']);
    expect(fails(create, { name_mm: 'x', sort_order: 1.5 })).toStrictEqual([
      'sort_order:invalid_type',
    ]);
  });

  it('strips a member it does not know (CG-API-03): status, product_count', () => {
    expect(create.parse({ name_mm: 'x', status: 0, product_count: 9 })).toStrictEqual({
      name_mm: 'x',
    });
  });
});

describe('productCategoryUpdateSchema (P6.CAT.03)', () => {
  it('Scenario: Rename the English name — expected_updated_at is required', () => {
    const body = { name_en: 'Styling products', expected_updated_at: AT };
    expect(update.parse(body)).toStrictEqual(body);
  });

  it('Scenario: A missing expected_updated_at is invalid_type (400 validation — API-IDEM-04)', () => {
    expect(fails(update, { name_en: 'x' })).toStrictEqual(['expected_updated_at:invalid_type']);
    expect(fails(update, { expected_updated_at: 'yesterday' })).toStrictEqual([
      'expected_updated_at:invalid_format',
    ]);
  });

  it('Scenario: Switch a category off — status 0 and 1 only', () => {
    expect(
      update.parse({ status: ProductCategoryStatus.INACTIVE, expected_updated_at: AT }),
    ).toMatchObject({
      status: 0,
    });
    expect(fails(update, { status: 2, expected_updated_at: AT })).toStrictEqual([
      'status:invalid_value',
    ]);
  });

  it('keeps the bounds of the create for the names; null clears the English name', () => {
    expect(fails(update, { name_mm: '', expected_updated_at: AT })).toStrictEqual([
      'name_mm:too_small',
    ]);
    expect(fails(update, { name_mm: 'မ'.repeat(151), expected_updated_at: AT })).toStrictEqual([
      'name_mm:too_big',
    ]);
    expect(update.parse({ name_en: null, expected_updated_at: AT }).name_en).toBeNull();
    expect(update.parse({ expected_updated_at: AT }).name_en).toBeUndefined();
  });
});

describe('productCategoryListQuerySchema (P6.CAT.01)', () => {
  it('defaults to ACTIVE and no archived rows', () => {
    expect(listQuery.parse({})).toStrictEqual({ status: [1], include_archived: false });
  });

  it('status is repeatable: one value as a string, several as a list', () => {
    expect(listQuery.parse({ status: '0' }).status).toStrictEqual([0]);
    expect(listQuery.parse({ status: ['0', '1'] }).status).toStrictEqual([0, 1]);
  });

  it('status= is a 400, never status 0; 2 is invalid_value', () => {
    expect(fails(listQuery, { status: '' }).every((issue) => issue.startsWith('status'))).toBe(
      true,
    );
    expect(fails(listQuery, { status: '2' }).every((issue) => issue.startsWith('status'))).toBe(
      true,
    );
  });

  it('include_archived takes true or false only', () => {
    expect(listQuery.parse({ include_archived: 'true' }).include_archived).toBe(true);
    expect(fails(listQuery, { include_archived: 'yes' })).toStrictEqual([
      'include_archived:invalid_value',
    ]);
  });
});

describe('idsOrderSchema (P6.CAT.06)', () => {
  it('takes a list of ids; empty or a non-uuid is refused', () => {
    expect(idsOrderSchema.parse({ ids: [ID] })).toStrictEqual({ ids: [ID] });
    expect(fails(idsOrderSchema, { ids: [] })).toStrictEqual(['ids:too_small']);
    expect(fails(idsOrderSchema, { ids: ['nope'] })).toStrictEqual(['ids.0:invalid_format']);
    expect(fails(idsOrderSchema, {})).toStrictEqual(['ids:invalid_type']);
  });
});

describe('productCategorySchema (the ProductCategory DTO)', () => {
  const row = {
    id: ID,
    name_mm: 'ဆံပင်ပုံသွင်း',
    name_en: 'Styling',
    sort_order: 1,
    status: 1,
    archived_at: null,
    product_count: 1,
    updated_at: AT,
  };

  it('is strict: the OpenAPI members only', () => {
    expect(productCategorySchema.parse(row)).toStrictEqual(row);
    expect(productCategorySchema.safeParse({ ...row, company_id: ID }).success).toBe(false);
    expect(productCategoryListSchema.parse({ items: [row] }).items).toHaveLength(1);
  });
});
