import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../constants/error-codes.js';
import { errorMessageKey, fieldMessageKey } from './message-key.js';

// API-ERR-01 · API-ERR-02 · API-ERR-03 (Part 0 v1.6) · design D6 / D9: a problem or a field issue is
// shown through its code as the language key `error.<code>`.
describe('errorMessageKey', () => {
  it.each(['forbidden', 'not_found', 'internal_error', 'validation', 'file_too_large'])(
    'a known code %s → error.%s',
    (code) => {
      expect(errorMessageKey(code)).toBe(`error.${code}`);
    },
  );

  it('an unknown code → error.unknown (never the developer text)', () => {
    expect(errorMessageKey('zz_unknown')).toBe('error.unknown');
  });

  // Later changes add their own codes (add-foundation-auth-access: the sign-in and access codes),
  // so this pins the codes of add-shared-ui-components and the scaffold, not the whole list.
  it("holds this change's API codes", () => {
    expect(Object.values(ErrorCode)).toEqual(
      expect.arrayContaining([
        'amount_invalid',
        'file_too_large',
        'file_type_not_allowed',
        'forbidden',
        'internal_error',
        'not_found',
        'phone_invalid',
        'reason_required',
        'validation',
      ]),
    );
  });
});

// add-service-catalogue task 2.2 — the three Part 2 §13b codes this change raises (API-ERR-02); the
// category count is the context member `count` (P2.CAT.04).
describe('errorMessageKey — add-service-catalogue', () => {
  it.each(['category_in_use', 'options_required', 'use_options_endpoint'])(
    '%s → error.%s',
    (code) => {
      expect(errorMessageKey(code)).toBe(`error.${code}`);
    },
  );
});

// add-product-catalogue task 2.5 — the two Part 6 §12 codes this change raises (API-ERR-02); the context
// members are `branches[]` / `in_transit_quantity` and `purchases` / `transfers` / `counts` / `sales`.
describe('errorMessageKey — add-product-catalogue', () => {
  it.each(['product_has_stock', 'product_in_open_documents'])('%s → error.%s', (code) => {
    expect(errorMessageKey(code)).toBe(`error.${code}`);
  });
});

describe('fieldMessageKey — the table of design D9', () => {
  it('a catalogue code named by the schema → error.<that code>', () => {
    for (const code of ['phone_invalid', 'amount_invalid', 'reason_required', 'date_invalid']) {
      expect(fieldMessageKey({ code }, 'x')).toEqual({ key: `error.${code}`, params: {} });
    }
  });

  it('invalid_type with an undefined value → error.required', () => {
    expect(
      fieldMessageKey({ code: 'invalid_type', params: { expected: 'string' } }, undefined),
    ).toEqual({
      key: 'error.required',
      params: {},
    });
  });

  it('too_small for an empty text or an empty list of a required field → error.required', () => {
    expect(fieldMessageKey({ code: 'too_small', params: { minimum: 2 } }, '')).toEqual({
      key: 'error.required',
      params: {},
    });
    expect(fieldMessageKey({ code: 'too_small', params: { minimum: 2 } }, '   ')).toEqual({
      key: 'error.required',
      params: {},
    });
    expect(fieldMessageKey({ code: 'too_small', params: { minimum: 1 } }, [])).toEqual({
      key: 'error.required',
      params: {},
    });
  });

  it('too_small otherwise → error.too_small with {minimum}', () => {
    expect(fieldMessageKey({ code: 'too_small', params: { minimum: 2 } }, 'K')).toEqual({
      key: 'error.too_small',
      params: { minimum: 2 },
    });
  });

  it('too_big → error.too_big with {maximum}', () => {
    expect(fieldMessageKey({ code: 'too_big', params: { maximum: 100 } }, 'x'.repeat(101))).toEqual(
      { key: 'error.too_big', params: { maximum: 100 } },
    );
  });

  it('invalid_type otherwise → error.invalid_type', () => {
    expect(
      fieldMessageKey({ code: 'invalid_type', params: { expected: 'number' } }, 'abc'),
    ).toEqual({
      key: 'error.invalid_type',
      params: {},
    });
  });

  it('a client Zod issue carries minimum / maximum on the issue itself', () => {
    expect(fieldMessageKey({ code: 'too_small', minimum: 2 }, 'K')).toEqual({
      key: 'error.too_small',
      params: { minimum: 2 },
    });
    expect(fieldMessageKey({ code: 'too_big', maximum: 100 }, 'x')).toEqual({
      key: 'error.too_big',
      params: { maximum: 100 },
    });
  });

  // add-branch-management task 1.2 — a failed code pattern or link address (API-ERR-03 · design D4).
  it('invalid_format → error.invalid_format', () => {
    expect(fieldMessageKey({ code: 'invalid_format' }, 'b4')).toEqual({
      key: 'error.invalid_format',
      params: {},
    });
  });

  it('an unknown code → error.unknown', () => {
    expect(fieldMessageKey({ code: 'zz_unknown' }, 'x')).toEqual({
      key: 'error.unknown',
      params: {},
    });
  });
});

// add-customer-management task 1.4 — the Part 3 §9 code of the archive guard; its count is the context
// member `count` (P3.CUS.07).
describe('errorMessageKey — add-customer-management', () => {
  it('customer_has_active_bookings → error.customer_has_active_bookings', () => {
    expect(ErrorCode.CUSTOMER_HAS_ACTIVE_BOOKINGS).toBe('customer_has_active_bookings');
    expect(errorMessageKey('customer_has_active_bookings')).toBe(
      'error.customer_has_active_bookings',
    );
  });
});
