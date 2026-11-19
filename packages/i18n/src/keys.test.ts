import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { LOCALES } from './config';
import { loadMessages } from './messages';

/** Every key of a namespace tree, dotted: `common.action.retry`. */
function keysOf(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [`${prefix}${key}`]
      : value === null // a Myanmar receipt label (English only — owner 12/Oct/2026)
        ? []
        : keysOf(value as object, `${prefix}${key}.`),
  );
}

/** The value at a dotted key. */
function valueOf(tree: object, key: string): string {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], tree) as string;
}

// ui-foundation "Every visible string comes from the my and en language files with checked keys"
// (D-PLT-03 · AD-L10N-01 · AD-L10N-02 · design D6).
describe('typed keys', () => {
  it('Scenario: A mistyped key does not compile', () => {
    const t = createTranslator({ locale: 'en', messages: loadMessages('en') });
    expect(t('common.action.retry')).toBe('Retry');
    // @ts-expect-error -- `retri` is not a key of the English files: `pnpm typecheck` fails here.
    const mistyped = () => t('common.action.retri');
    expect(mistyped).toBeTypeOf('function');
  });

  it('formats the placeholders of the brief in both languages', () => {
    const en = createTranslator({ locale: 'en', messages: loadMessages('en') });
    const my = createTranslator({ locale: 'my', messages: loadMessages('my') });
    expect(en('common.format.relative.minAgo', { n: 5 })).toBe('5 min ago');
    expect(my('common.format.relative.minAgo', { n: 5 })).toBe('လွန်ခဲ့သော 5 မိနစ်');
    expect(en('error.too_small', { minimum: 3 })).toBe(
      'This value is too short or too small — minimum 3.',
    );
    expect(en('status.flag.reopened', { n: 2 })).toBe('Reopened ×2');
    expect(en('common.confirm.irreversible')).toBe("This can't be undone.");
  });

  it.each(LOCALES)('every %s message is valid ICU and formats with its placeholders', (locale) => {
    const messages = loadMessages(locale);
    const errors: string[] = [];
    const t = createTranslator({
      locale,
      messages,
      onError: (error) => errors.push(error.message),
    }) as unknown as (key: string, values?: Record<string, string>) => string;
    for (const key of keysOf(messages)) {
      const value = valueOf(messages, key);
      const names = [...value.matchAll(/\{(\w+)\}/g)].map(([, name = '']) => name);
      const output = t(key, Object.fromEntries(names.map((name) => [name, `<${name}>`])));
      for (const name of names) expect(output, key).toContain(`<${name}>`);
      expect(output, key).not.toMatch(/[{}]/);
    }
    expect(errors).toEqual([]);
  });
});
