import { z } from 'zod';

import { ErrorCode } from '../constants/error-codes.js';
import { CompanyStatus } from '../constants/status.js';
import { catalogueCode } from './catalogue-code.js';
import { codeOf, wireDateTime } from './wire.js';

// The company profile (P1.CO.01 / P1.CO.02 · D-ORG-02 · D-WEB-03 · API Part 1 v1.7 CP1 / CP2 ·
// add-company-profile design D4): one schema for the form, the API and the OpenAPI document. Request
// schemas are plain z.object, so a member they do not define is stripped, never refused (CG-API-03);
// `logo_attachment_id` arrives with task group 6. Every bound is checked before the format and stops
// the checks after it (`abort`), so a link one character too long reports `too_big` and each failing
// member reports one issue. An optional text member that is blank after trimming parses as null
// (D-DB-04 — proposal reading 7); normalizeCompanyUpdate then drops the empty links (reading 8).

/** The bounds of Part 1 v1.7 (`CompanyUpdate`, `SocialLinks`) and of the DB Part 1 v3.4 columns. */
export const COMPANY_LIMITS = {
  NAME: 255,
  PHONE: 50,
  EMAIL: 255,
  ADDRESS: 1000,
  LINK: 1000,
  OTHER_LINKS: 10,
  OTHER_LABEL: 50,
} as const;

/** OpenAPI `pattern: '^https?://'` — case as written, so `HTTPS://…` is refused like the contract. */
const HTTP_PREFIX = /^https?:\/\//;

const blankAsNull = (value: string | null): string | null =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** Trimmed text, nullable and optional; blank after trimming is null. */
function optional<T extends z.ZodType<string, string>>(text: T) {
  return z.preprocess(blankAsNull, text.nullable()).optional();
}

/** A web address (CP2): at most 1,000 characters, then `http://` / `https://`, then a valid URL. */
const linkText = z
  .string()
  .trim()
  .max(COMPANY_LIMITS.LINK, { abort: true })
  .regex(HTTP_PREFIX, { abort: true })
  .check(z.url({ protocol: /^https?$/ }));

/**
 * An optional web address — a failure is the Zod issue `invalid_format` (API-ERR-03 · CP2); null or
 * blank clears the member. Shared with the branch links (`add-branch-management`).
 */
export const httpUrl = optional(linkText);

/** `SocialLinks` (Part 1 v1.7 — shared by the company and the branches): Viber stays free text. */
export const socialLinksSchema = z.object({
  facebook: httpUrl,
  tiktok: httpUrl,
  viber: optional(z.string().trim().max(COMPANY_LIMITS.LINK)),
  instagram: httpUrl,
  youtube: httpUrl,
  other: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(COMPANY_LIMITS.OTHER_LABEL),
        url: linkText,
      }),
    )
    .max(COMPANY_LIMITS.OTHER_LINKS)
    .optional(),
});

/** P1.CO.02 `PATCH /v1/company` — `CompanyUpdate` without `logo_attachment_id` (until group 6). */
export const companyUpdateSchema = z.object({
  name_mm: z.string().trim().min(1).max(COMPANY_LIMITS.NAME).optional(),
  name_en: optional(z.string().trim().max(COMPANY_LIMITS.NAME)),
  phone: optional(z.string().trim().max(COMPANY_LIMITS.PHONE)),
  // Kept as typed — not lower-cased like the sign-in address (design D4).
  email: optional(
    z
      .string()
      .trim()
      .max(COMPANY_LIMITS.EMAIL, { abort: true })
      .check(z.email(catalogueCode(ErrorCode.EMAIL_INVALID))),
  ),
  address_mm: optional(z.string().trim().max(COMPANY_LIMITS.ADDRESS)),
  address_en: optional(z.string().trim().max(COMPANY_LIMITS.ADDRESS)),
  website_url: httpUrl,
  social_links: socialLinksSchema.optional(),
  expected_updated_at: wireDateTime.optional(),
});

/** OpenAPI Part 1 `Company` — exactly the 12 members P1.CO.01 returns; `social_links` `{}` when none. */
export const companySchema = z.strictObject({
  id: z.uuid(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  logo_url: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address_mm: z.string().nullable(),
  address_en: z.string().nullable(),
  website_url: z.string().nullable(),
  social_links: socialLinksSchema,
  status: codeOf(CompanyStatus),
  updated_at: wireDateTime,
});

export type SocialLinks = z.infer<typeof socialLinksSchema>;
export type CompanyUpdate = z.infer<typeof companyUpdateSchema>;
export type CompanyDto = z.infer<typeof companySchema>;

/** The profile members a PATCH may change, as stored (design D3 step 3). */
export interface CompanyProfileValues {
  readonly name_mm: string;
  readonly name_en: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address_mm: string | null;
  readonly address_en: string | null;
  readonly website_url: string | null;
  readonly social_links: SocialLinks;
}

export type CompanyProfileChanges = Partial<CompanyProfileValues>;

const TEXT_MEMBERS = [
  'name_en',
  'phone',
  'email',
  'address_mm',
  'address_en',
  'website_url',
] as const;
const LINK_MEMBERS = ['facebook', 'tiktok', 'viber', 'instagram', 'youtube'] as const;

/** Links sent as null or blank are left out; an empty `other` list too (proposal reading 8). */
export function normalizeSocialLinks(links: SocialLinks): SocialLinks {
  const kept: SocialLinks = {};
  for (const member of LINK_MEMBERS) {
    const value = links[member];
    if (value !== undefined && value !== null) kept[member] = value;
  }
  if (links.other !== undefined && links.other.length > 0) kept.other = links.other;
  return kept;
}

/** The members of a parsed `CompanyUpdate` as they are stored; `expected_updated_at` is not one. */
export function normalizeCompanyUpdate(input: CompanyUpdate): CompanyProfileChanges {
  const changes: { -readonly [K in keyof CompanyProfileValues]?: CompanyProfileValues[K] } = {};
  if (input.name_mm !== undefined) changes.name_mm = input.name_mm;
  for (const member of TEXT_MEMBERS) {
    const value = input[member];
    if (value !== undefined) changes[member] = value;
  }
  if (input.social_links !== undefined)
    changes.social_links = normalizeSocialLinks(input.social_links);
  return changes;
}
