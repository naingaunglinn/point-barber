import { socialLinksOf } from '@point/shared';

import type { BranchRow, BranchWrite } from '../repositories/branches.repository.js';

// What "changed" means for a branch write (API-AUD-01 · P1-RULE-10 · API-IDEM-01 · design D7), and
// the stale check (API-IDEM-04 · design D6). Pure functions — table-tested (CG-TEST-02).

/** The members in the order of OpenAPI `BranchCreate`, then the status. */
const MEMBERS = [
  'name_mm',
  'name_en',
  'phone',
  'email',
  'address_mm',
  'address_en',
  'website_url',
  'social_links',
  'latitude',
  'longitude',
  'location_radius_meters',
  'is_public',
  'map_url',
  'status',
] as const satisfies readonly (keyof BranchWrite)[];

type Member = (typeof MEMBERS)[number];

export interface ChangedMember {
  readonly member: Member;
  /** The stored value as the API answers it (a coordinate as a number, no links as `{}`). */
  readonly before: unknown;
  readonly after: unknown;
}

/** `{ b: 1, a: [..] }` and `{ a: [..], b: 1 }` print the same; array order is kept. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** numeric(10,7): `16.8409` is the stored `16.8409000`. */
const coordinate = (value: number | null): string | null =>
  value === null ? null : value.toFixed(7);

function storedValue(stored: BranchRow, member: Member): unknown {
  switch (member) {
    case 'latitude':
    case 'longitude': {
      const value = stored[member];
      return value === null ? null : Number(value);
    }
    case 'social_links':
      return socialLinksOf(stored.social_links);
    default:
      return stored[member];
  }
}

function equal(stored: BranchRow, member: Member, write: BranchWrite): boolean {
  switch (member) {
    case 'latitude':
    case 'longitude': {
      const sent = write[member];
      return sent === undefined || coordinate(sent) === stored[member];
    }
    case 'social_links': {
      const sent = write.social_links;
      return (
        sent === undefined || canonical(socialLinksOf(stored.social_links)) === canonical(sent)
      );
    }
    default:
      return write[member] === undefined || write[member] === stored[member];
  }
}

/** The members of `write` whose value differs from the stored one; a member not sent never does. */
export function changedMembers(stored: BranchRow, write: BranchWrite): ChangedMember[] {
  return MEMBERS.filter((member) => !equal(stored, member, write)).map((member) => ({
    member,
    before: storedValue(stored, member),
    after: write[member],
  }));
}

/**
 * The stale check of `expected_updated_at` (design D6): equal to the millisecond. `updated_at` is
 * answered with its milliseconds (toMmtIsoMillis) from the same instant the row was read as, so an
 * echoed value always matches its own read.
 */
export function sameMillisecond(stored: Date, expected: string): boolean {
  return stored.getTime() === new Date(expected).getTime();
}
