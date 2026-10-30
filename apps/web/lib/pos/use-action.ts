'use client';

import { useCallback, useRef, useState } from 'react';

import { type ScreenProblem, screenProblem } from './problem';

// One state change of a POS screen (COMPLETE, INCOMPLETE, a line, a void, FINISH): no Idempotency-Key —
// these are idempotent by state (API-IDEM-01) — one request at a time, the refusal kept for the screen.
// Codes that mean "the screen is stale" (`invalid_transition`, `total_changed`) also reload the sale
// (design D11: an action on stale data is decided by the server, then the screen reloads).
const STALE = new Set(['invalid_transition', 'total_changed']);

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

  return { pending, problem, run, clear: () => setProblem(null) };
}
