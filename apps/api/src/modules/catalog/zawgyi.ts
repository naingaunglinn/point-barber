import { ErrorCode, type FieldError, isZawgyi } from '@point/shared';

import { ProblemException } from '../../common/http/problem.exception.js';

/**
 * Text typed with a Zawgyi keyboard is refused, one `errors[]` item per member (API-SHAPE-05: the client
 * converts, the server rejects what it still detects — `error.zawgyi_text`), after the schema passed and
 * before anything is written.
 */
export function assertNoZawgyi(members: Readonly<Record<string, string | null | undefined>>): void {
  const errors: FieldError[] = Object.entries(members).flatMap(([field, value]) =>
    typeof value === 'string' && isZawgyi(value) ? [{ field, code: ErrorCode.ZAWGYI_TEXT }] : [],
  );
  if (errors.length > 0) throw new ProblemException(ErrorCode.ZAWGYI_TEXT, 400, { errors });
}
