import { describe, expect, it } from 'vitest';

import { loginUrl, safeReturnTo, signedOutKey } from './return-to';

// add-foundation-auth-access task 7.2 / 7.7 — the return path and the signed-out reason (design D7 ·
// D17 · AD-AUTH-01).

describe('safeReturnTo (task 7.2)', () => {
  it.each(['/today', '/?branch=B3', '/visits/123?tab=2'])('keeps %s', (value) => {
    expect(safeReturnTo(value)).toBe(value);
  });

  it.each([
    'https://evil.test/x',
    '//evil.test/x',
    '/\\evil.test',
    'today',
    '/x\ny',
    '/',
    '',
    null,
  ])('drops %s', (value) => {
    expect(safeReturnTo(value)).toBeUndefined();
  });
});

describe('the signed-out reason (task 7.7)', () => {
  it.each([
    ['1', 'LOGOUT'],
    ['2', 'DEVICE_REMOVED'],
    ['3', 'ADMIN_REVOKE_ALL'],
    ['4', 'ACCOUNT_INACTIVE'],
  ])('reason=%s → auth.signedOut.%s', (reason, key) => {
    expect(signedOutKey(reason)).toBe(key);
  });

  it.each(['0', '5', 'x', '', null])('no message for %s', (reason) => {
    expect(signedOutKey(reason)).toBeUndefined();
  });

  it('builds the login URL with the reason and a safe return path', () => {
    expect(loginUrl({ reason: 3, returnTo: '/?branch=B3' })).toBe(
      '/login?reason=3&return_to=%2F%3Fbranch%3DB3',
    );
    expect(loginUrl({ returnTo: '//evil.test' })).toBe('/login');
    expect(loginUrl({})).toBe('/login');
  });
});
