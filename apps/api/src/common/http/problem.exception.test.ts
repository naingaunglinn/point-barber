import { ErrorCode } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { ProblemException } from './problem.exception.js';

// CG-NAME-05 · CG-ERR-03: a code that is not in the catalogue does not compile. The expect-error
// directive below fails `pnpm typecheck` the day `code` accepts any string again.
describe('ProblemException', () => {
  it('takes a code from the ErrorCode catalogue', () => {
    expect(new ProblemException(ErrorCode.NOT_FOUND, 404).code).toBe('not_found');
  });

  it('refuses a code outside the catalogue at compile time', () => {
    // @ts-expect-error — 'not_fuond' is not an ErrorCode
    expect(new ProblemException('not_fuond', 404).code).toBe('not_fuond');
  });
});
