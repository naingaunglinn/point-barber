import { ErrorCode, type FieldError, LeaveTypeStatus, isZawgyi } from '@point/shared';

import type { LeaveTypeWrite } from '../repositories/leave-types.repository.js';
import type { LeaveTypeRow } from './leave-type-mapper.js';

// The rules of a leave-type write, as pure functions — table-tested (CG-TEST-02): what "changed" means
// (API-AUD-01 · P2-RULE-12 · API-IDEM-01 · design D7), the stale check (API-IDEM-04 · D6), the Zawgyi
// refusal (API-SHAPE-05 · D4) and the type a new leave may use (D1 · D5).

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

/** Every name typed in Zawgyi, one `errors[]` item each (API-SHAPE-05 · AD-FORM-13 · design D4). */
export function zawgyiFields(members: LeaveTypeWrite): FieldError[] {
  return (['name_mm', 'name_en'] as const).flatMap((member) => {
    const value = members[member];
    return typeof value === 'string' && isZawgyi(value)
      ? [{ field: member, code: ErrorCode.ZAWGYI_TEXT }]
      : [];
  });
}

/** The type a new leave may use (design D1): ACTIVE and not archived, else null. */
export function activeOrNull(row: LeaveTypeRow | null): LeaveTypeRow | null {
  return row !== null && row.status === LeaveTypeStatus.ACTIVE && row.archived_at === null
    ? row
    : null;
}
