// The cookie `point_session`, written in one place (API-AUTH-01 · ADR-005 decision 1 · design D6):
// exactly `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=34560000` (400 days) and no `Domain`, so
// the cookie belongs to the staff host only. `Secure` is left out only when SESSION_COOKIE_SECURE is
// false, which the environment check allows in development and test alone.

export const SESSION_COOKIE = 'point_session';
export const SESSION_MAX_AGE_SECONDS = 34_560_000;

/** The `Set-Cookie` value for a session token. */
export function sessionCookie(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    'Path=/',
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    'SameSite=Lax',
  ].join('; ');
}

/**
 * The value of one cookie of a `Cookie` header; undefined when absent, empty or sent more than once.
 * Two `point_session` values mean one was planted (a parent-domain cookie with a longer Path comes
 * first): which one is meant cannot be known, so neither is used — the request has no session
 * (PR #21 review item 6).
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  const values: string[] = [];
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=');
    if (at !== -1 && pair.slice(0, at).trim() === name) values.push(pair.slice(at + 1).trim());
  }
  if (values.length !== 1) return undefined;
  const [value] = values;
  return value === undefined || value === '' ? undefined : value;
}

/** Sign-out clears the cookie: an empty value with `Max-Age=0` (P1.AUTH.05). */
export function clearedSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    'SameSite=Lax',
  ].join('; ');
}
