import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { B4, UNKNOWN_ID } from './helpers/branches.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-website-management tasks 2.1, 2.2 and 2.5 — P8.WEB.03 / 04 (P8-RULE-01 · P8-RULE-12 · P8-RULE-19 ·
// P7-RULE-03 · owner F7 · design D5): who reads and writes a branch's week, the week as read, and a save
// that writes only the weekdays that change. B3's fixture week is 9:00 AM – 9:00 PM every day, last set
// by U Kyaw Zin at 2026-10-01T09:00:00.000+06:30. Monday 05/Oct/2026.
const { B1, B3 } = FIXTURE_IDS.branches;
const { users } = FIXTURE_IDS;
const mmt = (local: string) => new Date(`${local}+06:30`);
const OCT_1 = '2026-10-01T09:00:00.000+06:30';

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T10:00:00'));
  await s.prisma.branch_opening_hours.updateMany({ data: { updated_at: new Date(OCT_1) } });
});
afterAll(() => s.close());

const at = (local: string) => s.clock?.set(mmt(local));
const cookieOf = async (who: FixturePerson) => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  return cookie;
};
const path = (branchId: string) => `/api/v1/website/branches/${branchId}/hours`;
const read = async (who: FixturePerson, branchId: string) =>
  s.http.get(path(branchId)).set('Cookie', await cookieOf(who));
const save = async (who: FixturePerson, branchId: string, body: object) =>
  s.http
    .put(path(branchId))
    .set('Cookie', await cookieOf(who))
    .send(body);

const day = (dayOfWeek: number, members: object = {}) => ({
  day_of_week: dayOfWeek,
  is_closed: false,
  opens_at: '09:00',
  closes_at: '21:00',
  ...members,
});
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => day(dayOfWeek));
const MONDAY_CLOSED = [
  day(1, { is_closed: true, opens_at: null, closes_at: null }),
  ...WEEK.slice(1),
];

const rowsOf = (branchId: string) =>
  s.prisma.branch_opening_hours.findMany({
    where: { branch_id: branchId },
    orderBy: { day_of_week: 'asc' },
    select: { day_of_week: true, is_closed: true, updated_at: true, updated_by_user_id: true },
  });
const jobs = () =>
  s.prisma.$queryRaw<{ data: { tags: string[] } }[]>`
    SELECT data FROM pgboss.job WHERE name = 'site.revalidate' ORDER BY created_on`;
const audits = () =>
  s.prisma.audit_events.findMany({
    where: { action: 'website.hours_update' },
    select: { branch_id: true, before_data: true, after_data: true },
  });
const written = async () => ({ jobs: (await jobs()).length, audits: (await audits()).length });

describe('add-website-management · website · Hours, closures and the booking QR are branch data (task 2.1)', () => {
  it("Scenario: A branch manager edits her own branch's hours, not another's", async () => {
    const before = await written();
    const b1 = await rowsOf(B1);
    const other = await save('E002', B1, { days: WEEK });
    expect([other.status, other.body.code, other.body.context]).toStrictEqual([
      403,
      'forbidden',
      { required: 'website.update' },
    ]);
    expect(await rowsOf(B1)).toStrictEqual(b1);
    expect(await written()).toStrictEqual(before);
    // The read of another branch is 404 (API-PERM-03 — recorded reading of the A1b PR).
    expect((await read('E002', B1)).status).toBe(404);
    expect((await read('E002', B3)).status).toBe(200);
  });

  it("Ko Zaw (Manager · B1) writes B1's week; U Kyaw Zin reads any branch", async () => {
    expect((await save('E003', B1, { days: WEEK })).status).toBe(200);
    expect((await read('E001', B1)).status).toBe(200);
  });

  it('Ko Aung (no website code) is refused with context.required', async () => {
    const reading = await read('E004', B3);
    const writing = await save('E004', B3, { days: WEEK });
    expect([reading.status, reading.body.code, reading.body.context]).toStrictEqual([
      403,
      'forbidden',
      { required: 'website.view' },
    ]);
    expect([writing.status, writing.body.context]).toStrictEqual([
      403,
      { required: 'website.update' },
    ]);
  });

  it('an unknown branch is 404 not_found, for a read and a write', async () => {
    const before = await written();
    for (const res of [
      await read('E001', UNKNOWN_ID),
      await save('E001', UNKNOWN_ID, { days: WEEK }),
    ]) {
      expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
    }
    expect(await written()).toStrictEqual(before);
  });
});

describe('add-website-management · website · Opening hours are read as one week (task 2.2)', () => {
  it("Scenario: B3's week", async () => {
    const res = await read('E002', B3);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      branch_id: B3,
      configured: true,
      days: WEEK,
      updated_at: OCT_1,
      updated_by: { user_id: users.E001, display_name: 'ဦးကျော်ဇင်' },
    });
  });

  it('Scenario: A branch without hours', async () => {
    const created = await s.http
      .post('/api/v1/branches')
      .set('Cookie', await cookieOf('E001'))
      .send(B4);
    const res = await read('E001', String(created.body.id));
    expect(res.body).toStrictEqual({
      branch_id: created.body.id,
      configured: false,
      days: [],
      updated_at: null,
      updated_by: null,
    });
  });
});

describe('add-website-management · website · An hours save is a whole valid week (P8.WEB.04)', () => {
  it('Scenario: Six days — 400 validation at days, B3 unchanged', async () => {
    const res = await save('E002', B3, { days: WEEK.slice(0, 6) });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', errors: [{ field: 'days' }] });
  });

  it('Scenario: Four wrong days at once', async () => {
    const days = [
      day(1, { is_closed: true, opens_at: '09:00', closes_at: null }),
      day(2, { opens_at: null, closes_at: null }),
      day(3, { closes_at: '00:00' }),
      day(4, { opens_at: '21:00', closes_at: '09:00' }),
      ...WEEK.slice(4),
    ];
    const res = await save('E002', B3, { days });
    expect([res.status, res.body.code]).toStrictEqual([400, 'validation']);
    expect(res.body.errors).toStrictEqual([
      { field: 'days[0]', code: 'times_not_allowed' },
      { field: 'days[1]', code: 'times_required' },
      { field: 'days[2]', code: 'overnight_not_allowed' },
      { field: 'days[3]', code: 'closes_before_opens' },
    ]);
  });
});

describe('add-website-management · website · An hours save writes only the weekdays that change (task 2.5)', () => {
  it('Scenario: Monday closed at B3', async () => {
    at('2026-10-05T10:00:00');
    const before = await written();
    const res = await save('E002', B3, { days: MONDAY_CLOSED });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      configured: true,
      updated_at: '2026-10-05T10:00:00.000+06:30',
      updated_by: { user_id: users.E002 },
    });
    const rows = await rowsOf(B3);
    expect(rows[0]).toStrictEqual({
      day_of_week: 1,
      is_closed: true,
      updated_at: mmt('2026-10-05T10:00:00'),
      updated_by_user_id: users.E002,
    });
    for (const row of rows.slice(1)) {
      expect([row.updated_at, row.updated_by_user_id]).toStrictEqual([new Date(OCT_1), users.E001]);
    }
    expect((await jobs()).slice(before.jobs).map((job) => job.data.tags)).toStrictEqual([
      ['home', 'branch:B3'],
    ]);
    expect((await audits()).slice(before.audits)).toStrictEqual([
      {
        branch_id: B3,
        before_data: { '1': { is_closed: false, opens_at: '09:00', closes_at: '21:00' } },
        after_data: { '1': { is_closed: true, opens_at: null, closes_at: null } },
      },
    ]);
  });

  it('Scenario: The same week again', async () => {
    at('2026-10-05T10:05:00');
    const before = await written();
    const rows = await rowsOf(B3);
    const res = await save('E002', B3, { days: MONDAY_CLOSED });
    expect([res.status, res.body.updated_at]).toStrictEqual([200, '2026-10-05T10:00:00.000+06:30']);
    expect(await rowsOf(B3)).toStrictEqual(rows);
    expect(await written()).toStrictEqual(before);
  });

  it('Scenario: Stale week', async () => {
    const before = await written();
    const res = await save('E001', B3, { days: WEEK, expected_updated_at: OCT_1 });
    expect([res.status, res.body.code]).toStrictEqual([409, 'conflict']);
    expect(await written()).toStrictEqual(before);
    const fresh = await save('E001', B3, {
      days: MONDAY_CLOSED,
      expected_updated_at: '2026-10-05T10:00:00.000+06:30',
    });
    expect(fresh.status).toBe(200);
  });

  it('a branch without rows gets seven inserts', async () => {
    const created = await s.http
      .post('/api/v1/branches')
      .set('Cookie', await cookieOf('E001'))
      .send({ ...B4, code: 'B5' });
    const branchId = String(created.body.id);
    const res = await save('E001', branchId, { days: WEEK });
    expect([res.status, res.body.configured, res.body.days]).toStrictEqual([200, true, WEEK]);
    expect(await rowsOf(branchId)).toHaveLength(7);
    expect((await jobs()).at(-1)?.data.tags).toStrictEqual(['home', 'branch:B5']);
  });

  it('two first saves of a branch without rows take turns: both 200, seven rows', async () => {
    const created = await s.http
      .post('/api/v1/branches')
      .set('Cookie', await cookieOf('E001'))
      .send({ ...B4, code: 'B6' });
    const branchId = String(created.body.id);
    const cookie = await cookieOf('E001');
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // Another connection holds the branch row, so both saves are in flight before either one inserts.
    const holder = s.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM branches WHERE id = ${branchId}::uuid FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 20_000 },
    );
    await ready;
    const saves = [WEEK, MONDAY_CLOSED].map((days) =>
      s.http.put(path(branchId)).set('Cookie', cookie).send({ days }),
    );
    const settled = Promise.all(saves);
    await new Promise((resolve) => setTimeout(resolve, 500));
    release();
    await holder;
    const results = await settled;
    expect(results.map((res) => res.status)).toStrictEqual([200, 200]);
    expect(await rowsOf(branchId)).toHaveLength(7);
  });
});
