import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  WebsiteLimits,
  affectedBookingSchema,
  archiveRequestSchema,
  branchHoursWriteSchema,
  closureCreateSchema,
  closureUpdateSchema,
  sharePreviewQuerySchema,
  siteContentWriteSchema,
  teamProfileSchema,
} from './website.js';

// add-website-management task 1.4 — the shapes and bounds of Part 8 §17 / §18 (API-ERR-03: a bound
// refused is the Zod issue at the member). Every bound of the task: 80 / 81, 70 / 71, 160 / 161,
// 200 / 201, 300 / 301, 1,000 / 1,001. Values from the spec's scenarios.

interface Issue {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly [member: string]: unknown;
}

function issuesOf(schema: z.ZodType, value: unknown): Issue[] {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues.map((issue) => ({ ...issue }));
}

const passes = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;
const text = (length: number) => 'က'.repeat(length);
const without = (value: Record<string, unknown>, member: string) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => key !== member));

/** The Part 8 §17 defaults as the form sends them (spec "Defaults without rows"). */
const DEFAULTS = {
  hero_title: { mm: '', en: null },
  hero_subtitle: { mm: '', en: null },
  cover_attachment_id: null,
  share_image_attachment_id: null,
  seo_title: null,
  seo_description: null,
  announcement: null,
  show_prices: false,
  show_barbers: false,
};
const content = (members: Record<string, unknown>) => ({ ...DEFAULTS, ...members });

describe('siteContentWriteSchema (P8.WEB.02 · Part 8 §17)', () => {
  it('Scenario: The first save; an empty Myanmar hero title is allowed (reading 2)', () => {
    const hero = { mm: 'ပွိုင့် ဘာဘာရှော့ မှ ကြိုဆိုပါတယ်', en: 'Welcome to Point' };
    expect(siteContentWriteSchema.parse(content({ hero_title: hero })).hero_title).toStrictEqual(
      hero,
    );
    expect(siteContentWriteSchema.parse(DEFAULTS).hero_title).toStrictEqual({ mm: '', en: null });
  });

  it('an empty or blank English text reads back as null, as the settings value does (one source)', () => {
    for (const en of ['', '  ']) {
      const body = siteContentWriteSchema.parse(
        content({ hero_title: { mm: '', en }, seo_description: { mm: '', en } }),
      );
      expect(body.hero_title).toStrictEqual({ mm: '', en: null });
      expect(body.seo_description).toStrictEqual({ mm: '', en: null });
    }
  });

  it('Scenario: An SEO description in English only (no minimum); texts are trimmed', () => {
    const body = siteContentWriteSchema.parse(
      content({ seo_description: { mm: '', en: ' Haircuts in Yangon ' } }),
    );
    expect(body.seo_description).toStrictEqual({ mm: '', en: 'Haircuts in Yangon' });
  });

  const bounds = [
    { member: 'hero_title', language: 'mm', max: 80 },
    { member: 'hero_title', language: 'en', max: 80 },
    { member: 'hero_subtitle', language: 'mm', max: 160 },
    { member: 'hero_subtitle', language: 'en', max: 160 },
    { member: 'seo_title', language: 'mm', max: 70 },
    { member: 'seo_title', language: 'en', max: 70 },
    { member: 'seo_description', language: 'mm', max: 160 },
    { member: 'seo_description', language: 'en', max: 160 },
  ];
  it.each(bounds)('$member.$language: $max characters pass, one more is too_big', (bound) => {
    const at = (length: number) =>
      content({ [bound.member]: { mm: '', en: null, [bound.language]: text(length) } });
    expect(passes(siteContentWriteSchema, at(bound.max))).toBe(true);
    expect(issuesOf(siteContentWriteSchema, at(bound.max + 1))).toMatchObject([
      { code: 'too_big', maximum: bound.max, path: [bound.member, bound.language] },
    ]);
  });

  describe('announcement', () => {
    const announcement = (members: Record<string, unknown>) =>
      content({
        announcement: {
          text_mm: 'ဒီနေ့ ညနေ ၆ နာရီ ပိတ်ပါမယ်',
          text_en: 'Closing at 6:00 PM today',
          start_date: '2026-10-05',
          end_date: '2026-10-05',
          ...members,
        },
      });

    it('text_mm and text_en: 200 pass, 201 is too_big; a blank Myanmar text is too_small', () => {
      expect(passes(siteContentWriteSchema, announcement({ text_mm: text(200) }))).toBe(true);
      expect(passes(siteContentWriteSchema, announcement({ text_en: 'a'.repeat(200) }))).toBe(true);
      expect(issuesOf(siteContentWriteSchema, announcement({ text_mm: text(201) }))).toMatchObject([
        { code: 'too_big', maximum: 200, path: ['announcement', 'text_mm'] },
      ]);
      expect(
        issuesOf(siteContentWriteSchema, announcement({ text_en: 'a'.repeat(201) })),
      ).toMatchObject([{ code: 'too_big', maximum: 200, path: ['announcement', 'text_en'] }]);
      expect(issuesOf(siteContentWriteSchema, announcement({ text_mm: '  ' }))).toMatchObject([
        { code: 'too_small', path: ['announcement', 'text_mm'] },
      ]);
    });

    it('an ended announcement keeps its shape — its dates are checked only on a change (WM2)', () => {
      const ended = announcement({ start_date: '2026-10-01', end_date: '2026-10-04' });
      expect(passes(siteContentWriteSchema, ended)).toBe(true);
    });
  });

  it('every member is required (P8-RULE-11); an image id is a UUID or null', () => {
    expect(issuesOf(siteContentWriteSchema, without(DEFAULTS, 'show_barbers'))).toMatchObject([
      { code: 'invalid_type', path: ['show_barbers'] },
    ]);
    expect(
      issuesOf(siteContentWriteSchema, content({ cover_attachment_id: 'cover-a.jpg' })),
    ).toMatchObject([{ path: ['cover_attachment_id'] }]);
  });
});

const day = (dayOfWeek: number, members: Record<string, unknown> = {}) => ({
  day_of_week: dayOfWeek,
  is_closed: false,
  opens_at: '09:00',
  closes_at: '21:00',
  ...members,
});
const week = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => day(dayOfWeek));

// add-website-management task 2.3 — spec "An hours save is a whole valid week" (P8.WEB.04 ·
// P8-RULE-12 · owner WM3 ★): the per-day codes, one `errors[]` item per wrong day, all together; the
// API names the code the schema names (catalogue codes — API-ERR-03).
const codesOf = (value: unknown) =>
  issuesOf(branchHoursWriteSchema, value).map((issue) => [
    issue.path.map(String).join('.'),
    String(issue.message).replace(/^code:/, ''),
  ]);

describe('add-website-management · website · An hours save is a whole valid week', () => {
  it('Scenario: Four wrong days at once — one code per day, together', () => {
    const days = [
      day(1, { is_closed: true, opens_at: '09:00', closes_at: null }),
      day(2, { opens_at: null, closes_at: null }),
      day(3, { opens_at: '09:00', closes_at: '00:00' }),
      day(4, { opens_at: '21:00', closes_at: '09:00' }),
      ...week.slice(4),
    ];
    expect(codesOf({ days })).toStrictEqual([
      ['days.0', 'times_not_allowed'],
      ['days.1', 'times_required'],
      ['days.2', 'overnight_not_allowed'],
      ['days.3', 'closes_before_opens'],
    ]);
  });

  it('Scenario: One minute is enough — Friday 09:00 – 09:01 passes', () => {
    const days = week.map((entry) =>
      entry.day_of_week === 5 ? { ...entry, opens_at: '09:00', closes_at: '09:01' } : entry,
    );
    expect(branchHoursWriteSchema.safeParse({ days }).success).toBe(true);
  });

  it('equal times close before they open; a closed day with only a closing time has times', () => {
    const days = [
      day(1, { opens_at: '09:00', closes_at: '09:00' }),
      day(2, { is_closed: true, opens_at: null, closes_at: '21:00' }),
      day(3, { opens_at: '09:00', closes_at: null }),
      ...week.slice(3),
    ];
    expect(codesOf({ days })).toStrictEqual([
      ['days.0', 'closes_before_opens'],
      ['days.1', 'times_not_allowed'],
      ['days.2', 'times_required'],
    ]);
  });

  it('a repeated weekday is invalid_value at days; the per-day checks still run', () => {
    const days = [day(1), day(1, { opens_at: null }), ...week.slice(2)];
    expect(codesOf({ days })).toStrictEqual([
      ['days', 'invalid_value'],
      ['days.1', 'times_required'],
    ]);
  });
});

describe('branchHoursWriteSchema (P8.WEB.04)', () => {
  it("Scenario: B3's week passes; a closed day carries null times", () => {
    expect(passes(branchHoursWriteSchema, { days: week })).toBe(true);
    const closed = day(1, { is_closed: true, opens_at: null, closes_at: null });
    expect(passes(branchHoursWriteSchema, { days: [closed, ...week.slice(1)] })).toBe(true);
  });

  it('Scenario: Six days — refused at days; eight too', () => {
    expect(issuesOf(branchHoursWriteSchema, { days: week.slice(0, 6) })).toMatchObject([
      { code: 'too_small', path: ['days'] },
    ]);
    expect(issuesOf(branchHoursWriteSchema, { days: [...week, day(1)] })).toMatchObject([
      { code: 'too_big', path: ['days'] },
    ]);
  });

  it.each(['9:00', '24:00', '09:60'])('a time %s is not HH:mm', (time) => {
    const days = [day(1, { opens_at: time }), ...week.slice(1)];
    expect(issuesOf(branchHoursWriteSchema, { days })).toMatchObject([
      { code: 'invalid_format', path: ['days', 0, 'opens_at'] },
    ]);
  });
});

const THINGYAN = {
  branch_id: '0190c3a0-0000-7000-8000-000000000003',
  start_date: '2027-04-13',
  end_date: '2027-04-16',
  notice_mm: 'သင်္ကြန် ပိတ်ရက်',
  notice_en: 'Thingyan holidays',
};

describe('closures (P8.WEB.06 – 08)', () => {
  it('Scenario: Thingyan at B3 — the body passes; notice_en may be null or absent', () => {
    expect(closureCreateSchema.parse(THINGYAN)).toStrictEqual(THINGYAN);
    expect(passes(closureCreateSchema, without(THINGYAN, 'notice_en'))).toBe(true);
    expect(passes(closureCreateSchema, { ...THINGYAN, notice_en: null })).toBe(true);
  });

  it('Scenario: no Myanmar notice — a blank notice_mm is too_small', () => {
    expect(issuesOf(closureCreateSchema, { ...THINGYAN, notice_mm: '  ' })).toMatchObject([
      { code: 'too_small', path: ['notice_mm'] },
    ]);
  });

  it('notice_mm and notice_en: 300 pass, 301 is too_big', () => {
    expect(passes(closureCreateSchema, { ...THINGYAN, notice_mm: text(300) })).toBe(true);
    expect(passes(closureCreateSchema, { ...THINGYAN, notice_en: 'a'.repeat(300) })).toBe(true);
    for (const member of ['notice_mm', 'notice_en']) {
      expect(issuesOf(closureCreateSchema, { ...THINGYAN, [member]: text(301) })).toMatchObject([
        { code: 'too_big', maximum: 300, path: [member] },
      ]);
    }
  });

  it('an edit always sends expected_updated_at (API-IDEM-04)', () => {
    const body = { end_date: '2026-10-05', expected_updated_at: '2026-10-04T09:00:00.000+06:30' };
    expect(closureUpdateSchema.parse(body)).toStrictEqual(body);
    expect(issuesOf(closureUpdateSchema, { end_date: '2026-10-05' })).toMatchObject([
      { code: 'invalid_type', path: ['expected_updated_at'] },
    ]);
  });

  it('an archive reason: 1,000 pass, 1,001 is too_big, none is fine', () => {
    expect(passes(archiveRequestSchema, { reason: 'a'.repeat(1000) })).toBe(true);
    expect(passes(archiveRequestSchema, {})).toBe(true);
    expect(issuesOf(archiveRequestSchema, { reason: 'a'.repeat(1001) })).toMatchObject([
      { code: 'too_big', maximum: 1000, path: ['reason'] },
    ]);
  });
});

describe('sharePreviewQuerySchema (P8.WEB.10)', () => {
  it('Scenario: locale=fr and path=/book are refused; my / en and / or /branches/B3 pass', () => {
    expect(passes(sharePreviewQuerySchema, { locale: 'en', path: '/' })).toBe(true);
    expect(passes(sharePreviewQuerySchema, { locale: 'my', path: '/branches/B3' })).toBe(true);
    expect(issuesOf(sharePreviewQuerySchema, { locale: 'fr', path: '/' })).toMatchObject([
      { path: ['locale'] },
    ]);
    expect(issuesOf(sharePreviewQuerySchema, { locale: 'en', path: '/book' })).toMatchObject([
      { path: ['path'] },
    ]);
  });
});

describe('response members', () => {
  it('Scenario: Without a booking code the customer stays hidden — the members are absent', () => {
    const booking = {
      booking_id: '0190c3a0-0000-7000-8000-0000000000b1',
      starts_at: '2026-10-13T14:00:00+06:30',
      booked_employee: { id: '0190c3a0-0000-7000-8000-0000000000e4', display_name: 'Ko Aung' },
    };
    expect(affectedBookingSchema.parse(booking)).toStrictEqual(booking);
  });

  it('a team row has no phone member (P8-RULE-11)', () => {
    const row = {
      employee_id: '0190c3a0-0000-7000-8000-0000000000e4',
      employee_code: 'E004',
      name_mm: 'ကိုအောင်',
      name_en: 'Ko Aung',
      photo_url: null,
      public_profile: true,
      public_specialty_mm: null,
      public_specialty_en: 'Fades and beard trims',
      public_rating: 4.5,
      branches: [{ code: 'B3', name_mm: 'ပွိုင့် ၃.၀', name_en: 'Point 3.0' }],
      today_branches: [],
      shown_on_site: true,
      actions: { can_edit_profile: true, can_rate: true },
    };
    expect(passes(teamProfileSchema, row)).toBe(true);
    expect(issuesOf(teamProfileSchema, { ...row, phone: '09 7700 0004' })).toMatchObject([
      { code: 'unrecognized_keys' },
    ]);
  });

  it('the bounds are the numbers of Part 8 §17', () => {
    expect(WebsiteLimits).toMatchObject({ HERO_TITLE: 80, SEO_TITLE: 70, ANNOUNCEMENT_TEXT: 200 });
  });
});
