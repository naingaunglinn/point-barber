import { describe, expect, it } from 'vitest';

import {
  SHARE_DESCRIPTION_WARN_LENGTH,
  SHARE_TITLE_WARN_LENGTH,
  type SiteMetadataInput,
  siteMetadata,
} from './site-metadata.js';

// add-website-management task 1.5 — spec "The share preview shows exactly what a link-preview crawler
// gets" (P8.WEB.10 · FE-SEO-01 / 02 / 04 · owner WM6 ★ · WM7 ★ · design D10): one derivation for the
// staff share preview and the public pages' metadata (add-public-website-pages). Fixture: the company
// and B3 of spec-fixtures §1, SITE_ORIGIN https://point.test, every site.* key at its default.

const COMPANY = { name_mm: 'ပွိုင့် ဘာဘာရှော့', name_en: 'Point Barbershop' };
const B3 = {
  name_mm: 'ပွိုင့် ၃.၀',
  name_en: 'Point 3.0',
  address_mm: null,
  address_en: 'No. 3, Example Road',
};
const SHARE_A = {
  url: 'https://point.test/api/v1/public/media/0190c3a0-0000-7000-8000-0000000000s1/original',
  width: 1200,
  height: 630,
};
const NO_SEO = { seo_title: null, seo_description: null };

const home = (members: Partial<SiteMetadataInput> = {}): SiteMetadataInput => ({
  siteOrigin: 'https://point.test',
  locale: 'en',
  path: '/',
  company: COMPANY,
  content: NO_SEO,
  shareImage: null,
  ...members,
});
const branchPage = (members: Partial<SiteMetadataInput> = {}): SiteMetadataInput =>
  home({ path: '/branches/B3', branch: B3, shareImage: SHARE_A, ...members });

describe('siteMetadata — the home page', () => {
  it('Scenario: The home page in English without SEO texts', () => {
    expect(siteMetadata(home())).toStrictEqual({
      url: 'https://point.test/en',
      title: 'Point Barbershop',
      description: null,
      image: null,
      siteName: 'Point Barbershop',
      warnings: [{ code: 'share_image_missing' }],
    });
  });

  it('the home page in Myanmar without SEO texts — the Myanmar company name', () => {
    expect(siteMetadata(home({ locale: 'my' }))).toMatchObject({
      url: 'https://point.test/my',
      title: 'ပွိုင့် ဘာဘာရှော့',
      description: null,
      siteName: 'ပွိုင့် ဘာဘာရှော့',
    });
  });

  it('with SEO texts in both languages each locale takes its own', () => {
    const content = {
      seo_title: { mm: 'ပွိုင့် ဆံပင်ညှပ်ဆိုင်', en: 'Point — haircuts in Yangon' },
      seo_description: { mm: 'ရန်ကုန်က ဆံပင်ညှပ်ဆိုင်', en: 'Haircuts and shaves in Yangon' },
    };
    expect(siteMetadata(home({ content, shareImage: SHARE_A }))).toMatchObject({
      title: 'Point — haircuts in Yangon',
      description: 'Haircuts and shaves in Yangon',
      image: SHARE_A,
      warnings: [],
    });
    expect(siteMetadata(home({ locale: 'my', content }))).toMatchObject({
      title: 'ပွိုင့် ဆံပင်ညှပ်ဆိုင်',
      description: 'ရန်ကုန်က ဆံပင်ညှပ်ဆိုင်',
    });
  });

  it('English falls back to Myanmar; an empty text counts as not set', () => {
    const content = {
      seo_title: { mm: 'ပွိုင့် ဆံပင်ညှပ်ဆိုင်', en: null },
      seo_description: { mm: '', en: '' },
    };
    expect(siteMetadata(home({ content }))).toMatchObject({
      title: 'ပွိုင့် ဆံပင်ညှပ်ဆိုင်',
      description: null,
    });
    const emptyTitle = { seo_title: { mm: '', en: null }, seo_description: null };
    expect(siteMetadata(home({ content: emptyTitle })).title).toBe('Point Barbershop');
  });

  it('Scenario: An SEO description in English only — the Myanmar preview has none', () => {
    const content = { seo_title: null, seo_description: { mm: '', en: 'Haircuts in Yangon' } };
    expect(siteMetadata(home({ content })).description).toBe('Haircuts in Yangon');
    expect(siteMetadata(home({ locale: 'my', content })).description).toBeNull();
  });

  it('a company without an English name uses the Myanmar one on the English page', () => {
    const company = { name_mm: 'ပွိုင့် ဘာဘာရှော့', name_en: null };
    expect(siteMetadata(home({ company }))).toMatchObject({
      title: 'ပွိုင့် ဘာဘာရှော့',
      siteName: 'ပွိုင့် ဘာဘာရှော့',
    });
  });
});

describe('siteMetadata — a branch page (owner WM6 ★ · WM7 ★)', () => {
  it('Scenario: The B3 page in English', () => {
    expect(siteMetadata(branchPage())).toStrictEqual({
      url: 'https://point.test/en/branches/B3',
      title: 'Point Barbershop — Point 3.0',
      description: 'No. 3, Example Road',
      image: SHARE_A,
      siteName: 'Point Barbershop',
      warnings: [],
    });
  });

  it('a Myanmar-only address on the English page — English falls back to Myanmar', () => {
    const branch = { ...B3, address_mm: 'အမှတ် ၃၊ နမူနာလမ်း', address_en: null };
    expect(siteMetadata(branchPage({ branch })).description).toBe('အမှတ် ၃၊ နမူနာလမ်း');
  });

  it('the Myanmar page names the Myanmar company and branch; no Myanmar address → the home description', () => {
    const content = {
      seo_title: null,
      seo_description: { mm: 'ရန်ကုန်က ဆံပင်ညှပ်ဆိုင်', en: null },
    };
    expect(siteMetadata(branchPage({ locale: 'my', content }))).toMatchObject({
      url: 'https://point.test/my/branches/B3',
      title: 'ပွိုင့် ဘာဘာရှော့ — ပွိုင့် ၃.၀',
      description: 'ရန်ကုန်က ဆံပင်ညှပ်ဆိုင်',
    });
  });

  it('no address and no home description → no description', () => {
    const branch = { ...B3, address_en: null };
    expect(siteMetadata(branchPage({ branch })).description).toBeNull();
  });

  it('Scenario: A long branch title — 16 + 3 + 59 = 78 characters', () => {
    const branch = {
      ...B3,
      name_en: 'Point 4.0 — Thingyan pop-up near the east gate of Shwedagon',
    };
    const metadata = siteMetadata(branchPage({ path: '/branches/B4', branch }));
    expect(metadata.title).toHaveLength(78);
    expect(metadata.warnings).toStrictEqual([{ code: 'title_too_long' }]);
  });
});

describe('siteMetadata — the warnings', () => {
  const withTitle = (length: number) =>
    home({
      shareImage: SHARE_A,
      content: { seo_title: { mm: '', en: 'a'.repeat(length) }, seo_description: null },
    });
  const withDescription = (length: number) =>
    home({
      shareImage: SHARE_A,
      content: { seo_title: null, seo_description: { mm: '', en: 'a'.repeat(length) } },
    });

  it('the thresholds are 70 and 160 (AD-WEB-04 · Part 8 §17)', () => {
    expect([SHARE_TITLE_WARN_LENGTH, SHARE_DESCRIPTION_WARN_LENGTH]).toStrictEqual([70, 160]);
  });

  it('a title of 70 characters has no warning, 71 has title_too_long', () => {
    expect(siteMetadata(withTitle(70)).warnings).toStrictEqual([]);
    expect(siteMetadata(withTitle(71)).warnings).toStrictEqual([{ code: 'title_too_long' }]);
  });

  it('a description of 160 characters has no warning, 161 has description_too_long', () => {
    expect(siteMetadata(withDescription(160)).warnings).toStrictEqual([]);
    expect(siteMetadata(withDescription(161)).warnings).toStrictEqual([
      { code: 'description_too_long' },
    ]);
  });

  it('no share image, a long title and a long description: three warnings in that order', () => {
    const branch = { ...B3, name_en: 'a'.repeat(60), address_en: 'b'.repeat(161) };
    expect(siteMetadata(branchPage({ branch, shareImage: null })).warnings).toStrictEqual([
      { code: 'share_image_missing' },
      { code: 'title_too_long' },
      { code: 'description_too_long' },
    ]);
  });
});
