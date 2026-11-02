'use client';

import { useState } from 'react';

// The later times of a late entry, kept on this device between the steps (add-late-entry design D6 ·
// task 4.4): START sends only the start time; "Service done", the payments and Finish each send theirs.
// After START (201, or the "was it saved?" answer) the three times the START sheet took are written under
// `point.lateEntry.<visit_id>`; each step reads its time; FINISH or INCOMPLETE removes them. It is a
// convenience of one device — the server stays the only record, and a step whose time is not here asks
// for it (LE-3 ★). Storage can be missing or refuse (private mode, a full disk): every access is in a
// try / catch, and a failure only means the step asks.

export type LateEntryStepMember = 'completed_at' | 'received_at' | 'finished_at';

export type KeptLateEntryTimes = Readonly<Record<LateEntryStepMember, string | null>>;

const keyOf = (visitId: string) => `point.lateEntry.${visitId}`;
const MEMBERS: readonly LateEntryStepMember[] = ['completed_at', 'received_at', 'finished_at'];

export function keepLateEntryTimes(visitId: string, times: KeptLateEntryTimes): void {
  try {
    localStorage.setItem(keyOf(visitId), JSON.stringify(times));
  } catch {
    // The steps ask for their times instead.
  }
}

export function keptLateEntryTimes(visitId: string): KeptLateEntryTimes | null {
  try {
    const raw = localStorage.getItem(keyOf(visitId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const read = (member: LateEntryStepMember) => {
      const value = (parsed as Record<string, unknown>)[member];
      return typeof value === 'string' ? value : null;
    };
    return Object.fromEntries(MEMBERS.map((m) => [m, read(m)])) as KeptLateEntryTimes;
  } catch {
    return null;
  }
}

export function forgetLateEntryTimes(visitId: string): void {
  try {
    localStorage.removeItem(keyOf(visitId));
  } catch {
    // Nothing to remove that could be read.
  }
}

/** The times kept for this visit when the screen opened, and how to drop them. */
export function useLateEntryTimes(visitId: string) {
  const [kept] = useState(() => keptLateEntryTimes(visitId));
  return { kept, forget: () => forgetLateEntryTimes(visitId) } as const;
}
