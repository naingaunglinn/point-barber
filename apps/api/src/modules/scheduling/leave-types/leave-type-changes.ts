import type { LeaveTypeWrite } from '../repositories/leave-types.repository.js';
import type { LeaveTypeRow } from './leave-type-mapper.js';

// What "changed" means for a leave-type edit (API-AUD-01 · P2-RULE-12 · API-IDEM-01 · design D7) and
// the stale check (API-IDEM-04 · design D6). Pure functions — table-tested (CG-TEST-02).

/** The members of OpenAPI `LeaveTypeUpdate` an edit may change, in its order. */
const MEMBERS = [
  'name_mm',
  'name_en',
  'is_paid',
  'status',
  'sort_order',
] as const satisfies readonly (keyof LeaveTypeWrite)[];

/** The members whose sent value differs from the stored one, `before` / `after` each; none sent → {}. */
export function changedMembers(
  stored: LeaveTypeRow,
  write: LeaveTypeWrite,
): { readonly before: Record<string, unknown>; readonly after: Record<string, unknown> } {
  const changed = MEMBERS.filter(
    (member) => write[member] !== undefined && write[member] !== stored[member],
  );
  return {
    before: Object.fromEntries(changed.map((member) => [member, stored[member]])),
    after: Object.fromEntries(changed.map((member) => [member, write[member]])),
  };
}

/**
 * `expected_updated_at` equals the stored `updated_at` to the millisecond (design D6): the answer
 * carries the milliseconds (toMmtIsoMillis), so an echoed value matches the read it came from.
 */
export function sameMillisecond(stored: Date, expected: string): boolean {
  return stored.getTime() === new Date(expected).getTime();
}
