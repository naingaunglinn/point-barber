import { z } from 'zod';

import {
  type Branch,
  type BranchCreateBody,
  type BranchUpdateBody,
  branchCreateSchema,
  branchUpdateSchema,
} from '@point/shared';

// add-branch-management — the branch form's values and the bodies they become (P1.BR.02 · P1.BR.04 ·
// AD-FORM-03 / 04 · design D4 · D9). Every value is the text of its input; the body is checked by the
// API's own schema (`branchCreateSchema` / `branchUpdateSchema`), so the form shows the messages the API
// would send, on the same member paths (`social_links.other.0.url`). An edit sends only the members
// whose input changed, and `expected_updated_at` (API-IDEM-04).

/** The four links of the brief's Website section, then Viber (free text — a `viber://` link or a phone). */
export const SOCIAL_LINKS = ['facebook', 'tiktok', 'instagram', 'youtube', 'viber'] as const;
export type SocialLinkKey = (typeof SOCIAL_LINKS)[number];

/** `is_public` as the form's choice. */
export const PUBLIC = { SHOWN: 'shown', HIDDEN: 'hidden' } as const;
type Public = (typeof PUBLIC)[keyof typeof PUBLIC];

export interface OtherLinkValues {
  label: string;
  url: string;
}

export interface BranchFormValues {
  code: string;
  name_mm: string;
  name_en: string;
  phone: string;
  email: string;
  address_mm: string;
  address_en: string;
  latitude: string;
  longitude: string;
  location_radius_meters: string;
  map_url: string;
  is_public: Public;
  website_url: string;
  social_links: Record<SocialLinkKey, string> & { other: OtherLinkValues[] };
}

/** The optional text members: blank → null (design D4). */
const TEXT_MEMBERS = [
  'name_en',
  'phone',
  'email',
  'address_mm',
  'address_en',
  'map_url',
  'website_url',
] as const;
const NUMBER_MEMBERS = ['latitude', 'longitude', 'location_radius_meters'] as const;

/** A new branch: every input empty and the branch shown on the website (P1.BR.02 default). */
export function emptyBranchValues(): BranchFormValues {
  return {
    code: '',
    name_mm: '',
    name_en: '',
    phone: '',
    email: '',
    address_mm: '',
    address_en: '',
    latitude: '',
    longitude: '',
    location_radius_meters: '',
    map_url: '',
    is_public: PUBLIC.SHOWN,
    website_url: '',
    social_links: { facebook: '', tiktok: '', instagram: '', youtube: '', viber: '', other: [] },
  };
}

const textOf = (value: string | null | undefined): string => value ?? '';
const numberText = (value: number | null): string => (value === null ? '' : String(value));

/** The inputs of a stored branch. */
export function branchValues(branch: Branch): BranchFormValues {
  const links = branch.social_links;
  return {
    code: branch.code,
    name_mm: branch.name_mm,
    name_en: textOf(branch.name_en),
    phone: textOf(branch.phone),
    email: textOf(branch.email),
    address_mm: textOf(branch.address_mm),
    address_en: textOf(branch.address_en),
    latitude: numberText(branch.latitude),
    longitude: numberText(branch.longitude),
    location_radius_meters: numberText(branch.location_radius_meters),
    map_url: textOf(branch.map_url),
    is_public: branch.is_public ? PUBLIC.SHOWN : PUBLIC.HIDDEN,
    website_url: textOf(branch.website_url),
    social_links: {
      facebook: textOf(links.facebook),
      tiktok: textOf(links.tiktok),
      instagram: textOf(links.instagram),
      youtube: textOf(links.youtube),
      viber: textOf(links.viber),
      other: (links.other ?? []).map(({ label, url }) => ({ label, url })),
    },
  };
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * A number input: blank → null; a decimal → the number; anything else stays text, so the schema answers
 * `invalid_type` (`error.invalid_type`) as the API would.
 */
function numberOf(text: string): number | string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return DECIMAL.test(trimmed) ? Number(trimmed) : trimmed;
}

const blank = (text: string) => text.trim() === '';

/** The links as sent: the filled links, and every Other row (a blank row asks for its label). */
function socialLinksOf(values: BranchFormValues['social_links']): Record<string, unknown> {
  const links: Record<string, unknown> = {};
  for (const key of SOCIAL_LINKS) if (!blank(values[key])) links[key] = values[key];
  if (values.other.length > 0) links.other = values.other.map(({ label, url }) => ({ label, url }));
  return links;
}

/** P1.BR.02: the code, the names, the filled members; an empty radius takes the company setting (D5). */
export function createBody(values: BranchFormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {
    code: values.code,
    name_mm: values.name_mm,
    is_public: values.is_public === PUBLIC.SHOWN,
  };
  for (const key of TEXT_MEMBERS) if (!blank(values[key])) body[key] = values[key];
  for (const key of NUMBER_MEMBERS) {
    const value = numberOf(values[key]);
    if (value !== null) body[key] = value;
  }
  const links = socialLinksOf(values.social_links);
  if (Object.keys(links).length > 0) body.social_links = links;
  return body;
}

/**
 * P1.BR.04: the members whose input differs from the stored branch's — a cleared input is `null` — and
 * the stored `updated_at` as `expected_updated_at`. Never the code (owner BR1).
 */
export function updateBody(
  values: BranchFormValues,
  stored: BranchFormValues,
  expectedUpdatedAt: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (values.name_mm !== stored.name_mm) body.name_mm = values.name_mm;
  for (const key of TEXT_MEMBERS) {
    if (values[key] !== stored[key]) body[key] = blank(values[key]) ? null : values[key];
  }
  for (const key of NUMBER_MEMBERS) {
    if (values[key] !== stored[key]) body[key] = numberOf(values[key]);
  }
  if (values.is_public !== stored.is_public) body.is_public = values.is_public === PUBLIC.SHOWN;
  if (JSON.stringify(values.social_links) !== JSON.stringify(stored.social_links)) {
    body.social_links = socialLinksOf(values.social_links);
  }
  body.expected_updated_at = expectedUpdatedAt;
  return body;
}

/** The create form's schema: the inputs → the body → `branchCreateSchema`. */
export const createFormSchema: z.ZodType<BranchCreateBody, BranchFormValues> = z
  .custom<BranchFormValues>()
  .transform((values): unknown => createBody(values))
  .pipe(branchCreateSchema);

/** The edit form's schema for one stored branch: the changed members → `branchUpdateSchema`. */
export function updateFormSchema(
  stored: BranchFormValues,
  expectedUpdatedAt: string,
): z.ZodType<BranchUpdateBody, BranchFormValues> {
  return z
    .custom<BranchFormValues>()
    .transform((values): unknown => updateBody(values, stored, expectedUpdatedAt))
    .pipe(branchUpdateSchema);
}
