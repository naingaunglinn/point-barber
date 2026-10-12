import {
  businessDateOf,
  dateRangeForPreset,
  formatDate,
  formatDateTime,
  formatDuration,
  formatLakh,
  formatMoney,
  formatPercent,
  formatPhone,
  formatQty,
  formatRelativeTime,
  formatTime,
  formatTimeRange,
  localized,
  moneyFromWire,
  normalizeDigits,
  normalizeMyanmarText,
  normalizePhone,
  parseDateInput,
  todayMmt,
  type DatePreset,
} from '@point/shared';

import type { Locale } from '../fonts';
import { CUSTOMERS, DATES, PEOPLE } from './fixtures';
import { MYANMAR_DIGITS } from './font-samples';

// The Formatters section of the catalogue (task 4.6 · AD-FMT-00..11 · design D5): one row per call,
// input → output in both languages, for every function of D5. Time-dependent rows read the catalogue
// clock (`now`), never the device date.

export interface FormatterRow {
  /** The function, as named in design D5. */
  readonly fn: string;
  /** The input, as code-like text (not translated). */
  readonly input: string;
  readonly run: (locale: Locale, now: Date) => string;
}

const ks = moneyFromWire;
const MINUTE = 60_000;
const before = (now: Date, ms: number) => new Date(now.getTime() - ms);

/** "Myanmar" typed in Zawgyi. */
const ZAWGYI_SAMPLE = 'ျမန္မာ';

const PRESETS: readonly DatePreset[] = [
  'today',
  'yesterday',
  'thisWeek',
  'last7Days',
  'thisMonth',
  'lastMonth',
];

export const FORMATTER_ROWS: readonly FormatterRow[] = [
  {
    fn: 'formatMoney',
    input: '7000n · app',
    run: (locale) => formatMoney(ks(7_000), { locale, profile: 'app' }),
  },
  {
    fn: 'formatMoney',
    input: '7000n · site',
    run: (locale) => formatMoney(ks(7_000), { locale, profile: 'site' }),
  },
  {
    fn: 'formatMoney',
    input: '1250000n · app · unit: false',
    run: (locale) => formatMoney(ks(1_250_000), { locale, profile: 'app', unit: false }),
  },
  { fn: 'formatLakh', input: '1250000n', run: () => formatLakh(ks(1_250_000)) ?? '' },
  { fn: 'formatDate', input: DATES.today, run: (locale) => formatDate(DATES.today, { locale }) },
  {
    fn: 'formatDate',
    input: `${DATES.today} · weekday`,
    run: (locale) => formatDate(DATES.today, { locale, weekday: true }),
  },
  { fn: 'formatTime', input: '14:30', run: (locale) => formatTime('14:30', { locale }) },
  { fn: 'formatTime', input: DATES.finish, run: (locale) => formatTime(DATES.finish, { locale }) },
  {
    fn: 'formatDateTime',
    input: DATES.finish,
    run: (locale) => formatDateTime(DATES.finish, { locale }),
  },
  {
    fn: 'formatTimeRange',
    input: '14:30 – 15:15',
    run: (locale) => formatTimeRange('14:30', '15:15', { locale }),
  },
  {
    fn: 'formatTimeRange',
    input: '11:30 – 12:15',
    run: (locale) => formatTimeRange('11:30', '12:15', { locale }),
  },
  ...[45, 90, 60, 0].map((minutes) => ({
    fn: 'formatDuration',
    input: String(minutes),
    run: (locale: Locale) => formatDuration(minutes, { locale }),
  })),
  { fn: 'formatPercent', input: '12.345', run: () => formatPercent(12.345) },
  { fn: 'formatPercent', input: "'99.995'", run: () => formatPercent('99.995') },
  { fn: 'formatQty', input: '3', run: (locale) => formatQty(3, { locale }) },
  ...[
    ['now − 30 s', 30_000],
    ['now − 5 min', 5 * MINUTE],
    ['now − 3 h', 3 * 60 * MINUTE],
    ['now − 2 days', 2 * 24 * 60 * MINUTE],
  ].map(([input, ms]) => ({
    fn: 'formatRelativeTime',
    input: String(input),
    run: (locale: Locale, now: Date) =>
      formatRelativeTime(before(now, Number(ms)), now, { locale }),
  })),
  { fn: 'formatPhone', input: '+95977123456', run: () => formatPhone('+95977123456') },
  {
    fn: 'normalizePhone',
    input: CUSTOMERS.maSu.phoneTyped,
    run: () => normalizePhone(CUSTOMERS.maSu.phoneTyped),
  },
  { fn: 'normalizePhone', input: '0977', run: () => normalizePhone('0977') },
  { fn: 'normalizeDigits', input: MYANMAR_DIGITS, run: () => normalizeDigits(MYANMAR_DIGITS) },
  {
    fn: 'businessDateOf',
    input: '2026-10-04T17:30:00Z',
    run: () => businessDateOf('2026-10-04T17:30:00Z'),
  },
  { fn: 'todayMmt', input: 'now', run: (_locale, now) => todayMmt(now) },
  ...['05/10/2026', '05/Oct/2026', '၀၅/၁၀/၂၀၂၆', '31/02/2026'].map((text) => ({
    fn: 'parseDateInput',
    input: text,
    run: () => parseDateInput(text),
  })),
  ...PRESETS.map((preset) => ({
    fn: 'dateRangeForPreset',
    input: `${preset} · todayMmt(now)`,
    run: (_locale: Locale, now: Date) => {
      const { from, to } = dateRangeForPreset(preset, todayMmt(now));
      return `${from} – ${to}`;
    },
  })),
  {
    fn: 'localized',
    input: `${PEOPLE.aung.name_mm} / ${PEOPLE.aung.name_en}`,
    run: (locale) => localized(PEOPLE.aung, 'name', locale),
  },
  {
    fn: 'localized',
    input: `${PEOPLE.aung.name_mm} / ''`,
    run: (locale) => localized({ ...PEOPLE.aung, name_en: '' }, 'name', locale),
  },
  {
    fn: 'normalizeMyanmarText',
    input: ZAWGYI_SAMPLE,
    run: () => {
      const { text, converted } = normalizeMyanmarText(ZAWGYI_SAMPLE);
      return `${text} · converted: ${String(converted)}`;
    },
  },
];
