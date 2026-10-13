import { Injectable } from '@nestjs/common';

import { Clock } from '../../../common/clock/clock.js';

// The rate limits of API-LIM-02 (add-foundation-auth-access design D5): an in-process sliding window
// per (bucket, key) on the injected clock — one API instance, so the state lives in the process
// (system design §3.2; ADR-008 names the revisit trigger). A hit counts only when it is accepted, so a
// refused retry does not extend the wait. A restart empties every bucket alike.

export type RateLimitResult =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfter: number };

@Injectable()
export class RateLimiter {
  /** Accepted hit times (epoch ms), oldest first, per `bucket␟key`. */
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly clock: Clock) {}

  hit(bucket: string, key: string, limit: number, windowSeconds: number): RateLimitResult {
    const now = this.clock.now().getTime();
    const windowMs = windowSeconds * 1000;
    const id = `${bucket}␟${key}`;
    // A hit leaves the window exactly `windowSeconds` after it was made.
    const live = (this.hits.get(id) ?? []).filter((time) => now - time < windowMs);
    if (live.length >= limit) {
      this.hits.set(id, live);
      const oldest = live[0] ?? now;
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }
    live.push(now);
    this.hits.set(id, live);
    return { allowed: true };
  }
}
