'use client';

import { cn } from 'cn';
import { useEffect, useState } from 'react';

import { Skeleton as Shape } from '../../primitives/skeleton';

// Loading placeholders shaped like the content (AD-STATE-01 · AD-PERF-02 · design D10): shown only
// after `delayMs` (400 ms) of loading, so a fast load never flashes one; never a centred spinner.

export type SkeletonShape = 'text' | 'row' | 'card' | 'tile';

const SHAPE: Readonly<Record<SkeletonShape, string>> = {
  text: 'h-4 w-full',
  row: 'h-12 w-full md:h-14',
  card: 'h-24 w-full rounded-lg',
  tile: 'h-28 w-full rounded-lg',
};

export interface SkeletonProps {
  readonly shape: SkeletonShape;
  readonly count?: number;
  readonly delayMs?: number;
}

export function Skeleton({ shape, count = 1, delayMs = 400 }: SkeletonProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return (
    <div data-slot="skeleton-group" aria-busy="true" className="flex flex-col gap-2">
      {visible
        ? Array.from({ length: count }, (_, index) => (
            <Shape
              key={index}
              aria-hidden
              className={cn(SHAPE[shape], 'motion-reduce:animate-none')}
            />
          ))
        : null}
    </div>
  );
}
