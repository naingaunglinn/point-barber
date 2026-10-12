import { TZDate } from '@date-fns/tz';
import {
  addDays,
  endOfISOWeek,
  endOfMonth,
  format,
  startOfISOWeek,
  startOfMonth,
  subMonths,
} from 'date-fns';

import { APP_TIME_ZONE } from '../constants/time.js';
import { normalizeDigits } from '../text/digits.js';
import type { BusinessDate } from './instant.js';

// Typed dates (AD-FORM-15) and the list date presets (AD-LIST-01 · design D5). All calendar maths run
// on dates in Asia/Yangon (CG-TIME-04); "today" is passed in, never read from the device.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TYPED = /^(\d{1,2})\/(\d{1,2}|[A-Za-z]{3})\/(\d{4})$/;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function day(year: number, month: number, date: number): TZDate {
  return new TZDate(year, month - 1, date, APP_TIME_ZONE);
}

function businessDate(date: TZDate): BusinessDate {
  return format(date, 'yyyy-MM-dd');
}

/** `DD/MM/YYYY` or `DD/MMM/YYYY` (Myanmar digits too) → `YYYY-MM-DD`, or `date_invalid`. */
export function parseDateInput(text: string): BusinessDate | 'date_invalid' {
  const match = TYPED.exec(normalizeDigits(text).trim());
  if (!match) return 'date_invalid';
  const [, dd = '', mm = '', yyyy = ''] = match;
  const month = /^\d+$/.test(mm) ? Number(mm) : MONTHS.indexOf(mm.toLowerCase()) + 1;
  if (month < 1 || month > 12) return 'date_invalid';
  const result = businessDate(day(Number(yyyy), month, Number(dd)));
  const expected = `${yyyy}-${String(month).padStart(2, '0')}-${dd.padStart(2, '0')}`;
  return result === expected ? result : 'date_invalid'; // 31/02 rolls over to March: refused
}

export type DatePreset =
  'today' | 'yesterday' | 'thisWeek' | 'last7Days' | 'thisMonth' | 'lastMonth';

/** The `from` / `to` business dates (both inclusive — API-DATA-08) of a preset on `today`. */
export function dateRangeForPreset(
  preset: DatePreset,
  today: BusinessDate,
): { from: BusinessDate; to: BusinessDate } {
  const match = CALENDAR_DATE.exec(today);
  if (!match) throw new RangeError(`Not a business date: ${today}`);
  const now = day(Number(match[1]), Number(match[2]), Number(match[3]));
  const range = (from: TZDate, to: TZDate) => ({ from: businessDate(from), to: businessDate(to) });
  switch (preset) {
    case 'today':
      return range(now, now);
    case 'yesterday':
      return range(addDays(now, -1), addDays(now, -1));
    case 'thisWeek':
      return range(startOfISOWeek(now), endOfISOWeek(now));
    case 'last7Days':
      return range(addDays(now, -6), now);
    case 'thisMonth':
      return range(startOfMonth(now), endOfMonth(now));
    case 'lastMonth': {
      const previous = subMonths(now, 1);
      return range(startOfMonth(previous), endOfMonth(previous));
    }
  }
}
