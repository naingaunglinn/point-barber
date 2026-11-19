import type { Mmk } from '../money/mmk.js';
import { FORMAT_WORDS, type Locale } from './words.js';

// The money profiles (D-PLT-04 · AD-FMT-01 · FE-FMT-01): the staff app writes `Ks` in English and
// `ကျပ်` in Myanmar; the website writes `Ks` in both languages.
export type MoneyProfile = 'app' | 'site';

export interface FormatMoneyOptions {
  readonly locale: Locale;
  readonly profile: MoneyProfile;
  /** false in a table cell whose column header carries the unit. */
  readonly unit?: boolean;
}

/** `1250000` → `1,250,000` — whole kyats, digits 0–9, a comma every three digits. */
export function groupDigits(amount: Mmk): string {
  const digits = (amount < 0n ? -amount : amount).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return amount < 0n ? `-${grouped}` : grouped;
}

/** The unit word of a language and profile: `ကျပ်` in the Myanmar staff app, `Ks` everywhere else. */
export function moneyUnit(locale: Locale, profile: MoneyProfile): string {
  const words = FORMAT_WORDS[locale].unit;
  return (profile === 'app' ? words.kyat : null) ?? words.ks;
}

/** `7000` in `my` / `app` → `7,000 ကျပ်`. Every component shows money only through this function. */
export function formatMoney(
  amount: Mmk,
  { locale, profile, unit = true }: FormatMoneyOptions,
): string {
  const number = groupDigits(amount);
  if (!unit) return number;
  return `${number} ${moneyUnit(locale, profile)}`;
}
