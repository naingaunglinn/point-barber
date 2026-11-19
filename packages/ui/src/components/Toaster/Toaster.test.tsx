import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast, Toaster } from './Toaster';

// ui-foundation "Success toasts are short and shown one at a time" (AD-TOAST-01 · AD-A11Y-04 · design D10).
const FIRST = 'Booking saved';
const SECOND = 'Transfer sent';

function mockWidth(width: number) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: width >= Number(/(\d+)px/.exec(query)?.[1] ?? 0),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/** The toasts on screen; a dismissed one stays in the DOM for its exit animation, marked hidden. */
const visible = () =>
  [
    ...document.querySelectorAll('[data-sonner-toast][data-visible="true"][data-removed="false"]'),
  ].map((t) => t.textContent);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => vi.runOnlyPendingTimers());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Toaster', () => {
  it('Scenario: One toast at a time — only the second after it is raised, gone 4 s later', () => {
    mockWidth(320);
    render(<Toaster />);
    act(() => toast.success(FIRST));
    act(() => vi.advanceTimersByTime(1_000));
    act(() => toast.success(SECOND));
    act(() => vi.advanceTimersByTime(500));
    expect(visible()).toEqual([SECOND]);
    act(() => vi.advanceTimersByTime(3_400));
    expect(visible()).toEqual([SECOND]);
    act(() => vi.advanceTimersByTime(1_000));
    expect(visible()).toEqual([]);
  });

  it('Scenario: Position — bottom above the bottom navigation at 320 px, top-right at 1280 px, polite', () => {
    mockWidth(320);
    const phone = render(<Toaster />);
    act(() => toast.success(FIRST));
    act(() => vi.advanceTimersByTime(10));
    const list = () => document.querySelector('[data-sonner-toaster]');
    expect([
      list()?.getAttribute('data-y-position'),
      list()?.getAttribute('data-x-position'),
    ]).toEqual(['bottom', 'center']);
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(list()?.getAttribute('style')).toContain('--mobile-offset-bottom: calc(4rem + 1rem');
    phone.unmount();
    mockWidth(1280);
    render(<Toaster />);
    act(() => toast.success(SECOND));
    act(() => vi.advanceTimersByTime(10));
    expect([
      list()?.getAttribute('data-y-position'),
      list()?.getAttribute('data-x-position'),
    ]).toEqual(['top', 'right']);
  });
});
