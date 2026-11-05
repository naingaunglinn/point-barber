import { z } from 'zod';

// Building blocks of the response DTOs of the Part 2 / 3 / 4 OpenAPI files (API-DATA-02 ·
// API-DATA-04 · API-ERR-03): instants with their offset, Myanmar calendar dates, whole kyats as JSON
// integers, the smallint codes of a named constant, and the two reference shapes.

/** A fraction of a second with more than 9 digits — more than `toDate` reads (`INSTANT`). */
const LONG_FRACTION = /\.\d{10}/;

/**
 * An instant on the wire — ISO 8601 with its offset (`2026-10-05T10:42:00+06:30`), to the nanosecond at
 * most: a longer fraction is refused like any other malformed instant (`invalid_format`), not left for
 * `toDate` to throw on.
 */
export const wireDateTime = z.iso.datetime({ offset: true, abort: true }).check((ctx) => {
  if (LONG_FRACTION.test(ctx.value)) {
    ctx.issues.push({ code: 'invalid_format', format: 'datetime', input: ctx.value });
  }
});

/** A Myanmar calendar date `YYYY-MM-DD` (D-PLT-15). */
export const wireDate = z.iso.date();

/** An `_amount` member: whole MMK as a JSON integer, ≥ 0 (D-PLT-04 · API-DATA-02). */
export const wireAmount = z.int().min(0);

/** An `_amount` member that is never 0 — a payment or a refund. */
export const wirePositiveAmount = z.int().min(1);

/** The smallint codes of one named constant, e.g. `codeOf(SaleStatus)` = 0 | 1 | 2 (D-DB-03). */
export function codeOf<const T extends Record<string, number>>(set: T) {
  return z.literal(Object.values(set) as T[keyof T][]);
}

/** `{ id, display_name }` — an employee (the performer, the collector); not Part 1's `EmployeeRef`. */
export const employeeRefSchema = z.strictObject({ id: z.uuid(), display_name: z.string() });

/** `{ user_id, display_name }` — the user who recorded an action. */
export const userRefSchema = z.strictObject({ user_id: z.uuid(), display_name: z.string() });
