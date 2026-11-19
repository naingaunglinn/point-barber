'use client';

import { useCallback, useRef, useState } from 'react';

import { ErrorCode } from '@point/shared';

import { ApiProblem } from '../../lib/api/client';

// One money submit that survives a lost reply (AD-NET-01 · AD-NET-02 · P4.REQ.01 · visits spec "Was it
// saved?" is answered by the client request id · add-walkin-visit-checkout tasks 10.9 / 12.8): one
// `Idempotency-Key` per logical submit, kept across its retries and replaced only when the user starts a new
// action. When the request has had no answer for 15 s — or fails without an answer (no network) — the state
// is `checking` and the key is looked up: found → the saved record is the success; not found or no answer →
// `notSaved`, and only the user's Retry sends again, with the same key. A refusal (an answer with a status)
// ends the submit and frees the key for the next action — except 409 `idempotency_in_progress`: the first
// request with this key still runs (API-IDEM-01), so it is no answer: the key is kept, the lookup decides,
// and the late answer of that first request still lands. A second tap while a submit runs does nothing.

export type SavedSubmitState = 'idle' | 'sending' | 'checking' | 'notSaved';

export const SAVED_CHECK_AFTER_MS = 15_000;

export interface SavedSubmitOptions<T, F> {
  /** Sends the request with this key; rejects with the API problem or a network error. */
  readonly send: (key: string) => Promise<T>;
  /** `GET /v1/me/requests/{key}`: the saved record, or null on 404. */
  readonly lookup: (key: string) => Promise<F | null>;
  readonly onSent: (result: T) => void;
  readonly onFound: (found: F) => void;
  readonly onRefused: (problem: unknown) => void;
  /** True when the error is an answer of the API (it has a status); false for no answer. */
  readonly answered?: (error: unknown) => boolean;
  readonly newKey?: () => string;
  readonly checkAfterMs?: number;
}

const hasStatus = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { status?: unknown }).status === 'number';

/** 409 `idempotency_in_progress`: the server still runs the first request of this key. */
const stillRunning = (error: unknown) =>
  error instanceof ApiProblem && error.problem.code === ErrorCode.IDEMPOTENCY_IN_PROGRESS;

export function useSavedSubmit<T, F>({
  send,
  lookup,
  onSent,
  onFound,
  onRefused,
  answered = hasStatus,
  newKey = () => crypto.randomUUID(),
  checkAfterMs = SAVED_CHECK_AFTER_MS,
}: SavedSubmitOptions<T, F>) {
  const [state, setState] = useState<SavedSubmitState>('idle');
  const key = useRef<string | null>(null);
  const busy = useRef(false);

  const check = useCallback(
    async (requestKey: string) => {
      // The submit may already be over (the late answer of its first request landed): nothing to check.
      if (key.current !== requestKey) return;
      setState('checking');
      try {
        const found = await lookup(requestKey);
        if (key.current !== requestKey) return;
        if (found !== null) {
          key.current = null;
          setState('idle');
          onFound(found);
          return;
        }
      } catch {
        // No answer from the lookup either: the user decides when to try again.
      }
      if (key.current === requestKey) setState('notSaved');
    },
    [lookup, onFound],
  );

  const attempt = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    key.current ??= newKey();
    const requestKey = key.current;
    setState('sending');
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<'slow'>((resolve) => {
      timer = setTimeout(() => resolve('slow'), checkAfterMs);
    });
    const request = send(requestKey).then(
      (result) => ({ ok: true as const, result }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    try {
      const first = await Promise.race([request, slow]);
      clearTimeout(timer);
      if (first === 'slow') {
        await check(requestKey);
        // A late answer of the request still counts while nothing else has happened.
        void request.then((late) => {
          if (late.ok && !settled && key.current === requestKey) {
            settled = true;
            key.current = null;
            setState('idle');
            onSent(late.result);
          }
        });
        return;
      }
      settled = true;
      if (first.ok) {
        key.current = null;
        setState('idle');
        onSent(first.result);
      } else if (answered(first.error) && !stillRunning(first.error)) {
        key.current = null;
        setState('idle');
        onRefused(first.error);
      } else {
        await check(requestKey);
      }
    } finally {
      busy.current = false;
    }
  }, [answered, check, checkAfterMs, newKey, onRefused, onSent, send]);

  return {
    state,
    /** The first tap of a new action (a new key when none is pending). */
    submit: attempt,
    /** Retry after `notSaved`: the same key. */
    retry: attempt,
  };
}
