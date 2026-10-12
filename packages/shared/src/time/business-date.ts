import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

import { APP_TIME_ZONE } from '../constants/time.js';
import { toDate, type BusinessDate, type Instant } from './instant.js';

// Zone maths go through the zone name Asia/Yangon (CG-TIME-04), never a fixed offset or a local-time
// getter of the machine, so the answer is the same on a server in UTC and a phone in another zone.

/** The instant in Myanmar Time, as a date whose calendar fields are read in Asia/Yangon. */
export function inMmt(value: Instant | Date): TZDate {
  return new TZDate(toDate(value).getTime(), APP_TIME_ZONE);
}

/** The Myanmar calendar date of an instant: `2026-10-04T17:30:00Z` → `2026-10-05` (D-PLT-15). */
export function businessDateOf(value: Instant | Date): BusinessDate {
  return format(inMmt(value), 'yyyy-MM-dd');
}

/** Today in Myanmar Time, for the supplied `now` — never the device date (CG-TIME-03). */
export function todayMmt(now: Instant | Date): BusinessDate {
  return businessDateOf(now);
}
