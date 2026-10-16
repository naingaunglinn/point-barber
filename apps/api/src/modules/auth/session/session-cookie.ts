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

/** The value of one cookie of a `Cookie` header; undefined when absent or empty. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=');
    if (at === -1 || pair.slice(0, at).trim() !== name) continue;
    const value = pair.slice(at + 1).trim();
    return value === '' ? undefined : value;
  }
  return undefined;
}
