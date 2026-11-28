import { describe, expect, it } from 'vitest';

import { type StoredCustomer, changedMembers, sameMillisecond } from './changed-members.js';

// add-customer-management tasks 3.4 / 3.5 — what "changed" means for a customer write (API-AUD-01 ·
// API-IDEM-01 · design D7) and the stale check to the millisecond (API-IDEM-04 · design D8).
// Table-tested pure functions (CG-TEST-02) on Ma Su's row of spec-fixtures §2.
const stored: StoredCustomer = {
  name: 'Ma Su',
  phone: '09 7712 3456',
  phone_normalized: '+95977123456',
  notes: 'Prefers a short fade',
};

describe('changedMembers — design D7', () => {
  it('a member that is not sent never counts', () => {
    expect(changedMembers(stored, {})).toStrictEqual([]);
  });

  it('unchanged notes, name and phone are none', () => {
    expect(
      changedMembers(stored, {
        name: 'Ma Su',
        phone: '09 7712 3456',
        phone_normalized: '+95977123456',
        notes: 'Prefers a short fade',
      }),
    ).toStrictEqual([]);
  });

  it('the same E.164 typed another way changes phone only — the typed text is stored and audited', () => {
    const changes = changedMembers(stored, {
      phone: '+95 9 7712 3456',
      phone_normalized: '+95977123456',
    });
    expect(changes).toStrictEqual([
      { member: 'phone', before: '09 7712 3456', after: '+95 9 7712 3456' },
    ]);
  });

  it('a corrected number changes phone and phone_normalized, in that order', () => {
    expect(
      changedMembers(stored, { phone: '09 7712 3457', phone_normalized: '+95977123457' }),
    ).toStrictEqual([
      { member: 'phone', before: '09 7712 3456', after: '09 7712 3457' },
      { member: 'phone_normalized', before: '+95977123456', after: '+95977123457' },
    ]);
  });

  it('a new name and cleared notes are changes; null notes on null notes are not', () => {
    expect(changedMembers(stored, { name: 'Ma Su Su', notes: null })).toStrictEqual([
      { member: 'name', before: 'Ma Su', after: 'Ma Su Su' },
      { member: 'notes', before: 'Prefers a short fade', after: null },
    ]);
    expect(changedMembers({ ...stored, notes: null }, { notes: null })).toStrictEqual([]);
  });
});

describe('sameMillisecond — the stale check (design D8)', () => {
  const at = new Date('2026-10-05T10:00:00.123+06:30');

  it('is true for the same instant in any offset, and false one millisecond away', () => {
    expect(sameMillisecond(at, '2026-10-05T10:00:00.123+06:30')).toBe(true);
    expect(sameMillisecond(at, '2026-10-05T03:30:00.123Z')).toBe(true);
    expect(sameMillisecond(at, '2026-10-05T10:00:00.124+06:30')).toBe(false);
    expect(sameMillisecond(at, '2026-10-05T10:00:00+06:30')).toBe(false);
  });
});
