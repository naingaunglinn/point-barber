import { BookingStatus, CancelReasonStatus, ScopeType } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { bookingAt } from './helpers/branches.js';
import { assignRole } from './helpers/roles.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-booking-cancel-reasons tasks 3.6, 3.7 and the update cases of 3.3 — booking spec "A cancel reason is
// edited with its last-read time", "An inactive cancel reason is no longer offered and past bookings keep
// it", "The no-show reason keeps its status, note flag and place in history" and "Cancel-reason writes
// need the code through a company-scope assignment" (P3.CRS.03 · API-IDEM-04 · D-BKG-17 · design D4 ·
// D5 · D6), written before the route. Monday 05/Oct/2026, 10:00 AM MMT. Every scenario starts from the
// four presets as seeded: the rows are put back after it.
type Caller = { readonly cookie: string };
let t: SeededApp;
let kyawZin: Caller;
let hnin: Caller;
let zaw: Caller;
let seeded: Awaited<ReturnType<typeof storedRows>>;
const madeBookings: string[] = [];

const TEN = new Date('2026-10-05T10:00:00+06:30');
const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00+06:30`);

beforeAll(async () => {
  t = await startSeededApp({ now: TEN });
  [kyawZin, hnin, zaw] = await Promise.all([t.signIn('E001'), t.signIn('E002'), t.signIn('E003')]);
  await assignRole(t.prisma, {
    name: 'Reasons editor',
    employeeId: FIXTURE_IDS.employees.E003,
    codes: [
      'booking_cancel_reason.view',
      'booking_cancel_reason.create',
      'booking_cancel_reason.update',
      'booking_cancel_reason.delete',
    ],
    scope: ScopeType.BRANCHES,
    branchIds: [FIXTURE_IDS.branches.B1],
  });
  seeded = await storedRows();
});
afterAll(async () => {
  await t.close();
});
afterEach(async () => {
  t.clock?.set(TEN);
  await t.prisma.bookings.deleteMany({ where: { id: { in: madeBookings.splice(0) } } });
  for (const { id, ...row } of seeded) {
    await t.prisma.booking_cancel_reasons.update({ where: { id }, data: row });
  }
});

const storedRows = () =>
  t.prisma.booking_cancel_reasons.findMany({
    select: {
      id: true,
      name_mm: true,
      name_en: true,
      requires_note: true,
      sort_order: true,
      status: true,
      archived_at: true,
      updated_at: true,
    },
  });
const stored = (nameMm: string) =>
  t.prisma.booking_cancel_reasons.findFirstOrThrow({ where: { name_mm: nameMm } });
const list = (caller: Caller, query = '') =>
  t.http.get(`/api/v1/booking-cancel-reasons${query}`).set('Cookie', caller.cookie);
/** The reason as a client last read it (management read): its id and `updated_at` to echo. */
async function read(nameMm: string): Promise<{ id: string; updated_at: string }> {
  const res = await list(kyawZin, '?include_archived=true&status=0&status=1');
  const items: { id: string; name_mm: string; updated_at: string }[] = res.body.items;
  const found = items.find((item) => item.name_mm === nameMm);
  if (found === undefined) throw new Error(`no reason ${nameMm}`);
  return found;
}
const patch = (caller: Caller, id: string, body: object) =>
  t.http.patch(`/api/v1/booking-cancel-reasons/${id}`).set('Cookie', caller.cookie).send(body);
const archive = (id: string) =>
  t.http.post(`/api/v1/booking-cancel-reasons/${id}/archive`).set('Cookie', kyawZin.cookie);
const auditOf = (res: { headers: Record<string, unknown> }) =>
  t.prisma.audit_events.findMany({ where: { request_id: res.headers['x-request-id'] as string } });

const CHANGE = 'Customer ပြောင်းချင်';
const BUSY = 'Barber မအား';
const NO_SHOW = 'Customer မလာ';
const UNKNOWN_ID = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';

describe('add-booking-cancel-reasons · booking · A cancel reason is edited with its last-read time', () => {
  it('Scenario: Rename and require a note', async () => {
    const reason = await read(BUSY);
    const res = await patch(kyawZin, reason.id, {
      name_en: 'Barber is busy',
      requires_note: true,
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name_en: 'Barber is busy',
      requires_note: true,
      updated_at: '2026-10-05T10:00:00.000+06:30',
    });
  });

  it('Scenario: Edited by someone else meanwhile — 409 conflict, the row unchanged', async () => {
    const before = await read(BUSY);
    t.clock?.set(at('10:01'));
    const first = await patch(kyawZin, before.id, {
      name_en: 'Barber is busy',
      expected_updated_at: before.updated_at,
    });
    expect(first.status).toBe(200);
    const after = await stored(BUSY);
    const res = await patch(kyawZin, before.id, {
      name_en: 'Barber is busy',
      requires_note: true,
      expected_updated_at: before.updated_at,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('conflict');
    expect(await stored(BUSY)).toStrictEqual(after);
    expect(await auditOf(res)).toStrictEqual([]);
  });

  it('Scenario: An archived reason — 404 not_found', async () => {
    const reason = await read(BUSY);
    expect((await archive(reason.id)).status).toBe(200);
    const archived = await read(BUSY);
    const res = await patch(kyawZin, reason.id, {
      name_en: 'Barber is busy',
      expected_updated_at: archived.updated_at,
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('an unknown id — 404 not_found', async () => {
    const res = await patch(kyawZin, UNKNOWN_ID, {
      name_en: 'Barber is busy',
      expected_updated_at: '2026-10-05T10:00:00.000+06:30',
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('a missing expected_updated_at — 400 validation', async () => {
    const reason = await read(BUSY);
    const res = await patch(kyawZin, reason.id, { name_en: 'Barber is busy' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation');
    expect(res.body.errors[0]).toMatchObject({ field: 'expected_updated_at' });
  });

  it('Scenario: Nothing changed — 200, the same updated_at, no audit row', async () => {
    const reason = await read('Other');
    t.clock?.set(at('10:30'));
    const res = await patch(kyawZin, reason.id, {
      name_mm: 'Other',
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(200);
    expect(res.body.updated_at).toBe(reason.updated_at);
    expect(await auditOf(res)).toStrictEqual([]);
  });

  it('a rename to the name of another non-archived reason — 409 already_exists', async () => {
    const reason = await read(BUSY);
    const res = await patch(kyawZin, reason.id, {
      name_mm: 'Other ',
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('already_exists');
    expect((await stored(BUSY)).name_mm).toBe(BUSY);
  });

  it('a name typed in Zawgyi — 400 zawgyi_text, as on create', async () => {
    const reason = await read(BUSY);
    const res = await patch(kyawZin, reason.id, {
      name_mm: 'ေပး',
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'zawgyi_text',
      errors: [{ field: 'name_mm', code: 'zawgyi_text' }],
    });
  });
});

describe('add-booking-cancel-reasons · booking · An inactive cancel reason is no longer offered and past bookings keep it', () => {
  it('Scenario: Switched off and on', async () => {
    const reason = await read(CHANGE);
    const off = await patch(kyawZin, reason.id, {
      status: CancelReasonStatus.INACTIVE,
      expected_updated_at: reason.updated_at,
    });
    expect(off.status).toBe(200);
    t.clock?.set(at('10:01'));
    expect((await list(hnin)).body.items).toHaveLength(3);
    t.clock?.set(at('10:05'));
    const on = await patch(kyawZin, reason.id, {
      status: CancelReasonStatus.ACTIVE,
      expected_updated_at: off.body.updated_at,
    });
    expect(on.status).toBe(200);
    t.clock?.set(at('10:06'));
    expect((await list(hnin)).body.items).toHaveLength(4);
  });

  it('Scenario: A cancelled booking keeps its reason', async () => {
    const reason = await read(CHANGE);
    const bookingId = await bookingAt(
      t.prisma,
      FIXTURE_IDS.branches.B1,
      BookingStatus.BOOKED,
      at('09:00'),
    );
    madeBookings.push(bookingId);
    await t.prisma.bookings.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelled_at: at('09:10'),
        cancel_reason_id: reason.id,
        cancelled_by_actor: 2,
        cancelled_by_user_id: FIXTURE_IDS.users.E001,
      },
    });
    const keep = { cancel_reason_id: true, cancelled_at: true, updated_at: true } as const;
    const before = await t.prisma.bookings.findUniqueOrThrow({
      where: { id: bookingId },
      select: keep,
    });
    const res = await patch(kyawZin, reason.id, {
      status: CancelReasonStatus.INACTIVE,
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(200);
    expect(
      await t.prisma.bookings.findUniqueOrThrow({ where: { id: bookingId }, select: keep }),
    ).toStrictEqual(before);
  });
});

describe('add-booking-cancel-reasons · booking · The no-show reason keeps its status, note flag and place in history', () => {
  it('Scenario: Renaming the no-show reason', async () => {
    const reason = await read(NO_SHOW);
    const res = await patch(kyawZin, reason.id, {
      name_en: 'No-show',
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name_en: 'No-show', system_code: 1 });
  });

  it('Scenario: Switching it off — 409 system_row, status stays 1', async () => {
    const reason = await read(NO_SHOW);
    const res = await patch(kyawZin, reason.id, {
      status: CancelReasonStatus.INACTIVE,
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('system_row');
    expect((await stored(NO_SHOW)).status).toBe(CancelReasonStatus.ACTIVE);
    expect(await auditOf(res)).toStrictEqual([]);
  });

  it('Scenario: Requiring a note on it — 409 system_row', async () => {
    const reason = await read(NO_SHOW);
    const res = await patch(kyawZin, reason.id, {
      requires_note: true,
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('system_row');
    expect((await stored(NO_SHOW)).requires_note).toBe(false);
  });

  it('Scenario: Unchanged values are accepted', async () => {
    const reason = await read(NO_SHOW);
    const res = await patch(kyawZin, reason.id, {
      name_en: 'No-show',
      status: CancelReasonStatus.ACTIVE,
      requires_note: false,
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(200);
  });

  it('Scenario: Archiving it — 409 system_row, archived_at stays null', async () => {
    const reason = await read(NO_SHOW);
    const res = await archive(reason.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('system_row');
    expect((await stored(NO_SHOW)).archived_at).toBeNull();
    expect(await auditOf(res)).toStrictEqual([]);
  });
});

describe('add-booking-cancel-reasons · booking · Cancel-reason writes need the code through a company-scope assignment — update', () => {
  it('the admin edits', async () => {
    const reason = await read(BUSY);
    const res = await patch(kyawZin, reason.id, {
      name_en: 'Barber is busy',
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(200);
  });

  it('a branch-scope holder — 403 company_scope_required, nothing written', async () => {
    const reason = await read(BUSY);
    const res = await patch(zaw, reason.id, {
      name_en: 'Barber is busy',
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('company_scope_required');
    expect((await stored(BUSY)).name_en).toBe('Barber not available');
    expect(await auditOf(res)).toStrictEqual([]);
  });

  it('a manager without the code — 403 forbidden naming booking_cancel_reason.update', async () => {
    const reason = await read(BUSY);
    const res = await patch(hnin, reason.id, {
      name_en: 'Barber is busy',
      expected_updated_at: reason.updated_at,
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'booking_cancel_reason.update' },
    });
    expect((await stored(BUSY)).name_en).toBe('Barber not available');
    expect(await auditOf(res)).toStrictEqual([]);
  });
});
