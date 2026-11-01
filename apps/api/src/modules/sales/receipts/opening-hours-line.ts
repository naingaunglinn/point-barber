import { formatTimeRange, formatWeekday } from '@point/shared';

import type { OpeningDay } from '../../platform/index.js';

// The opening-hours line of the receipt footer (AD-RCPT-01 item 8 · D-WEB-04 · add-walkin-visit-checkout
// design D10): the branch's `branch_opening_hours` rows, Monday first (ISO 1 … 7), consecutive weekdays
// with the same hours joined as `Mon–Sun 9:00 AM – 9:00 PM`, one line per run (sales-checkout spec "on
// one line"); a closed day is written with the receipt's "Closed" label; a weekday without a row prints
// nothing and ends the run; no rows → no line. Times as AD-FMT-03 (`formatTimeRange`). The receipt is
// English always (OPEN-32), so the weekday words are the `en` ones.

export function openingHoursLine(days: readonly OpeningDay[], closedLabel: string): string | null {
  const hoursOf = (day: OpeningDay): string =>
    day.is_closed || day.opens_at === null || day.closes_at === null
      ? closedLabel
      : formatTimeRange(day.opens_at, day.closes_at, { locale: 'en' });

  const runs: { first: number; last: number; hours: string }[] = [];
  for (const day of [...days].sort((a, b) => a.day_of_week - b.day_of_week)) {
    const hours = hoursOf(day);
    const run = runs.at(-1);
    if (run !== undefined && run.last === day.day_of_week - 1 && run.hours === hours) {
      run.last = day.day_of_week;
    } else {
      runs.push({ first: day.day_of_week, last: day.day_of_week, hours });
    }
  }
  if (runs.length === 0) return null;
  return runs
    .map(({ first, last, hours }) => {
      const name = (day: number) => formatWeekday(day, { locale: 'en' });
      const span = first === last ? name(first) : `${name(first)}–${name(last)}`;
      return `${span} ${hours}`;
    })
    .join('\n');
}
