import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-website-management task 5.6 — P8.WEB.12 (P8-RULE-11 · P8-RULE-20 · ADR-006 action item 3 · design
// D12): the refresh needs company-scope `website.update`; every tag is checked before a job is queued.
const mmt = (local: string) => new Date(`${local}+06:30`);

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();
beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T10:00:00'));
});
afterAll(() => s.close());

const refresh = async (who: FixturePerson, body?: object) => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  const request = s.http.post('/api/v1/website/revalidate').set('Cookie', cookie);
  return body === undefined ? request : request.send(body);
};
const jobs = () =>
  s.prisma.$queryRaw<{ data: { tags: string[] } }[]>`
    SELECT data FROM pgboss.job WHERE name = 'site.revalidate' ORDER BY created_on`;
const audits = () =>
  s.prisma.audit_events.findMany({
    where: { action: 'website.revalidate' },
    select: { branch_id: true, before_data: true, after_data: true },
  });
const ALL = ['site', 'home', 'barbers', 'services', 'branch:B1', 'branch:B2', 'branch:B3'];

describe('add-website-management · website · The admin can refresh the website by hand (task 5.6)', () => {
  it('Scenario: Refresh everything — no body, the seven tags, one job, one audit row', async () => {
    const res = await refresh('E001');
    expect([res.status, res.body]).toStrictEqual([202, { queued_tags: ALL }]);
    expect((await jobs()).map((job) => job.data.tags)).toStrictEqual([ALL]);
    expect(await audits()).toStrictEqual([
      { branch_id: null, before_data: null, after_data: { tags: ALL } },
    ]);
  });

  it('the tags sent are queued as sent', async () => {
    const res = await refresh('E001', { tags: ['home'] });
    expect([res.status, res.body]).toStrictEqual([202, { queued_tags: ['home'] }]);
    expect((await jobs()).map((job) => job.data.tags)).toStrictEqual([ALL, ['home']]);
    expect(await audits()).toHaveLength(2);
  });

  it.each([[{ tags: ['branch:B9'] }], [{ tags: ['sitemap'] }], [{ tags: [] }]])(
    'Scenario: An unknown tag — %j is 400 validation and nothing is queued or audited',
    async (body) => {
      const res = await refresh('E001', body);
      expect([res.status, res.body.code]).toStrictEqual([400, 'validation']);
      expect(await jobs()).toHaveLength(2);
      expect(await audits()).toHaveLength(2);
    },
  );

  it('Scenario: A branch manager cannot refresh — 403 company_scope_required, nothing written', async () => {
    const res = await refresh('E002', { tags: ['branch:B3'] });
    expect([res.status, res.body.code]).toStrictEqual([403, 'company_scope_required']);
    expect(await jobs()).toHaveLength(2);
    expect(await audits()).toHaveLength(2);
  });

  it('a barber is refused with context.required = website.update', async () => {
    const res = await refresh('E004');
    expect([res.status, res.body.context]).toStrictEqual([403, { required: 'website.update' }]);
  });
});
