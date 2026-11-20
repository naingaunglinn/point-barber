import { ErrorCode } from '@point/shared';

import { ProblemException } from '../../common/http/problem.exception.js';

/**
 * The stale check of a catalogue edit (API-IDEM-04 · add-service-catalogue design D4): the token the client
 * echoes is the `updated_at` it read, with its milliseconds, compared with the locked row. A mismatch is 409
 * `conflict` and nothing is written.
 */
export function assertFresh(stored: Date, expected: string): void {
  if (stored.getTime() !== new Date(expected).getTime()) {
    throw new ProblemException(ErrorCode.CONFLICT, 409);
  }
}
