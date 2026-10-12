// The words the formatters write (D-PLT-03): the `common.format.*` texts of the
// add-shared-ui-components brief. Task 3.8 reads them from the language files instead.
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

export const FORMAT_WORDS: Readonly<Record<Locale, FormatWords>> = {
  en: {
    unit: { ks: 'Ks', kyat: null, lakh: null },
    min: 'min',
    hour: 'h',
    pcs: 'pcs',
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    relative: { justNow: 'just now', minAgo: '{n} min ago', hourAgo: '{n} h ago' },
  },
  my: {
    unit: { ks: 'Ks', kyat: 'ကျပ်', lakh: 'သိန်း' },
    min: 'မိနစ်',
    hour: 'နာရီ',
    pcs: 'ခု',
    weekday: ['တနင်္လာ', 'အင်္ဂါ', 'ဗုဒ္ဓဟူး', 'ကြာသပတေး', 'သောကြာ', 'စနေ', 'တနင်္ဂနွေ'],
    relative: {
      justNow: 'ယခုလေးတင်',
      minAgo: 'လွန်ခဲ့သော {n} မိနစ်',
      hourAgo: 'လွန်ခဲ့သော {n} နာရီ',
    },
  },
};
