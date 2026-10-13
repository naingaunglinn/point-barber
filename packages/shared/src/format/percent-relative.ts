import { toDate, type Instant } from '../time/instant.js';
import { formatDate } from './date-time.js';
import { FORMAT_WORDS, type Locale } from './words.js';

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * `12.345` → `12.35%` (AD-FMT-07 · design D5): at most two decimals, rounded half up on the decimal
 * string — not on a float — with trailing zeros removed. A display rule; no money is rounded here.
 */
export function formatPercent(value: number | string): string {
  const text = typeof value === 'number' && Number.isFinite(value) ? value.toFixed(10) : value;
  const match = typeof text === 'string' ? DECIMAL.exec(text.trim()) : null;
  if (!match) throw new RangeError(`Not a decimal number: ${String(value)}`);
  const [, sign = '', whole = '0', fraction = ''] = match;
  const digits = fraction.padEnd(3, '0');
  let hundredths = BigInt(whole) * 100n + BigInt(digits.slice(0, 2));
  if (Number(digits[2]) >= 5) hundredths += 1n;
  const integer = (hundredths / 100n).toString();
  const decimals = (hundredths % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  const negative = sign === '-' && hundredths !== 0n;
  return `${negative ? '-' : ''}${integer}${decimals === '' ? '' : `.${decimals}`}%`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * `just now` below 1 minute, `N min ago` below 60 minutes, `N h ago` below 24 hours, then the date
 * (AD-FMT-09). `now` is the supplied clock (CG-TIME-03), never the device time.
 */
export function formatRelativeTime(
  at: Instant | Date,
  now: Instant | Date,
  { locale }: { readonly locale: Locale },
): string {
  const words = FORMAT_WORDS[locale].relative;
  const elapsed = toDate(now).getTime() - toDate(at).getTime();
  if (elapsed < MINUTE) return words.justNow;
  if (elapsed < HOUR) return words.minAgo.replace('{n}', String(Math.floor(elapsed / MINUTE)));
  if (elapsed < DAY) return words.hourAgo.replace('{n}', String(Math.floor(elapsed / HOUR)));
  return formatDate(at, { locale });
}
