import { describe, expect, it } from 'vitest';

import { CATALOGUE_CODE_PREFIX } from './catalogue-code.js';
import {
  companySchema,
  companyUpdateSchema,
  normalizeCompanyUpdate,
  socialLinksSchema,
} from './company.js';

// add-company-profile tasks 1.4 / 1.5 — P1.CO.01 / P1.CO.02 with the bounds of API Part 1 v1.7 (CP1 · CP2):
// every bound at the limit and one past it, the field code of each failure as the API returns it
// (API-ERR-03: the catalogue code the schema names, else the Zod issue name), blank optional text
// stored as null (D-DB-04 — proposal reading 7), and unknown members stripped (CG-API-03). The values
// are the company contact rows of spec-fixtures §1.

interface Issue {
  readonly field: string;
  readonly code: string;
  readonly maximum?: number;
}

const fieldOf = (path: readonly PropertyKey[]) =>
  path.reduce<string>(
    (acc, key) =>
      typeof key === 'number'
        ? `${acc}[${key}]`
        : acc === ''
          ? String(key)
          : `${acc}.${String(key)}`,
    '',
  );

function issuesOf(value: unknown): Issue[] {
  const result = companyUpdateSchema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    field: fieldOf(issue.path),
    code: issue.message.startsWith(CATALOGUE_CODE_PREFIX)
      ? issue.message.slice(CATALOGUE_CODE_PREFIX.length)
      : issue.code,
    ...(issue.code === 'too_big' ? { maximum: Number(issue.maximum) } : {}),
  }));
}

const FIXTURE_LINKS = {
  facebook: 'https://www.facebook.com/point.test',
  tiktok: 'https://www.tiktok.com/@point.test',
  viber: '09 400 000 111',
};
/** A web address of exactly `length` characters. */
const linkOf = (length: number) => {
  const head = 'https://point.test/';
  return head + 'a'.repeat(length - head.length);
};
const otherLinks = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    label: `Branch map ${i + 1}`,
    url: `https://point.test/map/${i + 1}`,
  }));

describe('companyUpdateSchema — names (D-DB-04 · P1.CO.02)', () => {
  it('a blank Myanmar name is too_small; null is invalid_type', () => {
    expect(issuesOf({ name_mm: '   ' })).toStrictEqual([{ field: 'name_mm', code: 'too_small' }]);
    expect(issuesOf({ name_mm: null })).toStrictEqual([{ field: 'name_mm', code: 'invalid_type' }]);
  });

  it('names at 255 characters pass, 256 are too_big', () => {
    expect(issuesOf({ name_mm: 'မ'.repeat(255), name_en: 'P'.repeat(255) })).toStrictEqual([]);
    expect(issuesOf({ name_en: 'P'.repeat(256) })).toStrictEqual([
      { field: 'name_en', code: 'too_big', maximum: 255 },
    ]);
    expect(issuesOf({ name_mm: 'မ'.repeat(256) })).toStrictEqual([
      { field: 'name_mm', code: 'too_big', maximum: 255 },
    ]);
  });
});

describe('companyUpdateSchema — phone, e-mail, addresses (CP1)', () => {
  it('phone at 50 characters passes, 51 is too_big', () => {
    expect(issuesOf({ phone: '0'.repeat(50) })).toStrictEqual([]);
    expect(issuesOf({ phone: '0'.repeat(51) })).toStrictEqual([
      { field: 'phone', code: 'too_big', maximum: 50 },
    ]);
  });

  it('the phone is trimmed and kept as typed, never rewritten to E.164', () => {
    expect(companyUpdateSchema.parse({ phone: ' 09 400 000 111 ' })).toStrictEqual({
      phone: '09 400 000 111',
    });
  });

  it('"hello@" is email_invalid; the fixture address passes as typed, not lower-cased', () => {
    expect(issuesOf({ email: 'hello@' })).toStrictEqual([
      { field: 'email', code: 'email_invalid' },
    ]);
    expect(companyUpdateSchema.parse({ email: 'Hello@Point.test' })).toStrictEqual({
      email: 'Hello@Point.test',
    });
    expect(issuesOf({ email: `${'a'.repeat(250)}@x.test` })).toStrictEqual([
      { field: 'email', code: 'too_big', maximum: 255 },
    ]);
  });

  it('addresses at 1,000 characters pass, 1,001 are too_big', () => {
    expect(issuesOf({ address_mm: 'က'.repeat(1000), address_en: 'a'.repeat(1000) })).toStrictEqual(
      [],
    );
    expect(issuesOf({ address_en: 'a'.repeat(1001) })).toStrictEqual([
      { field: 'address_en', code: 'too_big', maximum: 1000 },
    ]);
    expect(issuesOf({ address_mm: 'က'.repeat(1001) })).toStrictEqual([
      { field: 'address_mm', code: 'too_big', maximum: 1000 },
    ]);
  });
});

describe('companyUpdateSchema — website and social links (CP1 · CP2)', () => {
  it('the fixture links pass and come back exactly as sent', () => {
    const body = { website_url: 'https://point.test', social_links: FIXTURE_LINKS };
    expect(companyUpdateSchema.parse(body)).toStrictEqual(body);
  });

  it.each(['javascript:alert(1)', 'www.facebook.com/point.test', 'HTTPS://point.test', 'https://'])(
    '%s is one invalid_format on each web-address member',
    (value) => {
      expect(issuesOf({ social_links: { facebook: value } })).toStrictEqual([
        { field: 'social_links.facebook', code: 'invalid_format' },
      ]);
      expect(issuesOf({ website_url: value })).toStrictEqual([
        { field: 'website_url', code: 'invalid_format' },
      ]);
      expect(issuesOf({ social_links: { other: [{ label: 'Map', url: value }] } })).toStrictEqual([
        { field: 'social_links.other[0].url', code: 'invalid_format' },
      ]);
    },
  );

  it.each(['tiktok', 'instagram', 'youtube'] as const)(
    '%s takes only http(s) addresses',
    (member) => {
      expect(issuesOf({ social_links: { [member]: 'ftp://point.test' } })).toStrictEqual([
        { field: `social_links.${member}`, code: 'invalid_format' },
      ]);
      expect(issuesOf({ social_links: { [member]: 'http://point.test' } })).toStrictEqual([]);
    },
  );

  it('a link at 1,000 characters passes; 1,001 is too_big only (the length is checked first)', () => {
    expect(
      issuesOf({ website_url: linkOf(1000), social_links: { youtube: linkOf(1000) } }),
    ).toStrictEqual([]);
    expect(issuesOf({ social_links: { instagram: linkOf(1001) } })).toStrictEqual([
      { field: 'social_links.instagram', code: 'too_big', maximum: 1000 },
    ]);
    expect(issuesOf({ website_url: 'x'.repeat(1001) })).toStrictEqual([
      { field: 'website_url', code: 'too_big', maximum: 1000 },
    ]);
  });

  it('Viber is free text — a viber:// link or a phone — up to 1,000 characters', () => {
    expect(
      issuesOf({ social_links: { viber: 'viber://chat?number=%2B959400000111' } }),
    ).toStrictEqual([]);
    expect(issuesOf({ social_links: { viber: '9'.repeat(1000) } })).toStrictEqual([]);
    expect(issuesOf({ social_links: { viber: '9'.repeat(1001) } })).toStrictEqual([
      { field: 'social_links.viber', code: 'too_big', maximum: 1000 },
    ]);
  });

  it('ten other links pass, eleven are too_big', () => {
    expect(issuesOf({ social_links: { other: otherLinks(10) } })).toStrictEqual([]);
    expect(issuesOf({ social_links: { other: otherLinks(11) } })).toStrictEqual([
      { field: 'social_links.other', code: 'too_big', maximum: 10 },
    ]);
  });

  it('an other-link label is 1 – 50 characters after trimming', () => {
    const link = (label: string) => ({
      social_links: { other: [{ label, url: 'https://point.test' }] },
    });
    expect(issuesOf(link('L'.repeat(50)))).toStrictEqual([]);
    expect(issuesOf(link('L'.repeat(51)))).toStrictEqual([
      { field: 'social_links.other[0].label', code: 'too_big', maximum: 50 },
    ]);
    expect(issuesOf(link('  '))).toStrictEqual([
      { field: 'social_links.other[0].label', code: 'too_small' },
    ]);
  });

  it('social_links is an object, never null (Part 1 CompanyUpdate)', () => {
    expect(issuesOf({ social_links: null })).toStrictEqual([
      { field: 'social_links', code: 'invalid_type' },
    ]);
  });
});

describe('companyUpdateSchema — members it does not define (CG-API-03)', () => {
  it('status, logo_attachment_id (until group 6) and unknown members are stripped', () => {
    expect(
      companyUpdateSchema.parse({
        status: 0,
        logo_attachment_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70',
        created_at: '2026-10-05T09:00:00+06:30',
        phone: '09 400 000 111',
        social_links: { facebook: FIXTURE_LINKS.facebook, x: 'https://x.test' },
      }),
    ).toStrictEqual({
      phone: '09 400 000 111',
      social_links: { facebook: FIXTURE_LINKS.facebook },
    });
  });

  it('expected_updated_at is an instant with its offset', () => {
    expect(
      companyUpdateSchema.parse({ expected_updated_at: '2026-10-05T09:00:00+06:30' }),
    ).toStrictEqual({ expected_updated_at: '2026-10-05T09:00:00+06:30' });
    expect(issuesOf({ expected_updated_at: '05/Oct/2026' })).toStrictEqual([
      { field: 'expected_updated_at', code: 'invalid_format' },
    ]);
  });
});

describe('normalizeCompanyUpdate — blank optional text is null (proposal readings 7 · 8)', () => {
  const normalized = (body: unknown) => normalizeCompanyUpdate(companyUpdateSchema.parse(body));

  it('blank optional members become null; members left out stay out', () => {
    expect(
      normalized({
        name_en: '',
        phone: '   ',
        email: '',
        address_mm: ' ',
        address_en: null,
        website_url: '',
        expected_updated_at: '2026-10-05T09:00:00+06:30',
      }),
    ).toStrictEqual({
      name_en: null,
      phone: null,
      email: null,
      address_mm: null,
      address_en: null,
      website_url: null,
    });
    expect(normalized({ name_mm: ' ပွိုင့် ဘာဘာရှော့ ' })).toStrictEqual({
      name_mm: 'ပွိုင့် ဘာဘာရှော့',
    });
    expect(normalized({})).toStrictEqual({});
  });

  it('links sent as null or blank are left out of social_links; an empty other list too', () => {
    expect(
      normalized({
        social_links: {
          facebook: null,
          tiktok: '  ',
          viber: '',
          instagram: 'https://www.instagram.com/point.test',
          other: [],
        },
      }),
    ).toStrictEqual({ social_links: { instagram: 'https://www.instagram.com/point.test' } });
    expect(normalized({ social_links: {} })).toStrictEqual({ social_links: {} });
    expect(normalized({ social_links: { other: otherLinks(2) } })).toStrictEqual({
      social_links: { other: otherLinks(2) },
    });
  });
});

describe('companySchema — the 12 members of Company (P1.CO.01 · task 1.5)', () => {
  const company = {
    id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70',
    name_mm: 'ပွိုင့် ဘာဘာရှော့',
    name_en: 'Point Barbershop',
    logo_url: null,
    phone: null,
    email: null,
    address_mm: null,
    address_en: null,
    website_url: null,
    social_links: {},
    status: 1,
    updated_at: '2026-10-05T09:00:00+06:30',
  };

  it('accepts the fixture company with no links stored', () => {
    expect(companySchema.parse(company)).toStrictEqual(company);
    expect(Object.keys(companySchema.shape)).toHaveLength(12);
  });

  it('refuses a member Company does not have', () => {
    expect(companySchema.safeParse({ ...company, created_at: company.updated_at }).success).toBe(
      false,
    );
    expect(companySchema.safeParse({ ...company, status: 2 }).success).toBe(false);
  });

  it('social_links holds the fixture links', () => {
    expect(socialLinksSchema.parse(FIXTURE_LINKS)).toStrictEqual(FIXTURE_LINKS);
    expect(
      companySchema.parse({ ...company, social_links: FIXTURE_LINKS }).social_links,
    ).toStrictEqual(FIXTURE_LINKS);
  });
});
