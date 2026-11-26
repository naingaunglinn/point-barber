import { z } from 'zod';

// The employee code format and the next code (add-employee-management design D5 · D-EMP-03 · P1.EMP.02
// · owner EM1): a format is a prefix of up to 10 letters or digits followed by a run of 1 – 6 `#`
// (`E###`, `PT####`); the next code is the prefix and the next number, zero-padded to the width of the
// run. Pure functions, shared by the API (the code of a create) and the screens (the format check).

/** The default of the company setting `employee.code_format` (owner EM1). */
export const EMPLOYEE_CODE_FORMAT_DEFAULT = 'E###';

export const EmployeeCodeFormatLimits = {
  /** Letters and digits before the `#` run. */
  PREFIX_MAX: 10,
  /** The `#` run: at least one, at most six. */
  WIDTH_MAX: 6,
} as const;

/** `^[A-Za-z0-9]{0,10}#{1,6}$` — the validation of the setting (design D5). */
export const EMPLOYEE_CODE_FORMAT_PATTERN = new RegExp(
  `^[A-Za-z0-9]{0,${String(EmployeeCodeFormatLimits.PREFIX_MAX)}}#{1,${String(EmployeeCodeFormatLimits.WIDTH_MAX)}}$`,
);

/** A format such as `E###`: a malformed one is one `invalid_format` issue. */
export const employeeCodeFormatSchema = z.string().regex(EMPLOYEE_CODE_FORMAT_PATTERN);

export interface EmployeeCodeFormat {
  readonly prefix: string;
  readonly width: number;
}

/** The prefix and the width of a format; throws for a format `employeeCodeFormatSchema` refuses. */
export function parseEmployeeCodeFormat(format: string): EmployeeCodeFormat {
  if (!EMPLOYEE_CODE_FORMAT_PATTERN.test(format)) {
    throw new Error(`not an employee code format: ${format}`);
  }
  const width = format.length - format.search(/#/);
  return { prefix: format.slice(0, format.length - width), width };
}

/**
 * The number after `prefix` in `code`: the rest must be digits only (`E010` → 10; `LIN-01` → none for
 * the prefix `E`; `E10A` → none). The repository reads the highest of these with one aggregate query;
 * this is the same reading, for the tests and the screens.
 */
export function codeNumber(prefix: string, code: string): bigint | null {
  if (!code.startsWith(prefix)) return null;
  const rest = code.slice(prefix.length);
  return /^[0-9]+$/.test(rest) ? BigInt(rest) : null;
}

/**
 * The next code (D5): the prefix of `format` and `existing + 1` (1 when `existing` is null), padded
 * with zeros to the width of the `#` run; a longer number is not truncated. `existing` is the highest
 * number already used with that prefix, or null.
 */
export function nextCode(format: string, existing: bigint | number | null): string {
  const { prefix, width } = parseEmployeeCodeFormat(format);
  const next = existing === null ? 1n : BigInt(existing) + 1n;
  return `${prefix}${next.toString().padStart(width, '0')}`;
}
