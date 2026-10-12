import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

// Which language a staff page is in (D-PLT-03 · AD-L10N-06 · design D6): the account's
// `users.ui_language`; when it is NULL, the system default (setting `system.default_language`). The
// cookie `point_locale` serves only before a session exists — the login screen, the first paint, the
// catalogue — so a shared shop phone never shows user B in user A's language.

/** `users.ui_language` and `system.default_language`: 1 MY · 2 EN (API Part 1). */
export const UiLanguage = { MY: 1, EN: 2 } as const;
export type UiLanguage = (typeof UiLanguage)[keyof typeof UiLanguage];

export const LOCALE_COOKIE = 'point_locale';
const ONE_YEAR = 365 * 24 * 60 * 60;

export interface LocaleInput {
  /** The signed-in account, when `/me` is known. */
  readonly session?: { readonly uiLanguage: UiLanguage | null };
  /** The value of the cookie `point_locale`, when the request has one. */
  readonly cookie?: string;
  /** The setting `system.default_language`, when the caller has it; 1 MY otherwise. */
  readonly systemDefault?: UiLanguage;
}

function localeOf(language: UiLanguage): Locale {
  return language === UiLanguage.EN ? 'en' : 'my';
}

export function resolveLocale({ session, cookie, systemDefault }: LocaleInput): Locale {
  const fallback = systemDefault === undefined ? DEFAULT_LOCALE : localeOf(systemDefault);
  if (session !== undefined) {
    return session.uiLanguage === null ? fallback : localeOf(session.uiLanguage);
  }
  return isLocale(cookie) ? cookie : fallback;
}

/** The `Set-Cookie` / `document.cookie` value that stores `locale` (1 year, SameSite=Lax). */
export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
}

/** After `/me` is known: the cookie to write when it does not already hold the resolved language. */
export function localeCookieUpdate(resolved: Locale, current: string | undefined): string | null {
  return current === resolved ? null : localeCookie(resolved);
}
