import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

// The e-mail code (P1-RULE-03 · D-AUTH-04 · design D4): 8 digits from a cryptographic source, a
// leading zero included; stored only as `hex(HMAC-SHA256(OTP_HMAC_SECRET, user_id + ':' + code))`;
// compared in constant time; valid while the server time is earlier than `expires_at`.

export const OTP_VALID_MS = 5 * 60 * 1000;

export const newOtpCode = (): string => randomInt(0, 100_000_000).toString().padStart(8, '0');

export const otpHash = (secret: string, userId: string, code: string): string =>
  createHmac('sha256', secret).update(`${userId}:${code}`, 'utf8').digest('hex');

/** Two hex digests compared in constant time; false for different lengths. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/** One `login_otps` row as the verify reads it. */
export interface OtpRow {
  readonly id: string;
  readonly code_hash: string;
  readonly expires_at: Date;
  readonly consumed_at: Date | null;
}

/**
 * Whether `code` signs in against the user's newest row: unconsumed, `now < expires_at`, and the
 * hash matches. Only the newest row counts — an older one was invalidated by the newer request.
 */
export function codeAccepted(newest: OtpRow | null, expected: string, now: Date): boolean {
  if (newest === null || newest.consumed_at !== null) return false;
  if (now.getTime() >= newest.expires_at.getTime()) return false;
  return sameHash(newest.code_hash, expected);
}
