import { Injectable } from '@nestjs/common';

import { Clock } from '../../../common/clock/clock.js';

// The rate limits of API-LIM-02 (add-foundation-auth-access design D5): an in-process sliding window
// per (bucket, key) on the injected clock — one API instance, so the state lives in the process
// (system design §3.2; ADR-008 names the revisit trigger). A hit counts only when it is accepted, so a
// refused retry does not extend the wait. A restart empties every bucket alike. Keys whose window has
// passed are swept away at most once a minute, so the map does not keep every address it has seen.

export type RateLimitResult =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfter: number };

interface Entry {
  readonly windowMs: number;
  /** Accepted hit times (epoch ms), oldest first. */
  times: number[];
}

const SWEEP_EVERY_MS = 60_000;

@Injectable()
export class RateLimiter {
  /** Per `bucket␟key`. */
  private readonly entries = new Map<string, Entry>();
  private lastSweep: number | undefined;

  constructor(private readonly clock: Clock) {}

  /** The number of keys held — for tests. */
  get size(): number {
    return this.entries.size;
  }

  hit(bucket: string, key: string, limit: number, windowSeconds: number): RateLimitResult {
    const now = this.clock.now().getTime();
    this.sweep(now);
    const windowMs = windowSeconds * 1000;
    const id = `${bucket}␟${key}`;
    // A hit leaves the window exactly `windowSeconds` after it was made.
    const live = (this.entries.get(id)?.times ?? []).filter((time) => now - time < windowMs);
    if (live.length >= limit) {
      this.entries.set(id, { windowMs, times: live });
      const oldest = live[0] ?? now;
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }
    live.push(now);
    this.entries.set(id, { windowMs, times: live });
    return { allowed: true };
  }

  /** Removes every key whose newest hit has left its window. */
  private sweep(now: number): void {
    if (this.lastSweep !== undefined && now - this.lastSweep < SWEEP_EVERY_MS) return;
    this.lastSweep = now;
    for (const [id, entry] of this.entries) {
      const newest = entry.times.at(-1);
      if (newest === undefined || now - newest >= entry.windowMs) this.entries.delete(id);
    }
  }
}
