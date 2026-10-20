// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SAVED_CHECK_AFTER_MS, useSavedSubmit } from './use-saved-submit';

// add-walkin-visit-checkout tasks 10.9 / 12.8 (the client logic) — visits spec '"Was it saved?" is
// answered by the client request id' (AD-NET-01 · AD-NET-02 · P4.REQ.01): 15 s without an answer → lookup;
// found → success without sending again; 404 → Retry with the same key; a refusal frees the key; a double
// tap sends once.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const never = () => new Promise<never>(() => {});
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
    const { hook, calls, sendSpy } = setup(
      () => (
        (n += 1),
        n === 1 ? Promise.reject({ status: 422, code: 'day_closed' }) : Promise.resolve('ok')
      ),
      async () => null,
    );
    await act(() => hook.result.current.submit());
    expect(calls.refused).toStrictEqual([{ status: 422, code: 'day_closed' }]);
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
});
