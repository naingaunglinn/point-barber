'use client';

import { useCallback, useRef, useState } from 'react';

import { ErrorCode } from '@point/shared';

import { type ScreenProblem, screenProblem } from './problem';

// One state change of a POS screen (COMPLETE, INCOMPLETE, a line, a void, FINISH — or a read a tap starts):
// no Idempotency-Key — these are idempotent by state (API-IDEM-01) — one request at a time, the refusal
// kept for the screen.
// Codes that mean "the screen is stale" also reload the sale (design D11: an action on stale data is
// decided by the server, then the screen reloads): `invalid_transition`, `total_changed`,
// `amount_mismatch` (a payment was voided or taken elsewhere) and `change_too_large` (the payments
// changed, so the change of an over-transfer is now above 10,000 Ks).
const STALE = new Set<string>([
  ErrorCode.INVALID_TRANSITION,
  ErrorCode.TOTAL_CHANGED,
  ErrorCode.AMOUNT_MISMATCH,
  ErrorCode.CHANGE_TOO_LARGE,
]);

export function useAction(onStale: () => unknown) {
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<ScreenProblem | null>(null);
  const busy = useRef(false);

  const run = useCallback(
    async <T>(work: () => Promise<T>, onDone?: (result: T) => void): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setPending(true);
      setProblem(null);
      try {
        const result = await work();
        onDone?.(result);
        return true;
      } catch (error) {
        const refusal = screenProblem(error);
        setProblem(refusal);
        if (STALE.has(refusal.code)) void onStale();
        return false;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [onStale],
  );

  // Stable, so a screen can clear the refusal from an effect (checkout.tsx).
  const clear = useCallback(() => setProblem(null), []);

  return { pending, problem, run, clear };
}
