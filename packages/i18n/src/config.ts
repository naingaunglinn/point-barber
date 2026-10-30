// The two UI languages (D-PLT-03): Myanmar is the default — setting `system.default_language`
// 1 = MY (API Part 1).
export const LOCALES = ['my', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'my';

/** One JSON file per namespace and language (design D6); feature changes add their own. */
export const NAMESPACES = [
  'common',
  'status',
  'error',
  'reason',
  'receipt',
  'devui',
  'auth',
] as const;
export type Namespace = (typeof NAMESPACES)[number];

export function isLocale(value: unknown): value is Locale {
  return value === 'my' || value === 'en';
}
