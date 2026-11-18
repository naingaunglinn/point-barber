import { CUSTOMER_SORTS, ErrorCode } from '@point/shared';
import { z } from 'zod';

import { ProblemException } from '../../../common/http/problem.exception.js';

// The keyset cursors of P3.CUS.01 and P3.CUS.09 (API-DATA-08 · add-customer-management design D3 /
// D10): base64url JSON of the last row's sort values and id. The list carries its timestamps as
// PostgreSQL prints them, so a cursor keeps the stored microseconds. A cursor that does not decode,
// or belongs to another sort, is 400 validation on `cursor`.

/** PostgreSQL's text of a timestamptz: `2026-09-28 04:12:00.123456+00`. */
const TIMESTAMP_TEXT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;

const listCursorSchema = z.strictObject({
  sort: z.enum(CUSTOMER_SORTS),
  /** `last_visit_at` (null = never visited) or `created_at`; absent for `name`. */
  key: z.string().regex(TIMESTAMP_TEXT).nullable().optional(),
  name: z.string(),
  id: z.uuid(),
});
const timelineCursorSchema = z.strictObject({ at: z.iso.datetime({ offset: true }), id: z.uuid() });

export type ListCursor = z.infer<typeof listCursorSchema>;
export interface TimelineCursor {
  readonly at: Date;
  readonly id: string;
}

const badCursor = (): ProblemException =>
  new ProblemException(ErrorCode.VALIDATION, 400, {
    errors: [{ field: 'cursor', code: 'invalid_type' }],
  });

const encode = (value: object): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

function decode<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw badCursor();
  }
}

export const encodeListCursor = (cursor: ListCursor): string => encode(cursor);

/** The list cursor of `sort`; another sort's cursor is refused. */
export function decodeListCursor(cursor: string, sort: ListCursor['sort']): ListCursor {
  const decoded = decode(cursor, listCursorSchema);
  // `-created_at` keys on a timestamp, `-last_visit_at` on one or null (never visited), `name` on none.
  const keyed =
    sort === 'name'
      ? (decoded.key ?? null) === null
      : sort === '-created_at'
        ? typeof decoded.key === 'string'
        : decoded.key !== undefined;
  if (decoded.sort !== sort || !keyed) throw badCursor();
  return decoded;
}

export const encodeTimelineCursor = (cursor: TimelineCursor): string =>
  encode({ at: cursor.at.toISOString(), id: cursor.id });

export function decodeTimelineCursor(cursor: string): TimelineCursor {
  const decoded = decode(cursor, timelineCursorSchema);
  return { at: new Date(decoded.at), id: decoded.id };
}
