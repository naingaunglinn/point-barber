import { settingListSchema } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type SeededApp, seededApp } from './helpers/seeded.js';

// add-website-management task 1.3 — spec "The nine `site.*` keys are settings written only through the
// website" (Part 8 §17 · P8-RULE-11 · P1-RULE-08 · P1.SET.03 · P1.SET.04 · D-PLT-16 · design D3): the
// generic settings endpoints refuse every site key with 400 `setting_scope` and write nothing, and the
// list of module `website` shows the nine keys read-only. Monday 05/Oct/2026 10:00 AM.
const API = '/api/v1/settings';
let s: SeededApp;
let cookie: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:00:00+06:30'));
  cookie = (await s.signIn('E001')).cookie;
});
afterAll(() => s.close());

const revalidateJobs = async () => {
  const rows = await s.prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pgboss.job WHERE name = 'site.revalidate'`;
  return Number(rows[0]?.n);
};

describe('add-website-management · website · The nine site.* keys are settings written only through the website', () => {
  it('Scenario: The generic settings endpoint refuses a site key', async () => {
    const jobs = await revalidateJobs();
    const put = await s.http
      .put(`${API}/site.show_prices`)
      .set('Cookie', cookie)
      .send({ value: true });
    const reset = await s.http.post(`${API}/site.show_prices/reset`).set('Cookie', cookie);
    expect([put.status, put.body.code]).toStrictEqual([400, 'setting_scope']);
    expect([reset.status, reset.body.code]).toStrictEqual([400, 'setting_scope']);
    expect(await s.prisma.settings.count({ where: { key: { startsWith: 'site.' } } })).toBe(0);
    expect(await s.prisma.settings_history.count()).toBe(0);
    expect(await revalidateJobs()).toBe(jobs);
  });

  it('GET /v1/settings?module=website lists the nine keys with editable = false', async () => {
    const res = await s.http.get(`${API}?module=website`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    const items = settingListSchema.parse(res.body).items;
    expect(items.map((item) => [item.key, item.editable, item.source])).toStrictEqual(
      [
        'site.announcement',
        'site.cover_attachment_id',
        'site.hero_subtitle',
        'site.hero_title',
        'site.seo_description',
        'site.seo_title',
        'site.share_image_attachment_id',
        'site.show_barbers',
        'site.show_prices',
      ].map((key) => [key, false, 'default']),
    );
    expect(items.find((item) => item.key === 'site.hero_title')?.effective).toStrictEqual({
      mm: '',
      en: null,
    });
  });
});
