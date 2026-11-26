// What "changed" means for a customer write (API-AUD-01 · API-IDEM-01 · add-customer-management design
// D7) and the stale check (API-IDEM-04 · design D8). Pure functions — table-tested (CG-TEST-02).

/** The members of the stored row a PATCH can touch. */
export interface StoredCustomer {
  readonly name: string;
  readonly phone: string;
  readonly phone_normalized: string;
  readonly notes: string | null;
}

/** The parsed members of a PATCH as they would be stored; `phone_normalized` goes with `phone`. */
export interface CustomerWrite {
  readonly name?: string;
  readonly phone?: string;
  readonly phone_normalized?: string;
  readonly notes?: string | null;
}

const MEMBERS = ['name', 'phone', 'phone_normalized', 'notes'] as const;
export type CustomerMember = (typeof MEMBERS)[number];

export interface ChangedMember {
  readonly member: CustomerMember;
  readonly before: string | null;
  readonly after: string | null;
}

/**
 * The members of `write` whose value differs from the stored one; a member not sent never does. A
 * phone counts as changed when the typed text **or** its E.164 form differs, so the same number typed
 * another way changes `phone` only (design D7). A phone change that changes the E.164 form lists
 * `phone_normalized` too: the audit row carries both.
 */
export function changedMembers(stored: StoredCustomer, write: CustomerWrite): ChangedMember[] {
  return MEMBERS.flatMap((member) => {
    const after = write[member];
    return after === undefined || after === stored[member]
      ? []
      : [{ member, before: stored[member], after }];
  });
}

/**
 * The stale check of `expected_updated_at` (design D8): equal to the millisecond. `updated_at` is
 * answered with its milliseconds (toMmtIsoMillis) from the same instant the row was read as, so an
 * echoed value always matches its own read.
 */
export function sameMillisecond(stored: Date, expected: string): boolean {
  return stored.getTime() === new Date(expected).getTime();
}
