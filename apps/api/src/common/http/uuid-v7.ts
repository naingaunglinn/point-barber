import { randomBytes } from 'node:crypto';

// Request ids (API-ERR-01 · API-AUD-02 · design D6). UUIDv7 = 48-bit Unix milliseconds + version 7
// + 74 random bits from the CSPRNG (RFC 9562 §5.7). The time comes from the caller's clock.

export const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ANY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidV7(unixMs: number): string {
  const bytes = randomBytes(16);
  const ms = BigInt(unixMs);
  for (let i = 0; i < 6; i += 1) {
    bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f); // version 7
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // variant 10xx
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Any version of UUID, any case (a client X-Request-Id is honoured only when this holds). */
export function isUuid(value: string): boolean {
  return ANY_UUID.test(value);
}
