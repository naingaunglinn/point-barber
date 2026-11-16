import { z } from 'zod';

import { ErrorCode } from '../constants/error-codes.js';
import { BranchStatus } from '../constants/status.js';
import { catalogueCode } from './catalogue-code.js';
import {
  COMPANY_LIMITS,
  type SocialLinks,
  httpUrl,
  normalizeSocialLinks,
  socialLinksSchema,
} from './company.js';
import { codeOf, wireDateTime } from './wire.js';

// P1.BR.01 `GET /v1/branches` — optional filter `status` 0 / 1, read from the query string.
export const branchesQuerySchema = z.object({
  status: z.coerce
    .number()
    .pipe(z.union([z.literal(BranchStatus.INACTIVE), z.literal(BranchStatus.ACTIVE)]))
    .optional(),
});

/**
 * OpenAPI Part 1 `BranchSummary` — reference data every staff member may read; it has no sensitive
 * member (P1.BR.01). The API builds it with one mapper that names all seven members (design D15).
 */
export const branchSummarySchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.literal([BranchStatus.INACTIVE, BranchStatus.ACTIVE]),
  is_public: z.boolean(),
});

/** OpenAPI Part 1 `BranchAssignment` — one item of P1.EMP.06 (Myanmar calendar dates). */
export const branchAssignmentSchema = z.strictObject({
  id: z.uuid(),
  branch: branchSummarySchema,
  effective_from: z.iso.date(),
  effective_to: z.iso.date().nullable(),
});

export type BranchesQuery = z.infer<typeof branchesQuerySchema>;
export type BranchSummary = z.infer<typeof branchSummarySchema>;
export type BranchAssignment = z.infer<typeof branchAssignmentSchema>;

// add-branch-management — P1.BR.02 – 05 (API Part 1 v1.7 · owner BR1 – BR3 · design D4). Request
// objects are plain z.object: an unknown member — `code` on an update (BR1) — is stripped (CG-API-03).
// No member has a default or a transform, so absent and null stay apart (D5) and the schemas give the
// OpenAPI document as they are; normalizeBranchMembers() runs after parsing.

/** Branch limits: DB Part 1 v3.4 columns, OpenAPI Part 1 v1.7 `BranchCreate`, owner BR3. */
export const BranchLimits = {
  CODE_MAX: 10,
  NAME_MAX: 255,
  PHONE_MAX: 50,
  EMAIL_MAX: 255,
  ADDRESS_MAX: 1000,
  LINK_MAX: COMPANY_LIMITS.LINK,
  LATITUDE_MAX: 90,
  LONGITUDE_MAX: 180,
  RADIUS_MIN: 10,
  RADIUS_MAX: 2000,
  REASON_MAX: 500,
} as const;

/**
 * `^[A-Z0-9]{1,10}$` (P1.BR.02 · Part 1 §13 #4): an empty code is one `too_small`, an 11-character
 * code one `too_big`, any other character `invalid_format`. The server never changes the case.
 */
export const branchCodeSchema = z
  .string()
  .trim()
  .min(1, { abort: true })
  .max(BranchLimits.CODE_MAX, { abort: true })
  .regex(/^[A-Z0-9]*$/);

const emailAddress = z.email();

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** The members a create sends besides the code, and that an update may send (BranchCreate). */
const branchMembers = {
  // The Myanmar name is required and never null (D-DB-04).
  name_mm: z.string().trim().min(1).max(BranchLimits.NAME_MAX),
  name_en: optionalText(BranchLimits.NAME_MAX),
  // Stored as typed: branches have no normalised phone column (API-DATA-06 is for customers).
  phone: optionalText(BranchLimits.PHONE_MAX),
  // A wrong address is the Part 1 catalogue code email_invalid (§11b); blank means none.
  email: z
    .string()
    .trim()
    .max(BranchLimits.EMAIL_MAX, { abort: true })
    .check(
      z.stringFormat(
        'email',
        (value) => value === '' || emailAddress.safeParse(value).success,
        catalogueCode(ErrorCode.EMAIL_INVALID),
      ),
    )
    .nullable()
    .optional(),
  address_mm: optionalText(BranchLimits.ADDRESS_MAX),
  address_en: optionalText(BranchLimits.ADDRESS_MAX),
  // The shared link member of add-company-profile: http(s), ≤ 1,000, blank parsed as null (BR3).
  website_url: httpUrl,
  social_links: socialLinksSchema.optional(),
  latitude: z
    .number()
    .min(-BranchLimits.LATITUDE_MAX)
    .max(BranchLimits.LATITUDE_MAX)
    .nullable()
    .optional(),
  longitude: z
    .number()
    .min(-BranchLimits.LONGITUDE_MAX)
    .max(BranchLimits.LONGITUDE_MAX)
    .nullable()
    .optional(),
  location_radius_meters: z
    .int()
    .min(BranchLimits.RADIUS_MIN)
    .max(BranchLimits.RADIUS_MAX)
    .nullable()
    .optional(),
  is_public: z.boolean().optional(),
  map_url: httpUrl,
};

/** P1.BR.02 body — OpenAPI `BranchCreate` (v1.7). */
export const branchCreateSchema = z.object({ code: branchCodeSchema, ...branchMembers });

/**
 * P1.BR.04 body — OpenAPI `BranchUpdate` (v1.7): every member optional (API-SHAPE-04); no `code`
 * (owner BR1), so a sent code is stripped; `name_mm: null` is `invalid_type`.
 */
export const branchUpdateSchema = branchCreateSchema
  .omit({ code: true })
  .partial()
  .extend({ expected_updated_at: wireDateTime.optional() });

/** P1.BR.05 body — 0 INACTIVE · 1 ACTIVE; the optional reason goes to the audit row only. */
export const branchStatusSchema = z.object({
  status: codeOf(BranchStatus),
  reason: z.string().trim().max(BranchLimits.REASON_MAX).optional(),
});

export type BranchCreateBody = z.infer<typeof branchCreateSchema>;
export type BranchUpdateBody = z.infer<typeof branchUpdateSchema>;
export type BranchStatusBody = z.infer<typeof branchStatusSchema>;

/** The answer for a stored `social_links` column: NULL → `{}` (`social_links` is never null). */
export function socialLinksOf(stored: unknown): SocialLinks {
  if (stored === null || stored === undefined) return {};
  return normalizeSocialLinks(socialLinksSchema.parse(stored));
}

/** The members of a create or update as they are stored: no `code`, no `expected_updated_at`. */
export interface BranchMembers {
  readonly name_mm?: string;
  readonly name_en?: string | null;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly address_mm?: string | null;
  readonly address_en?: string | null;
  readonly website_url?: string | null;
  readonly social_links?: SocialLinks;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly location_radius_meters?: number | null;
  readonly is_public?: boolean;
  readonly map_url?: string | null;
}

/** An optional text empty after trimming is stored as NULL (design D4). */
const blankToNull = (value: string | null): string | null => (value === '' ? null : value);

/**
 * The members of a parsed create or update body as they are stored (design D4): an optional text
 * empty after trimming → null, `social_links` normalised; an absent member stays absent and `null`
 * stays `null` (D5). The code of a create is taken from the body itself.
 */
export function normalizeBranchMembers(body: BranchCreateBody | BranchUpdateBody): BranchMembers {
  const {
    name_mm,
    name_en,
    phone,
    email,
    address_mm,
    address_en,
    website_url,
    social_links,
    latitude,
    longitude,
    location_radius_meters,
    is_public,
    map_url,
  } = body;
  return {
    ...(name_mm === undefined ? {} : { name_mm }),
    ...(name_en === undefined ? {} : { name_en: blankToNull(name_en) }),
    ...(phone === undefined ? {} : { phone: blankToNull(phone) }),
    ...(email === undefined ? {} : { email: blankToNull(email) }),
    ...(address_mm === undefined ? {} : { address_mm: blankToNull(address_mm) }),
    ...(address_en === undefined ? {} : { address_en: blankToNull(address_en) }),
    ...(website_url === undefined ? {} : { website_url: blankToNull(website_url) }),
    ...(social_links === undefined ? {} : { social_links: normalizeSocialLinks(social_links) }),
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
    ...(location_radius_meters === undefined ? {} : { location_radius_meters }),
    ...(is_public === undefined ? {} : { is_public }),
    ...(map_url === undefined ? {} : { map_url: blankToNull(map_url) }),
  };
}

/**
 * The members the public site shows (Part 8 `PublicBranch`) that an update can change, plus the
 * visibility flag: a change of one of them queues `site.revalidate` (API-PUB-03 · design D8).
 */
export const PUBLIC_BRANCH_MEMBERS = [
  'name_mm',
  'name_en',
  'address_mm',
  'address_en',
  'phone',
  'email',
  'map_url',
  'latitude',
  'longitude',
  'social_links',
  'is_public',
] as const;

/** OpenAPI Part 1 `Branch` (P1.BR.03): `BranchSummary` + its twelve own members, strict. */
export const branchSchema = z.strictObject({
  ...branchSummarySchema.shape,
  email: z.string().nullable(),
  address_mm: z.string().nullable(),
  address_en: z.string().nullable(),
  website_url: z.string().nullable(),
  social_links: socialLinksSchema,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  location_radius_meters: z.int().nullable(),
  // A Google Maps link (Part 1 `Branch.map_url` — format uri); written only through the create and
  // update schemas, so always http(s).
  map_url: z.url({ protocol: /^https?$/ }).nullable(),
  active_employees: z.int().min(0),
  created_at: wireDateTime,
  updated_at: wireDateTime,
});

/** The `context` of 409 `branch_in_use` (P1.BR.05 · P1-RULE-09 · owner BR2). */
export const branchInUseContextSchema = z.strictObject({
  open_bookings: z.int().min(0),
  open_sales: z.int().min(0),
  active_assignments: z.int().min(0),
});

export type Branch = z.infer<typeof branchSchema>;
export type BranchInUseContext = z.infer<typeof branchInUseContextSchema>;
