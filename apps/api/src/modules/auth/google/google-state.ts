import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Clock } from '../../../common/clock/clock.js';

// The pending Google sign-ins (design D7): in process, keyed by `sha256(state)`, 10 minutes, single
// use — the single-instance trade-off ADR-005 makes for the hand-off store. An API restart loses the
// pending sign-ins; the person taps the button again.

export const STATE_TTL_MS = 10 * 60 * 1000;

export interface PendingSignIn {
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly returnTo: string | undefined;
  readonly createdAt: number;
}

const keyOf = (state: string): string => createHash('sha256').update(state, 'utf8').digest('hex');

@Injectable()
export class GoogleStateStore {
  private readonly pending = new Map<string, PendingSignIn>();

  constructor(private readonly clock: Clock) {}

  put(state: string, value: Omit<PendingSignIn, 'createdAt'>): void {
    this.sweep();
    this.pending.set(keyOf(state), { ...value, createdAt: this.clock.now().getTime() });
  }

  /** The pending sign-in of `state`, removed on the way out; undefined when unknown or expired. */
  take(state: string): PendingSignIn | undefined {
    const key = keyOf(state);
    const value = this.pending.get(key);
    this.pending.delete(key);
    if (value === undefined) return undefined;
    return this.clock.now().getTime() - value.createdAt < STATE_TTL_MS ? value : undefined;
  }

  private sweep(): void {
    const now = this.clock.now().getTime();
    for (const [key, value] of this.pending) {
      if (now - value.createdAt >= STATE_TTL_MS) this.pending.delete(key);
    }
  }
}

/**
 * `return_to` of the staff host only (design D7 · OpenAPI `^/[^/].*$`): no backslash, no control
 * character, and resolved against the app origin it stays there. Anything else is dropped.
 */
export function safeReturnTo(value: string | undefined, appOrigin: string): string | undefined {
  if (value === undefined || !/^\/[^/].*$/.test(value) || value.includes('\\')) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;
  if (!URL.canParse(value, appOrigin) || new URL(value, appOrigin).origin !== appOrigin) {
    return undefined;
  }
  return value;
}
