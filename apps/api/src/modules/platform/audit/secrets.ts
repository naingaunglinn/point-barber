// The audit deny-list (CG-SEC-10 · API-AUD-01 · design D12): keys whose values never reach an
// audit row, at any depth. A key ending in `_secret` is dropped too. `code` and `state` are not on
// it: no row holds a sign-in code or an OAuth state (an OTP is kept only as `code_hash`), while
// branches, payment methods, discount codes and the permission catalogue carry a business `code`
// that the audit trail must show. The request log redacts the sign-in `code` / `state` by path.
const DENIED = new Set([
  'token',
  'token_hash',
  'code_hash',
  'google_subject',
  'id_token',
  'authorization_code',
]);

const denied = (key: string) => DENIED.has(key) || key.endsWith('_secret');

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !denied(key))
      .map(([key, inner]) => [key, clean(inner)]),
  );
}

/** A copy of `data` without the denied keys; null stays null. */
export function withoutSecrets(
  data: Readonly<Record<string, unknown>> | null | undefined,
): Readonly<Record<string, unknown>> | null {
  return data === null || data === undefined ? null : (clean(data) as Record<string, unknown>);
}
