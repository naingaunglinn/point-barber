import { AuditSource, ScopeType, companySchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { assignRole } from './helpers/roles.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-company-profile tasks 2.1, 2.3, 2.4, 2.7, 2.8 and the HTTP part of 2.9 — organization spec
// "Every signed-in staff member reads the company profile" … "A change of the company queues the website
// refresh in its transaction" (P1.CO.01 · P1.CO.02 · P1-RULE-10 / 13 · API-PERM-07 · API-IDEM-04 ·
// API-SHAPE-04 / 05 · API-AUD-01 · API-PUB-03 · CP1 – CP3). Monday 05/Oct/2026 (MMT); the company's
// `updated_at` is 9:00 AM before the first edit. The contact values are spec-fixtures §1.
const at = (time: string) => new Date(`2026-10-05T${time}:00+06:30`);
const iso = (time: string) => `2026-10-05T${time}:00+06:30`;
const NAME_MM = 'ပွိုင့် ဘာဘာရှော့';
const NAME_EN = 'Point Barbershop';
const PHONE = '09 400 000 111';
const EMAIL = 'hello@point.test';
const ADDRESS_MM = 'အမှတ် ၁၂၊ စမ်းသပ်လမ်း၊ ရန်ကုန်';
const ADDRESS_MM_ZAWGYI = 'အမွတ္ ၁၂၊ ' + 'စမ္းသပ္လမ္း၊ ' + 'ရန္ကုန္';
const FACEBOOK = 'https://www.facebook.com/point.test';
const TIKTOK = 'https://www.tiktok.com/@point.test';
const TWELVE = [
  'address_en',
  'address_mm',
  'email',
  'id',
  'logo_url',
  'name_en',
  'name_mm',
  'phone',
  'social_links',
  'status',
  'updated_at',
  'website_url',
];

type Caller = { readonly cookie: string };
let t: SeededApp;
let companyId: string;
let kyawZin: Caller;
let hnin: Caller;
let zaw: Caller;
let aung: Caller;

beforeAll(async () => {
  t = await seededApp(at('09:00'));
  companyId = (await t.prisma.companies.findFirstOrThrow({ select: { id: true } })).id;
  // spec-fixtures §1: the test role "Company editor" at branch scope B1, assigned to Ko Zaw.
  await assignRole(t.prisma, {
    name: 'Company editor',
    employeeId: FIXTURE_IDS.employees.E003,
    codes: ['company.view', 'company.update'],
    scope: ScopeType.BRANCHES,
    branchIds: [FIXTURE_IDS.branches.B1],
  });
  [kyawZin, hnin, zaw, aung] = await Promise.all([
    t.signIn('E001'),
    t.signIn('E002'),
    t.signIn('E003'),
    t.signIn('E004'),
  ]);
});
afterAll(async () => {
  await t.close();
});

/** The fixture company as it is before the first edit, `updated_at` 9:00 AM; the clock at `time`. */
async function freshCompany(time = '09:00'): Promise<void> {
  await t.prisma.companies.update({
    where: { id: companyId },
    data: {
      name_mm: NAME_MM,
      name_en: NAME_EN,
      logo_url: null,
      phone: null,
      email: null,
      address_mm: null,
      address_en: null,
      website_url: null,
      social_links: Prisma.DbNull,
      status: 1,
      updated_at: at('09:00'),
    },
  });
  t.clock?.set(at(time));
}

const read = (caller?: Caller) => {
  const request = t.http.get('/api/v1/company');
  return caller === undefined ? request : request.set('Cookie', caller.cookie);
};
const patch = (caller: Caller, body: object) =>
  t.http.patch('/api/v1/company').set('Cookie', caller.cookie).send(body);
const stored = () => t.prisma.companies.findUniqueOrThrow({ where: { id: companyId } });

/** The company.update rows one request wrote (by its X-Request-Id). */
const auditsOf = (res: { headers: Record<string, unknown> }) =>
  t.prisma.audit_events.findMany({
    where: { action: 'company.update', request_id: res.headers['x-request-id'] as string },
  });

/** The company.update rows and the site.revalidate jobs written so far. */
async function writes(): Promise<{ audits: number; jobs: number }> {
  const audits = await t.prisma.audit_events.count({
    where: { action: 'company.update', entity_id: companyId, source: AuditSource.APP },
  });
  const [row] = await t.prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'site.revalidate'`;
  return { audits, jobs: row?.n ?? 0 };
}

/** Runs `request` and returns its response with the rows and jobs it wrote. */
async function counted<T>(
  request: () => Promise<T>,
): Promise<{ res: T; audits: number; jobs: number }> {
  const before = await writes();
  const res = await request();
  const after = await writes();
  return { res, audits: after.audits - before.audits, jobs: after.jobs - before.jobs };
}

describe('add-company-profile · organization · Every signed-in staff member reads the company profile', () => {
  beforeAll(() => freshCompany());

  it('Scenario: A barber reads the company', async () => {
    const res = await read(aung);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: companyId,
      name_mm: NAME_MM,
      name_en: NAME_EN,
      logo_url: null,
      phone: null,
      social_links: {},
      status: 1,
      updated_at: iso('09:00'),
    });
  });

  it('Scenario: Only the profile members', async () => {
    const res = await read(aung);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(TWELVE);
    expect(companySchema.safeParse(res.body).success).toBe(true);
  });

  it('Scenario: Signed out', async () => {
    const res = await read();
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'unauthenticated' });
  });
});

describe('add-company-profile · organization · Only a company-scope holder of company.update changes the company', () => {
  beforeAll(() => freshCompany('09:30'));

  it('Scenario: A manager without the code — nothing written', async () => {
    const { res, audits, jobs } = await counted(() => patch(hnin, { phone: PHONE }));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden', context: { required: 'company.update' } });
    expect(await stored()).toMatchObject({ phone: null, updated_at: at('09:00') });
    expect({ audits, jobs }).toStrictEqual({ audits: 0, jobs: 0 });
  });

  it('Scenario: The code at branch scope only — nothing written', async () => {
    const { res, audits, jobs } = await counted(() => patch(zaw, { phone: PHONE }));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'company_scope_required' });
    expect(await stored()).toMatchObject({ phone: null, updated_at: at('09:00') });
    expect({ audits, jobs }).toStrictEqual({ audits: 0, jobs: 0 });
  });

  it('Scenario: Without the app header — nothing written', async () => {
    const { res, audits, jobs } = await counted(() =>
      t.raw.patch('/api/v1/company').set('Cookie', kyawZin.cookie).send({ phone: PHONE }),
    );
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'csrf' });
    expect(await stored()).toMatchObject({ phone: null, updated_at: at('09:00') });
    expect({ audits, jobs }).toStrictEqual({ audits: 0, jobs: 0 });
  });

  it('Scenario: The company admin changes the phone', async () => {
    const res = await patch(kyawZin, { phone: PHONE });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: PHONE, updated_at: iso('09:30') });
    expect(Object.keys(res.body as object).sort()).toStrictEqual(TWELVE);
  });
});

describe('add-company-profile · organization · A PATCH changes only the members it sends and answers with the whole company', () => {
  beforeAll(async () => {
    await freshCompany('09:30');
    await t.prisma.companies.update({
      where: { id: companyId },
      data: { phone: PHONE, email: EMAIL, social_links: { facebook: FACEBOOK, tiktok: TIKTOK } },
    });
  });

  it('Scenario: Members left out are kept', async () => {
    const res = await patch(kyawZin, { email: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: null,
      phone: PHONE,
      name_mm: NAME_MM,
      name_en: NAME_EN,
    });
    expect(res.body).toStrictEqual((await read(kyawZin)).body);
  });

  it('Scenario: Social links are replaced as a whole', async () => {
    const res = await patch(kyawZin, { social_links: { tiktok: TIKTOK } });
    expect(res.status).toBe(200);
    expect(res.body.social_links).toStrictEqual({ tiktok: TIKTOK });
    expect((await stored()).social_links).toStrictEqual({ tiktok: TIKTOK });
  });

  it('Scenario: The status cannot be changed here', async () => {
    t.clock?.set(at('09:45'));
    const before = (await read(kyawZin)).body.updated_at as string;
    const { res, audits, jobs } = await counted(() => patch(kyawZin, { status: 0 }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 1, updated_at: before });
    expect({ audits, jobs }).toStrictEqual({ audits: 0, jobs: 0 });
  });
});

describe('add-company-profile · organization · The Myanmar name is required and the English name is optional', () => {
  beforeAll(() => freshCompany('09:30'));

  it('Scenario: A blank Myanmar name', async () => {
    const res = await patch(kyawZin, { name_mm: '   ' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation' });
    expect(res.body.errors[0]).toMatchObject({ field: 'name_mm', code: 'too_small' });
    expect((await stored()).name_mm).toBe(NAME_MM);
  });

  it('Scenario: The Myanmar name cannot be cleared', async () => {
    const res = await patch(kyawZin, { name_mm: null });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({ field: 'name_mm', code: 'invalid_type' });
  });

  it('Scenario: English name at the limit', async () => {
    expect((await patch(kyawZin, { name_en: 'P'.repeat(255) })).status).toBe(200);
    const res = await patch(kyawZin, { name_en: 'P'.repeat(256) });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toStrictEqual({
      field: 'name_en',
      code: 'too_big',
      params: { maximum: 255 },
    });
  });

  it('Scenario: An empty English name falls back to Myanmar', async () => {
    const res = await patch(kyawZin, { name_en: '' });
    expect(res.status).toBe(200);
    expect(res.body.name_en).toBeNull();
    expect((await stored()).name_en).toBeNull();
  });
});

describe('add-company-profile · organization · Phone, e-mail and addresses are checked against their limits', () => {
  beforeAll(() => freshCompany('09:30'));

  it('Scenario: The phone is kept as typed', async () => {
    const res = await patch(kyawZin, { phone: ` ${PHONE} ` });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe(PHONE);
  });

  it('Scenario: Phone at the limit', async () => {
    expect((await patch(kyawZin, { phone: '0'.repeat(50) })).status).toBe(200);
    const res = await patch(kyawZin, { phone: '0'.repeat(51) });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toStrictEqual({
      field: 'phone',
      code: 'too_big',
      params: { maximum: 50 },
    });
    expect((await stored()).phone).toBe('0'.repeat(50));
  });

  it('Scenario: Not an e-mail address', async () => {
    const res = await patch(kyawZin, { email: 'hello@' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toStrictEqual({ field: 'email', code: 'email_invalid' });
    expect((await stored()).email).toBeNull();
  });

  it('Scenario: Address at the limit', async () => {
    expect((await patch(kyawZin, { address_en: 'a'.repeat(1000) })).status).toBe(200);
    const res = await patch(kyawZin, { address_en: 'a'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toStrictEqual({
      field: 'address_en',
      code: 'too_big',
      params: { maximum: 1000 },
    });
  });

  it('blank optional text is stored as null', async () => {
    const res = await patch(kyawZin, { phone: '  ', address_en: '' });
    expect(res.status).toBe(200);
    expect(await stored()).toMatchObject({ phone: null, address_en: null });
  });
});

describe('add-company-profile · organization · The website and the social links are web addresses within the limits', () => {
  beforeAll(() => freshCompany('09:30'));

  it('Scenario: The fixture links are accepted', async () => {
    const links = { facebook: FACEBOOK, tiktok: TIKTOK, viber: PHONE };
    const res = await patch(kyawZin, { website_url: 'https://point.test', social_links: links });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ website_url: 'https://point.test', social_links: links });
    expect(res.body.social_links).toStrictEqual(links);
  });

  it.each(['javascript:alert(1)', 'www.facebook.com/point.test'])(
    'Scenario: Not a web address — %s',
    async (facebook) => {
      const before = (await stored()).social_links;
      const res = await patch(kyawZin, { social_links: { facebook } });
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toStrictEqual({
        field: 'social_links.facebook',
        code: 'invalid_format',
      });
      expect((await stored()).social_links).toStrictEqual(before);
    },
  );

  it('Scenario: Ten other links, not eleven', async () => {
    const other = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        label: `Branch map ${i + 1}`,
        url: `https://point.test/map/${i + 1}`,
      }));
    const ten = await patch(kyawZin, { social_links: { other: other(10) } });
    expect(ten.status).toBe(200);
    expect(ten.body.social_links.other).toHaveLength(10);
    const eleven = await patch(kyawZin, { social_links: { other: other(11) } });
    expect(eleven.status).toBe(400);
    expect(eleven.body.errors[0]).toStrictEqual({
      field: 'social_links.other',
      code: 'too_big',
      params: { maximum: 10 },
    });
  });

  it('Scenario: Label of an other link at the limit', async () => {
    const res = await patch(kyawZin, {
      social_links: { other: [{ label: 'L'.repeat(51), url: 'https://point.test/map/1' }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toStrictEqual({
      field: 'social_links.other[0].label',
      code: 'too_big',
      params: { maximum: 50 },
    });
  });
});

describe('add-company-profile · organization · Zawgyi text is refused', () => {
  beforeAll(() => freshCompany('09:30'));

  it('Scenario: An address typed in Zawgyi — nothing stored', async () => {
    const { res, audits, jobs } = await counted(() =>
      patch(kyawZin, { address_mm: ADDRESS_MM_ZAWGYI }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'zawgyi_text' });
    expect(res.body.errors[0]).toStrictEqual({ field: 'address_mm', code: 'zawgyi_text' });
    expect(await stored()).toMatchObject({ address_mm: null, updated_at: at('09:00') });
    expect({ audits, jobs }).toStrictEqual({ audits: 0, jobs: 0 });
  });

  it('every member typed in Zawgyi is listed — names, addresses, other-link labels', async () => {
    const res = await patch(kyawZin, {
      name_mm: ADDRESS_MM_ZAWGYI,
      name_en: ADDRESS_MM_ZAWGYI,
      address_en: ADDRESS_MM_ZAWGYI,
      social_links: {
        other: [
          { label: 'Map', url: 'https://point.test/map/1' },
          { label: ADDRESS_MM_ZAWGYI, url: 'https://point.test/map/2' },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toStrictEqual([
      { field: 'name_mm', code: 'zawgyi_text' },
      { field: 'name_en', code: 'zawgyi_text' },
      { field: 'address_en', code: 'zawgyi_text' },
      { field: 'social_links.other[1].label', code: 'zawgyi_text' },
    ]);
  });

  it('Scenario: Unicode Myanmar is stored as sent', async () => {
    const res = await patch(kyawZin, { address_mm: ADDRESS_MM });
    expect(res.status).toBe(200);
    expect(res.body.address_mm).toBe(ADDRESS_MM);
  });
});

describe('add-company-profile · organization · An edit based on an older version is refused', () => {
  beforeAll(async () => {
    await freshCompany('09:30');
    // The phone saved from his phone at 9:30 AM.
    expect((await patch(kyawZin, { phone: PHONE })).status).toBe(200);
  });

  it('Scenario: Saved from an older screen — 409, nothing changed, nothing written', async () => {
    t.clock?.set(at('09:32'));
    const { res, audits, jobs } = await counted(() =>
      patch(kyawZin, { email: EMAIL, expected_updated_at: iso('09:00') }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'conflict' });
    expect(await stored()).toMatchObject({ email: null, updated_at: at('09:30') });
    expect({ audits, jobs }).toStrictEqual({ audits: 0, jobs: 0 });
  });

  it('Scenario: Saved from the current version', async () => {
    t.clock?.set(at('09:35'));
    const res = await patch(kyawZin, { email: EMAIL, expected_updated_at: iso('09:30') });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: EMAIL, updated_at: iso('09:35') });
  });

  it('Scenario: No version sent', async () => {
    t.clock?.set(at('09:36'));
    const res = await patch(kyawZin, { email: 'info@point.test' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('info@point.test');
  });

  it('two saves from the same version at once — one 200, one 409', async () => {
    t.clock?.set(at('09:38'));
    const version = (await read(kyawZin)).body.updated_at as string;
    const { res, audits, jobs } = await counted(() =>
      Promise.all([
        patch(kyawZin, { email: EMAIL, expected_updated_at: version }),
        patch(kyawZin, { address_en: 'No. 12, Test Street, Yangon', expected_updated_at: version }),
      ]),
    );
    expect(res.map((r) => r.status).sort()).toStrictEqual([200, 409]);
    expect({ audits, jobs }).toStrictEqual({ audits: 1, jobs: 1 });
  });
});

describe('add-company-profile · organization · Each change of the company writes one audit row and a save that changes nothing writes nothing', () => {
  beforeAll(() => freshCompany('09:30'));

  it('Scenario: The phone change is audited', async () => {
    const res = await patch(kyawZin, { phone: PHONE });
    expect(res.status).toBe(200);
    const rows = await auditsOf(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: AuditSource.APP,
      action: 'company.update',
      entity_type: 'companies',
      entity_id: companyId,
      actor_user_id: FIXTURE_IDS.users.E001,
      branch_id: null,
    });
    expect(rows[0]?.before_data).toStrictEqual({ phone: null });
    expect(rows[0]?.after_data).toStrictEqual({ phone: PHONE });
  });

  it('only the changed members are recorded; social_links whole', async () => {
    t.clock?.set(at('09:31'));
    const res = await patch(kyawZin, {
      phone: PHONE,
      name_en: NAME_EN,
      social_links: { facebook: FACEBOOK },
    });
    expect(res.status).toBe(200);
    const rows = await auditsOf(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.before_data).toStrictEqual({ social_links: {} });
    expect(rows[0]?.after_data).toStrictEqual({ social_links: { facebook: FACEBOOK } });
  });

  it('Scenario: The same values again', async () => {
    t.clock?.set(at('09:40'));
    const { res, audits, jobs } = await counted(() =>
      patch(kyawZin, { phone: PHONE, social_links: { facebook: FACEBOOK, tiktok: '' } }),
    );
    expect(res.status).toBe(200);
    expect(res.body.updated_at).toBe(iso('09:31'));
    expect({ audits, jobs }).toStrictEqual({ audits: 0, jobs: 0 });
  });
});

describe('add-company-profile · organization · A change of the company queues the website refresh in its transaction', () => {
  beforeAll(() => freshCompany('09:30'));

  it('Scenario: A change queues one refresh', async () => {
    const { res, jobs } = await counted(() => patch(kyawZin, { phone: PHONE }));
    expect(res.status).toBe(200);
    expect(jobs).toBe(1);
    const [job] = await t.prisma.$queryRaw<{ data: unknown }[]>`
      SELECT data FROM pgboss.job WHERE name = 'site.revalidate' ORDER BY created_on DESC LIMIT 1`;
    expect(job?.data).toStrictEqual({ tags: ['site', 'home'] });
  });

  it('Scenario: A refused edit queues nothing', async () => {
    t.clock?.set(at('09:35'));
    const { res, jobs } = await counted(() =>
      patch(kyawZin, { phone: '09 400 000 222', expected_updated_at: iso('09:00') }),
    );
    expect(res.status).toBe(409);
    expect(jobs).toBe(0);
  });
});
