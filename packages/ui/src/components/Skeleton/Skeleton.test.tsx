import { act, render } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Skeleton } from './Skeleton';

// ui-foundation "Loads over 400 ms show a skeleton, never a centred spinner" (AD-STATE-01 · AD-PERF-02 ·
// design D10): the skeleton appears after 400 ms of loading and is skipped for faster loads.

function Load({ ms }: { ms: number }) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return loading ? <Skeleton shape="card" count={3} /> : <p data-testid="data" />;
}

const shapes = () => document.querySelectorAll('[data-slot="skeleton"]').length;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Skeleton', () => {
  it('Scenario: Skeleton only for slow loads — the 2 s demo shows cards from 400 ms until the data arrives', () => {
    render(<Load ms={2_000} />);
    act(() => vi.advanceTimersByTime(399));
    expect(shapes()).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(shapes()).toBe(3);
    act(() => vi.advanceTimersByTime(1_600));
    expect(shapes()).toBe(0);
    expect(document.querySelector('[data-testid="data"]')).not.toBeNull();
  });

  it('Scenario: Skeleton only for slow loads — the 200 ms demo never shows a skeleton', () => {
    const seen: number[] = [];
    render(<Load ms={200} />);
    for (let t = 0; t < 1_000; t += 50) {
      act(() => vi.advanceTimersByTime(50));
      seen.push(shapes());
    }
    expect(Math.max(...seen)).toBe(0);
  });

  it.each([
    ['text', 'h-4'],
    ['row', 'h-12'],
    ['card', 'h-24'],
    ['tile', 'h-28'],
  ] as const)('draws the %s shape', (shape, height) => {
    render(<Skeleton shape={shape} delayMs={0} />);
    act(() => vi.advanceTimersByTime(0));
    expect(document.querySelector('[data-slot="skeleton"]')?.className).toContain(height);
  });

  it('is a busy region with no spinner, and stops pulsing for reduced motion', () => {
    render(<Skeleton shape="row" count={2} delayMs={0} />);
    act(() => vi.advanceTimersByTime(0));
    const region = document.querySelector('[data-slot="skeleton-group"]');
    expect(region?.getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('svg')).toBeNull();
    expect(document.querySelector('[data-slot="skeleton"]')?.className).toContain(
      'motion-reduce:animate-none',
    );
  });
});
