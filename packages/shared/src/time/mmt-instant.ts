import { TZDate } from '@date-fns/tz';

import { APP_TIME_ZONE } from '../constants/time.js';
import { businessDateOf } from './business-date.js';
import type { BusinessDate, Instant } from './instant.js';
import { toMmtIso } from './mmt-iso.js';

// A date and a time of day typed on a screen, as the instant they name in Myanmar Time — the late-entry
// time fields (add-late-entry design D2 · D-PLT-15 · CG-TIME-04). Read through the zone name, so a
// phone in another zone sends the same instant; businessDateOf is the way back.

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `2026-10-04` + `15:00` → `2026-10-04T15:00:00+06:30`. */
export function mmtInstant(date: BusinessDate, time: string): Instant {
  const day = DATE.exec(date);
  if (!day) throw new RangeError(`Not a business date: ${date}`);
  const clock = TIME.exec(time);
  if (!clock) throw new RangeError(`Not a time of day HH:mm: ${time}`);
  const instant = toMmtIso(
    new TZDate(
      Number(day[1]),
      Number(day[2]) - 1,
      Number(day[3]),
      Number(clock[1]),
      Number(clock[2]),
      APP_TIME_ZONE,
    ),
  );
  // 2026-02-30 would roll over into March.
  if (businessDateOf(instant) !== date) throw new RangeError(`Not a calendar date: ${date}`);
  return instant;
}
