import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  AdjustmentReasonLimits,
  adjustmentReasonCreateSchema as create,
  adjustmentReasonListQuerySchema as listQuery,
  adjustmentReasonListSchema,
  adjustmentReasonRenameSchema as rename,
  adjustmentReasonSchema,
  adjustmentReasonStatusSchema as setStatus,
} from './adjustment-reasons.js';

// add-product-catalogue task 2.4 — the P6.RSN schemas at each bound (P6.RSN.01 – 05 · OpenAPI Part 6
// `AdjustmentReason*` · API-ERR-03 · D-STK-05): create, rename, `{ status }`, the list query.

/** The issues of a refused value as `<path>:<code>`. */
function fails(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues.map(({ code, path }) => `${path.join('.')}:${code}`);
}

const AT = '2026-10-05T10:00:00.000+06:30';
const ID = '0199b2a4-6c00-7000-8000-000000000001';

describe('adjustmentReasonCreateSchema (P6.RSN.02)', () => {
  it('Scenario: Expired — both names, sort_order left to the service', () => {
    const body = { name_mm: 'သက်တမ်းကုန်', name_en: 'Expired' };
    expect(create.parse(body)).toStrictEqual(body);
  });

  it('name_mm 150 passes, 151 is too_big, blank is too_small', () => {
    expect(create.parse({ name_mm: 'မ'.repeat(150) }).name_mm).toHaveLength(150);
    expect(fails(create, { name_mm: 'မ'.repeat(151) })).toStrictEqual(['name_mm:too_big']);
    expect(fails(create, { name_mm: ' ' })).toStrictEqual(['name_mm:too_small']);
    expect(AdjustmentReasonLimits.NAME_MAX).toBe(150);
  });

  it('name_en 150 passes, 151 is too_big, blank is null', () => {
    expect(create.parse({ name_mm: 'x', name_en: 'E'.repeat(150) }).name_en).toHaveLength(150);
    expect(fails(create, { name_mm: 'x', name_en: 'E'.repeat(151) })).toStrictEqual([
      'name_en:too_big',
    ]);
    expect(create.parse({ name_mm: 'x', name_en: '' }).name_en).toBeNull();
  });

  it('sort_order: a value sent is kept, a negative one is too_small, a status is stripped', () => {
    expect(create.parse({ name_mm: 'x', sort_order: 2 }).sort_order).toBe(2);
    expect(fails(create, { name_mm: 'x', sort_order: -1 })).toStrictEqual(['sort_order:too_small']);
    expect(create.parse({ name_mm: 'x', status: 0 })).toStrictEqual({ name_mm: 'x' });
  });
});

describe('adjustmentReasonRenameSchema (P6.RSN.03)', () => {
  it('requires expected_updated_at; the names keep their bounds; status is not part of a rename', () => {
    expect(fails(rename, { name_mm: 'x' })).toStrictEqual(['expected_updated_at:invalid_type']);
    expect(rename.parse({ name_en: 'Gone', expected_updated_at: AT })).toStrictEqual({
      name_en: 'Gone',
      expected_updated_at: AT,
    });
    expect(fails(rename, { name_mm: '', expected_updated_at: AT })).toStrictEqual([
      'name_mm:too_small',
    ]);
    expect(rename.parse({ status: 0, expected_updated_at: AT })).toStrictEqual({
      expected_updated_at: AT,
    });
  });
});

describe('adjustmentReasonStatusSchema (P6.RSN.04)', () => {
  it('Scenario: disable and enable — 0 and 1; status 2 or none is refused', () => {
    expect(setStatus.parse({ status: 0 })).toStrictEqual({ status: 0 });
    expect(setStatus.parse({ status: 1 })).toStrictEqual({ status: 1 });
    expect(fails(setStatus, { status: 2 })).toStrictEqual(['status:invalid_value']);
    expect(fails(setStatus, {})).toStrictEqual(['status:invalid_value']);
  });
});

describe('adjustmentReasonListQuerySchema (P6.RSN.01)', () => {
  it('defaults to ACTIVE; status is repeatable; status= is refused', () => {
    expect(listQuery.parse({})).toStrictEqual({ status: [1] });
    expect(listQuery.parse({ status: ['0', '1'] }).status).toStrictEqual([0, 1]);
    expect(fails(listQuery, { status: '' }).every((issue) => issue.startsWith('status'))).toBe(
      true,
    );
  });
});

describe('adjustmentReasonSchema (the AdjustmentReason DTO)', () => {
  const row = {
    id: ID,
    name_mm: 'ပျောက်',
    name_en: 'Lost',
    sort_order: 2,
    status: 1,
    used_by_setting: null,
    updated_at: AT,
  };

  it('is strict, used_by_setting is a string or null, the list is { items }', () => {
    expect(adjustmentReasonSchema.parse(row)).toStrictEqual(row);
    expect(
      adjustmentReasonSchema.parse({ ...row, used_by_setting: 'stock.refund_damaged_reason_id' }),
    ).toBeDefined();
    expect(adjustmentReasonSchema.safeParse({ ...row, archived_at: null }).success).toBe(false);
    expect(adjustmentReasonListSchema.parse({ items: [row] }).items).toHaveLength(1);
  });
});
