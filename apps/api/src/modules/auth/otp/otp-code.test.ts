import { describe, expect, it, vi } from 'vitest';

import { OTP_VALID_MS, codeAccepted, newOtpCode, otpHash, sameHash } from './otp-code.js';

// add-foundation-auth-access task 5.1 — "A code is 8 digits, valid for 5 minutes, usable once, and
// only the latest one counts" (P1-RULE-03 · D-AUTH-04 · design D4).

const SECRET = 'h'.repeat(32);
const USER = '0199a3f2-0000-7000-8002-00000000e004';
const created = new Date('2026-10-05T02:30:00Z'); // 9:00:00 AM MMT
const at = (seconds: number) => new Date(created.getTime() + seconds * 1000);
const row = (code: string, extra: { consumed_at?: Date | null } = {}) => ({
  id: 'otp',
  code_hash: otpHash(SECRET, USER, code),
  expires_at: new Date(created.getTime() + OTP_VALID_MS),
  consumed_at: extra.consumed_at ?? null,
});

describe('e-mail code (task 5.1)', () => {
  it('is 8 digits, a leading zero included', async () => {
    for (let i = 0; i < 200; i += 1) expect(newOtpCode()).toMatch(/^[0-9]{8}$/);
    vi.resetModules();
    vi.doMock('node:crypto', async (original) => ({
      ...(await original<typeof import('node:crypto')>()),
      randomInt: () => 42,
    }));
    const { newOtpCode: mocked } = await import('./otp-code.js');
    expect(mocked()).toBe('00000042');
    vi.doUnmock('node:crypto');
  });

  it('is stored as the HMAC-SHA256 hex of user_id:code', () => {
    const hash = otpHash(SECRET, USER, '48291735');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('48291735');
    expect(otpHash(SECRET, 'other-user', '48291735')).not.toBe(hash);
  });

  it('compares in constant time, and only equal digests match', () => {
    const hash = otpHash(SECRET, USER, '48291735');
    expect(sameHash(hash, otpHash(SECRET, USER, '48291735'))).toBe(true);
    expect(sameHash(hash, otpHash(SECRET, USER, '48291736'))).toBe(false);
    expect(sameHash(hash, 'abcd')).toBe(false);
    expect(sameHash('', '')).toBe(false);
  });

  it('is accepted at 4:59 and refused at 5:00 and 5:01', () => {
    const expected = otpHash(SECRET, USER, '48291735');
    expect(codeAccepted(row('48291735'), expected, at(299))).toBe(true);
    expect(codeAccepted(row('48291735'), expected, at(300))).toBe(false);
    expect(codeAccepted(row('48291735'), expected, at(301))).toBe(false);
  });

  it('is refused once consumed, when wrong, or with no row', () => {
    const expected = otpHash(SECRET, USER, '48291735');
    expect(codeAccepted(row('48291735', { consumed_at: at(60) }), expected, at(120))).toBe(false);
    expect(codeAccepted(row('11112222'), expected, at(60))).toBe(false);
    expect(codeAccepted(null, expected, at(60))).toBe(false);
  });

  it('is judged only against the newest row: an older code no longer matches it', () => {
    const newest = row('22223333');
    expect(codeAccepted(newest, otpHash(SECRET, USER, '48291735'), at(90))).toBe(false);
    expect(codeAccepted(newest, otpHash(SECRET, USER, '22223333'), at(90))).toBe(true);
  });
});
