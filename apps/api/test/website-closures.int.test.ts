import { randomUUID } from 'node:crypto';

import { BookingStatus, ScopeType, UserStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BranchClosures } from '../src/modules/platform/index.js';
import { bookingAt } from './builders/bookings.js';
import { UNKNOWN_ID, revalidateJobs } from './helpers/branches.js';
import { assignRole } from './helpers/roles.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-website-management tasks 3.1 – 3.5 — P8.WEB.05 / 06 (P8-RULE-12 · P7-RULE-03 · owner F7 / F8 / WM9 ·
// design D6 / D7): a closure's dates, the overlap rule, the bookings inside it and the list. Monday
// 05/Oct/2026 10:00 AM; U Kyaw Zin is the admin, Ma Hnin the Manager of B3, Ko Zaw the Manager of B1.
const { B1, B2, B3 } = FIXTURE_IDS.branches;
const { E002, E004, E005 } = FIXTURE_IDS.employees;
const mmt = (local: string) => new Date(`${local}+06:30`);
const API = '/api/v1/website/closures';
// A Myanmar text typed with a Zawgyi keyboard (detector probability ≥ 0.95).
const ZAWGYI = 'အမွတ္ ၃၊ စမ္းသပ္လမ္း';
const THINGYAN = {
  branch_id: B3,
  start_date: '2027-04-13',
  end_date: '2027-04-16',
  notice_mm: 'သင်္ကြန် ပိတ်ရက်',
  notice_en: 'Thingyan holidays',
};

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T10:00:00'));
});
afterAll(() => s.close());
beforeEach(async () => {
  await s.prisma.bookings.deleteMany();
  await s.prisma.branch_closures.deleteMany();
});

const cookieOf = async (who: FixturePerson) => {
  const cookie = cookies.get(who) ?? (await s.signIn(who)).cookie;
  cookies.set(who, cookie);
  return cookie;
};
const create = async (who: FixturePerson, body: object) =>
  s.http
    .post(API)
    .set('Cookie', await cookieOf(who))
    .send(body);
const list = async (who: FixturePerson, query = '') =>
  s.http.get(`${API}${query}`).set('Cookie', await cookieOf(who));

/** A closure written directly (the creating user is U Kyaw Zin). */
const closureRow = async (
  branchId: string,
  start: string,
  end: string,
  members: { archived?: boolean; notice?: string } = {},
) => {
  const id = randomUUID();
  await s.prisma.branch_closures.create({
    data: {
      id,
      branch_id: branchId,
      start_date: new Date(`${start}T00:00:00Z`),
      end_date: new Date(`${end}T00:00:00Z`),
      notice_mm: members.notice ?? 'ပိတ်ရက်',
      created_by_user_id: FIXTURE_IDS.users.E001,
      archived_at: members.archived === true ? new Date('2026-10-01T00:00:00Z') : null,
    },
  });
  return id;
};
/** The Myanmar display name — the caller's language when no language is set (AD-L10N-03). */
const nameOf = async (employeeId: string) =>
  (await s.prisma.employees.findUniqueOrThrow({ where: { id: employeeId } })).name_mm;
const closures = () => s.prisma.branch_closures.findMany({ orderBy: { start_date: 'asc' } });
const audits = () =>
  s.prisma.audit_events.findMany({
    where: { action: 'website.closure_create' },
    select: { branch_id: true, after_data: true },
  });
const written = async () => ({
  closures: (await closures()).length,
  audits: (await audits()).length,
  jobs: (await revalidateJobs(s.prisma)).length,
});

describe('add-website-management · website · A closure starts today or later, ends on or after its start and lasts at most 366 days (task 3.1)', () => {
  it('Scenario: Thingyan at B3 — 201, upcoming, one audit row with the branch, one refresh job', async () => {
    const jobs = (await revalidateJobs(s.prisma)).length;
    const auditsBefore = (await audits()).length;
    const res = await create('E002', THINGYAN);
    expect(res.status).toBe(201);
    expect(res.body.closure).toMatchObject({
      branch_id: B3,
      start_date: '2027-04-13',
      end_date: '2027-04-16',
      notice_mm: THINGYAN.notice_mm,
      notice_en: 'Thingyan holidays',
      state: 'upcoming',
      archived_at: null,
      created_by: { user_id: FIXTURE_IDS.users.E002, display_name: await nameOf(E002) },
    });
    expect([res.body.affected_bookings, res.body.warnings]).toStrictEqual([[], []]);
    expect(res.headers.location).toBe(`/api/v1/website/closures/${res.body.closure.id}`);
    expect(await closures()).toHaveLength(1);
    const rows = (await audits()).slice(auditsBefore);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.branch_id).toBe(B3);
    const after = await revalidateJobs(s.prisma);
    expect(after.slice(jobs)).toStrictEqual([{ tags: ['home', 'branch:B3'] }]);
  });

  it('Scenario: Yesterday — 422 date_in_past and nothing is stored; today is accepted', async () => {
    const before = await written();
    const res = await create('E002', {
      ...THINGYAN,
      start_date: '2026-10-04',
      end_date: '2026-10-05',
    });
    expect([res.status, res.body.code]).toStrictEqual([422, 'date_in_past']);
    expect(await written()).toStrictEqual(before);
    const today = await create('E002', {
      ...THINGYAN,
      start_date: '2026-10-05',
      end_date: '2026-10-05',
    });
    expect([today.status, today.body.closure?.state]).toStrictEqual([201, 'current']);
  });

  it('Scenario: 366 days and 367 days', async () => {
    const ok = await create('E001', {
      ...THINGYAN,
      branch_id: B1,
      start_date: '2026-10-12',
      end_date: '2027-10-12',
    });
    expect(ok.status).toBe(201);
    const before = await written();
    const tooLong = await create('E001', {
      ...THINGYAN,
      branch_id: B2,
      start_date: '2026-10-12',
      end_date: '2027-10-13',
    });
    expect([tooLong.status, tooLong.body.code, tooLong.body.context]).toStrictEqual([
      422,
      'range_too_long',
      { max_days: 366 },
    ]);
    expect(await written()).toStrictEqual(before);
  });

  it('Scenario: End before start, and no Myanmar notice — 400 at end_date and at notice_mm', async () => {
    const before = await written();
    const backwards = await create('E002', {
      ...THINGYAN,
      start_date: '2026-10-13',
      end_date: '2026-10-12',
    });
    expect([backwards.status, backwards.body.code, backwards.body.errors[0].field]).toStrictEqual([
      400,
      'validation',
      'end_date',
    ]);
    const blank = await create('E002', {
      ...THINGYAN,
      start_date: '2026-10-12',
      end_date: '2026-10-13',
      notice_mm: '  ',
    });
    expect([blank.status, blank.body.code, blank.body.errors[0].field]).toStrictEqual([
      400,
      'validation',
      'notice_mm',
    ]);
    expect(await written()).toStrictEqual(before);
  });

  it('the notice bounds: 300 characters are stored, 301 are refused (mm and en)', async () => {
    const long = (length: number) => 'က'.repeat(length);
    const ok = await create('E002', {
      ...THINGYAN,
      notice_mm: long(300),
      notice_en: 'a'.repeat(300),
    });
    expect(ok.status).toBe(201);
    const before = await written();
    for (const [member, value] of [
      ['notice_mm', long(301)],
      ['notice_en', 'a'.repeat(301)],
    ] as const) {
      const res = await create('E002', {
        ...THINGYAN,
        start_date: '2027-06-01',
        end_date: '2027-06-02',
        [member]: value,
      });
      expect([res.status, res.body.errors?.[0]?.field]).toStrictEqual([400, member]);
    }
    expect(await written()).toStrictEqual(before);
  });

  it('a Zawgyi notice is refused with zawgyi_text and nothing is stored', async () => {
    const before = await written();
    const res = await create('E002', { ...THINGYAN, notice_mm: ZAWGYI });
    expect([res.status, res.body.code, res.body.errors]).toStrictEqual([
      400,
      'zawgyi_text',
      [{ field: 'notice_mm', code: 'zawgyi_text' }],
    ]);
    expect(await written()).toStrictEqual(before);
  });

  it('Ma Hnin cannot close B1 (403 forbidden); an unknown branch is not found; nothing is written', async () => {
    const before = await written();
    const other = await create('E002', { ...THINGYAN, branch_id: B1 });
    expect([other.status, other.body.code, other.body.context]).toStrictEqual([
      403,
      'forbidden',
      { required: 'website.update' },
    ]);
    expect(await written()).toStrictEqual(before);
  });
});

it('a branch that does not exist is 404 and nothing is written', async () => {
  const before = await written();
  const res = await create('E001', { ...THINGYAN, branch_id: UNKNOWN_ID });
  expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
  expect(await written()).toStrictEqual(before);
});

describe('add-website-management · website · Closures of one branch never overlap (task 3.2)', () => {
  it('Scenario: Overlapping by one day — 409 closure_overlap with the id of the existing closure', async () => {
    const existing = await closureRow(B3, '2026-10-12', '2026-10-13');
    const before = await written();
    const res = await create('E002', {
      ...THINGYAN,
      start_date: '2026-10-13',
      end_date: '2026-10-14',
    });
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      409,
      'closure_overlap',
      { closure_id: existing },
    ]);
    expect(await written()).toStrictEqual(before);
  });

  it('Scenario: Back to back is allowed', async () => {
    await closureRow(B3, '2026-10-12', '2026-10-13');
    const res = await create('E002', {
      ...THINGYAN,
      start_date: '2026-10-14',
      end_date: '2026-10-15',
    });
    expect(res.status).toBe(201);
  });

  it("an archived closure and another branch's closure do not count", async () => {
    await closureRow(B3, '2026-10-12', '2026-10-13', { archived: true });
    await closureRow(B1, '2026-10-12', '2026-10-13');
    const res = await create('E002', {
      ...THINGYAN,
      start_date: '2026-10-12',
      end_date: '2026-10-13',
    });
    expect(res.status).toBe(201);
  });

  it('two requests for the same days at once — one 201 and one 409 naming the winner (R2)', async () => {
    const auditsBefore = (await audits()).length;
    const body = { ...THINGYAN, start_date: '2026-11-02', end_date: '2026-11-03' };
    const [a, b] = await Promise.all([create('E002', body), create('E001', body)]);
    expect([a.status, b.status].sort()).toStrictEqual([201, 409]);
    const winner = a.status === 201 ? a : b;
    const loser = a.status === 201 ? b : a;
    expect([loser.body.code, loser.body.context]).toStrictEqual([
      'closure_overlap',
      { closure_id: winner.body.closure.id },
    ]);
    expect(await closures()).toHaveLength(1);
    expect((await audits()).length - auditsBefore).toBe(1);
  });
});

describe('add-website-management · website · Bookings inside a closure are listed, never cancelled (task 3.4)', () => {
  const bookedTwo = async () => {
    const first = await bookingAt(s.prisma, {
      branch: B3,
      status: BookingStatus.BOOKED,
      startsAt: mmt('2026-10-13T14:00:00'),
    });
    const second = await bookingAt(s.prisma, {
      branch: B3,
      status: BookingStatus.BOOKED,
      startsAt: mmt('2026-10-13T16:00:00'),
    });
    const company = (await s.prisma.branches.findUniqueOrThrow({ where: { id: B3 } })).company_id;
    const customer = (
      await s.prisma.customers.upsert({
        where: {
          company_id_phone_normalized: { company_id: company, phone_normalized: '+959771234567' },
        },
        update: {},
        create: {
          id: randomUUID(),
          company_id: company,
          name: 'Ko Phyo',
          phone: '09 7712 3457',
          phone_normalized: '+959771234567',
        },
      })
    ).id;
    await s.prisma.bookings.update({
      where: { id: second },
      data: { customer_id: customer, customer_name: 'Ko Phyo', booked_employee_id: E005 },
    });
    return { first, second };
  };
  const CLOSURE = { ...THINGYAN, start_date: '2026-10-12', end_date: '2026-10-13' };

  /** `booking.view` is a code of add-staff-booking (#36): this test adds it to the catalogue. */
  const grantBookingView = async (employeeId: string) => {
    await s.prisma.permissions.upsert({
      where: { code: 'booking.view' },
      update: {},
      create: { id: randomUUID(), code: 'booking.view', module: 'booking', action: 'view' },
    });
    await assignRole(s.prisma, {
      name: 'Booking viewer',
      employeeId,
      codes: ['booking.view'],
      scope: ScopeType.BRANCHES,
      branchIds: [B3],
    });
  };

  it('Scenario: Without a booking code the customer stays hidden (Ma Thida, "Website editor")', async () => {
    const { first, second } = await bookedTwo();
    // Ma Thida is only invited in the fixture; she signs in for this scenario.
    await s.prisma.users.update({
      where: { id: FIXTURE_IDS.users.E008 },
      data: { status: UserStatus.ACTIVE },
    });
    await assignRole(s.prisma, {
      name: 'Website editor',
      employeeId: FIXTURE_IDS.employees.E008,
      codes: ['website.view', 'website.update'],
      scope: ScopeType.BRANCHES,
      branchIds: [B3],
    });
    const res = await create('E008', CLOSURE);
    expect(res.status).toBe(201);
    expect(res.body.affected_bookings).toStrictEqual([
      {
        booking_id: first,
        starts_at: '2026-10-13T14:00:00.000+06:30',
        booked_employee: { id: E004, display_name: await nameOf(E004) },
      },
      {
        booking_id: second,
        starts_at: '2026-10-13T16:00:00.000+06:30',
        booked_employee: { id: E005, display_name: await nameOf(E005) },
      },
    ]);
  });

  it('Scenario: Two bookings on 13/Oct — Ma Hnin with booking.view sees the customers; both stay BOOKED', async () => {
    const { first, second } = await bookedTwo();
    await grantBookingView(E002);
    const before = await s.prisma.bookings.findMany({ orderBy: { starts_at: 'asc' } });
    const res = await create('E002', CLOSURE);
    expect(res.status).toBe(201);
    expect(
      res.body.affected_bookings.map(
        (row: { booking_id: string; customer_name: string; customer_phone: string }) => [
          row.booking_id,
          row.customer_name,
        ],
      ),
    ).toStrictEqual([
      [first, 'Ma Su'],
      [second, 'Ko Phyo'],
    ]);
    expect(res.body.affected_bookings[1].customer_phone).toBe('+959771234567');
    expect(res.body.warnings).toStrictEqual([
      { code: 'bookings_in_closure', params: { count: 2 } },
    ]);
    // Nothing about the bookings changed (owner F8 · D-CUS-05).
    expect(await s.prisma.bookings.findMany({ orderBy: { starts_at: 'asc' } })).toStrictEqual(
      before,
    );
    expect(before.map((row) => row.status)).toStrictEqual([
      BookingStatus.BOOKED,
      BookingStatus.BOOKED,
    ]);
  });

  it('Scenario: More bookings than the list holds — 100 listed, count 101, truncated { shown: 100, total: 101 }', async () => {
    const template = await bookingAt(s.prisma, {
      branch: B3,
      status: BookingStatus.BOOKED,
      startsAt: mmt('2026-10-13T09:00:00'),
    });
    const row = await s.prisma.bookings.findUniqueOrThrow({ where: { id: template } });
    await s.prisma.bookings.deleteMany();
    // One-minute bookings of one barber, a minute apart (bookings_no_overlap).
    await s.prisma.bookings.createMany({
      data: Array.from({ length: 101 }, (_, index) => {
        const id = randomUUID();
        const startsAt = new Date(mmt('2026-10-13T09:00:00').getTime() + index * 60_000);
        const endsAt = new Date(startsAt.getTime() + 60_000);
        return {
          ...row,
          id,
          starts_at: startsAt,
          ends_at: endsAt,
          block_starts_at: startsAt,
          block_ends_at: endsAt,
          manage_token_hash: `test-${id}`,
        };
      }),
    });
    expect(await s.prisma.bookings.count()).toBe(101);
    const res = await create('E002', CLOSURE);
    expect(res.status).toBe(201);
    expect(res.body.affected_bookings).toHaveLength(100);
    expect(res.body.warnings).toStrictEqual([
      { code: 'bookings_in_closure', params: { count: 101 } },
      { code: 'truncated', params: { shown: 100, total: 101 } },
    ]);
    const starts = res.body.affected_bookings.map((item: { starts_at: string }) => item.starts_at);
    expect([...starts].sort()).toStrictEqual(starts);
  });
});

describe('add-website-management · website · Closures are listed by branch scope, current and future by default (task 3.5)', () => {
  const seedThree = async () => {
    await closureRow(B3, '2026-10-01', '2026-10-02');
    const current = await closureRow(B3, '2026-10-04', '2026-10-07');
    const upcoming = await closureRow(B3, '2026-10-12', '2026-10-13');
    return { current, upcoming };
  };
  const ids = (res: { body: { items: { id: string }[] } }) => res.body.items.map((item) => item.id);

  it('Scenario: The default list — 04/Oct – 07/Oct (current) and 12/Oct – 13/Oct (upcoming)', async () => {
    const { current, upcoming } = await seedThree();
    const res = await list('E002');
    expect(res.status).toBe(200);
    expect(ids(res)).toStrictEqual([current, upcoming]);
    expect(res.body.items.map((item: { state: string }) => item.state)).toStrictEqual([
      'current',
      'upcoming',
    ]);
    expect(res.body.next_cursor).toBeNull();
  });

  it('Scenario: Another branch — Ma Hnin asking for B1 gets 200 and no items', async () => {
    await closureRow(B1, '2026-10-12', '2026-10-13');
    const res = await list('E002', `?branch_id=${B1}`);
    expect([res.status, res.body.items]).toStrictEqual([200, []]);
    // Without the filter she sees only her own branch.
    expect((await list('E002')).body.items).toHaveLength(0);
    expect((await list('E001')).body.items).toHaveLength(1);
  });

  it('from and to select the closures that overlap [from, to]', async () => {
    const { current } = await seedThree();
    const res = await list('E002', '?from=2026-10-02&to=2026-10-04');
    expect(res.body.items.map((item: { id: string }) => item.id)).toHaveLength(2);
    expect(ids(await list('E002', '?from=2026-10-05&to=2026-10-06'))).toStrictEqual([current]);
    expect(ids(await list('E002', '?from=2026-10-08&to=2026-10-11'))).toStrictEqual([]);
  });

  it('include_archived adds archived closures; the default leaves them out', async () => {
    const archived = await closureRow(B3, '2026-10-20', '2026-10-21', { archived: true });
    expect(ids(await list('E002'))).toStrictEqual([]);
    const all = await list('E002', '?include_archived=true');
    expect(ids(all)).toStrictEqual([archived]);
    expect(all.body.items[0].state).toBe('archived');
  });

  it('is ordered by start_date and then branch code, with cursor paging', async () => {
    const b3 = await closureRow(B3, '2026-10-12', '2026-10-13');
    const b1 = await closureRow(B1, '2026-10-12', '2026-10-13');
    const early = await closureRow(B2, '2026-10-10', '2026-10-11');
    const first = await list('E001', '?limit=2');
    expect(ids(first)).toStrictEqual([early, b1]);
    expect(first.body.next_cursor).toEqual(expect.any(String));
    const second = await list('E001', `?limit=2&cursor=${first.body.next_cursor}`);
    expect(ids(second)).toStrictEqual([b3]);
    expect(second.body.next_cursor).toBeNull();
  });

  it('limit 1 and 100 are accepted, 101 and 0 are 400 on limit', async () => {
    await seedThree();
    expect((await list('E002', '?limit=1')).body.items).toHaveLength(1);
    expect((await list('E002', '?limit=100')).status).toBe(200);
    for (const limit of ['101', '0']) {
      const res = await list('E002', `?limit=${limit}`);
      expect([res.status, res.body.errors[0].field]).toStrictEqual([400, 'limit']);
    }
  });

  it('BranchClosures.onDates expands 12/Oct – 13/Oct into two dates and leaves archived ones out', async () => {
    await closureRow(B3, '2026-10-12', '2026-10-13', { notice: 'ပိတ်ရက်' });
    await closureRow(B3, '2026-10-20', '2026-10-21', { archived: true });
    await closureRow(B1, '2026-10-12', '2026-10-12');
    const dates = await s.app.get(BranchClosures).onDates({
      branch_ids: [B3],
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(dates).toStrictEqual([
      { branch_id: B3, date: '2026-10-12', notice_mm: 'ပိတ်ရက်', notice_en: null },
      { branch_id: B3, date: '2026-10-13', notice_mm: 'ပိတ်ရက်', notice_en: null },
    ]);
    // The window cuts a closure: only the days inside it.
    expect(
      (
        await s.app
          .get(BranchClosures)
          .onDates({ branch_ids: [B3], from: '2026-10-13', to: '2026-10-13' })
      ).map((entry) => entry.date),
    ).toStrictEqual(['2026-10-13']);
  });
});
