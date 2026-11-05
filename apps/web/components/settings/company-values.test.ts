import { describe, expect, it } from 'vitest';

import { type CompanyDto, CompanyStatus, companySchema, companyUpdateSchema } from '@point/shared';

import { type CompanyFormInput, companyPatch, valuesOf } from './company-values';

// add-company-profile task 4.5 — "Save sends only the changed members": a member is changed when its
// input differs from the company the form loaded, whatever React Hook Form tracked; `social_links` is
// replaced as a whole (P1.CO.02), so an added, removed or moved link sends every link.

const AT_9 = '2026-10-05T09:00:00.000+06:30';
const MAP_1 = { label: 'Branch map 1', url: 'https://point.test/map/1' };
const MAP_2 = { label: 'Branch map 2', url: 'https://point.test/map/2' };

const LOADED: CompanyDto = companySchema.parse({
  id: '0199a3f2-0000-7000-8000-000000000c01',
  name_mm: 'ပွိုင့် ဘာဘာရှော့',
  name_en: 'Point Barbershop',
  logo_url: null,
  phone: null,
  email: null,
  address_mm: null,
  address_en: null,
  website_url: null,
  social_links: { facebook: 'https://www.facebook.com/point.test', other: [MAP_1, MAP_2] },
  status: CompanyStatus.ACTIVE,
  updated_at: AT_9,
});

const patchOf = (current: CompanyFormInput) =>
  companyPatch(companyUpdateSchema.parse(current), current, LOADED);

const withOther = (other: { label: string; url: string }[]): CompanyFormInput => {
  const start = valuesOf(LOADED);
  return { ...start, social_links: { ...start.social_links, other } };
};

describe('companyPatch — the changed members, compared with the loaded company', () => {
  it('nothing changed: only expected_updated_at', () => {
    expect(patchOf(valuesOf(LOADED))).toStrictEqual({ expected_updated_at: AT_9 });
  });

  it('the other links moved: every link is sent in the new order', () => {
    expect(patchOf(withOther([MAP_2, MAP_1]))).toStrictEqual({
      social_links: { facebook: 'https://www.facebook.com/point.test', other: [MAP_2, MAP_1] },
      expected_updated_at: AT_9,
    });
  });

  it('a link removed and the same one added back in its place: nothing changed', () => {
    expect(patchOf(withOther([{ ...MAP_1 }, { ...MAP_2 }]))).toStrictEqual({
      expected_updated_at: AT_9,
    });
  });
});
