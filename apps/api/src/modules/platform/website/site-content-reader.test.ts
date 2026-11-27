import { describe, expect, it } from 'vitest';

import type { StoredSetting } from '../settings/resolve.js';
import { LIVE_WITHIN_SECONDS, siteContentOf } from './site-content-reader.js';

// add-website-management task 5.1 — `SiteContentReader` (P8.WEB.01 / 02 · P8-RULE-11 · design D4 ·
// proposal reading 9): the nine keys with their Part 8 §17 defaults, the newest row's `updated_at` /
// `updated_by`, `site_origin` and `live_within_seconds`; the image members stay null until part A6.
const ZIN = '0199a3f2-0000-7000-8002-00000000e001';
const HNIN = '0199a3f2-0000-7000-8002-00000000e002';
const names = new Map([
  [ZIN, 'ဦးကျော်ဇင်'],
  [HNIN, 'မနှင်း'],
]);
const options = { siteOrigin: 'https://point.test', names };

const row = (key: string, value: unknown, at: string, by = ZIN): StoredSetting => ({
  id: `0199a3f2-0000-7000-8000-${String(key.length).padStart(12, '0')}`,
  key,
  branch_id: null,
  value,
  updated_at: new Date(at),
  updated_by_user_id: by,
});

describe('add-website-management · SiteContentReader (task 5.1)', () => {
  it('Scenario: Defaults without rows — Part 8 §17 defaults, no save yet', () => {
    expect(siteContentOf([], options)).toStrictEqual({
      hero_title: { mm: '', en: null },
      hero_subtitle: { mm: '', en: null },
      cover_image: null,
      share_image: null,
      seo_title: null,
      seo_description: null,
      announcement: null,
      show_prices: false,
      show_barbers: false,
      site_origin: 'https://point.test',
      updated_at: null,
      updated_by: null,
      live_within_seconds: LIVE_WITHIN_SECONDS,
    });
    expect(LIVE_WITHIN_SECONDS).toBe(10);
  });

  it('a stored row replaces its key only; the newest row gives updated_at and updated_by', () => {
    const content = siteContentOf(
      [
        row('site.hero_title', { mm: 'ပွိုင့်', en: 'Point' }, '2026-10-05T03:30:00.000Z'),
        row('site.show_prices', true, '2026-10-05T03:35:00.000Z', HNIN),
        row('site.seo_title', { mm: 'ခေါင်းစဉ်', en: null }, '2026-10-05T03:31:00.000Z'),
      ],
      options,
    );
    expect(content).toMatchObject({
      hero_title: { mm: 'ပွိုင့်', en: 'Point' },
      hero_subtitle: { mm: '', en: null },
      seo_title: { mm: 'ခေါင်းစဉ်', en: null },
      show_prices: true,
      show_barbers: false,
      updated_at: '2026-10-05T10:05:00.000+06:30',
      updated_by: { user_id: HNIN, display_name: 'မနှင်း' },
    });
  });

  it('a user without a known name has an empty display name, never a missing member', () => {
    const content = siteContentOf([row('site.show_barbers', true, '2026-10-05T03:30:00.000Z')], {
      siteOrigin: 'https://point.test',
      names: new Map(),
    });
    expect(content.updated_by).toStrictEqual({ user_id: ZIN, display_name: '' });
  });

  it('the announcement and the two image members are read as stored or null', () => {
    const announcement = {
      text_mm: 'ဒီနေ့ ညနေ ၆ နာရီ ပိတ်ပါမယ်',
      text_en: 'Closing at 6:00 PM today',
      start_date: '2026-10-05',
      end_date: '2026-10-05',
    };
    const content = siteContentOf(
      [row('site.announcement', announcement, '2026-10-05T03:30:00.000Z')],
      options,
    );
    expect(content.announcement).toStrictEqual(announcement);
    expect([content.cover_image, content.share_image]).toStrictEqual([null, null]);
  });
});
