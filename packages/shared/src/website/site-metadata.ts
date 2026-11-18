import type { Locale } from '../format/words.js';
import { WebsiteWarning } from '../schemas/website.js';

// The one derivation of a page's link-preview metadata (P8.WEB.10 · FE-SEO-01 / 02 / 04 · owner WM6 ★ ·
// WM7 ★ · add-website-management design D10): the staff share preview (P8.WEB.10) and the public
// pages' `generateMetadata` (add-public-website-pages) call this function, so the two never differ.
// Pure: the share image comes in as `{ url, width, height }` (absolute URL). The inputs are
// structural, so the admin `SiteContent` and the public `PublicSite` content both fit.

/** Above this many characters the title gets `title_too_long` (AD-WEB-04 · Part 8 §17). */
export const SHARE_TITLE_WARN_LENGTH = 70;
/** Above this many characters the description gets `description_too_long` (Part 8 §17). */
export const SHARE_DESCRIPTION_WARN_LENGTH = 160;

/** A Myanmar / English text of the site (`site.seo_title`, `site.seo_description`). */
export interface SiteMetadataText {
  readonly mm: string;
  readonly en: string | null;
}

export interface SiteMetadataImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export interface SiteMetadataInput {
  /** `SITE_ORIGIN`, e.g. `https://point.test`. */
  readonly siteOrigin: string;
  readonly locale: Locale;
  /** `/` or `/branches/<code>`. */
  readonly path: string;
  readonly company: { readonly name_mm: string; readonly name_en: string | null };
  readonly content: {
    readonly seo_title: SiteMetadataText | null;
    readonly seo_description: SiteMetadataText | null;
  };
  readonly shareImage: SiteMetadataImage | null;
  /** The branch of a branch page — public and ACTIVE (the caller answers 404 otherwise). */
  readonly branch?: {
    readonly name_mm: string;
    readonly name_en: string | null;
    readonly address_mm: string | null;
    readonly address_en: string | null;
  };
}

export interface SiteMetadata {
  /** The canonical address of the page in its language (FE-SEO-04): `SITE_ORIGIN/<locale><path>`. */
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  readonly image: SiteMetadataImage | null;
  readonly siteName: string;
  readonly warnings: readonly { readonly code: WebsiteWarning }[];
}

/** A text empty after trimming counts as not set (proposal reading 2). */
const filled = (value: string | null | undefined): string | null =>
  value === null || value === undefined || value.trim() === '' ? null : value;

/** The text of the page's language; English falls back to Myanmar (D-DB-04 · FE-L10N-02). */
const inLocale = (
  locale: Locale,
  mm: string | null | undefined,
  en: string | null | undefined,
): string | null => (locale === 'en' ? (filled(en) ?? filled(mm)) : filled(mm));

/** A name: the page's language, else the Myanmar name (always present). */
const nameIn = (
  locale: Locale,
  named: { readonly name_mm: string; readonly name_en: string | null },
) => inLocale(locale, named.name_mm, named.name_en) ?? named.name_mm;

/** The title, description, image and warnings of one page (spec "The share preview shows exactly …"). */
export function siteMetadata(input: SiteMetadataInput): SiteMetadata {
  const { locale, company, content, branch } = input;
  const companyName = nameIn(locale, company);
  const homeDescription = inLocale(
    locale,
    content.seo_description?.mm,
    content.seo_description?.en,
  );
  const title =
    branch === undefined
      ? (inLocale(locale, content.seo_title?.mm, content.seo_title?.en) ?? companyName)
      : `${companyName} — ${nameIn(locale, branch)}`;
  const description =
    branch === undefined
      ? homeDescription
      : (inLocale(locale, branch.address_mm, branch.address_en) ?? homeDescription);
  const warnings: { code: WebsiteWarning }[] = [];
  if (input.shareImage === null) warnings.push({ code: WebsiteWarning.SHARE_IMAGE_MISSING });
  if (title.length > SHARE_TITLE_WARN_LENGTH)
    warnings.push({ code: WebsiteWarning.TITLE_TOO_LONG });
  if (description !== null && description.length > SHARE_DESCRIPTION_WARN_LENGTH) {
    warnings.push({ code: WebsiteWarning.DESCRIPTION_TOO_LONG });
  }
  return {
    url: `${input.siteOrigin}/${locale}${input.path === '/' ? '' : input.path}`,
    title,
    description,
    image: input.shareImage,
    siteName: companyName,
    warnings,
  };
}
