import { randomUUID } from 'node:crypto';

import {
  bookingQrSchema,
  sharePreviewSchema,
  teamProfileSchema,
  websiteOverviewSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UNKNOWN_ID } from './helpers/branches.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-website-management tasks 5.2 – 5.5 — P8.WEB.01 / 09 / 10 / 11 (P8-RULE-01 · P8-RULE-11 · owner F7 ·
// WM5 ★ · WM6 ★ · WM7 ★ · WM8 ★ · design D8 / D10 / D11). Monday 05/Oct/2026 10:00 AM MMT, SITE_ORIGIN
// https://point.test, no `site.*` row. The share image scenarios wait for part A6.
const { B1, B2, B3 } = FIXTURE_IDS.branches;
const { users, employees } = FIXTURE_IDS;
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();

const get = async (who: FixturePerson, url: string) => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  return s.http.get(url).set('Cookie', cookie);
};

let companyId = '';
/** A company `site.*` row written directly: the content save arrives with part A6. */
const setSetting = async (key: string, value: boolean) => {
  const row = await s.prisma.settings.findFirst({
    where: { company_id: companyId, key, branch_id: null },
    select: { id: true },
  });
  if (row === null) {
    await s.prisma.settings.create({
      data: { id: randomUUID(), company_id: companyId, key, value, updated_by_user_id: users.E001 },
    });
  } else await s.prisma.settings.update({ where: { id: row.id }, data: { value } });
};

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T10:00:00'));
  companyId = (await s.prisma.companies.findFirstOrThrow({ select: { id: true } })).id;
  await s.prisma.branch_closures.create({
    data: {
      id: randomUUID(),
      branch_id: B3,
      start_date: new Date('2026-10-12T00:00:00Z'),
      end_date: new Date('2026-10-13T00:00:00Z'),
      notice_mm: 'ပိတ်ရက် (စမ်းသပ်)',
      notice_en: 'Closed (test)',
      created_by_user_id: users.E001,
    },
  });
  await s.prisma.employees.update({
    where: { id: employees.E004 },
    data: {
      public_profile: true,
      public_rating: 4.5,
      public_specialty_en: 'Fades and beard trims',
    },
  });
  await s.prisma.schedule_shifts.create({
    data: {
      id: randomUUID(),
      employee_id: employees.E004,
      branch_id: B3,
      shift_date: new Date('2026-10-05T00:00:00Z'),
      starts_at: mmt('2026-10-05T09:00:00'),
      ends_at: mmt('2026-10-05T21:00:00'),
      source: 2,
    },
  });
});
afterAll(() => s.close());

describe('add-website-management · website · The overview gives the content, the branches, the counts and the actions (task 5.2)', () => {
  it("Scenario: The admin's overview", async () => {
    const res = await get('E001', '/api/v1/website');
    expect(res.status).toBe(200);
    const overview = websiteOverviewSchema.parse(res.body);
    expect(overview.site_origin).toBe('https://point.test');
    expect(overview.content).toMatchObject({
      show_prices: false,
      show_barbers: false,
      hero_title: { mm: '', en: null },
      cover_image: null,
      announcement: null,
      updated_at: null,
      live_within_seconds: 10,
    });
    expect(overview.branches.map((branch) => [branch.code, branch.editable])).toStrictEqual([
      ['B1', true],
      ['B2', true],
      ['B3', true],
    ]);
    const b3 = overview.branches.find((branch) => branch.code === 'B3');
    expect(b3).toMatchObject({
      hours_configured: true,
      next_closure: {
        start_date: '2026-10-12',
        end_date: '2026-10-13',
        notice_en: 'Closed (test)',
      },
    });
    expect(overview.branches.find((branch) => branch.code === 'B1')?.next_closure).toBeNull();
    expect(overview.counts).toStrictEqual({
      public_branches: 3,
      services_on_website: 3,
      public_team: 1,
    });
    expect(overview.actions).toStrictEqual({ can_edit_content: true, can_revalidate: true });
  });

  it("Scenario: A branch manager's overview — B3 only, no content actions", async () => {
    const overview = websiteOverviewSchema.parse((await get('E002', '/api/v1/website')).body);
    expect(overview.branches.map((branch) => [branch.code, branch.editable])).toStrictEqual([
      ['B3', true],
    ]);
    expect(overview.actions).toStrictEqual({ can_edit_content: false, can_revalidate: false });
  });

  it('Scenario: A barber is refused — 403 forbidden with context.required = website.view', async () => {
    const res = await get('E004', '/api/v1/website');
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      403,
      'forbidden',
      { required: 'website.view' },
    ]);
  });
});

describe("add-website-management · website · The team overview shows every active employee's public profile (task 5.3)", () => {
  const team = async (who: FixturePerson) => {
    const res = await get(who, '/api/v1/website/team');
    expect(res.status).toBe(200);
    return (res.body as { items: unknown[] }).items.map((item) => teamProfileSchema.parse(item));
  };

  it("Scenario: Ko Aung's row — shown, rated, at B3 today, no phone member", async () => {
    await setSetting('site.show_barbers', true);
    const items = await team('E001');
    expect(items).toHaveLength(8);
    expect(items.map((item) => item.employee_code)).toStrictEqual(
      items.map((item) => item.employee_code).sort(),
    );
    const aung = items.find((item) => item.employee_id === employees.E004);
    expect(aung).toMatchObject({
      public_profile: true,
      shown_on_site: true,
      public_rating: 4.5,
      public_specialty_en: 'Fades and beard trims',
      branches: [{ code: 'B3' }],
      today_branches: [
        {
          code: 'B3',
          starts_at: '2026-10-05T09:00:00.000+06:30',
          ends_at: '2026-10-05T21:00:00.000+06:30',
        },
      ],
      actions: { can_edit_profile: true, can_rate: true },
    });
    expect(Object.keys(aung ?? {})).not.toContain('phone');
    const min = items.find((item) => item.employee_id === employees.E005);
    expect(min).toMatchObject({ public_profile: false, shown_on_site: false, today_branches: [] });
  });

  it("the actions follow the caller's grants: Ma Hnin rates her branch's barber and edits no profile", async () => {
    const items = await team('E002');
    const byId = new Map(items.map((item) => [item.employee_id, item.actions]));
    expect(byId.get(employees.E004)).toStrictEqual({ can_edit_profile: false, can_rate: true });
    // Ko Htet works at B1: not Ma Hnin's branch.
    expect(byId.get(employees.E006)).toStrictEqual({ can_edit_profile: false, can_rate: false });
  });

  it('Scenario: Barbers switched off — every row has shown_on_site = false', async () => {
    await setSetting('site.show_barbers', false);
    expect((await team('E001')).every((item) => !item.shown_on_site)).toBe(true);
  });

  it('a barber is refused', async () => {
    expect((await get('E004', '/api/v1/website/team')).status).toBe(403);
  });
});

describe('add-website-management · website · The share preview shows exactly what a link-preview crawler gets (task 5.4)', () => {
  const preview = (who: FixturePerson, query: string) =>
    get(who, `/api/v1/website/share-preview?${query}`);

  it('Scenario: The home page in English without SEO texts', async () => {
    const res = await preview('E001', 'locale=en&path=/');
    expect(res.status).toBe(200);
    expect(sharePreviewSchema.parse(res.body)).toStrictEqual({
      url: 'https://point.test/en',
      locale: 'en',
      title: 'Point Barbershop',
      description: null,
      image: null,
      site_name: 'Point Barbershop',
      warnings: [{ code: 'share_image_missing' }],
    });
  });

  it('the Myanmar home page has its own canonical address and the Myanmar company name', async () => {
    const res = await preview('E001', 'locale=my&path=/');
    expect(res.body).toMatchObject({
      url: 'https://point.test/my',
      title: 'ပွိုင့် ဘာဘာရှော့',
      site_name: 'ပွိုင့် ဘာဘာရှော့',
    });
  });

  it('Scenario: The B3 page in English — branch title and the branch address (the image waits for A6)', async () => {
    await s.prisma.branches.update({
      where: { id: B3 },
      data: { address_en: 'No. 3, Example Road' },
    });
    const res = await preview('E002', 'locale=en&path=/branches/B3');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      url: 'https://point.test/en/branches/B3',
      title: 'Point Barbershop — Point 3.0',
      description: 'No. 3, Example Road',
      image: null,
      warnings: [{ code: 'share_image_missing' }],
    });
  });

  it('Scenario: A long branch title — 78 characters warn title_too_long', async () => {
    await s.prisma.branches.create({
      data: {
        id: randomUUID(),
        company_id: companyId,
        code: 'B4',
        name_mm: 'ပွိုင့် ၄.၀',
        name_en: 'Point 4.0 — Thingyan pop-up near the east gate of Shwedagon',
      },
    });
    const res = await preview('E001', 'locale=en&path=/branches/B4');
    expect(res.body.title).toHaveLength(78);
    expect(res.body.warnings).toStrictEqual([
      { code: 'share_image_missing' },
      { code: 'title_too_long' },
    ]);
  });

  it('Scenario: A branch that is not public — 404 not_found; an unknown branch too', async () => {
    await s.prisma.branches.update({ where: { id: B2 }, data: { is_public: false } });
    for (const code of ['B2', 'B9']) {
      const res = await preview('E001', `locale=en&path=/branches/${code}`);
      expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
    }
    await s.prisma.branches.update({ where: { id: B2 }, data: { is_public: true } });
  });

  it.each([['locale=fr&path=/'], ['locale=en&path=/book'], ['locale=en']])(
    '%s is 400 validation',
    async (query) => {
      const res = await preview('E001', query);
      expect([res.status, res.body.code]).toStrictEqual([400, 'validation']);
    },
  );

  it('a barber is refused', async () => {
    expect((await preview('E004', 'locale=en&path=/')).status).toBe(403);
  });
});

describe('add-website-management · website · The booking QR gives the branch booking link (task 5.5)', () => {
  const qr = (who: FixturePerson, branchId: string) =>
    get(who, `/api/v1/website/booking-qr/${branchId}`);

  it("Scenario: B3's QR — the link, its display text and no logo on the fixture", async () => {
    const res = await qr('E002', B3);
    expect(res.status).toBe(200);
    expect(bookingQrSchema.parse(res.body)).toStrictEqual({
      branch_id: B3,
      code: 'B3',
      name_mm: 'ပွိုင့် ၃.၀',
      name_en: 'Point 3.0',
      url: 'https://point.test/book?branch=B3',
      display_url: 'point.test/book?branch=B3',
      logo_url: null,
      is_public: true,
    });
  });

  it('a branch that is not public is served with is_public = false', async () => {
    await s.prisma.branches.update({ where: { id: B2 }, data: { is_public: false } });
    const res = await qr('E001', B2);
    expect([res.status, res.body.is_public, res.body.url]).toStrictEqual([
      200,
      false,
      'https://point.test/book?branch=B2',
    ]);
    await s.prisma.branches.update({ where: { id: B2 }, data: { is_public: true } });
  });

  // Recorded reading (lead 18/Nov/2026, website-routes.test.ts): the spec scenario says 403 for another
  // branch's QR; a single-resource read outside the grant is 404 (API-PERM-03), so the decorator answers it.
  it("Scenario: Another branch's QR — outside Ma Hnin's grant (404 by API-PERM-03)", async () => {
    const res = await qr('E002', B1);
    expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
  });

  it('an unknown branch is 404 and a barber is refused', async () => {
    expect((await qr('E001', UNKNOWN_ID)).status).toBe(404);
    expect((await qr('E004', B3)).status).toBe(403);
  });
});
