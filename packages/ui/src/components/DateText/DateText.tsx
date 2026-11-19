'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import {
  businessDateOf,
  dateRangeForPreset,
  formatDate,
  formatDateTime,
  formatTime,
  todayMmt,
  type BusinessDate,
  type Instant,
} from '@point/shared';

import { useNow } from '../../providers/clock';
import { useFormat } from '../../providers/format';

// Dates and times on screen (D-PLT-05 · D-PLT-15 · AD-FMT-02 · AD-FMT-03 · design D10): only through
// the shared formatter, in Myanmar Time. With `relativeDay` the two most recent dates read "Today" /
// "Yesterday" — today from the supplied clock (`useNow()`), never from the device.

export type DateTextMode = 'date' | 'time' | 'datetime';

export interface DateTextProps {
  /** A business date `YYYY-MM-DD`, an instant, or for `time` a wire time of day `HH:mm`. */
  readonly value: BusinessDate | Instant;
  readonly mode?: DateTextMode;
  readonly weekday?: boolean;
  readonly relativeDay?: boolean;
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function RelativeDay({
  value,
  weekday,
}: {
  readonly value: BusinessDate | Instant;
  readonly weekday: boolean;
}) {
  const t = useTranslations('common.date');
  const { locale } = useFormat('DateText');
  const today = todayMmt(useNow());
  const day = CALENDAR_DATE.test(value) ? value : businessDateOf(value);
  if (day === today) return t('today');
  if (day === dateRangeForPreset('yesterday', today).from) return t('yesterday');
  return formatDate(value, { locale, weekday });
}

export function DateText({
  value,
  mode = 'date',
  weekday = false,
  relativeDay = false,
}: DateTextProps) {
  const { locale } = useFormat('DateText');
  let text: ReactNode;
  if (mode === 'time') text = formatTime(value, { locale });
  else if (mode === 'datetime') text = formatDateTime(value, { locale });
  else if (relativeDay) text = <RelativeDay value={value} weekday={weekday} />;
  else text = formatDate(value, { locale, weekday });
  return (
    <time dateTime={value} className="whitespace-nowrap">
      {text}
    </time>
  );
}
