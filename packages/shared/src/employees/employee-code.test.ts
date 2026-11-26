import { describe, expect, it } from 'vitest';

import {
  EMPLOYEE_CODE_FORMAT_DEFAULT,
  codeNumber,
  employeeCodeFormatSchema,
  nextCode,
  parseEmployeeCodeFormat,
} from './employee-code.js';

// add-employee-management task 1.3 — the code format and the next code (design D5 · owner EM1).
// Codes of spec-fixtures §3: E001 … E009 are used before Ko Lin (E010) and Ma Khin (E011) are added.

const highest = (prefix: string, codes: readonly string[]): bigint | null =>
  codes.reduce<bigint | null>((best, code) => {
    const n = codeNumber(prefix, code);
    return n !== null && (best === null || n > best) ? n : best;
  }, null);

const E001_TO_E009 = Array.from({ length: 9 }, (_, i) => `E${String(i + 1).padStart(3, '0')}`);

describe('nextCode (task 1.3)', () => {
  it('E### with E001 … E009 → E010', () => {
    expect(nextCode('E###', highest('E', E001_TO_E009))).toBe('E010');
  });

  it('E### after E010 → E011', () => {
    expect(nextCode('E###', highest('E', [...E001_TO_E009, 'E010']))).toBe('E011');
  });

  it('PT#### with no code → PT0001', () => {
    expect(nextCode('PT####', null)).toBe('PT0001');
  });

  it('LIN-01 is ignored for the prefix E', () => {
    const codes = [...E001_TO_E009, 'LIN-01'];
    expect(codeNumber('E', 'LIN-01')).toBeNull();
    expect(highest('E', codes)).toBe(9n);
    expect(nextCode('E###', highest('E', codes))).toBe('E010');
  });

  it('a code with a letter after the digits is ignored', () => {
    expect(codeNumber('E', 'E10A')).toBeNull();
    expect(codeNumber('E', 'E')).toBeNull();
    expect(codeNumber('E', 'E0010')).toBe(10n);
  });

  it('a number longer than the width is not truncated', () => {
    expect(nextCode('E###', 999)).toBe('E1000');
    expect(nextCode('E#', 9)).toBe('E10');
  });

  it('a very long number keeps every digit', () => {
    expect(nextCode('E###', BigInt(`1${'0'.repeat(30)}`))).toBe(`E1${'0'.repeat(29)}1`);
  });

  it('a prefix with digits keeps its digits', () => {
    expect(nextCode('PT01###', highest('PT01', ['PT01005', 'PT02009']))).toBe('PT01006');
  });

  it('a format with no prefix gives the number alone', () => {
    expect(nextCode('####', 41)).toBe('0042');
  });
});

describe('employeeCodeFormatSchema (task 1.3)', () => {
  const accepts = (format: string) => employeeCodeFormatSchema.safeParse(format).success;

  it('the default is accepted', () => {
    expect(accepts(EMPLOYEE_CODE_FORMAT_DEFAULT)).toBe(true);
    expect(parseEmployeeCodeFormat('E###')).toEqual({ prefix: 'E', width: 3 });
  });

  it('E + 6 # is accepted and E + 7 # is refused', () => {
    expect(accepts('E######')).toBe(true);
    expect(accepts('E#######')).toBe(false);
  });

  it('a format without # is refused', () => {
    for (const format of ['E', 'E001', '', 'EMP']) expect(accepts(format), format).toBe(false);
  });

  it('a prefix of 10 characters is accepted, one of 11 is refused', () => {
    expect(accepts(`${'A'.repeat(10)}#`)).toBe(true);
    expect(accepts(`${'A'.repeat(11)}#`)).toBe(false);
  });

  it('a character other than a letter or a digit, or a # before the end, is refused', () => {
    for (const format of ['E-###', 'E ###', 'E#1', '#E#', 'E###\n']) {
      expect(accepts(format), JSON.stringify(format)).toBe(false);
    }
  });

  it('parseEmployeeCodeFormat throws for a refused format', () => {
    expect(() => parseEmployeeCodeFormat('E')).toThrow();
  });
});
