import { describe, expect, it } from 'vitest';

import { formatPhone, normalizePhone } from './phone.js';

// ui-foundation · "Phone numbers are normalised to E.164 by one shared function"
// (D-CUS-02 · API-DATA-06 · AD-FORM-10 · AD-FMT-04 · P3-RULE-01).
describe('normalizePhone', () => {
  it.each(['09 7712 3456', '09-7712-3456', '+95977123456', '95977123456', '၀၉ ၇၇၁၂ ၃၄၅၆'])(
    "Scenario: Ma Su's number in every accepted form — %j",
    (text) => {
      expect(normalizePhone(text)).toBe('+95977123456');
    },
  );

  it('Scenario: Length boundaries of E.164', () => {
    expect(normalizePhone('09123')).toBe('phone_invalid'); // +959123: 6 digits
    expect(normalizePhone('091234')).toBe('+9591234'); // 7 digits
    expect(normalizePhone('+959123456789012')).toBe('+959123456789012'); // 15 digits
    expect(normalizePhone('+9591234567890123')).toBe('phone_invalid'); // 16 digits
  });

  it('Scenario: A number without a usable prefix', () => {
    expect(normalizePhone('7712 3456')).toBe('phone_invalid');
  });

  it.each(['', '09 7712 345a', '+0977123456', '0977-12+3456'])('%j → phone_invalid', (text) => {
    expect(normalizePhone(text)).toBe('phone_invalid');
  });
});

describe('formatPhone', () => {
  it('Scenario: Display grouping', () => {
    expect(formatPhone('+95977123456')).toBe('09 7712 3456');
    expect(formatPhone('+95945001122')).toBe('09 4500 1122');
    expect(formatPhone('+959771234567')).toBe('09 771 234 567');
  });

  it('7 digits after 09 are grouped 3-4; other numbers are shown in E.164', () => {
    expect(formatPhone('+9591234567')).toBe('09 123 4567');
    expect(formatPhone('+95112345678')).toBe('+95112345678');
    expect(formatPhone('+6591234567')).toBe('+6591234567');
  });
});
