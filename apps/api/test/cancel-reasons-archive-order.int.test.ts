import { CancelReasonStatus, ScopeType } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { assignRole } from './helpers/roles.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-booking-cancel-reasons tasks 3.9, 3.11, the archive and reorder cases of 3.3 and the after-archive
// case of 3.4 — booking spec "Archiving hides a cancel reason for good and keeps every reference", "The
// cancel reasons are reordered as one complete list", "Every cancel-reason change leaves one audit row
// without a branch" and "The Myanmar name … is unique among non-archived rows" (P3.CRS.04 · P3.CRS.05 ·
// API-AUD-01 · design D4 · D6 · D8), written before the routes. Monday 05/Oct/2026, 10:00 AM MMT. Every
// scenario starts from the four presets as seeded: the rows are put back after it.
type Caller = { readonly cookie: string };
let t: SeededApp;
let kyawZin: Caller;
let hnin: Caller;
let zaw: Caller;
let seeded: Awaited<ReturnType<typeof storedRows>>;

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
  const kept = seeded.map((row) => row.id);
  await t.prisma.booking_cancel_reasons.deleteMany({ where: { id: { notIn: kept } } });
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
const idOf = async (nameMm: string) => (await stored(nameMm)).id;
const sortOrders = async () =>
  Object.fromEntries((await storedRows()).map((row) => [row.name_mm, row.sort_order]));
const list = (caller: Caller) =>
  t.http.get('/api/v1/booking-cancel-reasons').set('Cookie', caller.cookie);
const archive = (caller: Caller, id: string) =>
  t.http.post(`/api/v1/booking-cancel-reasons/${id}/archive`).set('Cookie', caller.cookie);
const reorder = (caller: Caller, ids: readonly string[]) =>
  t.http.put('/api/v1/booking-cancel-reasons/order').set('Cookie', caller.cookie).send({ ids });
const auditOf = (res: { headers: Record<string, unknown> }) =>
  t.prisma.audit_events.findMany({ where: { request_id: res.headers['x-request-id'] as string } });

const CHANGE = 'Customer ပြောင်းချင်';
const BUSY = 'Barber မအား';
const NO_SHOW = 'Customer မလာ';
const OTHER = 'Other';
const UNKNOWN_ID = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';
const ARCHIVED_AT = '2026-10-05T10:00:00.000+06:30';

describe('add-booking-cancel-reasons · booking · Archiving hides a cancel reason for good and keeps every reference', () => {
  it('Scenario: Archive a preset', async () => {
    const res = await archive(kyawZin, await idOf(BUSY));
    expect(res.status).toBe(200);
    expect(res.body.archived_at).toBe(ARCHIVED_AT);
    expect((await list(hnin)).body.items).toHaveLength(3);
  });

  it('Scenario: Archived twice — the same archived_at, no second audit row', async () => {
    const id = await idOf(BUSY);
    expect((await archive(kyawZin, id)).status).toBe(200);
    t.clock?.set(at('10:05'));
    const again = await archive(kyawZin, id);
    expect(again.status).toBe(200);
    expect(again.body.archived_at).toBe(ARCHIVED_AT);
    expect(await auditOf(again)).toStrictEqual([]);
  });

  it('Scenario: An inactive reason can be archived — status stays 0', async () => {
    await t.prisma.booking_cancel_reasons.update({
      where: { id: await idOf(CHANGE) },
      data: { status: CancelReasonStatus.INACTIVE },
    });
    const res = await archive(kyawZin, await idOf(CHANGE));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(CancelReasonStatus.INACTIVE);
    expect((await stored(CHANGE)).status).toBe(CancelReasonStatus.INACTIVE);
  });

  it('an unknown id — 404 not_found', async () => {
    const res = await archive(kyawZin, UNKNOWN_ID);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('the name of an archived reason may be used again (task 3.4)', async () => {
    expect((await archive(kyawZin, await idOf(BUSY))).status).toBe(200);
    const res = await t.http
      .post('/api/v1/booking-cancel-reasons')
      .set('Cookie', kyawZin.cookie)
      .send({ name_mm: BUSY });
    expect(res.status).toBe(201);
  });
});

describe('add-booking-cancel-reasons · booking · The cancel reasons are reordered as one complete list', () => {
  it('Scenario: No-show first', async () => {
    const ids = await Promise.all([NO_SHOW, CHANGE, BUSY, OTHER].map(idOf));
    const res = await reorder(kyawZin, ids);
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { id: string }) => item.id)).toStrictEqual(ids);
    expect(await sortOrders()).toStrictEqual({ [NO_SHOW]: 1, [CHANGE]: 2, [BUSY]: 3, [OTHER]: 4 });
  });

  it('the stored order sent again — 200, no audit row', async () => {
    const ids = await Promise.all([CHANGE, BUSY, NO_SHOW, OTHER].map(idOf));
    const res = await reorder(kyawZin, ids);
    expect(res.status).toBe(200);
    expect(await auditOf(res)).toStrictEqual([]);
  });

  const refused = async (ids: readonly string[]) => {
    const before = await sortOrders();
    const res = await reorder(kyawZin, ids);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation');
    expect(res.body.errors[0].field).toBe('ids');
    expect(await sortOrders()).toStrictEqual(before);
    expect(await auditOf(res)).toStrictEqual([]);
  };

  it('Scenario: One reason missing', async () => {
    await refused(await Promise.all([NO_SHOW, CHANGE, BUSY].map(idOf)));
  });

  it('Scenario: An archived reason in the list', async () => {
    const ids = await Promise.all([NO_SHOW, CHANGE, BUSY, OTHER].map(idOf));
    expect((await archive(kyawZin, await idOf(BUSY))).status).toBe(200);
    await refused(ids);
  });

  it('Scenario: An inactive reason must be included', async () => {
    await t.prisma.booking_cancel_reasons.update({
      where: { id: await idOf(CHANGE) },
      data: { status: CancelReasonStatus.INACTIVE },
    });
    await refused(await Promise.all([NO_SHOW, BUSY, OTHER].map(idOf)));
  });

  it('a repeated id, an unknown id', async () => {
    const three = await Promise.all([NO_SHOW, CHANGE, BUSY].map(idOf));
    await refused([...three, await idOf(BUSY)]);
    await refused([...three, UNKNOWN_ID]);
  });

  it('a reason created between the read and the save', async () => {
    const ids = await Promise.all([NO_SHOW, CHANGE, BUSY, OTHER].map(idOf));
    const created = await t.http
      .post('/api/v1/booking-cancel-reasons')
      .set('Cookie', kyawZin.cookie)
      .send({ name_mm: 'Customer နေမကောင်း' });
    expect(created.status).toBe(201);
    await refused(ids);
  });
});

describe('add-booking-cancel-reasons · booking · Every cancel-reason change leaves one audit row without a branch', () => {
  it('Scenario: A rename', async () => {
    const reason = await stored(BUSY);
    const res = await t.http
      .patch(`/api/v1/booking-cancel-reasons/${reason.id}`)
      .set('Cookie', kyawZin.cookie)
      .send({ name_en: 'Barber is busy', expected_updated_at: reason.updated_at.toISOString() });
    expect(res.status).toBe(200);
    expect(await auditOf(res)).toMatchObject([
      {
        action: 'booking_cancel_reason.update',
        entity_type: 'booking_cancel_reasons',
        entity_id: reason.id,
        branch_id: null,
        before_data: { name_en: 'Barber not available' },
        after_data: { name_en: 'Barber is busy' },
      },
    ]);
  });

  it('an archive: one row with archived_at', async () => {
    const id = await idOf(BUSY);
    const res = await archive(kyawZin, id);
    expect(await auditOf(res)).toMatchObject([
      {
        action: 'booking_cancel_reason.archive',
        entity_type: 'booking_cancel_reasons',
        entity_id: id,
        branch_id: null,
      },
    ]);
  });

  it('a reorder: one row with the id order before and after', async () => {
    const before = await Promise.all([CHANGE, BUSY, NO_SHOW, OTHER].map(idOf));
    const after = await Promise.all([NO_SHOW, CHANGE, BUSY, OTHER].map(idOf));
    const res = await reorder(kyawZin, after);
    expect(await auditOf(res)).toMatchObject([
      {
        action: 'booking_cancel_reason.reorder',
        entity_type: 'booking_cancel_reasons',
        branch_id: null,
        before_data: { ids: before },
        after_data: { ids: after },
      },
    ]);
  });
});

describe('add-booking-cancel-reasons · booking · Cancel-reason writes need the code through a company-scope assignment — archive and reorder', () => {
  it('a branch-scope holder — 403 company_scope_required on both, nothing written', async () => {
    const ids = await Promise.all([NO_SHOW, CHANGE, BUSY, OTHER].map(idOf));
    const archived = await archive(zaw, await idOf(BUSY));
    const reordered = await reorder(zaw, ids);
    for (const res of [archived, reordered]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('company_scope_required');
      expect(await auditOf(res)).toStrictEqual([]);
    }
    expect((await stored(BUSY)).archived_at).toBeNull();
  });

  it('a manager without the codes — 403 forbidden naming the route code', async () => {
    const ids = await Promise.all([NO_SHOW, CHANGE, BUSY, OTHER].map(idOf));
    const archived = await archive(hnin, await idOf(BUSY));
    expect(archived.status).toBe(403);
    expect(archived.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'booking_cancel_reason.delete' },
    });
    const reordered = await reorder(hnin, ids);
    expect(reordered.status).toBe(403);
    expect(reordered.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'booking_cancel_reason.update' },
    });
    expect(await sortOrders()).toStrictEqual({ [CHANGE]: 1, [BUSY]: 2, [NO_SHOW]: 3, [OTHER]: 4 });
  });
});
