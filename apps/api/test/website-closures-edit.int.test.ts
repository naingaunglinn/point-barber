import { randomUUID } from 'node:crypto';

import { BookingStatus, toMmtIsoMillis } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DomainEvents, type DomainEvent } from '../src/common/events/domain-events.js';
import { BackgroundTasks } from '../src/common/http/background-tasks.js';
import { BookingOptionsCache } from '../src/modules/platform/index.js';
import { bookingAt } from './builders/bookings.js';
import { UNKNOWN_ID, revalidateJobs } from './helpers/branches.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-website-management tasks 4.1, 4.3 and 4.4 — P8.WEB.07 / 08 (P8-RULE-12 · P7-RULE-03 · P8-RULE-19 ·
// owner F8 / WM4 · design D6 / D9): a closure is edited by its state, archived while no past day changes,
// and every changing write queues one refresh job, collects `schedule.changed` for the branch's room and
// tells the booking-options cache after the commit. Monday 05/Oct/2026 10:00 AM; Ma Hnin is the Manager
// of B3, Ko Zaw the Manager of B1, U Kyaw Zin the admin.
const { B1, B3 } = FIXTURE_IDS.branches;
const mmt = (local: string) => new Date(`${local}+06:30`);
const API = '/api/v1/website/closures';
const ZAWGYI = 'အမွတ္ ၃၊ စမ္းသပ္လမ္း';

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();
const events: DomainEvent[] = [];
const cleared = vi.fn<(branchIds: readonly string[]) => void>();

beforeAll(async () => {
  s = await seededApp(mmt('2026-10-05T10:00:00'));
  s.app.get(DomainEvents).on('schedule.changed', (event) => {
    events.push(event);
  });
  vi.spyOn(s.app.get(BookingOptionsCache), 'clear').mockImplementation(cleared);
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
const settled = async <T>(res: T): Promise<T> => {
  await s.app.get(BackgroundTasks).drain();
  return res;
};

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
      created_at: mmt('2026-10-01T09:00:00'),
      updated_at: mmt('2026-10-01T09:00:00'),
      archived_at: members.archived === true ? new Date('2026-10-01T00:00:00Z') : null,
    },
  });
  return id;
};
const rowOf = (id: string) => s.prisma.branch_closures.findUniqueOrThrow({ where: { id } });
/** The `expected_updated_at` a screen sends: the `updated_at` it last read. */
const stamp = async (id: string) => toMmtIsoMillis((await rowOf(id)).updated_at);
const patch = async (who: FixturePerson, id: string, body: object) =>
  settled(
    await s.http
      .patch(`${API}/${id}`)
      .set('Cookie', await cookieOf(who))
      .send(body),
  );
/** An edit of the closure as last read. */
const edit = async (who: FixturePerson, id: string, body: object) =>
  patch(who, id, { expected_updated_at: await stamp(id), ...body });
const archive = async (who: FixturePerson, id: string, body?: object) =>
  settled(
    await s.http
      .post(`${API}/${id}/archive`)
      .set('Cookie', await cookieOf(who))
      .send(body),
  );
const audits = (action: string) =>
  s.prisma.audit_events.findMany({
    where: { action },
    select: { branch_id: true, reason: true, before_data: true, after_data: true },
  });
/** What a write may leave behind: jobs, events and cache calls since the last mark. */
const marks = () => ({
  jobs: revalidateJobs(s.prisma).then((rows) => rows.length),
  events: events.length,
  cleared: cleared.mock.calls.length,
});
const effectsSince = async (before: ReturnType<typeof marks>) => ({
  jobs: (await revalidateJobs(s.prisma)).length - (await before.jobs),
  events: events.length - before.events,
  cleared: cleared.mock.calls.length - before.cleared,
});
const NO_EFFECTS = { jobs: 0, events: 0, cleared: 0 };

describe('add-website-management · website · A closure is edited according to its state (task 4.1)', () => {
  it('Scenario: End a started closure today — 200, state current, 06/Oct and 07/Oct no longer closed, one audit row', async () => {
    const id = await closureRow(B3, '2026-10-04', '2026-10-07');
    const before = await stamp(id);
    const res = await edit('E002', id, { end_date: '2026-10-05' });
    expect(res.status).toBe(200);
    expect(res.body.closure).toMatchObject({ id, end_date: '2026-10-05', state: 'current' });
    expect(res.body.closure.start_date).toBe('2026-10-04');
    const row = await rowOf(id);
    expect(row.end_date.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(toMmtIsoMillis(row.updated_at)).toBe('2026-10-05T10:00:00.000+06:30');
    expect(before).toBe('2026-10-01T09:00:00.000+06:30');
    const rows = await audits('website.closure_update');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      branch_id: B3,
      before_data: { end_date: '2026-10-07' },
      after_data: { end_date: '2026-10-05' },
    });
  });

  it('Scenario: Moving a started closure start — 422 closure_started; nothing written', async () => {
    const id = await closureRow(B3, '2026-10-04', '2026-10-07');
    const mark = marks();
    const res = await edit('E002', id, { start_date: '2026-10-05' });
    expect([res.status, res.body.code]).toStrictEqual([422, 'closure_started']);
    expect((await rowOf(id)).start_date.toISOString().slice(0, 10)).toBe('2026-10-04');
    expect(await effectsSince(mark)).toStrictEqual(NO_EFFECTS);
    expect(await audits('website.closure_update')).toHaveLength(0);
  });

  it('Scenario: Ending a started closure yesterday — 422 date_in_past (WM4 ★)', async () => {
    const id = await closureRow(B3, '2026-10-04', '2026-10-07');
    const res = await edit('E002', id, { end_date: '2026-10-04' });
    expect([res.status, res.body.code]).toStrictEqual([422, 'date_in_past']);
  });

  it('Scenario: A started closure keeps its start when the same start is sent back', async () => {
    const id = await closureRow(B3, '2026-10-04', '2026-10-07');
    const res = await edit('E002', id, {
      start_date: '2026-10-04',
      end_date: '2026-10-08',
      notice_en: 'Closed for repairs',
    });
    expect([res.status, res.body.closure?.end_date, res.body.closure?.notice_en]).toStrictEqual([
      200,
      '2026-10-08',
      'Closed for repairs',
    ]);
  });

  it('Scenario: An ended closure is history — 422 closure_past', async () => {
    const id = await closureRow(B3, '2026-10-01', '2026-10-02');
    const res = await edit('E002', id, { notice_en: 'Closed' });
    expect([res.status, res.body.code]).toStrictEqual([422, 'closure_past']);
  });

  it('Scenario: An archived closure — 409 invalid_transition', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13', { archived: true });
    const res = await edit('E002', id, { notice_en: 'Closed' });
    expect([res.status, res.body.code]).toStrictEqual([409, 'invalid_transition']);
  });

  it('Scenario: A stale edit — 409 conflict and nothing written', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const mark = marks();
    const res = await patch('E002', id, {
      expected_updated_at: '2026-10-01T08:59:59.999+06:30',
      end_date: '2026-10-14',
    });
    expect([res.status, res.body.code]).toStrictEqual([409, 'conflict']);
    expect((await rowOf(id)).end_date.toISOString().slice(0, 10)).toBe('2026-10-13');
    expect(await effectsSince(mark)).toStrictEqual(NO_EFFECTS);
  });

  it('Scenario: An upcoming closure moved onto an existing one — 409 closure_overlap with its id', async () => {
    const other = await closureRow(B3, '2026-10-20', '2026-10-21');
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const res = await edit('E002', id, { end_date: '2026-10-20' });
    expect([res.status, res.body.code, res.body.context]).toStrictEqual([
      409,
      'closure_overlap',
      { closure_id: other },
    ]);
  });

  it('Scenario: An upcoming closure may grow over its own days and move back to back', async () => {
    await closureRow(B3, '2026-10-20', '2026-10-21');
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const res = await edit('E002', id, { start_date: '2026-10-12', end_date: '2026-10-19' });
    expect([res.status, res.body.closure?.end_date, res.body.closure?.state]).toStrictEqual([
      200,
      '2026-10-19',
      'upcoming',
    ]);
  });

  it('Scenario: The new range decides — a past start, an end before the start, 367 days', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const past = await edit('E002', id, { start_date: '2026-10-04' });
    const backwards = await edit('E002', id, { start_date: '2026-10-14' });
    const long = await edit('E002', id, { end_date: '2027-10-13' });
    expect([past.status, past.body.code]).toStrictEqual([422, 'date_in_past']);
    expect([backwards.status, backwards.body.code, backwards.body.errors?.[0]?.field]).toStrictEqual(
      [400, 'validation', 'end_date'],
    );
    expect([long.status, long.body.code, long.body.context]).toStrictEqual([
      422,
      'range_too_long',
      { max_days: 366 },
    ]);
  });

  it('Scenario: The affected bookings of the new range are listed, none cancelled', async () => {
    const booked = await bookingAt(s.prisma, {
      branch: B3,
      status: BookingStatus.BOOKED,
      startsAt: mmt('2026-10-13T14:00:00'),
    });
    const id = await closureRow(B3, '2026-10-20', '2026-10-21');
    const res = await edit('E002', id, { start_date: '2026-10-12', end_date: '2026-10-13' });
    expect(res.status).toBe(200);
    expect(res.body.affected_bookings.map((row: { booking_id: string }) => row.booking_id)).toStrictEqual(
      [booked],
    );
    expect(res.body.warnings).toStrictEqual([{ code: 'bookings_in_closure', params: { count: 1 } }]);
    expect((await s.prisma.bookings.findUniqueOrThrow({ where: { id: booked } })).status).toBe(
      BookingStatus.BOOKED,
    );
  });

  it('Scenario: The same values again change nothing — 200, no audit row, job, event or cache call', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13', { notice: 'ပိတ်ရက် (စမ်းသပ်)' });
    const mark = marks();
    const res = await edit('E002', id, {
      start_date: '2026-10-12',
      end_date: '2026-10-13',
      notice_mm: 'ပိတ်ရက် (စမ်းသပ်)',
    });
    expect([res.status, res.body.closure?.updated_at]).toStrictEqual([
      200,
      '2026-10-01T09:00:00.000+06:30',
    ]);
    expect(await audits('website.closure_update')).toHaveLength(0);
    expect(await effectsSince(mark)).toStrictEqual(NO_EFFECTS);
  });

  it('Scenario: Another branch is refused (Ma Hnin, B1) and an unknown id is 404', async () => {
    const id = await closureRow(B1, '2026-10-12', '2026-10-13');
    const refused = await edit('E002', id, { end_date: '2026-10-14' });
    expect([refused.status, refused.body.code]).toStrictEqual([403, 'forbidden']);
    const unknown = await patch('E002', UNKNOWN_ID, {
      expected_updated_at: '2026-10-01T09:00:00.000+06:30',
    });
    expect(unknown.status).toBe(404);
    expect((await rowOf(id)).end_date.toISOString().slice(0, 10)).toBe('2026-10-13');
  });

  it('Scenario: A Zawgyi notice is 400 zawgyi_text and a missing expected_updated_at is 400', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const zawgyi = await edit('E002', id, { notice_mm: ZAWGYI });
    expect([zawgyi.status, zawgyi.body.code]).toStrictEqual([400, 'zawgyi_text']);
    const bare = await patch('E002', id, { end_date: '2026-10-14' });
    expect([bare.status, bare.body.code]).toStrictEqual([400, 'validation']);
  });
});

describe('add-website-management · website · Deleting a closure archives it only while no past day changes (task 4.3)', () => {
  it('Scenario: A closure made today by mistake — 200 archived, the reason in one audit row', async () => {
    const id = await closureRow(B3, '2026-10-05', '2026-10-05');
    const res = await archive('E002', id, { reason: 'wrong branch' });
    expect([res.status, res.body.state]).toStrictEqual([200, 'archived']);
    expect(res.body.archived_at).toBe('2026-10-05T10:00:00.000+06:30');
    const rows = await audits('website.closure_archive');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ branch_id: B3, reason: 'wrong branch' });
  });

  it('Scenario: An upcoming closure is archived with no body at all', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const res = await archive('E002', id);
    expect([res.status, res.body.state]).toStrictEqual([200, 'archived']);
    expect((await audits('website.closure_archive'))[0]?.reason).toBeNull();
  });

  it('Scenario: A closure that started yesterday — 422 closure_started; unchanged', async () => {
    const id = await closureRow(B3, '2026-10-04', '2026-10-07');
    const mark = marks();
    const res = await archive('E002', id);
    expect([res.status, res.body.code]).toStrictEqual([422, 'closure_started']);
    expect((await rowOf(id)).archived_at).toBeNull();
    expect(await effectsSince(mark)).toStrictEqual(NO_EFFECTS);
  });

  it('Scenario: An ended closure — 422 closure_past', async () => {
    const id = await closureRow(B3, '2026-10-01', '2026-10-02');
    const res = await archive('E002', id);
    expect([res.status, res.body.code]).toStrictEqual([422, 'closure_past']);
  });

  it('Scenario: Archived twice — 200 with the same archived_at, one audit row and no second effect', async () => {
    const id = await closureRow(B3, '2026-10-05', '2026-10-05');
    const first = await archive('E002', id, { reason: 'wrong branch' });
    s.clock?.set(mmt('2026-10-05T11:00:00'));
    const mark = marks();
    const again = await archive('E002', id);
    s.clock?.set(mmt('2026-10-05T10:00:00'));
    expect([again.status, again.body.archived_at]).toStrictEqual([200, first.body.archived_at]);
    expect(await audits('website.closure_archive')).toHaveLength(1);
    expect(await effectsSince(mark)).toStrictEqual(NO_EFFECTS);
  });

  it('Scenario: A reason of 1,001 characters is 400; 1,000 is accepted; Ma Hnin cannot archive B1', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const long = await archive('E002', id, { reason: 'x'.repeat(1001) });
    expect([long.status, long.body.code]).toStrictEqual([400, 'validation']);
    expect((await rowOf(id)).archived_at).toBeNull();
    const other = await closureRow(B1, '2026-10-12', '2026-10-13');
    expect((await archive('E002', other)).status).toBe(403);
    expect((await archive('E002', id, { reason: 'x'.repeat(1000) })).status).toBe(200);
  });
});

describe('add-website-management · website · Closure writes refresh the site and the calendars (task 4.4)', () => {
  const THINGYAN = {
    branch_id: B3,
    start_date: '2027-04-13',
    end_date: '2027-04-16',
    notice_mm: 'သင်္ကြန် ပိတ်ရက်',
    notice_en: 'Thingyan holidays',
  };

  it('Scenario: The calendar hears about Thingyan — one job, one schedule.changed in the branch room, one cache call', async () => {
    const mark = marks();
    const res = await settled(
      await s.http
        .post(API)
        .set('Cookie', await cookieOf('E002'))
        .send(THINGYAN),
    );
    expect(res.status).toBe(201);
    expect((await revalidateJobs(s.prisma)).slice(-1)).toStrictEqual([{ tags: ['home', 'branch:B3'] }]);
    expect(await effectsSince(mark)).toStrictEqual({ jobs: 1, events: 1, cleared: 1 });
    expect(events.at(-1)).toStrictEqual({
      name: 'schedule.changed',
      rooms: [`branch:${B3}`],
      payload: { branch_id: B3, dates: ['2027-04-13', '2027-04-16'] },
    });
    expect(cleared).toHaveBeenLastCalledWith([B3]);
  });

  it('Scenario: A refused create leaves no job, event or cache call', async () => {
    const mark = marks();
    const res = await settled(
      await s.http
        .post(API)
        .set('Cookie', await cookieOf('E002'))
        .send({ ...THINGYAN, start_date: '2026-10-04', end_date: '2026-10-05' }),
    );
    expect(res.status).toBe(422);
    expect(await effectsSince(mark)).toStrictEqual(NO_EFFECTS);
  });

  it('Scenario: An edit that moves the dates names the old and the new range', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const mark = marks();
    const res = await edit('E002', id, { start_date: '2026-10-14', end_date: '2026-10-15' });
    expect(res.status).toBe(200);
    expect(await effectsSince(mark)).toStrictEqual({ jobs: 1, events: 2, cleared: 1 });
    expect(events.slice(-2).map((event) => event.payload.dates)).toStrictEqual([
      ['2026-10-12', '2026-10-13'],
      ['2026-10-14', '2026-10-15'],
    ]);
    expect(events.slice(-2).every((event) => event.rooms?.join() === `branch:${B3}`)).toBe(true);
    expect((await revalidateJobs(s.prisma)).slice(-1)).toStrictEqual([{ tags: ['home', 'branch:B3'] }]);
  });

  it('Scenario: A notice-only edit names the one range', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const mark = marks();
    await edit('E002', id, { notice_en: 'Closed (test)' });
    expect(await effectsSince(mark)).toStrictEqual({ jobs: 1, events: 1, cleared: 1 });
    expect(events.at(-1)?.payload.dates).toStrictEqual(['2026-10-12', '2026-10-13']);
  });

  it('Scenario: An archive queues one job, one event and one cache call', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const mark = marks();
    await archive('E002', id);
    expect(await effectsSince(mark)).toStrictEqual({ jobs: 1, events: 1, cleared: 1 });
    expect(cleared).toHaveBeenLastCalledWith([B3]);
  });

  it('Scenario: Two edits of one closure at once — the row lock serialises them, the second is stale', async () => {
    const id = await closureRow(B3, '2026-10-12', '2026-10-13');
    const expected = await stamp(id);
    const answers = await Promise.all([
      patch('E002', id, { expected_updated_at: expected, end_date: '2026-10-14' }),
      patch('E002', id, { expected_updated_at: expected, end_date: '2026-10-15' }),
    ]);
    expect(answers.map((res) => res.status).sort()).toStrictEqual([200, 409]);
  });
});
