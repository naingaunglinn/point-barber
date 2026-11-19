import { describe, expect, it } from 'vitest';

import { UUID_V7, isUuid, uuidV7 } from './uuid-v7.js';

const MS = Date.UTC(2026, 9, 5, 4, 12);

// API-ERR-01 · API-AUD-02 · design D6.
describe('uuidV7', () => {
  it('matches the UUIDv7 pattern of the spec', () => {
    expect(uuidV7(MS)).toMatch(UUID_V7);
  });

  it('starts with the 48-bit millisecond timestamp', () => {
    expect(uuidV7(MS).replace(/-/g, '').slice(0, 12)).toBe(MS.toString(16).padStart(12, '0'));
  });

  it('gives two different ids in the same millisecond', () => {
    expect(uuidV7(MS)).not.toBe(uuidV7(MS));
  });
});

describe('isUuid', () => {
  it.each([
    '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70',
    '3f2b8c1e-5d4a-4f6b-9c7d-1a2b3c4d5e6f',
    '0199A3F2-7C1E-7B3A-9D4E-2F6A8C1B5E70',
  ])('accepts %s', (value) => {
    expect(isUuid(value)).toBe(true);
  });

  it.each([
    'sale-42',
    '',
    '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e7',
    '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70x',
  ])('refuses %s', (value) => {
    expect(isUuid(value)).toBe(false);
  });
});
