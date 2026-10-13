// Database errors the one error mapper turns into a problem (CG-DB-12 · add-foundation-auth-access
// design D14). Read by shape, so the HTTP layer needs no Prisma import.

interface PrismaLikeError {
  readonly code?: unknown;
  readonly meta?: unknown;
  readonly message?: unknown;
}

/**
 * A unique violation on a `client_request_id` index: another request with the same Idempotency-Key
 * created its row after this one's find() — the last line behind the advisory lock. The
 * transaction is aborted; the client's retry replays.
 */
export function isClientRequestIdConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, meta, message } = error as PrismaLikeError;
  // P2002 = unique constraint failed; P2010 = a raw query failed (here with SQLSTATE 23505).
  if (code !== 'P2002' && code !== 'P2010') return false;
  const text = `${JSON.stringify(meta ?? {})} ${typeof message === 'string' ? message : ''}`;
  return (code === 'P2002' || text.includes('23505')) && text.includes('client_request_id');
}
