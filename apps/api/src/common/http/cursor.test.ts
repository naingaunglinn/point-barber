import { ErrorCode } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from './cursor.js';
import { ProblemException } from './problem.exception.js';

// API-DATA-08 — the opaque cursor of the first list of add-walkin-visit-checkout (P2.SVC.01).
describe('cursor', () => {
  const id = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';

  it('round-trips an id and is opaque (no plain id in it)', () => {
    const cursor = encodeCursor(id);
    expect(cursor).not.toContain(id);
    expect(decodeCursor(cursor)).toBe(id);
  });

  it.each(['', 'not-a-cursor', encodeCursor('1; DROP TABLE services')])(
    'refuses %j with 400 validation on cursor',
    (cursor) => {
      try {
        decodeCursor(cursor);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(ProblemException);
        expect((error as ProblemException).code).toBe(ErrorCode.VALIDATION);
        expect((error as ProblemException).options.errors?.[0]?.field).toBe('cursor');
      }
    },
  );
});
