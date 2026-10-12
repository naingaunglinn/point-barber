// An instant on the wire is ISO 8601 with an offset (API-DATA-03): `2026-10-05T10:42:00+06:30`.
export type Instant = string;
/** A Myanmar calendar date, `YYYY-MM-DD` (D-PLT-15). */
export type BusinessDate = string;

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** The moment an Instant or a Date stands for; throws on anything else. */
export function toDate(value: Instant | Date): Date {
  if (typeof value === 'string' && !INSTANT.test(value)) {
    throw new RangeError(`Not an ISO 8601 instant with an offset: ${value}`);
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError(`Not a valid instant: ${String(value)}`);
  return date;
}
