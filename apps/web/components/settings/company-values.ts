import {
  type CompanyDto,
  type CompanyUpdate,
  type companyUpdateSchema,
  normalizeSocialLinks,
} from '@point/shared';
import type { z } from 'zod';

// The company form's values and the body of its Save (add-company-profile design D8 · tasks 4.1 / 4.5 ·
// CG-API-06): the inputs hold text — a stored null is the empty string, so an untouched field is never
// "changed" — and their names are the members of the API, so the schema's issues and the API's
// `errors[].field` land on them as they are. Save sends the members the user changed, as the schema
// parsed them (trimmed, blank → null), and `expected_updated_at` = the `updated_at` the form loaded.
// `social_links` is replaced as a whole (P1.CO.02), so a change of any link sends all of them.

/** The form's input: the request schema's input (members by their API names). */
export type CompanyFormInput = z.input<typeof companyUpdateSchema>;

/** The values the form starts from, for a company as the API returns it. */
export interface CompanyFormValues {
  readonly name_mm: string;
  readonly name_en: string;
  readonly phone: string;
  readonly email: string;
  readonly address_mm: string;
  readonly address_en: string;
  readonly website_url: string;
  readonly social_links: {
    readonly facebook: string;
    readonly tiktok: string;
    readonly viber: string;
    readonly instagram: string;
    readonly youtube: string;
    readonly other: { label: string; url: string }[];
  };
}

/** The link members of `social_links` other than the list (Part 1 v1.7 `SocialLinks`). */
export const LINK_MEMBERS = ['facebook', 'tiktok', 'viber', 'instagram', 'youtube'] as const;
export type LinkMember = (typeof LINK_MEMBERS)[number];

const TEXT_MEMBERS = [
  'name_mm',
  'name_en',
  'phone',
  'email',
  'address_mm',
  'address_en',
  'website_url',
] as const;

export function valuesOf(company: CompanyDto): CompanyFormValues {
  const links = company.social_links;
  return {
    name_mm: company.name_mm,
    name_en: company.name_en ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    address_mm: company.address_mm ?? '',
    address_en: company.address_en ?? '',
    website_url: company.website_url ?? '',
    social_links: {
      facebook: links.facebook ?? '',
      tiktok: links.tiktok ?? '',
      viber: links.viber ?? '',
      instagram: links.instagram ?? '',
      youtube: links.youtube ?? '',
      other: (links.other ?? []).map((link) => ({ label: link.label, url: link.url })),
    },
  };
}

/** React Hook Form's `dirtyFields`: true where an input differs from the values the form started from. */
export type DirtyTree =
  boolean | undefined | readonly DirtyTree[] | { readonly [member: string]: DirtyTree };

/** Whether anything under this node of `dirtyFields` changed. */
export function anyDirty(node: DirtyTree): boolean {
  if (node === undefined || typeof node === 'boolean') return node === true;
  return Object.values(node).some(anyDirty);
}

/** The body of Save: the changed members as parsed, and the loaded `updated_at`. */
export function companyPatch(
  parsed: CompanyUpdate,
  dirty: { readonly [member: string]: DirtyTree },
  expectedUpdatedAt: string,
): CompanyUpdate {
  const body: { -readonly [K in keyof CompanyUpdate]?: CompanyUpdate[K] } = {};
  const copy = <K extends keyof CompanyUpdate>(member: K) => {
    body[member] = parsed[member];
  };
  for (const member of TEXT_MEMBERS) if (anyDirty(dirty[member])) copy(member);
  if (anyDirty(dirty.social_links))
    body.social_links = normalizeSocialLinks(parsed.social_links ?? {});
  return { ...body, expected_updated_at: expectedUpdatedAt };
}
