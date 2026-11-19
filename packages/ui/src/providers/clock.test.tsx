import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { todayMmt } from '@point/shared';

import { ClockProvider, useNow } from './clock';

const DEFAULT_NOW = '2026-10-05T10:42:00+06:30';

function seeded(now: string) {
  return ({ children }: { children: ReactNode }) => (
    <ClockProvider now={now}>{children}</ClockProvider>
  );
}

beforeEach(() => {
  // A phone whose date is wrong: 01/Jan/2020, local time.
  vi.useFakeTimers({ now: new Date(2020, 0, 1, 9, 0, 0) });
});

afterEach(() => {
  vi.useRealTimers();
});

// ui-foundation '"Today" and "now" come from the supplied clock, not from the device' (D-PLT-15 ·
// API-AUTH-05 · CG-TIME-03 · CG-TIME-06 · design D5).
describe('ClockProvider and useNow()', () => {
  it('Scenario: A phone with a wrong date — today is 05/Oct/2026, not the device date', () => {
    const { result } = renderHook(() => useNow(), { wrapper: seeded(DEFAULT_NOW) });
    expect(result.current.toISOString()).toBe('2026-10-05T04:12:00.000Z');
    expect(todayMmt(result.current)).toBe('2026-10-05');
  });

  it('Scenario: The clock advances — todayMmt changes at MMT midnight without a reload', () => {
    const { result } = renderHook(() => todayMmt(useNow()), {
      wrapper: seeded('2026-10-05T17:29:30Z'),
    });
    expect(result.current).toBe('2026-10-05');
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe('2026-10-06');
  });

  it('advances by the elapsed device time, whatever the device date is', () => {
    const { result } = renderHook(() => useNow(), { wrapper: seeded(DEFAULT_NOW) });
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(result.current.toISOString()).toBe('2026-10-05T04:17:00.000Z');
  });

  it('a jump of the device date does not move the clock', () => {
    const { result } = renderHook(() => useNow(), { wrapper: seeded(DEFAULT_NOW) });
    act(() => vi.setSystemTime(new Date(2031, 5, 1)));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.toISOString()).toBe('2026-10-05T04:13:00.000Z');
  });

  it('re-renders when the minute changes, not before', () => {
    const renders = vi.fn();
    function Probe() {
      const now = useNow();
      renders(now.toISOString());
      return <time>{now.toISOString()}</time>;
    }
    render(
      <ClockProvider now="2026-10-05T04:12:45Z">
        <Probe />
      </ClockProvider>,
    );
    const first = renders.mock.calls.length;
    act(() => vi.advanceTimersByTime(14_000));
    expect(renders.mock.calls.length).toBe(first);
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText('2026-10-05T04:13:00.000Z')).toBeDefined();
  });

  it('starts from the seed exactly, so the server and the first client render agree', () => {
    vi.advanceTimersByTime(10_000); // time spent before the provider mounts
    const { result } = renderHook(() => useNow(), { wrapper: seeded(DEFAULT_NOW) });
    expect(result.current.toISOString()).toBe('2026-10-05T04:12:00.000Z');
  });

  it('a new seed restarts the clock from it', () => {
    let now = DEFAULT_NOW;
    const { result, rerender } = renderHook(() => useNow(), {
      wrapper: ({ children }) => <ClockProvider now={now}>{children}</ClockProvider>,
    });
    act(() => vi.advanceTimersByTime(120_000));
    now = '2026-10-06T00:00:00Z';
    rerender();
    expect(result.current.toISOString()).toBe('2026-10-06T00:00:00.000Z');
  });

  it('refuses a seed that is not an ISO instant with its zone', () => {
    expect(() => renderHook(() => useNow(), { wrapper: seeded('2026-10-05 10:42') })).toThrow(
      RangeError,
    );
  });

  it('fails loudly outside a ClockProvider', () => {
    expect(() => renderHook(() => useNow())).toThrow('useNow() needs a ClockProvider');
  });
});
