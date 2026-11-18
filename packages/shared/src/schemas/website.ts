import { z } from 'zod';

import { ErrorCode, FieldIssueCode } from '../constants/error-codes.js';
import { CATALOGUE_CODE_PREFIX } from './catalogue-code.js';
import { warningSchema } from './sales.js';
import { timeOfDaySchema } from './schedule.js';
import { employeeRefSchema, userRefSchema, wireDate, wireDateTime } from './wire.js';

// Website management (API Part 8 P8.WEB.01 – 12 · §16 – §18 · add-website-management task 1.4): the
// shapes of OpenAPI Part 8. Requests are plain z.object (unknown members stripped — CG-API-03),
// responses strict. Shape and length only: the rules that need today or the stored row (announcement
// dates — owner WM2, closure dates, a repeated weekday, the per-day hours — owner WM3) run in the writes.

/** The bounds of Part 8 §17 and the OpenAPI schemas. */
export const WebsiteLimits = {
  HERO_TITLE: 80,
  HERO_SUBTITLE: 160,
  SEO_TITLE: 70,
  SEO_DESCRIPTION: 160,
  ANNOUNCEMENT_TEXT: 200,
  CLOSURE_NOTICE: 300,
  ARCHIVE_REASON: 1000,
  WEEK_DAYS: 7,
} as const;

/** `warnings[].code` of the website endpoints (Part 8 §16 · API-DATA-10 · owner WM9). */
export const WebsiteWarning = {
  BOOKINGS_IN_CLOSURE: 'bookings_in_closure',
  TRUNCATED: 'truncated',
  SHARE_IMAGE_MISSING: 'share_image_missing',
  TITLE_TOO_LONG: 'title_too_long',
  DESCRIPTION_TOO_LONG: 'description_too_long',
} as const;

export type WebsiteWarning = (typeof WebsiteWarning)[keyof typeof WebsiteWarning];

/** A site text: `mm` 0 … max after trimming (proposal reading 2), `en` null or ≤ max. */
const siteText = (max: number) =>
  z.object({ mm: z.string().trim().max(max), en: z.string().trim().max(max).nullable() });

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** P8.WEB.02 body — `SiteContentWrite`: the whole content in one PUT (P8-RULE-11). */
export const siteContentWriteSchema = z.object({
  hero_title: siteText(WebsiteLimits.HERO_TITLE),
  hero_subtitle: siteText(WebsiteLimits.HERO_SUBTITLE),
  cover_attachment_id: z.uuid().nullable(),
  share_image_attachment_id: z.uuid().nullable(),
  seo_title: siteText(WebsiteLimits.SEO_TITLE).nullable(),
  seo_description: siteText(WebsiteLimits.SEO_DESCRIPTION).nullable(),
  announcement: z
    .object({
      text_mm: z.string().trim().min(1).max(WebsiteLimits.ANNOUNCEMENT_TEXT),
      text_en: optionalText(WebsiteLimits.ANNOUNCEMENT_TEXT),
      start_date: wireDate,
      end_date: wireDate,
    })
    .nullable(),
  show_prices: z.boolean(),
  show_barbers: z.boolean(),
  expected_updated_at: wireDateTime.nullable().optional(),
});

const hoursDay = {
  day_of_week: z.int().min(1).max(WebsiteLimits.WEEK_DAYS),
  is_closed: z.boolean(),
  opens_at: timeOfDaySchema.nullable(),
  closes_at: timeOfDaySchema.nullable(),
};

type HoursDay = z.infer<z.ZodObject<typeof hoursDay>>;

/**
 * The per-day rule of P8.WEB.04 (P8-RULE-12 · owner WM3 ★ · design D5), checked in this order: a closed
 * day with a time; an open day without both times; closing at `00:00` (midnight is the next day — no
 * overnight, D-PLT-15); any other closing at or before the opening. Null when the day is valid.
 */
export function hoursDayCode(day: HoursDay): ErrorCode | null {
  if (day.is_closed) {
    return day.opens_at === null && day.closes_at === null ? null : ErrorCode.TIMES_NOT_ALLOWED;
  }
  if (day.opens_at === null || day.closes_at === null) return ErrorCode.TIMES_REQUIRED;
  if (day.closes_at === '00:00') return ErrorCode.OVERNIGHT_NOT_ALLOWED;
  // `HH:mm` texts sort as their times.
  return day.closes_at <= day.opens_at ? ErrorCode.CLOSES_BEFORE_OPENS : null;
}

/**
 * P8.WEB.04 body — `BranchHoursWrite`: exactly seven days, each weekday once (else `invalid_value` at
 * `days`), and every day checked — one `errors[]` item per wrong day at `days[<index>]`, all together.
 */
export const branchHoursWriteSchema = z
  .object({
    days: z.array(z.object(hoursDay)).length(WebsiteLimits.WEEK_DAYS),
    expected_updated_at: wireDateTime.nullable().optional(),
  })
  .superRefine((body, ctx) => {
    const weekdays = new Set(body.days.map((day) => day.day_of_week));
    if (weekdays.size !== body.days.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['days'],
        message: `${CATALOGUE_CODE_PREFIX}${FieldIssueCode.INVALID_VALUE}`,
      });
    }
    body.days.forEach((day, index) => {
      const code = hoursDayCode(day);
      if (code !== null) {
        ctx.addIssue({ code: 'custom', path: ['days', index], message: `${CATALOGUE_CODE_PREFIX}${code}` });
      }
    });
  });

const noticeMm = z.string().trim().min(1).max(WebsiteLimits.CLOSURE_NOTICE);

/** P8.WEB.06 body — `ClosureCreate`. */
export const closureCreateSchema = z.object({
  branch_id: z.uuid(),
  start_date: wireDate,
  end_date: wireDate,
  notice_mm: noticeMm,
  notice_en: optionalText(WebsiteLimits.CLOSURE_NOTICE),
});

/** P8.WEB.07 body — `ClosureUpdate`: any member, always the `updated_at` last read (API-IDEM-04). */
export const closureUpdateSchema = z.object({
  start_date: wireDate.optional(),
  end_date: wireDate.optional(),
  notice_mm: noticeMm.optional(),
  notice_en: optionalText(WebsiteLimits.CLOSURE_NOTICE),
  expected_updated_at: wireDateTime,
});

/** P8.WEB.08 body — `ArchiveRequest`; the reason goes to the audit row. */
export const archiveRequestSchema = z.object({
  reason: optionalText(WebsiteLimits.ARCHIVE_REASON),
});

/** P8.WEB.10 query: `locale` `my` / `en`, `path` `/` or `/branches/<code>`. */
export const sharePreviewQuerySchema = z.object({
  locale: z.enum(['my', 'en']),
  path: z.union([z.literal('/'), z.string().regex(/^\/branches\/[A-Z0-9]{1,10}$/)]),
});

/** P8.WEB.12 body — `RevalidateRequest`; the tags are checked against the branches in the write. */
export const revalidateRequestSchema = z.object({ tags: z.array(z.string()).optional() });

export type SiteContentWriteBody = z.infer<typeof siteContentWriteSchema>;
export type BranchHoursWriteBody = z.infer<typeof branchHoursWriteSchema>;
export type ClosureCreateBody = z.infer<typeof closureCreateSchema>;
export type ClosureUpdateBody = z.infer<typeof closureUpdateSchema>;
export type ArchiveRequestBody = z.infer<typeof archiveRequestSchema>;
export type SharePreviewQuery = z.infer<typeof sharePreviewQuerySchema>;
export type RevalidateRequestBody = z.infer<typeof revalidateRequestSchema>;

const textOut = z.strictObject({ mm: z.string(), en: z.string().nullable() });
const imageOut = z.strictObject({ attachment_id: z.uuid(), url: z.string() }).nullable();
const branchNames = { code: z.string(), name_mm: z.string(), name_en: z.string().nullable() };

/** `SiteContent` — the nine keys resolved, the image paths, the newest row's save. */
export const siteContentSchema = z.strictObject({
  hero_title: textOut,
  hero_subtitle: textOut,
  cover_image: imageOut,
  share_image: imageOut,
  seo_title: textOut.nullable(),
  seo_description: textOut.nullable(),
  announcement: z
    .strictObject({
      text_mm: z.string(),
      text_en: z.string().nullable().optional(),
      start_date: wireDate,
      end_date: wireDate,
    })
    .nullable(),
  show_prices: z.boolean(),
  show_barbers: z.boolean(),
  site_origin: z.string(),
  updated_at: wireDateTime.nullable(),
  updated_by: userRefSchema.nullable(),
  live_within_seconds: z.int(),
});

/** `WebsiteOverview` (P8.WEB.01). */
export const websiteOverviewSchema = z.strictObject({
  site_origin: z.string(),
  content: siteContentSchema,
  branches: z.array(
    z.strictObject({
      id: z.uuid(),
      ...branchNames,
      is_public: z.boolean(),
      map_url: z.string().nullable(),
      hours_configured: z.boolean(),
      next_closure: z
        .strictObject({
          start_date: wireDate,
          end_date: wireDate,
          notice_mm: z.string(),
          notice_en: z.string().nullable(),
        })
        .nullable(),
      editable: z.boolean(),
    }),
  ),
  counts: z.strictObject({
    public_branches: z.int(),
    services_on_website: z.int(),
    public_team: z.int(),
  }),
  actions: z.strictObject({ can_edit_content: z.boolean(), can_revalidate: z.boolean() }),
});

/** `BranchHoursWeek` (P8.WEB.03) — Monday first; no rows → `configured = false`, `days = []`. */
export const branchHoursWeekSchema = z.strictObject({
  branch_id: z.uuid(),
  configured: z.boolean(),
  days: z.array(z.strictObject(hoursDay)),
  updated_at: wireDateTime.nullable(),
  updated_by: userRefSchema.nullable(),
});

/** `BranchClosure` — `state` is computed, never stored (design D6). */
export const branchClosureSchema = z.strictObject({
  id: z.uuid(),
  branch_id: z.uuid(),
  start_date: wireDate,
  end_date: wireDate,
  notice_mm: z.string(),
  notice_en: z.string().nullable(),
  state: z.enum(['upcoming', 'current', 'ended', 'archived']),
  created_by: userRefSchema,
  created_at: wireDateTime,
  updated_at: wireDateTime,
  archived_at: wireDateTime.nullable(),
});

/** `AffectedBooking` — the customer members are absent without a `booking.*` code for the branch (D7). */
export const affectedBookingSchema = z.strictObject({
  booking_id: z.uuid(),
  starts_at: wireDateTime,
  booked_employee: employeeRefSchema,
  customer_name: z.string().nullable().optional(),
  customer_phone: z.string().nullable().optional(),
});

/** `ClosureResult` (P8.WEB.06 / 07) — bookings listed, never cancelled (owner F8). */
export const closureResultSchema = z.strictObject({
  closure: branchClosureSchema,
  affected_bookings: z.array(affectedBookingSchema),
  warnings: z.array(warningSchema),
});

/** `TeamProfile` (P8.WEB.09) — no phone, e-mail or note member (P8-RULE-11). */
export const teamProfileSchema = z.strictObject({
  employee_id: z.uuid(),
  employee_code: z.string(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  photo_url: z.string().nullable(),
  public_profile: z.boolean(),
  public_specialty_mm: z.string().nullable(),
  public_specialty_en: z.string().nullable(),
  public_rating: z.number().nullable(),
  branches: z.array(z.strictObject(branchNames)),
  today_branches: z.array(
    z.strictObject({ ...branchNames, starts_at: wireDateTime, ends_at: wireDateTime }),
  ),
  shown_on_site: z.boolean(),
  actions: z.strictObject({ can_edit_profile: z.boolean(), can_rate: z.boolean() }),
});

/** `SharePreview` (P8.WEB.10). */
export const sharePreviewSchema = z.strictObject({
  url: z.string(),
  locale: z.enum(['my', 'en']),
  title: z.string(),
  description: z.string().nullable(),
  image: z.strictObject({ url: z.string(), width: z.int(), height: z.int() }).nullable(),
  site_name: z.string(),
  warnings: z.array(warningSchema),
});

/** `BookingQr` (P8.WEB.11 · D-WEB-02 · AD-QR-01). */
export const bookingQrSchema = z.strictObject({
  branch_id: z.uuid(),
  ...branchNames,
  url: z.string(),
  display_url: z.string(),
  logo_url: z.string().nullable(),
  is_public: z.boolean(),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
export type WebsiteOverview = z.infer<typeof websiteOverviewSchema>;
export type BranchHoursWeek = z.infer<typeof branchHoursWeekSchema>;
export type BranchClosure = z.infer<typeof branchClosureSchema>;
export type AffectedBooking = z.infer<typeof affectedBookingSchema>;
export type ClosureResult = z.infer<typeof closureResultSchema>;
export type TeamProfile = z.infer<typeof teamProfileSchema>;
export type SharePreview = z.infer<typeof sharePreviewSchema>;
export type BookingQr = z.infer<typeof bookingQrSchema>;
