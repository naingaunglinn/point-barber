import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  PAYMENT_METHOD_CODE_PATTERN,
  PAYMENT_METHOD_NAME_MAX,
  PAYMENT_METHOD_ORDER_MAX,
  PAYMENT_METHOD_REGEX_MAX,
  SORT_ORDER_MAX,
  SYSTEM_PAYMENT_METHOD_CODES,
} from '../constants/payment-methods.js';
import {
  paymentMethodCreateSchema as create,
  paymentMethodListQuerySchema as listQuery,
  paymentMethodOrderSchema as order,
  paymentMethodUpdateSchema as update,
} from './sales.js';

// add-payment-methods-admin task 1.4 — the request schemas of P4.PMT.01 – 03 and 06 at each bound
// (API-ERR-03 · CG-API-03): the spec's "Names have fixed lengths", "The code is 2 to 30 characters …",
// "The list is filtered …" and "Reorder sets sort_order 1 to n …" scenarios that the schema alone decides.
// The length of `reference_regex` is the format check's (task 1.10), not the schema's.

/** The issues of a refused value as `<path>:<code>`. */
function fails(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues.map(({ code, path }) => `${path.join('.')}:${code}`);
}

const AT = '2026-10-05T10:00:00.123+06:30';
const ID = '0199b2a4-6c00-7000-8000-000000000001';
const base = { code: 'WAVE', name_mm: 'Wave', kind: 2 };

describe('the constants and their sources', () => {
  it('state the limits of DB Part 4 and the system codes of the seed', () => {
    expect(PAYMENT_METHOD_CODE_PATTERN.source).toBe('^[A-Z0-9_]{2,30}$');
    expect(PAYMENT_METHOD_NAME_MAX).toBe(100);
    expect(PAYMENT_METHOD_REGEX_MAX).toBe(200);
    expect(SORT_ORDER_MAX).toBe(2_147_483_647);
    expect(PAYMENT_METHOD_ORDER_MAX).toBe(1_000);
    expect(SYSTEM_PAYMENT_METHOD_CODES).toStrictEqual(['CASH', 'KBZPAY']);
  });
});

describe('paymentMethodCreateSchema (P4.PMT.02)', () => {
  it('Scenario: Defaults for a bank transfer — flags false, English name and format left out', () => {
    expect(create.parse({ code: 'BANK_TRF', name_mm: 'Bank transfer', kind: 3 })).toStrictEqual({
      code: 'BANK_TRF',
      name_mm: 'Bank transfer',
      kind: 3,
      requires_reference: false,
      requires_verification: false,
    });
  });

  it('Scenario: Two characters and thirty characters pass', () => {
    expect(create.parse({ ...base, code: 'WV' }).code).toBe('WV');
    const thirty = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123';
    expect(create.parse({ ...base, code: thirty }).code).toBe(thirty);
  });

  it('Scenario: One character, thirty-one characters and lower case are invalid_format', () => {
    for (const code of ['W', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ01234', 'wave', 'WA VE', 'WA-VE'])
      expect(fails(create, { ...base, code }), code).toStrictEqual(['code:invalid_format']);
  });

  it('Scenario: The limits — name_mm 100 passes, 101 is too_big, three spaces too_small', () => {
    expect(create.parse({ ...base, name_mm: 'မ'.repeat(100) }).name_mm).toHaveLength(100);
    expect(fails(create, { ...base, name_mm: 'မ'.repeat(101) })).toStrictEqual(['name_mm:too_big']);
    expect(fails(create, { ...base, name_mm: '   ' })).toStrictEqual(['name_mm:too_small']);
    expect(create.parse({ ...base, name_mm: ' Wave ' }).name_mm).toBe('Wave');
  });

  it('name_en: 100 passes, 101 is too_big, blank becomes null', () => {
    expect(create.parse({ ...base, name_en: 'W'.repeat(100) }).name_en).toHaveLength(100);
    expect(fails(create, { ...base, name_en: 'W'.repeat(101) })).toStrictEqual(['name_en:too_big']);
    for (const blank of ['', '  '])
      expect(create.parse({ ...base, name_en: blank }).name_en).toBeNull();
  });

  it('reference_regex: blank becomes null; any other text is kept as sent, untrimmed', () => {
    for (const blank of ['', '   '])
      expect(create.parse({ ...base, reference_regex: blank }).reference_regex).toBeNull();
    expect(create.parse({ ...base, reference_regex: ' ^KBZ$ ' }).reference_regex).toBe(' ^KBZ$ ');
    // no maximum here: 201 characters is `invalid_regex` of the format check (design D5)
    expect(create.parse({ ...base, reference_regex: 'A'.repeat(201) }).reference_regex).toHaveLength(
      201,
    );
  });

  it('Scenario: A kind outside 1 to 4 is invalid_value', () => {
    expect(fails(create, { ...base, kind: 5 })).toStrictEqual(['kind:invalid_value']);
    for (const kind of [0, 1.5]) expect(fails(create, { ...base, kind })).toHaveLength(1);
    for (const kind of [1, 2, 3, 4]) expect(create.parse({ ...base, kind }).kind).toBe(kind);
  });

  it('sort_order: 0 and the integer maximum pass; −1 is too_small, one over too_big', () => {
    for (const sortOrder of [0, SORT_ORDER_MAX])
      expect(create.parse({ ...base, sort_order: sortOrder }).sort_order).toBe(sortOrder);
    expect(fails(create, { ...base, sort_order: -1 })).toStrictEqual(['sort_order:too_small']);
    expect(fails(create, { ...base, sort_order: SORT_ORDER_MAX + 1 })).toStrictEqual([
      'sort_order:too_big',
    ]);
  });

  it('a missing code or name is invalid_type; is_cash and status are dropped', () => {
    expect(fails(create, { kind: 2 })).toStrictEqual(['code:invalid_type', 'name_mm:invalid_type']);
    const parsed = create.parse({ ...base, is_cash: true, status: 0 });
    expect(parsed).not.toHaveProperty('is_cash');
    expect(parsed).not.toHaveProperty('status');
  });
});

describe('paymentMethodUpdateSchema (P4.PMT.03)', () => {
  it('Scenario: A rename — the members sent and nothing added', () => {
    const body = { name_en: 'Wave Pay', expected_updated_at: AT };
    expect(update.parse(body)).toStrictEqual(body);
  });

  it('Scenario: Missing expected_updated_at is invalid_type', () => {
    expect(fails(update, { name_en: 'Wave Pay' })).toStrictEqual([
      'expected_updated_at:invalid_type',
    ]);
  });

  it('Scenario: Code and kind never change — code, kind and is_cash are dropped', () => {
    const sent = { code: 'WAVE2', kind: 1, is_cash: true, name_en: 'Wave Pay' };
    expect(update.parse({ ...sent, expected_updated_at: AT })).toStrictEqual({
      name_en: 'Wave Pay',
      expected_updated_at: AT,
    });
  });

  it('flags, status and the format follow the create bounds', () => {
    const body = { requires_reference: true, requires_verification: false, status: 0 };
    expect(update.parse({ ...body, expected_updated_at: AT })).toMatchObject(body);
    expect(fails(update, { status: 2, expected_updated_at: AT })).toStrictEqual([
      'status:invalid_value',
    ]);
    expect(
      update.parse({ reference_regex: ' ', expected_updated_at: AT }).reference_regex,
    ).toBeNull();
    expect(fails(update, { name_mm: ' ', expected_updated_at: AT })).toStrictEqual([
      'name_mm:too_small',
    ]);
  });
});

describe('paymentMethodOrderSchema (P4.PMT.06)', () => {
  it('takes the ids in order; empty is too_small and a non-UUID invalid_format', () => {
    expect(order.parse({ ids: [ID] })).toStrictEqual({ ids: [ID] });
    expect(fails(order, { ids: [] })).toStrictEqual(['ids:too_small']);
    expect(fails(order, { ids: [ID, 'other'] })).toStrictEqual(['ids.1:invalid_format']);
  });

  it('Scenario: More ids than the ceiling — 1,000 pass, 1,001 are too_big', () => {
    expect(order.parse({ ids: Array<string>(1_000).fill(ID) }).ids).toHaveLength(1_000);
    expect(fails(order, { ids: Array<string>(1_001).fill(ID) })).toStrictEqual(['ids:too_big']);
  });
});

describe('paymentMethodListQuerySchema (P4.PMT.01)', () => {
  it('defaults to ACTIVE only and no archived rows', () => {
    expect(listQuery.parse({})).toStrictEqual({ status: [1], include_archived: false });
  });

  it('Scenario: Both statuses — status is repeatable; one value arrives as a string', () => {
    expect(listQuery.parse({ status: ['0', '1'] }).status).toStrictEqual([0, 1]);
    expect(listQuery.parse({ status: '0' }).status).toStrictEqual([0]);
    expect(listQuery.parse({ include_archived: 'true' }).include_archived).toBe(true);
  });

  it('Scenario: A status outside 0 and 1 is invalid_value; a blank one is refused too', () => {
    expect(fails(listQuery, { status: '2' })).toStrictEqual(['status.0:invalid_value']);
    expect(fails(listQuery, { status: ['1', '2'] })).toStrictEqual(['status.1:invalid_value']);
    expect(fails(listQuery, { status: '' })).toHaveLength(1);
  });
});
