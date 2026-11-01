import { ErrorCode } from '@point/shared';

import { ProblemException } from './problem.exception.js';

// The opaque cursor of a cursor-paginated list (API-DATA-08): the id of the last row of the page, as
// base64url. A list orders by its keys and then id, so the id alone finds the place. A cursor that
// does not decode is 400 validation on `cursor`.

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function decodeCursor(cursor: string): string {
  const id = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!UUID.test(id)) {
    throw new ProblemException(ErrorCode.VALIDATION, 400, {
      errors: [{ field: 'cursor', code: 'invalid_type' }],
    });
  }
  return id;
}
