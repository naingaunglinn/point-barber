import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { B4 } from './helpers/branches.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-branch-management task 3.8 — organization spec "Each committed branch write leaves one audit row
// with the branch" (P1-RULE-10 · API-AUD-01 · D-AUD-01 · D-AUD-02 · design D7). U Kyaw Zin on Monday
// 05/Oct/2026.
const B = FIXTURE_IDS.branches;
const U = FIXTURE_IDS.users;
let t: SeededApp;
let kyawZin: { readonly cookie: string; readonly sessionId: string };
let b4 = '';

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T09:30:00+06:30') });
  kyawZin = await t.signIn('E001');
});
afterAll(async () => {
  await t.close();
});

const rowsOf = (res: { headers: Record<string, unknown> }) =>
  t.prisma.audit_events.findMany({
    where: { request_id: res.headers['x-request-id'] as string },
  });
const call = (method: 'post' | 'patch', path: string, body: object) =>
  t.http[method](`/api/v1/${path}`).set('Cookie', kyawZin.cookie).send(body);

describe('add-branch-management · organization · Each committed branch write leaves one audit row with the branch', () => {
  it('Scenario: Create', async () => {
    const res = await call('post', 'branches', B4);
    expect(res.status).toBe(201);
    b4 = (res.body as { id: string }).id;
    const rows = await rowsOf(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 1,
      action: 'branch.create',
      entity_type: 'branches',
      entity_id: b4,
      branch_id: b4,
      actor_user_id: U.E001,
      actor_session_id: kyawZin.sessionId,
      before_data: null,
      reason: null,
    });
    expect(rows[0]?.after_data).toMatchObject({
      code: 'B4',
      name_mm: 'ပွိုင့် ၄.၀',
      name_en: 'Point 4.0',
      status: 1,
      is_public: true,
      location_radius_meters: 100,
    });
  });

  it('Scenario: Update', async () => {
    const res = await call('patch', `branches/${B.B3}`, { phone: '09 7700 0003' });
    expect(res.status).toBe(200);
    const rows = await rowsOf(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 1,
      action: 'branch.update',
      entity_type: 'branches',
      entity_id: B.B3,
      branch_id: B.B3,
      actor_user_id: U.E001,
      before_data: { phone: null },
      after_data: { phone: '09 7700 0003' },
    });
  });

  it('Scenario: Status with a reason', async () => {
    const res = await call('post', `branches/${b4}/status`, {
      status: 0,
      reason: 'Not opening this year',
    });
    expect(res.status).toBe(200);
    const rows = await rowsOf(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'branch.status',
      entity_type: 'branches',
      entity_id: b4,
      branch_id: b4,
      before_data: { status: 1 },
      after_data: { status: 0 },
      reason: 'Not opening this year',
    });
  });

  it('a status change without a reason records reason null', async () => {
    const res = await call('post', `branches/${b4}/status`, { status: 1 });
    expect(res.status).toBe(200);
    expect(await rowsOf(res)).toMatchObject([{ action: 'branch.status', reason: null }]);
  });

  it('Scenario: Refused and unchanged writes leave no row', async () => {
    const refused = await call('post', `branches/${B.B3}/status`, { status: 0 });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'branch_in_use' });
    const before = (await t.http.get(`/api/v1/branches/${B.B3}`).set('Cookie', kyawZin.cookie))
      .body as { updated_at: string };
    t.clock?.set(new Date('2026-10-05T10:30:00+06:30'));
    const unchanged = await call('patch', `branches/${B.B3}`, { phone: '09 7700 0003' });
    expect(unchanged.status).toBe(200);
    expect((unchanged.body as { updated_at: string }).updated_at).toBe(before.updated_at);
    expect(await rowsOf(refused)).toHaveLength(0);
    expect(await rowsOf(unchanged)).toHaveLength(0);
  });

  it('only the changed members are recorded, a coordinate as a number', async () => {
    const res = await call('patch', `branches/${B.B3}`, {
      phone: '09 7700 0003',
      latitude: 16.8409,
      longitude: 96.1735,
    });
    expect(await rowsOf(res)).toMatchObject([
      {
        before_data: { latitude: null, longitude: null },
        after_data: { latitude: 16.8409, longitude: 96.1735 },
      },
    ]);
    const again = await call('patch', `branches/${B.B3}`, { latitude: 16.8409 });
    expect(await rowsOf(again)).toHaveLength(0);
  });
});
