import { format } from 'date-fns';

import { inMmt } from './business-date.js';
import type { Instant } from './instant.js';

// The one serializer of the instants the API returns (API-DATA-03 · D-PLT-15 · CG-TIME-04): ISO 8601
// to the second with the offset of Asia/Yangon, read from the zone name — never a fixed offset and
// never the machine's zone. Moved here from apps/api by add-walkin-visit-checkout (task 3.8).

/** `2026-10-04T17:30:00Z` → `2026-10-05T00:00:00+06:30`. */
export function toMmtIso(value: Instant | Date): Instant {
  return format(inMmt(value), "yyyy-MM-dd'T'HH:mm:ssxxx");
}
