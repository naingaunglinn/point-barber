import { describe, expect, it } from 'vitest';

import { Clock } from '../../../common/clock/clock.js';
import { RateLimiter } from './rate-limiter.js';

// add-foundation-auth-access task 2.7 — API-LIM-02 · design D5: an in-process sliding window on the
// injected clock; a refused hit is not counted; retry_after is whole seconds, rounded up.
class FakeClock extends Clock {
  constructor(private ms: number) {
    super();
  }
  override now(): Date {
    return new Date(this.ms);
  }
  set(iso: string): void {
    this.ms = Date.parse(iso);
  }
}

const at = (time: string) => `2026-10-05T${time}+06:30`;

function limiter(time = '09:00:00') {
  const clock = new FakeClock(Date.parse(at(time)));
  return { clock, rl: new RateLimiter(clock) };
}

describe('RateLimiter', () => {
  it('a fresh limiter accepts the first hit', () => {
    expect(limiter().rl.hit('otp:email', 'k', 1, 60)).toStrictEqual({ allowed: true });
  });

  it('refuses the hit over the limit with the seconds until the oldest hit leaves', () => {
    const { clock, rl } = limiter();
    expect(rl.hit('otp:email', 'k', 1, 60).allowed).toBe(true);
    clock.set(at('09:00:30'));
    expect(rl.hit('otp:email', 'k', 1, 60)).toStrictEqual({ allowed: false, retryAfter: 30 });
  });

  it('rounds retry_after up to a whole second', () => {
    const { clock, rl } = limiter();
    rl.hit('otp:email', 'k', 1, 60);
    clock.set(at('09:00:59.500'));
    expect(rl.hit('otp:email', 'k', 1, 60)).toStrictEqual({ allowed: false, retryAfter: 1 });
  });

  it('the window slides at exactly its length', () => {
    const { clock, rl } = limiter();
    rl.hit('otp:email', 'k', 1, 60);
    clock.set(at('09:00:59.999'));
    expect(rl.hit('otp:email', 'k', 1, 60).allowed).toBe(false);
    clock.set(at('09:01:00'));
    expect(rl.hit('otp:email', 'k', 1, 60).allowed).toBe(true);
  });

  it('counts only accepted hits, so a refused retry does not extend the wait', () => {
    const { clock, rl } = limiter();
    rl.hit('otp:email', 'k', 1, 60);
    for (const time of ['09:00:10', '09:00:20', '09:00:50']) {
      clock.set(at(time));
      expect(rl.hit('otp:email', 'k', 1, 60).allowed).toBe(false);
    }
    clock.set(at('09:01:00'));
    expect(rl.hit('otp:email', 'k', 1, 60).allowed).toBe(true);
  });

  it('10 per hour per IP: the 11th is refused until the first leaves the window', () => {
    const { clock, rl } = limiter();
    for (let minute = 0; minute < 10; minute += 1) {
      clock.set(at(`09:${String(minute * 5).padStart(2, '0')}:00`));
      expect(rl.hit('otp:ip', '203.0.113.10', 10, 3600).allowed).toBe(true);
    }
    clock.set(at('09:45:00'));
    // The spec's example: the first request leaves the window at 10:00:00 → 900 s.
    expect(rl.hit('otp:ip', '203.0.113.10', 10, 3600)).toStrictEqual({
      allowed: false,
      retryAfter: 900,
    });
  });

  // PR #16 review: the map must not keep every IP and address it has ever seen.
  it('forgets a key once its last hit has left the window (swept at most once a minute)', () => {
    const { clock, rl } = limiter();
    rl.hit('otp:email', 'once@point.test', 1, 60);
    rl.hit('otp:ip', '203.0.113.10', 10, 3600);
    expect(rl.size).toBe(2);
    clock.set(at('09:01:30'));
    rl.hit('otp:email', 'other@point.test', 1, 60);
    // The e-mail key's window (60 s) has passed; the IP key's (1 hour) has not.
    expect(rl.size).toBe(2);
    clock.set(at('10:00:30'));
    rl.hit('otp:email', 'third@point.test', 1, 60);
    expect(rl.size).toBe(1);
  });

  it('does not sweep more than once a minute', () => {
    const { clock, rl } = limiter();
    rl.hit('otp:email', 'a@point.test', 1, 1);
    clock.set(at('09:00:30'));
    rl.hit('otp:email', 'b@point.test', 1, 1);
    // Both windows have passed, but the last sweep was less than a minute ago.
    expect(rl.size).toBe(2);
  });

  it('keeps buckets and keys apart', () => {
    const { rl } = limiter();
    rl.hit('otp:email', 'a', 1, 60);
    expect(rl.hit('otp:email', 'b', 1, 60).allowed).toBe(true);
    expect(rl.hit('otp_verify:ip', 'a', 1, 60).allowed).toBe(true);
  });
});
