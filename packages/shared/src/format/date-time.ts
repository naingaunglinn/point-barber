import { TZDate } from '@date-fns/tz';
import { format, getISODay, isValid } from 'date-fns';

import { APP_TIME_ZONE } from '../constants/time.js';
import { inMmt } from '../time/business-date.js';
import type { BusinessDate, Instant } from '../time/instant.js';
import { FORMAT_WORDS, type Locale } from './words.js';

// Dates `05/Oct/2026` and times `2:30 PM`, digits 0–9, in Myanmar Time whatever the device's zone
// is (D-PLT-05 · D-PLT-15 · AD-FMT-02 · AD-FMT-03 · design D5). Month names come from this fixed
// table, never from an ICU locale (which may write `Sept`).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A time of day on the wire (API-DATA-03): `14:30` or `14:30:00`. */
const WIRE_TIME = /^(\d{2}):(\d{2})(?::\d{2})?$/;

interface Options {
  readonly locale: Locale;
}

/** The calendar date of a business date (as given) or of an instant (in Myanmar Time). */
function calendarDate(value: BusinessDate | Instant | Date): TZDate {
  if (typeof value === 'string') {
    const match = CALENDAR_DATE.exec(value);
    if (match) {
      const [, year, month, day] = match.map(Number);
      const date = new TZDate(Number(year), Number(month) - 1, Number(day), APP_TIME_ZONE);
      if (!isValid(date) || format(date, 'yyyy-MM-dd') !== value) {
        throw new RangeError(`Not a calendar date: ${value}`);
      }
      return date;
    }
  }
  return inMmt(value);
}

/** Hours (0–23) and minutes of a wire time of day or of an instant in Myanmar Time. */
function timeOfDay(value: string | Date): { hours: number; minutes: number } {
  const match = typeof value === 'string' ? WIRE_TIME.exec(value) : null;
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) throw new RangeError(`Not a time of day: ${String(value)}`);
    return { hours, minutes };
  }
  const time = inMmt(value);
  return { hours: Number(format(time, 'H')), minutes: Number(format(time, 'm')) };
}

function clock({ hours, minutes }: { hours: number; minutes: number }) {
  return {
    text: `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, '0')}`,
    marker: hours < 12 ? 'AM' : 'PM',
  };
}

/** `2026-10-05` → `05/Oct/2026`; with `weekday` → `Mon, 05/Oct/2026` (the word in the UI language). */
export function formatDate(
  value: BusinessDate | Instant | Date,
  { locale, weekday = false }: Options & { readonly weekday?: boolean },
): string {
  const date = calendarDate(value);
  const text = `${format(date, 'dd')}/${MONTHS[Number(format(date, 'M')) - 1]}/${format(date, 'yyyy')}`;
  if (!weekday) return text;
  return `${FORMAT_WORDS[locale].weekday[getISODay(date) - 1]}, ${text}`;
}

/** An ISO `day_of_week` (1 Mon … 7 Sun) → its word in the UI language (`Mon` in English). */
export function formatWeekday(isoDay: number, { locale }: Options): string {
  const word = FORMAT_WORDS[locale].weekday[isoDay - 1];
  if (!Number.isInteger(isoDay) || word === undefined) {
    throw new RangeError(`Not an ISO weekday: ${String(isoDay)}`);
  }
  return word;
}

/** A wire time `14:30` or an instant → `2:30 PM` — no seconds, no zone label, in both languages. */
export function formatTime(value: string | Date, _options: Options): string {
  const { text, marker } = clock(timeOfDay(value));
  return `${text} ${marker}`;
}

/** `05/Oct/2026 10:42 AM` — the date, one space, the time (AD-RCPT-01 pattern). */
export function formatDateTime(value: Instant | Date, options: Options): string {
  return `${formatDate(value, options)} ${formatTime(value, options)}`;
}

/** `2:30 – 3:15 PM`; the marker is written on both ends only when they differ (AD-FMT-03). */
export function formatTimeRange(
  start: string | Date,
  end: string | Date,
  _options: Options,
): string {
  const from = clock(timeOfDay(start));
  const to = clock(timeOfDay(end));
  return from.marker === to.marker
    ? `${from.text} – ${to.text} ${to.marker}`
    : `${from.text} ${from.marker} – ${to.text} ${to.marker}`;
}
