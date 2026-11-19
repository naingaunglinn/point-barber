import { describe, expect, expectTypeOf, it } from 'vitest';

import { hasMyanmarScript, localized } from './localized.js';

// ui-foundation · "Bilingual data fields fall back from English to Myanmar without a marker"
// (D-DB-04 · AD-L10N-03 · API-DATA-05) and "Myanmar-script data carries lang=my" (AD-L10N-04).
describe('localized', () => {
  it('Scenario: Both names present', () => {
    const service = { name_mm: 'ဆံပင်ညှပ်', name_en: 'Haircut' };
    expect(localized(service, 'name', 'en')).toBe('Haircut');
    expect(localized(service, 'name', 'my')).toBe('ဆံပင်ညှပ်');
  });

  it('Scenario: English name missing', () => {
    expect(localized({ name_mm: 'မုတ်ဆိတ်ရိတ်', name_en: null }, 'name', 'en')).toBe(
      'မုတ်ဆိတ်ရိတ်',
    );
  });

  it('Scenario: Blank English name', () => {
    expect(localized({ name_mm: 'မုတ်ဆိတ်ရိတ်', name_en: '  ' }, 'name', 'en')).toBe(
      'မုတ်ဆိတ်ရိတ်',
    );
  });

  it('works for any bilingual field and needs its _mm member', () => {
    expect(
      localized({ description_mm: 'ဖော်ပြချက်', description_en: 'Note' }, 'description', 'en'),
    ).toBe('Note');
    // @ts-expect-error — a record without `name_mm` is not a bilingual `name`.
    localized({ name_en: 'Haircut' }, 'name', 'en');
    expectTypeOf(localized).returns.toEqualTypeOf<string>();
  });
});

describe('hasMyanmarScript', () => {
  it.each([
    ['မုတ်ဆိတ်ရိတ်', true],
    ['Ma Su', false],
    ['Ko Aung (ကိုအောင်)', true],
    ['၀၉', true],
    ['09 7712 3456', false],
    ['', false],
  ])('%j → %s', (text, expected) => {
    expect(hasMyanmarScript(text)).toBe(expected);
  });
});
