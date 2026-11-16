import { describe, expect, it } from 'vitest';

import {
  PUBLIC_BRANCH_MEMBERS,
  branchCodeSchema,
  branchCreateSchema,
  branchInUseContextSchema,
  branchSchema,
  branchStatusSchema,
  branchUpdateSchema,
  normalizeBranchMembers,
  socialLinksOf,
} from './branches.js';
import { normalizeSocialLinks, socialLinksSchema } from './company.js';

// add-branch-management tasks 1.3 – 1.6 — organization spec "A branch code is 1–10 capital letters or
// digits and unique in the company", "Branch members are checked against their limits", "An update
// changes only the members it sends and never the code" (P1.BR.02 / 04 / 05 · owner BR1 / BR3 ·
// add-company-profile CP1 / CP2 · design D4). Values from spec-fixtures §1 (B4, 09 7700 0003 …).

type Issue = { readonly code: string; readonly path: readonly PropertyKey[]; [k: string]: unknown };

function issuesOf(schema: { safeParse(value: unknown): unknown }, value: unknown): Issue[] {
  const result = schema.safeParse(value) as
    { success: true } | { success: false; error: { issues: Issue[] } };
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues;
}

const B4 = { code: 'B4', name_mm: 'ပွိုင့် ၄.၀', name_en: 'Point 4.0' };
/** An https address of exactly `length` characters. */
const link = (length: number) => {
  const head = 'https://facebook.com/';
  return head + 'a'.repeat(length - head.length);
};
const create = (members: Record<string, unknown>) => ({ ...B4, ...members });

describe('branchCodeSchema (task 1.3 · P1.BR.02 · Part 1 §13 #4)', () => {
  it('Scenario: Ten characters are accepted', () => {
    expect(branchCodeSchema.parse('PX12345678')).toBe('PX12345678');
  });

  it('Scenario: Eleven characters are refused — one too_big issue with maximum 10', () => {
    const issues = issuesOf(branchCodeSchema, 'PX123456789');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'too_big', maximum: 10 });
  });

  it('Scenario: an empty code — one too_small issue with minimum 1', () => {
    const issues = issuesOf(branchCodeSchema, '');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'too_small', minimum: 1 });
  });

  it.each(['b4', 'B-4', 'B 4', 'ဘီ၄'])(
    'Scenario: lower case and signs — %s → invalid_format',
    (code) => {
      expect(issuesOf(branchCodeSchema, code)).toMatchObject([{ code: 'invalid_format' }]);
    },
  );

  it('the server never changes the case; outer spaces are trimmed', () => {
    expect(branchCodeSchema.parse(' B4 ')).toBe('B4');
    expect(issuesOf(branchCodeSchema, 'b4')).toHaveLength(1);
  });

  it('one issue per refused code, also when it is long and lower case', () => {
    expect(issuesOf(branchCodeSchema, 'abcdefghijkl')).toHaveLength(1);
  });
});

describe('branch members — "Branch members are checked against their limits" (task 1.4)', () => {
  const field = (members: Record<string, unknown>) =>
    issuesOf(branchCreateSchema, create(members)).map((issue) => ({
      ...issue,
      field: issue.path.join('.'),
    }));

  it('Scenario: Myanmar name at and over the limit', () => {
    expect(branchCreateSchema.safeParse(create({ name_mm: 'မ'.repeat(255) })).success).toBe(true);
    expect(field({ name_mm: 'မ'.repeat(256) })).toMatchObject([
      { field: 'name_mm', code: 'too_big', maximum: 255 },
    ]);
    expect(field({ name_mm: '   ' })).toMatchObject([
      { field: 'name_mm', code: 'too_small', minimum: 1 },
    ]);
  });

  it('name_en, phone, email: at the limit and one past it', () => {
    expect(branchCreateSchema.safeParse(create({ name_en: 'P'.repeat(255) })).success).toBe(true);
    expect(field({ name_en: 'P'.repeat(256) })).toMatchObject([
      { field: 'name_en', code: 'too_big', maximum: 255 },
    ]);
    expect(branchCreateSchema.safeParse(create({ phone: '9'.repeat(50) })).success).toBe(true);
    expect(field({ phone: '9'.repeat(51) })).toMatchObject([
      { field: 'phone', code: 'too_big', maximum: 50 },
    ]);
    const email255 = `${'a'.repeat(255 - '@point.test'.length)}@point.test`;
    expect(branchCreateSchema.safeParse(create({ email: email255 })).success).toBe(true);
    expect(field({ email: `a${email255}` })).toMatchObject([
      { field: 'email', code: 'too_big', maximum: 255 },
    ]);
  });

  it('Scenario: Formats — a wrong e-mail carries the catalogue code email_invalid', () => {
    expect(field({ email: 'point4@' })).toMatchObject([
      { field: 'email', code: 'invalid_format', message: 'code:email_invalid' },
    ]);
  });

  it('Scenario: Formats — website_url and map_url need http(s); javascript: is refused (R4)', () => {
    expect(field({ website_url: 'point4.example' })).toMatchObject([
      { field: 'website_url', code: 'invalid_format' },
    ]);
    expect(field({ map_url: 'javascript:alert(1)' })).toMatchObject([
      { field: 'map_url', code: 'invalid_format' },
    ]);
    expect(field({ map_url: 'ftp://maps.example' })).toMatchObject([
      { field: 'map_url', code: 'invalid_format' },
    ]);
  });

  it('addresses and links: 1,000 characters pass, 1,001 are too_big (owner BR3)', () => {
    for (const member of ['address_mm', 'address_en']) {
      expect(branchCreateSchema.safeParse(create({ [member]: 'လ'.repeat(1000) })).success).toBe(
        true,
      );
      expect(field({ [member]: 'လ'.repeat(1001) })).toMatchObject([
        { field: member, code: 'too_big', maximum: 1000 },
      ]);
    }
    for (const member of ['website_url', 'map_url']) {
      expect(branchCreateSchema.safeParse(create({ [member]: link(1000) })).success).toBe(true);
      expect(field({ [member]: link(1001) })).toMatchObject([
        { field: member, code: 'too_big', maximum: 1000 },
      ]);
    }
  });

  it('Scenario: Coordinates at and outside the limits', () => {
    for (const [member, limit] of [
      ['latitude', 90],
      ['longitude', 180],
    ] as const) {
      expect(branchCreateSchema.safeParse(create({ [member]: limit })).success).toBe(true);
      expect(branchCreateSchema.safeParse(create({ [member]: -limit })).success).toBe(true);
      expect(field({ [member]: limit + 1 })).toMatchObject([{ field: member, code: 'too_big' }]);
      expect(field({ [member]: -limit - 1 })).toMatchObject([{ field: member, code: 'too_small' }]);
    }
    expect(
      branchCreateSchema.parse(create({ latitude: 16.8409, longitude: 96.1735 })),
    ).toMatchObject({ latitude: 16.8409, longitude: 96.1735 });
  });

  it('Scenario: Radius at and outside the limits — an integer from 10 to 2,000', () => {
    for (const radius of [10, 2000]) {
      expect(branchCreateSchema.safeParse(create({ location_radius_meters: radius })).success).toBe(
        true,
      );
    }
    expect(field({ location_radius_meters: 9 })).toMatchObject([
      { field: 'location_radius_meters', code: 'too_small', minimum: 10 },
    ]);
    expect(field({ location_radius_meters: 2001 })).toMatchObject([
      { field: 'location_radius_meters', code: 'too_big', maximum: 2000 },
    ]);
    expect(field({ location_radius_meters: 50.5 })).toMatchObject([
      { field: 'location_radius_meters', code: 'invalid_type' },
    ]);
  });

  it('is_public is a boolean', () => {
    expect(field({ is_public: 'yes' })).toMatchObject([
      { field: 'is_public', code: 'invalid_type' },
    ]);
    expect(field({ is_public: null })).toMatchObject([
      { field: 'is_public', code: 'invalid_type' },
    ]);
  });

  it('Scenario: Links at and over the limit — social links', () => {
    expect(
      branchCreateSchema.safeParse(create({ social_links: { facebook: link(1000) } })).success,
    ).toBe(true);
    expect(field({ social_links: { facebook: link(1001) } })).toMatchObject([
      { field: 'social_links.facebook', code: 'too_big', maximum: 1000 },
    ]);
    const other = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ label: `Link ${i + 1}`, url: link(40) }));
    expect(
      branchCreateSchema.safeParse(create({ social_links: { other: other(10) } })).success,
    ).toBe(true);
    expect(field({ social_links: { other: other(11) } })).toMatchObject([
      { field: 'social_links.other', code: 'too_big', maximum: 10 },
    ]);
  });

  it('social links: each kind of member and its limit (CP1 / CP2)', () => {
    for (const member of ['facebook', 'tiktok', 'instagram', 'youtube']) {
      expect(field({ social_links: { [member]: 'javascript:alert(1)' } })).toMatchObject([
        { field: `social_links.${member}`, code: 'invalid_format' },
      ]);
    }
    expect(socialLinksSchema.safeParse({ viber: 'viber://chat?number=0977000003' }).success).toBe(
      true,
    );
    expect(socialLinksSchema.safeParse({ viber: '09 7700 0003' }).success).toBe(true);
    expect(socialLinksSchema.safeParse({ viber: '9'.repeat(1000) }).success).toBe(true);
    expect(issuesOf(socialLinksSchema, { viber: '9'.repeat(1001) })).toMatchObject([
      { path: ['viber'], code: 'too_big', maximum: 1000 },
    ]);
    const label = (text: string) => ({ other: [{ label: text, url: link(40) }] });
    expect(socialLinksSchema.safeParse(label('ဆ'.repeat(50))).success).toBe(true);
    expect(issuesOf(socialLinksSchema, label('ဆ'.repeat(51)))).toMatchObject([
      { path: ['other', 0, 'label'], code: 'too_big', maximum: 50 },
    ]);
    expect(issuesOf(socialLinksSchema, label('  '))).toMatchObject([
      { path: ['other', 0, 'label'], code: 'too_small', minimum: 1 },
    ]);
    expect(issuesOf(socialLinksSchema, { other: [{ label: 'Shop', url: '  ' }] })).toMatchObject([
      { path: ['other', 0, 'url'], code: 'invalid_format' },
    ]);
  });

  it('Scenario: Several members wrong at once — one issue for each', () => {
    const issues = issuesOf(branchCreateSchema, { code: 'b4', name_en: 'Point 4.0' });
    expect(issues.map((issue) => [issue.path.join('.'), issue.code])).toStrictEqual([
      ['code', 'invalid_format'],
      ['name_mm', 'invalid_type'],
    ]);
  });

  it('a missing code is refused (code and name_mm are required)', () => {
    expect(issuesOf(branchCreateSchema, { name_mm: 'ပွိုင့် ၄.၀' })).toMatchObject([
      { path: ['code'], code: 'invalid_type' },
    ]);
  });
});

describe('normalisation after parsing (task 1.4 · design D4)', () => {
  it('an optional text empty after trimming → null; the names are trimmed', () => {
    const parsed = branchCreateSchema.parse(
      create({
        name_mm: '  ပွိုင့် ၄.၀ ',
        name_en: '   ',
        phone: '',
        email: ' ',
        address_mm: '  ',
        address_en: '',
        website_url: '  ',
        map_url: '',
      }),
    );
    expect(normalizeBranchMembers(parsed)).toStrictEqual({
      name_mm: 'ပွိုင့် ၄.၀',
      name_en: null,
      phone: null,
      email: null,
      address_mm: null,
      address_en: null,
      website_url: null,
      map_url: null,
    });
  });

  it('the phone is kept as typed (no E.164 — branches have no normalised phone)', () => {
    expect(
      normalizeBranchMembers(branchCreateSchema.parse(create({ phone: '09 7700 0003' }))),
    ).toMatchObject({ phone: '09 7700 0003' });
  });

  it('absent members stay absent and null stays null (absent ≠ null — D5)', () => {
    const absent = normalizeBranchMembers(branchCreateSchema.parse(B4));
    expect('location_radius_meters' in absent).toBe(false);
    expect('social_links' in absent).toBe(false);
    const sentNull = normalizeBranchMembers(
      branchCreateSchema.parse(create({ location_radius_meters: null, latitude: null })),
    );
    expect(sentNull).toMatchObject({ location_radius_meters: null, latitude: null });
  });

  it('Scenario: Blank links are left out — null and blank members are dropped', () => {
    expect(
      normalizeSocialLinks(
        socialLinksSchema.parse({
          facebook: 'https://facebook.com/point3',
          tiktok: '  ',
          viber: null,
          other: [],
        }),
      ),
    ).toStrictEqual({ facebook: 'https://facebook.com/point3' });
    expect(
      normalizeSocialLinks(socialLinksSchema.parse({ youtube: null, viber: ' ' })),
    ).toStrictEqual({});
  });

  it('a sent social_links object is normalised by normalizeBranchMembers as a whole', () => {
    expect(
      normalizeBranchMembers(
        branchCreateSchema.parse(
          create({ social_links: { instagram: ' https://instagram.com/point4 ', tiktok: '' } }),
        ),
      ),
    ).toMatchObject({ social_links: { instagram: 'https://instagram.com/point4' } });
  });

  it('a stored NULL social_links is answered as {}', () => {
    expect(socialLinksOf(null)).toStrictEqual({});
    expect(socialLinksOf({ facebook: 'https://facebook.com/point3' })).toStrictEqual({
      facebook: 'https://facebook.com/point3',
    });
  });
});

describe('branchUpdateSchema and branchStatusSchema (task 1.5 · P1.BR.04 / 05 · owner BR1)', () => {
  it('Scenario: A sent code is ignored — it is stripped like any unknown member', () => {
    expect(branchUpdateSchema.parse({ code: 'B9', phone: '09 7700 0003' })).toStrictEqual({
      phone: '09 7700 0003',
    });
  });

  it('Scenario: The Myanmar name cannot be cleared — name_mm: null → invalid_type', () => {
    expect(issuesOf(branchUpdateSchema, { name_mm: null })).toMatchObject([
      { path: ['name_mm'], code: 'invalid_type' },
    ]);
  });

  it('every member is optional; absent and null stay apart', () => {
    expect(branchUpdateSchema.parse({})).toStrictEqual({});
    expect(branchUpdateSchema.parse({ phone: null })).toStrictEqual({ phone: null });
    expect('phone' in branchUpdateSchema.parse({ address_en: 'No. 3, Example Road' })).toBe(false);
  });

  it('the update members take the create limits (BR3)', () => {
    expect(issuesOf(branchUpdateSchema, { location_radius_meters: 2001 })).toMatchObject([
      { path: ['location_radius_meters'], code: 'too_big', maximum: 2000 },
    ]);
    expect(issuesOf(branchUpdateSchema, { map_url: 'javascript:alert(1)' })).toMatchObject([
      { path: ['map_url'], code: 'invalid_format' },
    ]);
  });

  it('expected_updated_at needs an offset; milliseconds are accepted', () => {
    expect(
      branchUpdateSchema.parse({ expected_updated_at: '2026-10-05T10:00:00.123+06:30' }),
    ).toStrictEqual({ expected_updated_at: '2026-10-05T10:00:00.123+06:30' });
    expect(
      issuesOf(branchUpdateSchema, { expected_updated_at: '2026-10-05T10:00:00' }),
    ).toMatchObject([{ path: ['expected_updated_at'], code: 'invalid_format' }]);
  });

  it('status 0 and 1 pass; 2 is refused at the member status', () => {
    expect(branchStatusSchema.parse({ status: 0 })).toStrictEqual({ status: 0 });
    expect(branchStatusSchema.parse({ status: 1 })).toStrictEqual({ status: 1 });
    // A literal set answers invalid_value, also for a missing member (zod 4.6.5).
    expect(issuesOf(branchStatusSchema, { status: 2 })).toMatchObject([
      { path: ['status'], code: 'invalid_value' },
    ]);
    expect(issuesOf(branchStatusSchema, {})).toMatchObject([
      { path: ['status'], code: 'invalid_value' },
    ]);
  });

  it('Scenario: Status and reason limits — 500 characters pass, 501 are too_big', () => {
    expect(branchStatusSchema.parse({ status: 0, reason: 'ရ'.repeat(500) })).toMatchObject({
      status: 0,
    });
    expect(issuesOf(branchStatusSchema, { status: 0, reason: 'ရ'.repeat(501) })).toMatchObject([
      { path: ['reason'], code: 'too_big', maximum: 500 },
    ]);
    expect(
      branchStatusSchema.parse({ status: 0, reason: ' Not opening this year ' }),
    ).toStrictEqual({ status: 0, reason: 'Not opening this year' });
  });
});

describe('response schemas and the website members (task 1.6 · P1.BR.03 · owner BR2 · D8)', () => {
  const b3 = {
    id: '0199a3f2-0000-7000-8001-0000000000b3',
    code: 'B3',
    name_mm: 'ပွိုင့် ၃.၀',
    name_en: 'Point 3.0',
    phone: null,
    status: 1,
    is_public: true,
    email: null,
    address_mm: null,
    address_en: null,
    website_url: null,
    social_links: {},
    latitude: null,
    longitude: null,
    location_radius_meters: null,
    map_url: null,
    active_employees: 5,
    created_at: '2026-09-01T00:00:00+06:30',
    updated_at: '2026-09-01T00:00:00.000+06:30',
  };

  it('branchSchema is BranchSummary + the twelve Branch members, strict', () => {
    expect(branchSchema.parse(b3)).toStrictEqual(b3);
    expect(Object.keys(branchSchema.shape)).toHaveLength(19);
    expect(branchSchema.safeParse({ ...b3, archived_at: null }).success).toBe(false);
    expect(branchSchema.safeParse({ ...b3, status: 2 }).success).toBe(false);
  });

  it('branchInUseContextSchema holds the three counts of owner BR2', () => {
    expect(
      branchInUseContextSchema.parse({ open_bookings: 0, open_sales: 0, active_assignments: 5 }),
    ).toStrictEqual({ open_bookings: 0, open_sales: 0, active_assignments: 5 });
    expect(
      branchInUseContextSchema.safeParse({ open_bookings: 0, active_assignments: 5 }).success,
    ).toBe(false);
  });

  it('PUBLIC_BRANCH_MEMBERS = the Part 8 PublicBranch members a branch update can change, plus is_public', () => {
    // Part 8 v1.0 components.schemas.PublicBranch, copied from point-sdd docs/api/openapi/part8-platform.yaml.
    const publicBranch = [
      'code',
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
      'hours',
      'closures',
    ];
    // hours / closures are other tables (Part 8); the code never changes after create (owner BR1).
    const onTheRow = publicBranch.filter((m) => !['hours', 'closures', 'code'].includes(m));
    expect([...PUBLIC_BRANCH_MEMBERS].sort()).toStrictEqual([...onTheRow, 'is_public'].sort());
    for (const member of PUBLIC_BRANCH_MEMBERS)
      expect(branchUpdateSchema.shape).toHaveProperty(member);
  });
});
