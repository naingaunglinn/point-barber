import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  SupplierLimits,
  supplierCreateSchema as create,
  supplierListQuerySchema as listQuery,
  supplierListSchema,
  supplierSchema,
  supplierUpdateSchema as update,
} from './suppliers.js';

// add-product-catalogue task 2.4 — the P6.SUP schemas at each bound (P6.SUP.01 / 03 – 07 · OpenAPI Part 6
// `Supplier*` · API-ERR-03): name 200, phone 50, address 1,000, notes 2,000.

/** The issues of a refused value as `<path>:<code>`. */
function fails(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues.map(({ code, path }) => `${path.join('.')}:${code}`);
}

const AT = '2026-10-05T10:00:00.000+06:30';
const ID = '0199b2a4-6c00-7000-8000-000000000001';

describe('supplierCreateSchema (P6.SUP.03)', () => {
  it('Scenario: Golden Comb Supplies with a free-text phone', () => {
    const body = { name: 'Golden Comb Supplies', phone: '09 450 000 333' };
    expect(create.parse(body)).toStrictEqual(body);
    expect(create.parse({ name: 'X', phone: 'ask for Daw Mya, after 5 pm' }).phone).toContain(
      'Daw Mya',
    );
  });

  it('Scenario: name 200 passes, 201 is too_big, blank is too_small', () => {
    expect(create.parse({ name: 'S'.repeat(200) }).name).toHaveLength(200);
    expect(fails(create, { name: 'S'.repeat(201) })).toStrictEqual(['name:too_big']);
    expect(fails(create, { name: '   ' })).toStrictEqual(['name:too_small']);
    expect(fails(create, {})).toStrictEqual(['name:invalid_type']);
  });

  it('trims the name: "Shwe Hla Trading " is "Shwe Hla Trading"', () => {
    expect(create.parse({ name: 'Shwe Hla Trading ' }).name).toBe('Shwe Hla Trading');
  });

  it.each([
    ['notes', SupplierLimits.NOTES_MAX, 2000],
    ['address', SupplierLimits.ADDRESS_MAX, 1000],
    ['phone', SupplierLimits.PHONE_MAX, 50],
  ] as const)(
    'Scenario: %s at the limit passes, one over is too_big',
    (member, limit, expected) => {
      expect(limit).toBe(expected);
      expect(create.parse({ name: 'X', [member]: 'a'.repeat(limit) })[member]).toHaveLength(limit);
      expect(fails(create, { name: 'X', [member]: 'a'.repeat(limit + 1) })).toStrictEqual([
        `${member}:too_big`,
      ]);
    },
  );

  it('a blank optional text is null; null passes; absent stays absent', () => {
    expect(create.parse({ name: 'X', phone: '', address: '  ', notes: null })).toStrictEqual({
      name: 'X',
      phone: null,
      address: null,
      notes: null,
    });
    expect(create.parse({ name: 'X' })).toStrictEqual({ name: 'X' });
  });

  it('strips status: a new supplier is ACTIVE', () => {
    expect(create.parse({ name: 'X', status: 0 })).toStrictEqual({ name: 'X' });
  });
});

describe('supplierUpdateSchema (P6.SUP.05)', () => {
  it('requires expected_updated_at; status 0 / 1 only', () => {
    expect(fails(update, { name: 'X' })).toStrictEqual(['expected_updated_at:invalid_type']);
    expect(update.parse({ status: 0, expected_updated_at: AT }).status).toBe(0);
    expect(fails(update, { status: 2, expected_updated_at: AT })).toStrictEqual([
      'status:invalid_value',
    ]);
  });

  it('keeps the bounds of the create and lets a text be cleared with null', () => {
    expect(fails(update, { name: '', expected_updated_at: AT })).toStrictEqual(['name:too_small']);
    expect(fails(update, { notes: 'a'.repeat(2001), expected_updated_at: AT })).toStrictEqual([
      'notes:too_big',
    ]);
    expect(update.parse({ phone: null, expected_updated_at: AT }).phone).toBeNull();
  });
});

describe('supplierListQuerySchema (P6.SUP.01)', () => {
  it('defaults: ACTIVE, no archived, limit 25', () => {
    expect(listQuery.parse({})).toStrictEqual({ limit: 25, status: [1], include_archived: false });
  });

  it('q, status, include_archived, cursor and limit 1 – 100', () => {
    expect(
      listQuery.parse({
        q: ' shwe ',
        status: ['0', '1'],
        include_archived: 'true',
        cursor: 'c',
        limit: '100',
      }),
    ).toStrictEqual({ q: 'shwe', status: [0, 1], include_archived: true, cursor: 'c', limit: 100 });
    expect(fails(listQuery, { limit: '0' })).toStrictEqual(['limit:too_small']);
    expect(fails(listQuery, { limit: '101' })).toStrictEqual(['limit:too_big']);
  });
});

describe('supplierSchema (the Supplier DTO)', () => {
  const row = {
    id: ID,
    name: 'Shwe Hla Trading',
    phone: '09 450 000 222',
    address: 'No. 5, Supply Road, Yangon',
    notes: null,
    status: 1,
    archived_at: null,
    created_at: AT,
    updated_at: AT,
  };

  it('is strict, and the page carries next_cursor and total', () => {
    expect(supplierSchema.parse(row)).toStrictEqual(row);
    expect(supplierSchema.safeParse({ ...row, company_id: ID }).success).toBe(false);
    expect(supplierListSchema.parse({ items: [row], next_cursor: null, total: 1 }).total).toBe(1);
  });
});
