import { FORMAT_WORDS, type Locale } from './words.js';

// Durations and quantities translate the unit, never the digits (AD-FMT-05 · AD-FMT-08).

interface Options {
  readonly locale: Locale;
}

/** `90` → `1 h 30 min` / `1 နာရီ 30 မိနစ်`; a whole number of hours has no minutes part. */
export function formatDuration(minutes: number, { locale }: Options): string {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`A duration is whole minutes from 0, got ${minutes}`);
  }
  const words = FORMAT_WORDS[locale];
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} ${words.min}`;
  return rest === 0 ? `${hours} ${words.hour}` : `${hours} ${words.hour} ${rest} ${words.min}`;
}

/** `3` → `3 pcs` / `3 ခု`. */
export function formatQty(quantity: number, { locale }: Options): string {
  const digits = String(quantity).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${digits} ${FORMAT_WORDS[locale].pcs}`;
}
