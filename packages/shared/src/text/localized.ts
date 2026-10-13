import type { Locale } from '../format/words.js';

// Master data is stored in Myanmar and English (D-DB-04). The English UI shows `*_en`, or `*_mm` when
// the English value is empty — with no marker (AD-L10N-03 · API-DATA-05).

type Bilingual<F extends string> = { readonly [K in `${F}_mm`]: string } & {
  readonly [K in `${F}_en`]?: string | null;
};

/** `localized({ name_mm, name_en }, 'name', 'en')` → `name_en`, else `name_mm`. */
export function localized<F extends string>(
  record: Bilingual<F>,
  field: F,
  locale: Locale,
): string {
  const values: Readonly<Record<string, string | null | undefined>> = record;
  const mm = values[`${field}_mm`] ?? '';
  if (locale === 'my') return mm;
  const en = values[`${field}_en`];
  return typeof en === 'string' && en.trim() !== '' ? en : mm;
}

const MYANMAR = /[\u1000-\u109F]/;

/** True when the text holds a character of the Myanmar block, U+1000–U+109F (AD-L10N-04). */
export function hasMyanmarScript(text: string): boolean {
  return MYANMAR.test(text);
}
