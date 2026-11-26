import { CancelReasonStatus, CancelReasonSystemCode, ScopeType } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { assignRole } from './helpers/roles.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-booking-cancel-reasons task 3.1 — booking spec "Every staff member lists the active cancel reasons
// in their order" and "Archived cancel reasons are a management read" (P3.CRS.01 · P3-RULE-11 ·
// API-PERM-03 · design D2 · D7), written before the route. Monday 05/Oct/2026, 10:00 AM MMT; the four
// presets of the base seed. Each scenario puts the rows back as the seed left them.
type Caller = { readonly cookie: string };
let t: SeededApp;
let kyawZin: Caller;
let aung: Caller;
let zaw: Caller;

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T10:00:00+06:30') });
  [kyawZin, aung, zaw] = await Promise.all([t.signIn('E001'), t.signIn('E004'), t.signIn('E003')]);
});
afterAll(async () => {
  await t.close();
});
afterEach(async () => {
  await t.prisma.booking_cancel_reasons.updateMany({
    data: { status: CancelReasonStatus.ACTIVE, archived_at: null },
  });
});

const list = (caller: Caller, query = '') =>
  t.http.get(`/api/v1/booking-cancel-reasons${query}`).set('Cookie', caller.cookie);
const names = (body: { items: { name_en: string }[] }) => body.items.map((item) => item.name_en);
const setStatus = (name_en: string, status: number) =>
  t.prisma.booking_cancel_reasons.updateMany({ where: { name_en }, data: { status } });
const archive = (name_en: string) =>
  t.prisma.booking_cancel_reasons.updateMany({
    where: { name_en },
    data: { archived_at: new Date('2026-10-05T09:00:00+06:30') },
  });

describe('add-booking-cancel-reasons · booking · Every staff member lists the active cancel reasons in their order', () => {
  it('Scenario: A barber reads the list', async () => {
    const res = await list(aung);
    expect(res.status).toBe(200);
    expect(res.body.items).toMatchObject([
      { name_en: 'Customer wants to change', sort_order: 1, system_code: null },
      { name_en: 'Barber not available', sort_order: 2, system_code: null },
      {
        name_en: 'Customer no-show',
        sort_order: 3,
        system_code: CancelReasonSystemCode.NO_SHOW,
        requires_note: false,
      },
      { name_en: 'Other', sort_order: 4, requires_note: true, system_code: null },
    ]);
    expect(Object.keys(res.body.items[0]).sort()).toStrictEqual(
      [
        'archived_at',
        'id',
        'name_en',
        'name_mm',
        'requires_note',
        'sort_order',
        'status',
        'system_code',
        'updated_at',
      ].sort(),
    );
  });

  it('Scenario: Inactive reasons are left out unless asked for', async () => {
    await setStatus('Customer wants to change', CancelReasonStatus.INACTIVE);
    expect((await list(aung)).body.items).toHaveLength(3);
    expect(names((await list(aung, '?status=0')).body)).toStrictEqual(['Customer wants to change']);
    expect((await list(aung, '?status=0&status=1')).body.items).toHaveLength(4);
  });

  it('orders by sort_order, then name_mm; status=2 is 400 validation', async () => {
    await t.prisma.booking_cancel_reasons.updateMany({
      where: { name_en: 'Other' },
      data: { sort_order: 1 },
    });
    expect(names((await list(aung)).body).slice(0, 2)).toStrictEqual([
      'Customer wants to change',
      'Other',
    ]);
    await t.prisma.booking_cancel_reasons.updateMany({
      where: { name_en: 'Other' },
      data: { sort_order: 4 },
    });
    const bad = await list(aung, '?status=2');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('validation');
  });
});

describe('add-booking-cancel-reasons · booking · Archived cancel reasons are a management read', () => {
  it('Scenario: The admin sees archived rows', async () => {
    await archive('Barber not available');
    const res = await list(kyawZin, '?include_archived=true');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(4);
    expect(
      res.body.items.find((item: { name_en: string }) => item.name_en === 'Barber not available'),
    ).toMatchObject({ archived_at: '2026-10-05T09:00:00.000+06:30' });
    expect((await list(kyawZin)).body.items).toHaveLength(3);
  });

  it('Scenario: A branch-scope viewer sees them too', async () => {
    await archive('Barber not available');
    await assignRole(t.prisma, {
      name: 'Reasons viewer',
      employeeId: FIXTURE_IDS.employees.E003,
      codes: ['booking_cancel_reason.view'],
      scope: ScopeType.BRANCHES,
      branchIds: [FIXTURE_IDS.branches.B1],
    });
    const res = await list(zaw, '?include_archived=true');
    expect(res.status).toBe(200);
    expect(names(res.body)).toContain('Barber not available');
  });

  it('Scenario: A barber may not', async () => {
    const res = await list(aung, '?include_archived=true');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'booking_cancel_reason.view' },
    });
  });
});
