import { describe, expect, it } from 'vitest';

import { LOCALE_COOKIE, localeCookie, localeCookieUpdate, resolveLocale } from './resolve-locale';

// ui-foundation "The language is the account's, else the system default; the cookie serves only
// before a session exists" (D-PLT-03 · AD-L10N-06 · AD-L10N-04 · design D6).
describe('resolveLocale', () => {
  it('Scenario: First visit without a cookie and without a session', () => {
    expect(resolveLocale({})).toBe('my');
  });

  it('Scenario: NULL on the account means the system default, not the cookie', () => {
    const locale = resolveLocale({ session: { uiLanguage: null }, cookie: 'en', systemDefault: 1 });
    expect(locale).toBe('my');
    expect(localeCookieUpdate(locale, 'en')).toBe(localeCookie('my'));
  });

  it('Scenario: The account value wins over the cookie', () => {
    const locale = resolveLocale({ session: { uiLanguage: 2 }, cookie: 'my', systemDefault: 1 });
    expect(locale).toBe('en');
    expect(localeCookieUpdate(locale, 'my')).toBe(localeCookie('en'));
  });

  it.each([
    [1, 'my'],
    [2, 'en'],
  ] as const)(
    'a session with ui_language %i is %s, whatever the cookie says',
    (uiLanguage, locale) => {
      for (const cookie of [undefined, 'my', 'en', 'xx']) {
        expect(resolveLocale({ session: { uiLanguage }, cookie, systemDefault: 1 })).toBe(locale);
        expect(resolveLocale({ session: { uiLanguage }, cookie, systemDefault: 2 })).toBe(locale);
      }
    },
  );

  it('a session with ui_language NULL takes the system default 2 → en', () => {
    expect(resolveLocale({ session: { uiLanguage: null }, cookie: 'my', systemDefault: 2 })).toBe(
      'en',
    );
  });

  it('a session with ui_language NULL and no system default given → my (default 1 MY)', () => {
    expect(resolveLocale({ session: { uiLanguage: null }, cookie: 'en' })).toBe('my');
  });

  it.each(['my', 'en'] as const)('no session: the cookie %s is used', (cookie) => {
    expect(resolveLocale({ cookie, systemDefault: 1 })).toBe(cookie);
    expect(resolveLocale({ cookie, systemDefault: 2 })).toBe(cookie);
  });

  it.each(['', 'EN', 'fr', ' my'])(
    'no session: a cookie of %j is ignored for the system default',
    (cookie) => {
      expect(resolveLocale({ cookie, systemDefault: 2 })).toBe('en');
      expect(resolveLocale({ cookie })).toBe('my');
    },
  );
});

describe('the locale cookie', () => {
  it('holds my or en for one year, SameSite=Lax, for the whole host', () => {
    expect(LOCALE_COOKIE).toBe('point_locale');
    expect(localeCookie('en')).toBe('point_locale=en; Path=/; Max-Age=31536000; SameSite=Lax');
  });

  it('is rewritten only when it differs from the resolved language', () => {
    expect(localeCookieUpdate('my', 'my')).toBeNull();
    expect(localeCookieUpdate('my', undefined)).toBe(localeCookie('my'));
    expect(localeCookieUpdate('en', 'fr')).toBe(localeCookie('en'));
  });
});
