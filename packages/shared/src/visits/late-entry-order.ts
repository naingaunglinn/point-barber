import { toDate, type Instant } from '../time/instant.js';

// The order of the four late-entry times, one function for the API and the START sheet (add-late-entry
// design D2 · P4-RULE-13 · LE-1): started ≤ completed ≤ every received ≤ finished ≤ now, equal times
// allowed. Each step passes the times that exist then (recorded reading 1), so a missing member is
// skipped. The payments are not ordered among themselves, only between completed and finished.

export type LateEntryTimeMember = 'started_at' | 'completed_at' | 'received_at' | 'finished_at';

export interface LateEntryTimes {
  readonly startedAt: Instant;
  readonly completedAt?: Instant | null;
  readonly receivedAts?: readonly Instant[];
  readonly finishedAt?: Instant | null;
  readonly now: Instant | Date;
}

/** The first member that is earlier than the one before it or later than now; null when in order. */
export function lateEntryOrderViolation(times: LateEntryTimes): LateEntryTimeMember | null {
  const at = (value: Instant | Date) => toDate(value).getTime();
  const now = at(times.now);
  const outOf = (time: number, floor: number) => time < floor || time > now;

  let floor = at(times.startedAt);
  if (floor > now) return 'started_at';
  if (times.completedAt != null) {
    const completed = at(times.completedAt);
    if (outOf(completed, floor)) return 'completed_at';
    floor = completed;
  }
  let latest = floor;
  for (const receivedAt of times.receivedAts ?? []) {
    const received = at(receivedAt);
    if (outOf(received, floor)) return 'received_at';
    latest = Math.max(latest, received);
  }
  if (times.finishedAt != null && outOf(at(times.finishedAt), latest)) return 'finished_at';
  return null;
}
