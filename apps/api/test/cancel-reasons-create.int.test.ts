import { CancelReasonStatus, CancelReasonSystemCode, ScopeType } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { assignRole } from './helpers/roles.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-booking-cancel-reasons tasks 3.3 (the create cases) and 3.4 — booking spec "Cancel-reason writes
// need the code through a company-scope assignment", "A new cancel reason is an active admin row placed
// last" and "The Myanmar name of a cancel reason is unique among non-archived rows" (P3.CRS.02 ·
// API-PERM-07 · API-IDEM-05 · owner CR1 · design D4 · D6), written before the route. Monday
// 05/Oct/2026, 10:00 AM MMT. Every scenario starts from the four presets: the rows a scenario adds are
// removed after it. The case after an archive comes with the archive route (A3).
type Caller = { readonly cookie: string };
let t: SeededApp;
let kyawZin: Caller;
let hnin: Caller;
let zaw: Caller;

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T10:00:00+06:30') });
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
});
afterAll(async () => {
  await t.close();
});
afterEach(async () => {
  await t.prisma.booking_cancel_reasons.deleteMany({
    where: { name_mm: { notIn: PRESETS } },
  });
});

/** The Myanmar names of the base seed (name_en may be null on an added row, name_mm never is). */
const PRESETS = ['Customer ပြောင်းချင်', 'Barber မအား', 'Customer မလာ', 'Other'];
const create = (caller: Caller, body: object) =>
  t.http.post('/api/v1/booking-cancel-reasons').set('Cookie', caller.cookie).send(body);
const rows = () => t.prisma.booking_cancel_reasons.count();
const auditOf = (res: { headers: Record<string, unknown> }) =>
  t.prisma.audit_events.findMany({ where: { request_id: res.headers['x-request-id'] as string } });
const SICK = { name_mm: 'Customer နေမကောင်း', name_en: 'Customer is sick' };

describe('add-booking-cancel-reasons · booking · Cancel-reason writes need the code through a company-scope assignment', () => {
  it('Scenario: The admin creates', async () => {
    const res = await create(kyawZin, SICK);
    expect(res.status).toBe(201);
    expect(await auditOf(res)).toMatchObject([
      {
        action: 'booking_cancel_reason.create',
        entity_type: 'booking_cancel_reasons',
        entity_id: res.body.id,
        branch_id: null,
      },
    ]);
  });

  it('Scenario: A branch-scope holder — 403 company_scope_required, nothing written', async () => {
    const res = await create(zaw, SICK);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('company_scope_required');
    expect(await rows()).toBe(4);
    expect(await auditOf(res)).toStrictEqual([]);
  });

  it('Scenario: A manager without the code', async () => {
    const res = await create(hnin, SICK);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'forbidden',
      context: { required: 'booking_cancel_reason.create' },
    });
    expect(await rows()).toBe(4);
    expect(await auditOf(res)).toStrictEqual([]);
  });
});

describe('add-booking-cancel-reasons · booking · A new cancel reason is an active admin row placed last', () => {
  it('Scenario: Placed after "Other"', async () => {
    const res = await create(kyawZin, SICK);
    expect(res.status).toBe(201);
    expect(res.body).toStrictEqual({
      id: expect.any(String),
      ...SICK,
      requires_note: false,
      system_code: null,
      sort_order: 5,
      status: CancelReasonStatus.ACTIVE,
      archived_at: null,
      updated_at: '2026-10-05T10:00:00.000+06:30',
    });
    const list = await t.http.get('/api/v1/booking-cancel-reasons').set('Cookie', kyawZin.cookie);
    expect(list.body.items.at(-1)).toMatchObject({ name_en: 'Customer is sick' });
  });

  it('Scenario: A system code cannot be created', async () => {
    const res = await create(kyawZin, {
      name_mm: 'မိုးရွာ',
      name_en: 'Heavy rain',
      system_code: CancelReasonSystemCode.NO_SHOW,
    });
    expect(res.status).toBe(201);
    expect(res.body.system_code).toBeNull();
    expect(
      await t.prisma.booking_cancel_reasons.count({
        where: { system_code: CancelReasonSystemCode.NO_SHOW },
      }),
    ).toBe(1);
  });

  it('Scenario: A reason that needs a note', async () => {
    const res = await create(kyawZin, { name_mm: 'မိုးရွာ', requires_note: true, sort_order: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ requires_note: true, name_en: null, sort_order: 2 });
  });

  it('Scenario: Name length at the limit and past it', async () => {
    expect((await create(kyawZin, { name_mm: 'မ'.repeat(150) })).status).toBe(201);
    const long = await create(kyawZin, { name_mm: 'မ'.repeat(151) });
    expect(long.status).toBe(400);
    expect(long.body).toMatchObject({
      code: 'validation',
      errors: [{ field: 'name_mm', code: 'too_big' }],
    });
    const blank = await create(kyawZin, { name_mm: '   ' });
    expect(blank.status).toBe(400);
    expect(blank.body.errors[0]).toMatchObject({ field: 'name_mm', code: 'too_small' });
  });
});

describe('add-booking-cancel-reasons · booking · The Myanmar name of a cancel reason is unique among non-archived rows', () => {
  it('Scenario: Same name as a preset', async () => {
    const res = await create(kyawZin, { name_mm: 'Other ' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('already_exists');
    expect(await rows()).toBe(4);
    expect(await auditOf(res)).toStrictEqual([]);
  });

  it('Scenario: Two creates at the same moment', async () => {
    const answers = await Promise.all([
      create(kyawZin, { name_mm: 'မိုးရွာ' }),
      create(kyawZin, { name_mm: 'မိုးရွာ' }),
    ]);
    expect(answers.map((res) => res.status).sort()).toStrictEqual([201, 409]);
    expect(answers.find((res) => res.status === 409)?.body.code).toBe('already_exists');
    expect(await t.prisma.booking_cancel_reasons.count({ where: { name_mm: 'မိုးရွာ' } })).toBe(1);
  });

  it('Scenario: The same English name is allowed', async () => {
    const res = await create(kyawZin, { name_mm: 'အခြား', name_en: 'Other' });
    expect(res.status).toBe(201);
  });
});

// A2 recorded readings (the lead's answers of 17/Nov/2026, following the locked texts named):
// an empty English name is stored as NULL (AD-L10N-03), and Zawgyi in a name is refused before any
// lookup or write (API-SHAPE-05 · AD-FORM-13 · CG-API-03).
// "Example name" typed with a Zawgyi keyboard (the sample of branches-create.int.test.ts).
const ZAWGYI = 'အမွတ္ ၃၊ စမ္းသပ္လမ္း';

describe('add-booking-cancel-reasons · booking · recorded readings of A2', () => {
  it('a blank English name is stored as NULL', async () => {
    const res = await create(kyawZin, { name_mm: 'မိုးရွာ', name_en: '   ' });
    expect(res.status).toBe(201);
    expect(res.body.name_en).toBeNull();
    const row = await t.prisma.booking_cancel_reasons.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(row.name_en).toBeNull();
  });

  it('Zawgyi in either name → 400 zawgyi_text, nothing written', async () => {
    const res = await create(kyawZin, { name_mm: ZAWGYI, name_en: ZAWGYI });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'zawgyi_text',
      errors: [
        { field: 'name_mm', code: 'zawgyi_text' },
        { field: 'name_en', code: 'zawgyi_text' },
      ],
    });
    expect(await rows()).toBe(4);
    expect(await auditOf(res)).toStrictEqual([]);
  });

  it('Zawgyi is answered before a taken name', async () => {
    const res = await create(kyawZin, { name_mm: 'Other', name_en: ZAWGYI });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('zawgyi_text');
  });
});
