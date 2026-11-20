import { describe, expect, it } from 'vitest';

import { ZawgyiDetector } from './myanmar-tools/zawgyi-detector.js';
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

// fix(add-company-profile) 18/Nov/2026, lead: short Unicode text scores ≥ 0.95 with the detector, so it
// was refused (`zawgyi_text`) or rewritten by the input — မိုးရွာ became မိုးရှာ. Text is taken for Zawgyi
// only when it also holds a sequence Unicode never stores.
const detector = new ZawgyiDetector();

describe('isZawgyi — short Unicode Myanmar text', () => {
  // The P3.CRS.02 scenario names (add-booking-cancel-reasons), shipped `my` labels and spec text.
  const UNICODE_SCORED_AS_ZAWGYI = [
    'မိုးရွာ', // 0.9507 — add-booking-cancel-reasons tasks 3.3
    'ဘာသာစကား', // 0.9547 — my/settings.json
    'ငါးခု', // 0.9772 — my/devui.json
    '၏', // 0.9841 — my/devui.json
    'အမြဲ။', // 0.9986 — the highest-scoring short Unicode text in point-sdd
    'ကို မကိုးကားပါနဲ့။', // 0.9990 — the highest-scoring Unicode text in point-sdd
  ];

  it('the detector alone scores these Unicode texts at 0.95 or more', () => {
    for (const text of UNICODE_SCORED_AS_ZAWGYI) {
      expect(detector.getZawgyiProbability(text), text).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('they are not Zawgyi', () => {
    for (const text of UNICODE_SCORED_AS_ZAWGYI) {
      expect(isZawgyi(text), text).toBe(false);
    }
  });

  it('nor are the other cancel-reason names and ရွာ', () => {
    for (const text of ['ရွာ', 'Customer မလာ', 'Barber မအား', 'Customer နေမကောင်း', 'အခြား']) {
      expect(isZawgyi(text), text).toBe(false);
    }
  });

  it('well-formed Unicode is not Zawgyi, whatever the detector says', () => {
    for (const text of [
      ...UNICODE_SCORED_AS_ZAWGYI,
      UNICODE_MYANMAR,
      UNICODE_ADDRESS,
      'ကျွန်ုပ်',
    ]) {
      expect(isZawgyi(text, { probability: () => 1 }), text).toBe(false);
    }
  });

  it('the input leaves မိုးရွာ as typed', () => {
    expect(normalizeMyanmarText('မိုးရွာ')).toEqual({ text: 'မိုးရွာ', converted: false });
  });
});

describe('isZawgyi — Zawgyi is still found', () => {
  // Real Zawgyi words, each with one sequence Unicode never stores; the detector scores each ≥ 0.95.
  const SHORT_ZAWGYI: readonly (readonly [string, string, string])[] = [
    ['\u1031\u1015\u1038', 'ပေး', 'ေ typed before its consonant'],
    ['\u1018\u101a\u1039', 'ဘယ်', 'U+1039 as the visible asat'],
    ['\u1019\u103a\u102c\u1038', 'များ', 'U+103A as the medial ya, before a vowel sign'],
    ['\u103b\u1015', 'ပြ', 'the medial typed before its consonant'],
    ['\u1014\u1032\u1094', 'နဲ့', 'a Zawgyi glyph code point'],
    ['\u1015\u1036\u102f', 'ပုံ', 'ံ typed before ု'],
  ];

  it('short words, one per sequence — and the input converts them', () => {
    for (const [zawgyi, unicode, sequence] of SHORT_ZAWGYI) {
      expect(isZawgyi(zawgyi), sequence).toBe(true);
      expect(normalizeMyanmarText(zawgyi), sequence).toEqual({ text: unicode, converted: true });
    }
  });

  it('ေမာင္ and ေဘာင္ခ်ာ (add-attachments-upload) are Zawgyi', () => {
    expect(normalizeMyanmarText('\u1031\u1019\u102c\u1004\u1039')).toEqual({
      text: 'မောင်',
      converted: true,
    });
    expect(normalizeMyanmarText('ေဘာင္ခ်ာ')).toEqual({ text: 'ဘောင်ချာ', converted: true });
  });

  it('the long address and the threshold are unchanged', () => {
    expect(isZawgyi(ZAWGYI_ADDRESS)).toBe(true);
    expect(isZawgyi('\u103b\u1015', { probability: () => 0.949 })).toBe(false);
  });
});
