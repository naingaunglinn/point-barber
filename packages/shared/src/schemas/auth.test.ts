import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { branchesQuerySchema } from './branches.js';
import { googleStartQuerySchema, otpRequestSchema, otpVerifySchema } from './auth.js';
import { CATALOGUE_CODE_PREFIX } from './catalogue-code.js';
import { patchMeSchema } from './me.js';

// The request schemas of add-foundation-auth-access (API-ERR-03 · P1.AUTH.01 · P1.AUTH.02 ·
// P1.AUTH.03 · P1.ME.02 · P1.BR.01 · design D4) — task 1.5. The API turns each issue into an
// `errors[]` item: the catalogue code the schema names, or else the Zod issue name.
function fieldErrors(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    code: issue.message.startsWith(CATALOGUE_CODE_PREFIX)
      ? issue.message.slice(CATALOGUE_CODE_PREFIX.length)
      : issue.code,
    ...(issue.code === 'too_big' ? { maximum: Number(issue.maximum) } : {}),
  }));
}

const address = (localLength: number) => `${'a'.repeat(localLength)}@point.test`;

describe('otpRequestSchema (P1.AUTH.01)', () => {
  it('trims and lower-cases the address', () => {
    expect(otpRequestSchema.parse({ email: '  Aung@Point.Test ' })).toStrictEqual({
      email: 'aung@point.test',
    });
  });

  it('accepts an address of 255 characters', () => {
    expect(address(244)).toHaveLength(255);
    expect(otpRequestSchema.parse({ email: address(244) })).toStrictEqual({ email: address(244) });
  });

  it('refuses an address of 256 characters with too_big and maximum 255', () => {
    expect(address(245)).toHaveLength(256);
    expect(fieldErrors(otpRequestSchema, { email: address(245) })).toStrictEqual([
      { field: 'email', code: 'too_big', maximum: 255 },
    ]);
  });

  it('refuses a value that is not an address with email_invalid', () => {
    expect(fieldErrors(otpRequestSchema, { email: 'aung' })).toStrictEqual([
      { field: 'email', code: 'email_invalid' },
    ]);
  });

  it('reports a missing address with the Zod issue name, not "required"', () => {
    expect(fieldErrors(otpRequestSchema, {})).toStrictEqual([
      { field: 'email', code: 'invalid_type' },
    ]);
  });

  it('strips an unknown member (CG-API-03)', () => {
    expect(otpRequestSchema.parse({ email: 'aung@point.test', role: 'admin' })).toStrictEqual({
      email: 'aung@point.test',
    });
  });
});

describe('otpVerifySchema (P1.AUTH.02)', () => {
  const body = { email: 'Aung@Point.Test', code: '04829173' };

  it('accepts 8 digits, a leading zero included, and normalises the address', () => {
    expect(otpVerifySchema.parse(body)).toStrictEqual({
      email: 'aung@point.test',
      code: '04829173',
    });
  });

  it.each(['1234567', '123456789', '1234 5678', '١٢٣٤٥٦٧٨', '1234567a'])(
    'refuses %s with otp_format',
    (code) => {
      expect(fieldErrors(otpVerifySchema, { ...body, code })).toStrictEqual([
        { field: 'code', code: 'otp_format' },
      ]);
    },
  );

  it('refuses an address that is not one with email_invalid', () => {
    expect(fieldErrors(otpVerifySchema, { ...body, email: 'aung' })).toStrictEqual([
      { field: 'email', code: 'email_invalid' },
    ]);
  });

  it('takes an optional device label of at most 255 characters', () => {
    expect(otpVerifySchema.parse({ ...body, device_label: 'Shop phone' }).device_label).toBe(
      'Shop phone',
    );
    expect(fieldErrors(otpVerifySchema, { ...body, device_label: 'x'.repeat(256) })).toStrictEqual([
      { field: 'device_label', code: 'too_big', maximum: 255 },
    ]);
  });
});

describe('googleStartQuerySchema (P1.AUTH.03)', () => {
  it('takes an optional return_to string', () => {
    expect(googleStartQuerySchema.parse({})).toStrictEqual({});
    expect(googleStartQuerySchema.parse({ return_to: '/today' })).toStrictEqual({
      return_to: '/today',
    });
  });

  it('ignores client and challenge, which this change does not have (design D7)', () => {
    expect(
      googleStartQuerySchema.parse({ return_to: '/today', client: 'shell', challenge: 'x' }),
    ).toStrictEqual({ return_to: '/today' });
  });
});

describe('patchMeSchema (P1.ME.02)', () => {
  it.each([1, 2, null])('accepts ui_language %s', (value) => {
    expect(patchMeSchema.parse({ ui_language: value })).toStrictEqual({ ui_language: value });
  });

  it.each([3, 0, '2', 1.5])('refuses ui_language %s', (value) => {
    expect(fieldErrors(patchMeSchema, { ui_language: value })[0]?.field).toBe('ui_language');
  });
});

describe('branchesQuerySchema (P1.BR.01)', () => {
  it('reads status 0 or 1 from the query string', () => {
    expect(branchesQuerySchema.parse({})).toStrictEqual({});
    expect(branchesQuerySchema.parse({ status: '1' })).toStrictEqual({ status: 1 });
    expect(branchesQuerySchema.parse({ status: '0' })).toStrictEqual({ status: 0 });
  });

  it.each(['2', '-1', 'active', '1.5'])('refuses status %s', (value) => {
    expect(fieldErrors(branchesQuerySchema, { status: value })[0]?.field).toBe('status');
  });
});
