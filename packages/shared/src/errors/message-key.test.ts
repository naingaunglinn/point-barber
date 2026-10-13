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

  it("holds this change's API codes", () => {
    expect(Object.values(ErrorCode).sort()).toEqual(
      [
        'amount_invalid',
        'file_too_large',
        'file_type_not_allowed',
        'forbidden',
        'internal_error',
        'not_found',
        'phone_invalid',
        'reason_required',
        'validation',
      ].sort(),
    );
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

  it('an unknown code → error.unknown', () => {
    expect(fieldMessageKey({ code: 'zz_unknown' }, 'x')).toEqual({
      key: 'error.unknown',
      params: {},
    });
  });
});
