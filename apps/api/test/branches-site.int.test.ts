import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { B4, revalidateJobs } from './helpers/branches.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-branch-management task 3.10 — organization spec "Branch writes that the public site shows queue a
// website refresh" (API-PUB-03 · ADR-002 · ADR-006 · design D8). SiteContent.touch itself (task 3.9) is
// the shared piece of add-company-profile, tested in site-content.int.test.ts. No worker runs in
// test:int, so every queued site.revalidate job stays in pgboss.job; each test compares the queue
// before and after its requests.
const B = FIXTURE_IDS.branches;
let t: SeededApp;
let kyawZin: { readonly cookie: string };
let b4 = '';

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T09:30:00+06:30') });
  kyawZin = await t.signIn('E001');
});
afterAll(async () => {
  await t.close();
});

/** The jobs queued while `work` runs. */
async function queuedBy(work: () => Promise<unknown>): Promise<{ tags: string[] }[]> {
  const before = (await revalidateJobs(t.prisma)).length;
  await work();
  return (await revalidateJobs(t.prisma)).slice(before);
}
const call = (method: 'post' | 'patch', path: string, body: object) =>
  t.http[method](`/api/v1/${path}`).set('Cookie', kyawZin.cookie).send(body);

describe('add-branch-management · organization · Branch writes that the public site shows queue a website refresh', () => {
  it('Scenario: Create', async () => {
    const jobs = await queuedBy(async () => {
      const res = await call('post', 'branches', B4);
      expect(res.status).toBe(201);
      b4 = (res.body as { id: string }).id;
    });
    expect(jobs).toStrictEqual([{ tags: ['home', 'branch:B4'] }]);
  });

  it('Scenario: A shown member changes', async () => {
    const jobs = await queuedBy(async () => {
      expect((await call('patch', `branches/${B.B3}`, { phone: '09 7700 0003' })).status).toBe(200);
      expect((await call('patch', `branches/${B.B3}`, { email: 'point3@point.test' })).status).toBe(
        200,
      );
    });
    expect(jobs).toStrictEqual([{ tags: ['home', 'branch:B3'] }, { tags: ['home', 'branch:B3'] }]);
  });

  it('Scenario: Only the radius changes', async () => {
    const jobs = await queuedBy(async () => {
      const res = await call('patch', `branches/${B.B3}`, { location_radius_meters: 150 });
      expect(res.status).toBe(200);
    });
    expect(jobs).toStrictEqual([]);
  });

  it('only the website address, or nothing at all, queues none either', async () => {
    const jobs = await queuedBy(async () => {
      expect(
        (await call('patch', `branches/${B.B3}`, { website_url: 'https://point.example/b3' }))
          .status,
      ).toBe(200);
      expect((await call('patch', `branches/${B.B3}`, { phone: '09 7700 0003' })).status).toBe(200);
    });
    expect(jobs).toStrictEqual([]);
  });

  it('is_public and the coordinates are shown members', async () => {
    const jobs = await queuedBy(async () => {
      expect((await call('patch', `branches/${B.B1}`, { is_public: false })).status).toBe(200);
      expect((await call('patch', `branches/${B.B1}`, { latitude: 16.8409 })).status).toBe(200);
    });
    expect(jobs).toStrictEqual([{ tags: ['home', 'branch:B1'] }, { tags: ['home', 'branch:B1'] }]);
  });

  it('Scenario: Status changes', async () => {
    const jobs = await queuedBy(async () => {
      expect((await call('post', `branches/${b4}/status`, { status: 0 })).status).toBe(200);
      const refused = await call('post', `branches/${B.B3}/status`, { status: 0 });
      expect(refused.status).toBe(409);
    });
    expect(jobs).toStrictEqual([{ tags: ['home', 'branch:B4'] }]);
  });

  it('a refused write queues none: a Zawgyi name on create is rolled back with its row', async () => {
    const jobs = await queuedBy(async () => {
      const res = await call('post', 'branches', {
        code: 'PX12345678',
        // "No. 3, Example Road" in Myanmar typed with a Zawgyi keyboard.
        name_mm:
          '\u1021\u1019\u103d\u1010\u1039 \u1043\u104a \u1005\u1019\u1039\u1038\u101e\u1015\u1039\u101c\u1019\u1039\u1038',
      });
      expect(res.status).toBe(400);
    });
    expect(jobs).toStrictEqual([]);
  });
});
