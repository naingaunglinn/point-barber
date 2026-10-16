import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, LOCALES, NAMESPACES } from './config';
import { loadMessages } from './messages';

// D-PLT-03 · AD-L10N-01 · AD-L10N-02 · design D6: one JSON file per namespace and language.
describe('language files', () => {
  it('has the two locales, Myanmar first and default', () => {
    expect(LOCALES).toEqual(['my', 'en']);
    expect(DEFAULT_LOCALE).toBe('my');
  });

  it.each(LOCALES)('loads the namespaces of this change for %s', (locale) => {
    expect(Object.keys(loadMessages(locale)).sort()).toEqual([...NAMESPACES].sort());
    expect(NAMESPACES).toEqual(['common', 'status', 'error', 'reason', 'receipt', 'devui', 'auth']);
  });

  // ui-foundation "Every visible string comes from the my and en language files" — receipt labels are
  // English only; their Myanmar values are null until a Myanmar receipt is wanted (owner 12/Oct/2026).
  it('receipt labels: text in English, null in Myanmar', () => {
    const en = Object.values(loadMessages('en').receipt);
    const my = Object.values(loadMessages('my').receipt) as unknown[];
    expect(en.length).toBeGreaterThan(0);
    for (const value of en) expect(value).toMatch(/\S/);
    expect(my).toEqual(en.map(() => null));
  });
});
