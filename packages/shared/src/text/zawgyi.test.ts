import { describe, expect, it } from 'vitest';

import { isZawgyi, normalizeMyanmarText } from './zawgyi.js';

// AD-FORM-13 · AD-L10N-07 · design D11: Zawgyi typed into a shared text input is converted to
// Unicode when the detector's probability is at least 0.95; Unicode text is left untouched.
const ZAWGYI_MYANMAR = '\u103b\u1019\u1014\u1039\u1019\u102c'; // "Myanmar" typed in Zawgyi
const UNICODE_MYANMAR = '\u1019\u103c\u1014\u103a\u1019\u102c'; // the same word in Unicode

describe('normalizeMyanmarText', () => {
  it('converts Zawgyi to Unicode and says so', () => {
    expect(normalizeMyanmarText(ZAWGYI_MYANMAR)).toEqual({
      text: UNICODE_MYANMAR,
      converted: true,
    });
  });

  it('leaves Unicode Myanmar text untouched', () => {
    expect(normalizeMyanmarText(UNICODE_MYANMAR)).toEqual({
      text: UNICODE_MYANMAR,
      converted: false,
    });
    expect(normalizeMyanmarText('\u1006\u1036\u1015\u1004\u103a\u100a\u103e\u1015\u103a')).toEqual({
      text: '\u1006\u1036\u1015\u1004\u103a\u100a\u103e\u1015\u103a',
      converted: false,
    });
  });

  it('leaves text without Myanmar script untouched', () => {
    for (const text of ['Ko Aung', '7,000', '']) {
      expect(normalizeMyanmarText(text)).toEqual({ text, converted: false });
    }
  });

  it('converts only at a probability of 0.95 or more', () => {
    expect(normalizeMyanmarText(ZAWGYI_MYANMAR, { probability: () => 0.95 }).converted).toBe(true);
    expect(normalizeMyanmarText(ZAWGYI_MYANMAR, { probability: () => 0.949 })).toEqual({
      text: ZAWGYI_MYANMAR,
      converted: false,
    });
  });
});

// add-company-profile task 1.3 — API-SHAPE-05 · AD-FORM-13 · design D10: the server refuses Zawgyi text
// with the detector and threshold of normalizeMyanmarText, so text the form accepted is accepted. The
// fixture address of spec-fixtures §1, typed in Unicode and with a Zawgyi keyboard.
const UNICODE_ADDRESS = 'အမှတ် ၁၂၊ စမ်းသပ်လမ်း၊ ရန်ကုန်';
const ZAWGYI_ADDRESS =
  '\u1021\u1019\u103d\u1010\u1039 \u1041\u1042\u104a ' +
  '\u1005\u1019\u1039\u1038\u101e\u1015\u1039\u101c\u1019\u1039\u1038\u104a ' +
  '\u101b\u1014\u1039\u1000\u102f\u1014\u1039';

describe('isZawgyi', () => {
  it('finds the address typed in Zawgyi — the same text normalizeMyanmarText converts', () => {
    expect(isZawgyi(ZAWGYI_ADDRESS)).toBe(true);
    expect(normalizeMyanmarText(ZAWGYI_ADDRESS)).toEqual({
      text: UNICODE_ADDRESS,
      converted: true,
    });
  });

  it('passes the same address in Unicode, the company name, Latin text and an empty string', () => {
    for (const text of [UNICODE_ADDRESS, 'ပွိုင့် ဘာဘာရှော့', 'No. 12, Test Street, Yangon', '']) {
      expect(isZawgyi(text), text).toBe(false);
    }
  });

  it('uses the 0.95 threshold of normalizeMyanmarText', () => {
    expect(isZawgyi(ZAWGYI_ADDRESS, { probability: () => 0.95 })).toBe(true);
    expect(isZawgyi(ZAWGYI_ADDRESS, { probability: () => 0.949 })).toBe(false);
    // Text without Myanmar script is never Zawgyi, whatever the detector says.
    expect(isZawgyi('Point Barbershop', { probability: () => 1 })).toBe(false);
  });
});
