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

interface DriverAdapterCause {
  readonly originalCode?: unknown;
  readonly constraint?: { readonly index?: unknown };
}

/**
 * The index a unique violation (SQLSTATE 23505) hit, read from the driver adapter's cause — the same
 * for a model call (P2002) and a raw query (P2010); null for any other error.
 */
export function uniqueViolationIndex(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, meta } = error as PrismaLikeError;
  if (code !== 'P2002' && code !== 'P2010') return null;
  const cause = (meta as { driverAdapterError?: { cause?: DriverAdapterCause } } | undefined)
    ?.driverAdapterError?.cause;
  if (cause?.originalCode !== '23505') return null;
  const index = cause.constraint?.index;
  return typeof index === 'string' ? index : null;
}

/**
 * A second non-voided payment with the reference of the same method hit payments_reference_unique
 * (D-PAY-02 · P4-RULE-09 · add-walkin-visit-checkout design D9) — the final guard behind the
 * reference lock, so two simultaneous payments can never both be stored.
 */
export function isPaymentReferenceConflict(error: unknown): boolean {
  return uniqueViolationIndex(error) === 'payments_reference_unique';
}

/** The SQLSTATE of a failed query (`55P03` lock_not_available, `23505` …), from the driver adapter. */
export function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { meta } = error as PrismaLikeError;
  const code = (meta as { driverAdapterError?: { cause?: DriverAdapterCause } } | undefined)
    ?.driverAdapterError?.cause?.originalCode;
  return typeof code === 'string' ? code : null;
}
