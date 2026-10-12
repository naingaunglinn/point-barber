import en from '@point/i18n/messages/en/common.json' with { type: 'json' };
import my from '@point/i18n/messages/my/common.json' with { type: 'json' };

// The words the formatters write (D-PLT-03 · AD-FMT-00): read from the `common.format.*` keys of the
// language files, so a wording fix there changes the formatters too. The only dependency between
// the two packages is this one, shared → i18n (design D1).
export type Locale = 'my' | 'en';

export interface FormatWords {
  /** `kyat` and `lakh` are Myanmar words only; the English UI writes `Ks` and has no lakh helper. */
  readonly unit: {
    readonly ks: string;
    readonly kyat: string | null;
    readonly lakh: string | null;
  };
  readonly min: string;
  readonly hour: string;
  readonly pcs: string;
  /** Monday first — the ISO numbering of `day_of_week` (1 Mon … 7 Sun). */
  readonly weekday: readonly [string, string, string, string, string, string, string];
  readonly relative: {
    readonly justNow: string;
    readonly minAgo: string;
    readonly hourAgo: string;
  };
}

type Format = typeof en.format;

function wordsOf(format: Format, locale: Locale): FormatWords {
  const { unit, weekday, relative } = format;
  // The brief marks `unit.kyat` and `unit.lakh` "not used in en": the English files repeat the
  // Myanmar text only to keep the key sets equal (`pnpm i18n:check`), and the formatters ignore it.
  const myanmarOnly = (text: string) => (locale === 'my' ? text : null);
  return {
    unit: { ks: unit.ks, kyat: myanmarOnly(unit.kyat), lakh: myanmarOnly(unit.lakh) },
    min: format.min,
    hour: format.hour,
    pcs: format.pcs,
    weekday: [
      weekday.mon,
      weekday.tue,
      weekday.wed,
      weekday.thu,
      weekday.fri,
      weekday.sat,
      weekday.sun,
    ],
    relative: { ...relative },
  };
}

export const FORMAT_WORDS: Readonly<Record<Locale, FormatWords>> = {
  en: wordsOf(en.format, 'en'),
  my: wordsOf(my.format, 'my'),
};
