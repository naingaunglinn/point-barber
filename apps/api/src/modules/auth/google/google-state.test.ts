import { describe, expect, it } from 'vitest';

import { Clock } from '../../../common/clock/clock.js';
import { GoogleStateStore, safeReturnTo } from './google-state.js';

// add-foundation-auth-access task 5.13 — the return path and the state store of the Google sign-in
// (P1.AUTH.03 · ADR-005 · design D7).

const APP = 'https://app.point.test';

describe('return_to (task 5.13)', () => {
  it.each(['/today', '/visits/123?tab=2'])('keeps the staff path %s', (path) => {
    expect(safeReturnTo(path, APP)).toBe(path);
  });

  it.each([
    'https://evil.test/x',
    '//evil.test/x',
    '/\\evil.test',
    'today',
    '/x\ny',
    // The pattern needs a character after the slash; a dropped value falls back to `/` anyway.
    '/',
    '',
    undefined,
  ])('drops %s', (value) => {
    expect(safeReturnTo(value, APP)).toBeUndefined();
  });
});

class Moving extends Clock {
  at = 0;
  override now(): Date {
    return new Date(this.at);
  }
}

describe('Google state store (task 5.13)', () => {
  const pending = { codeVerifier: 'v', nonce: 'n', returnTo: '/today' };

  it('gives a state back once', () => {
    const store = new GoogleStateStore(new Moving());
    store.put('s1', pending);
    expect(store.take('s1')).toMatchObject(pending);
    expect(store.take('s1')).toBeUndefined();
  });

  it('forgets a state after 10 minutes', () => {
    const clock = new Moving();
    const store = new GoogleStateStore(clock);
    store.put('s1', pending);
    store.put('s2', pending);
    clock.at = 10 * 60 * 1000 - 1;
    expect(store.take('s1')).toMatchObject(pending);
    clock.at = 10 * 60 * 1000;
    expect(store.take('s2')).toBeUndefined();
  });

  it('knows no state it did not issue', () => {
    expect(new GoogleStateStore(new Moving()).take('other')).toBeUndefined();
  });
});
