'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { toDate, type Instant } from '@point/shared';

// The one clock of the browser (D-PLT-15 · CG-TIME-03 · CG-TIME-06 · design D5): seeded with a server
// instant — `system.server_time` of `/me`, on the catalogue the `now` parameter — and advanced by the
// elapsed time of the device's monotonic clock, so a phone with a wrong date still shows the right
// day. This file is the only place in the web code that reads a device clock (lint — design D14).

interface Clock {
  /** The seed, in milliseconds since the epoch. */
  readonly seed: number;
  /** `performance.now()` when the seed was taken in this browser. */
  readonly startedAt: number;
}

const ClockContext = createContext<Clock | null>(null);

const MINUTE = 60_000;

function read(clock: Clock): number {
  return clock.seed + (performance.now() - clock.startedAt);
}

export function ClockProvider({ now, children }: Readonly<{ now: Instant; children: ReactNode }>) {
  const seed = toDate(now).getTime();
  const [clock, setClock] = useState<Clock>(() => ({ seed, startedAt: performance.now() }));
  if (clock.seed !== seed) setClock({ seed, startedAt: performance.now() });
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

/**
 * The current instant. The first render returns the seed exactly (the server render and the first
 * client render agree); after that the component re-renders each time the clock's minute changes.
 */
export function useNow(): Date {
  const clock = useContext(ClockContext);
  if (clock === null) throw new Error('useNow() needs a ClockProvider');
  const [now, setNow] = useState(clock.seed);
  useEffect(() => {
    setNow(read(clock));
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNow(read(clock));
          schedule();
        },
        MINUTE - (read(clock) % MINUTE),
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [clock]);
  return new Date(now);
}
