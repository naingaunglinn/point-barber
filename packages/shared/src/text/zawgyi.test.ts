import { describe, expect, it } from 'vitest';

import { normalizeMyanmarText } from './zawgyi.js';

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
