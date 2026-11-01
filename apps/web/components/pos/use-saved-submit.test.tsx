// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiProblem } from '../../lib/api/client';
import { problem } from '../../test/render';
import { SAVED_CHECK_AFTER_MS, useSavedSubmit } from './use-saved-submit';

// add-walkin-visit-checkout tasks 10.9 / 12.8 (the client logic) — visits spec '"Was it saved?" is
// answered by the client request id' (AD-NET-01 · AD-NET-02 · P4.REQ.01): 15 s without an answer → lookup;
// found → success without sending again; 404 → Retry with the same key; a refusal frees the key; a double
// tap sends once; 409 `idempotency_in_progress` on a Retry is no answer — the key stays and the first
// request's late success still lands (API-IDEM-01).
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const never = () => new Promise<never>(() => {});
const later = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const inProgress = () =>
  new ApiProblem(409, problem(409, 'idempotency_in_progress') as never, undefined);
let keys = 0;
const newKey = () => `K${(keys += 1)}`;

function setup(
  send: (key: string) => Promise<string>,
  lookup: (key: string) => Promise<string | null>,
) {
  const calls = { sent: [] as string[], found: [] as string[], refused: [] as unknown[] };
  const sendSpy = vi.fn(send);
  const lookupSpy = vi.fn(lookup);
  const hook = renderHook(() =>
    useSavedSubmit({
      send: sendSpy,
      lookup: lookupSpy,
      onSent: (result) => calls.sent.push(result),
      onFound: (found) => calls.found.push(found),
      onRefused: (problem) => calls.refused.push(problem),
      newKey,
    }),
  );
  return { hook, calls, sendSpy, lookupSpy };
}

describe('useSavedSubmit', () => {
  it('an answer in time: sent once, back to idle', async () => {
    keys = 0;
    const { hook, calls, sendSpy } = setup(
      async () => 'visit-1',
      async () => null,
    );
    await act(() => hook.result.current.submit());
    expect([
      calls.sent,
      sendSpy.mock.calls.map(([k]) => k),
      hook.result.current.state,
    ]).toStrictEqual([['visit-1'], ['K1'], 'idle']);
  });

  it('Scenario: START was saved, the reply was lost — "checking" after 15 s, the lookup opens it, no resend', async () => {
    keys = 0;
    const { hook, calls, sendSpy, lookupSpy } = setup(never, async () => 'visit-1');
    let done: Promise<void> | undefined;
    act(() => {
      done = hook.result.current.submit();
    });
    expect(hook.result.current.state).toBe('sending');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVED_CHECK_AFTER_MS);
      await done;
    });
    expect(lookupSpy).toHaveBeenCalledWith('K1');
    expect([calls.found, sendSpy.mock.calls.length, hook.result.current.state]).toStrictEqual([
      ['visit-1'],
      1,
      'idle',
    ]);
  });

  it('Scenario: Payment was not saved — 404, then Retry sends the same key K1', async () => {
    keys = 0;
    let first = true;
    const { hook, calls, sendSpy } = setup(
      (key) => (first ? ((first = false), never()) : Promise.resolve(`payment-${key}`)),
      async () => null,
    );
    let done: Promise<void> | undefined;
    act(() => {
      done = hook.result.current.submit();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVED_CHECK_AFTER_MS);
      await done;
    });
    expect(hook.result.current.state).toBe('notSaved');
    await act(() => hook.result.current.retry());
    expect(sendSpy.mock.calls.map(([k]) => k)).toStrictEqual(['K1', 'K1']);
    expect(calls.sent).toStrictEqual(['payment-K1']);
  });

  it('Scenario: No connection — the request and the lookup both fail → notSaved, nothing sent again by itself', async () => {
    keys = 0;
    const { hook, sendSpy } = setup(
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => Promise.reject(new TypeError('Failed to fetch')),
    );
    await act(() => hook.result.current.submit());
    expect(hook.result.current.state).toBe('notSaved');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(sendSpy).toHaveBeenCalledOnce();
  });

  it('a refusal (an answer with a status) ends the submit; the next action gets a new key', async () => {
    keys = 0;
    let n = 0;
    const refusal = problem(422, 'day_closed');
    const { hook, calls, sendSpy } = setup(
      () => ((n += 1), n === 1 ? Promise.reject(refusal) : Promise.resolve('ok')),
      async () => null,
    );
    await act(() => hook.result.current.submit());
    expect(calls.refused).toStrictEqual([refusal]);
    await act(() => hook.result.current.submit());
    expect(sendSpy.mock.calls.map(([k]) => k)).toStrictEqual(['K1', 'K2']);
  });

  it('a double tap while sending sends once', async () => {
    keys = 0;
    let resolve: (value: string) => void = () => {};
    const { hook, sendSpy } = setup(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
      async () => null,
    );
    let done: Promise<void> | undefined;
    act(() => {
      done = hook.result.current.submit();
      void hook.result.current.submit();
    });
    await act(async () => {
      resolve('visit-1');
      await done;
    });
    expect(sendSpy).toHaveBeenCalledOnce();
  });

  it('Scenario: Payment still running — Retry answered 409 idempotency_in_progress keeps K1; the late success lands', async () => {
    keys = 0;
    const first = later<string>();
    let n = 0;
    const { hook, calls, sendSpy } = setup(
      () => {
        n += 1;
        if (n === 1) return first.promise;
        return n === 2 ? Promise.reject(inProgress()) : Promise.resolve('payment-K2');
      },
      async () => null,
    );
    let done: Promise<void> | undefined;
    act(() => {
      done = hook.result.current.submit();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVED_CHECK_AFTER_MS);
      await done;
    });
    expect(hook.result.current.state).toBe('notSaved');
    await act(() => hook.result.current.retry());
    // Not a refusal: nothing for the screen to show, the user can still Retry with the same key.
    expect([calls.refused, calls.sent, hook.result.current.state]).toStrictEqual([
      [],
      [],
      'notSaved',
    ]);
    await act(async () => {
      first.resolve('payment-K1');
      await first.promise;
    });
    expect([calls.sent, hook.result.current.state]).toStrictEqual([['payment-K1'], 'idle']);
    // The submit is over: the next action gets a new key.
    await act(() => hook.result.current.submit());
    expect(sendSpy.mock.calls.map(([k]) => k)).toStrictEqual(['K1', 'K1', 'K2']);
  });

  it('the late success lands while the lookup after the 409 is still out — it stays idle, not notSaved', async () => {
    keys = 0;
    const first = later<string>();
    const secondLookup = later<string | null>();
    let sends = 0;
    let lookups = 0;
    const { hook, calls } = setup(
      () => ((sends += 1), sends === 1 ? first.promise : Promise.reject(inProgress())),
      () => ((lookups += 1), lookups === 1 ? Promise.resolve(null) : secondLookup.promise),
    );
    let done: Promise<void> | undefined;
    act(() => {
      done = hook.result.current.submit();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVED_CHECK_AFTER_MS);
      await done;
    });
    let retried: Promise<void> | undefined;
    await act(async () => {
      retried = hook.result.current.retry();
      await Promise.resolve();
    });
    expect([lookups, hook.result.current.state]).toStrictEqual([2, 'checking']);
    await act(async () => {
      first.resolve('payment-K1');
      await first.promise;
    });
    expect([calls.sent, hook.result.current.state]).toStrictEqual([['payment-K1'], 'idle']);
    await act(async () => {
      secondLookup.resolve(null);
      await retried;
    });
    expect([calls.sent, calls.refused, hook.result.current.state]).toStrictEqual([
      ['payment-K1'],
      [],
      'idle',
    ]);
  });
});
