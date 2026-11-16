import { describe, expect, it } from 'vitest';

import type { BranchRow } from '../repositories/branches.repository.js';
import { changedMembers, sameMillisecond } from './changed-members.js';

// add-branch-management tasks 3.2 / 3.3 — what "changed" means (API-AUD-01 · design D7) and the stale
// check to the millisecond (API-IDEM-04 · design D6). B3 of spec-fixtures §1.
const B3: BranchRow = {
  id: '0199a3f2-0000-7000-8001-0000000000b3',
  code: 'B3',
  name_mm: 'ပွိုင့် ၃.၀',
  name_en: 'Point 3.0',
  phone: null,
  email: null,
  address_mm: null,
  address_en: null,
  website_url: null,
  social_links: { facebook: 'https://facebook.com/point3', tiktok: 'https://tiktok.com/@point3' },
  latitude: '16.8409000',
  longitude: '96.1735000',
  location_radius_meters: null,
  is_public: true,
  map_url: null,
  status: 1,
  created_at: new Date('2026-09-01T00:00:00+06:30'),
  updated_at: new Date('2026-10-05T10:00:00.123+06:30'),
};

describe('changedMembers (task 3.2 · design D7)', () => {
  it('text: a new value is a change, the same value is not', () => {
    expect(changedMembers(B3, { phone: '09 7700 0003' })).toStrictEqual([
      { member: 'phone', before: null, after: '09 7700 0003' },
    ]);
    expect(changedMembers(B3, { name_en: 'Point 3.0' })).toStrictEqual([]);
  });

  it('boolean', () => {
    expect(changedMembers(B3, { is_public: true })).toStrictEqual([]);
    expect(changedMembers(B3, { is_public: false })).toStrictEqual([
      { member: 'is_public', before: true, after: false },
    ]);
  });

  it('16.8409 equals the stored 16.8409000 (numeric(10,7) — unchanged)', () => {
    expect(changedMembers(B3, { latitude: 16.8409, longitude: 96.1735 })).toStrictEqual([]);
    expect(changedMembers(B3, { latitude: 16.84090001 })).toStrictEqual([]);
    expect(changedMembers(B3, { latitude: 16.841 })).toStrictEqual([
      { member: 'latitude', before: 16.8409, after: 16.841 },
    ]);
  });

  it('social_links with its keys in another order is unchanged', () => {
    expect(
      changedMembers(B3, {
        social_links: {
          tiktok: 'https://tiktok.com/@point3',
          facebook: 'https://facebook.com/point3',
        },
      }),
    ).toStrictEqual([]);
  });

  it('other links in another order are a change; the links are recorded whole', () => {
    const stored: BranchRow = {
      ...B3,
      social_links: {
        other: [
          { label: 'Shop', url: 'https://shop.example' },
          { label: 'Blog', url: 'https://blog.example' },
        ],
      },
    };
    const reordered = {
      other: [
        { label: 'Blog', url: 'https://blog.example' },
        { label: 'Shop', url: 'https://shop.example' },
      ],
    };
    expect(changedMembers(stored, { social_links: reordered })).toStrictEqual([
      { member: 'social_links', before: stored.social_links, after: reordered },
    ]);
  });

  it('a stored NULL social_links equals {}', () => {
    expect(changedMembers({ ...B3, social_links: null }, { social_links: {} })).toStrictEqual([]);
  });

  it('null against a stored value is a change (a member cleared)', () => {
    expect(changedMembers(B3, { latitude: null })).toStrictEqual([
      { member: 'latitude', before: 16.8409, after: null },
    ]);
    expect(changedMembers({ ...B3, phone: '09 7700 0003' }, { phone: null })).toStrictEqual([
      { member: 'phone', before: '09 7700 0003', after: null },
    ]);
  });

  it('a member that is not sent is never a change; the order is the order of the members', () => {
    expect(changedMembers(B3, {})).toStrictEqual([]);
    expect(
      changedMembers(B3, { location_radius_meters: 150, phone: '09 7700 0003' }).map(
        (change) => change.member,
      ),
    ).toStrictEqual(['phone', 'location_radius_meters']);
  });

  it('status', () => {
    expect(changedMembers(B3, { status: 1 })).toStrictEqual([]);
    expect(changedMembers(B3, { status: 0 })).toStrictEqual([
      { member: 'status', before: 1, after: 0 },
    ]);
  });
});

describe('sameMillisecond — the stale check (task 3.3 · design D6)', () => {
  it('stored …00.123456 equals sent …00.123; …00.124 does not', () => {
    const stored = new Date('2026-10-05T10:00:00.123456+06:30');
    expect(sameMillisecond(stored, '2026-10-05T10:00:00.123+06:30')).toBe(true);
    expect(sameMillisecond(stored, '2026-10-05T03:30:00.123Z')).toBe(true);
    expect(sameMillisecond(stored, '2026-10-05T10:00:00.124+06:30')).toBe(false);
    expect(sameMillisecond(stored, '2026-10-05T10:00:00+06:30')).toBe(false);
  });
});
