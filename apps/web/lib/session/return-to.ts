import { RevokeReason } from '@point/shared';

// Where the login screen sends the browser back to (design D7 · D17): a path of the staff host only —
// the rule of the API's `return_to` (OpenAPI `^/[^/].*$`, no backslash, no control character, and it
// stays on the app's origin when resolved), checked again here before it is used.

const BASE = 'https://staff.invalid';

export function safeReturnTo(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (!/^\/[^/].*$/.test(value) || value.includes('\\')) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;
  if (!URL.canParse(value, BASE) || new URL(value, BASE).origin !== BASE) return undefined;
  return value;
}

/** The signed-out reason keys of AD-AUTH-01 (`auth.signedOut.<NAME>`), by `revoke_reason`. */
export const SIGNED_OUT_KEYS = {
  [RevokeReason.LOGOUT]: 'LOGOUT',
  [RevokeReason.DEVICE_REMOVED]: 'DEVICE_REMOVED',
  [RevokeReason.ADMIN_REVOKE_ALL]: 'ADMIN_REVOKE_ALL',
  [RevokeReason.ACCOUNT_INACTIVE]: 'ACCOUNT_INACTIVE',
} as const;

export type SignedOutKey = (typeof SIGNED_OUT_KEYS)[keyof typeof SIGNED_OUT_KEYS];

/** `?reason=1…4` → the key, or undefined for anything else. */
export function signedOutKey(reason: string | null | undefined): SignedOutKey | undefined {
  const number = Number(reason);
  return Object.hasOwn(SIGNED_OUT_KEYS, number)
    ? SIGNED_OUT_KEYS[number as RevokeReason]
    : undefined;
}

/** The login screen URL for a lost session: the reason (when revoked) and the page to come back to. */
export function loginUrl(options: {
  readonly reason?: number;
  readonly returnTo?: string;
}): string {
  const params = new URLSearchParams();
  if (options.reason !== undefined) params.set('reason', String(options.reason));
  const back = safeReturnTo(options.returnTo);
  if (back !== undefined) params.set('return_to', back);
  const query = params.toString();
  return query === '' ? '/login' : `/login?${query}`;
}
