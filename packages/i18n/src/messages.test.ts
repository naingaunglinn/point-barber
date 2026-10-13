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
    expect(NAMESPACES).toEqual(['common', 'status', 'error', 'reason', 'devui']);
  });
});
