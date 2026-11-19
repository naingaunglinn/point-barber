import { randomUUID } from 'node:crypto';

import { CustomerStatus, DailyClosingStatus, ErrorCode, ServiceStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-walkin-visit-checkout tasks 4.3, 4.4 and 5.3 — the operational reads of the POS through the HTTP
// endpoints (P2.SVC.01 · P2.CAT.01 · P2.PRC.06 · P3.CUS.02 · API-PERM-03 · design D2): `@Staff()`, no code,
// limited to the read scope. services-pricing spec "The POS lists only the services sold at its branch"
// and "The price quote is the only price calculator"; customers spec "The Finish step looks up the
// customer by phone". Today is Monday 05/Oct/2026 10:00 AM MMT.
const { branches, services, users } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';
const HTET = 'E006';

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:00:00+06:30'));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
});
afterAll(() => s.close());

const names = (body: { items: { name_en: string }[] }) => body.items.map((item) => item.name_en);

describe('GET /v1/services and GET /v1/service-categories (P2.SVC.01 · P2.CAT.01)', () => {
  it('Scenario: Services sold at B3 — Haircut, Shave, Hair wash', async () => {
    const res = await api.get(MIN, `/services?branch_id=${branches.B3}`);
    expect(res.status).toBe(200);
    expect(names(res.body)).toStrictEqual(['Haircut', 'Shave', 'Hair wash']);
  });

  it('Scenario: A service switched off at the branch — hidden at B3, still at B1', async () => {
    await prisma.branch_services.updateMany({
      where: { branch_id: branches.B3, service_id: services.HAIR_WASH },
      data: { status: ServiceStatus.INACTIVE },
    });
    expect(names((await api.get(MIN, `/services?branch_id=${branches.B3}`)).body)).toStrictEqual([
      'Haircut',
      'Shave',
    ]);
    expect(names((await api.get(HTET, `/services?branch_id=${branches.B1}`)).body)).toContain(
      'Hair wash',
    );
    await prisma.branch_services.updateMany({
      where: { branch_id: branches.B3, service_id: services.HAIR_WASH },
      data: { status: ServiceStatus.ACTIVE },
    });
  });

  it('Scenario: Branch outside the read scope — Ko Htet asks for B3: 200 with items = []', async () => {
    const res = await api.get(HTET, `/services?branch_id=${branches.B3}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toStrictEqual([]);
  });

  it('the ACTIVE categories in sort order, for any signed-in staff member', async () => {
    const res = await api.get(AUNG, '/service-categories');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

describe('POST /v1/prices/quote (P2.PRC.06)', () => {
  const quote = (who: 'E004' | 'E005' | 'E006', over: object = {}) =>
    api.post(who, '/prices/quote', {
      branch_id: branches.B3,
      location_type: 1,
      date: '2026-10-05',
      employee_id: FIXTURE_IDS.employees.E005,
      items: [{ service_id: services.HAIRCUT }, { service_id: services.SHAVE }],
      ...over,
    });

  it('Scenario: Two items — 8,000 and 3,000, subtotal 11,000 (8,000 + 3,000), complete', async () => {
    const res = await quote(MIN);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: [{ unit_price_amount: 8_000 }, { unit_price_amount: 3_000 }],
      subtotal_amount: 11_000,
      complete: true,
    });
  });

  it('Scenarios: Last day inside the window — 2026-10-19 → 200; one day past — 2026-10-20 → 422 outside_window', async () => {
    expect((await quote(MIN, { date: '2026-10-19' })).status).toBe(200);
    const past = await quote(MIN, { date: '2026-10-20' });
    expect([past.status, past.body.code]).toStrictEqual([422, ErrorCode.OUTSIDE_WINDOW]);
  });

  it('Scenarios: An open past day — 2026-10-04 → 200; A closed past day — 422 day_closed, reopen', async () => {
    expect((await quote(MIN, { date: '2026-10-04' })).status).toBe(200);
    await prisma.daily_closings.create({
      data: {
        id: randomUUID(),
        branch_id: branches.B3,
        business_date: new Date('2026-10-04T00:00:00Z'),
        status: DailyClosingStatus.CLOSED,
        counted_cash_amount: 0n,
        closed_at: new Date('2026-10-04T21:05:00+06:30'),
        closed_by_user_id: users.E002,
      },
    });
    const closed = await quote(MIN, { date: '2026-10-04' });
    expect(closed.status).toBe(422);
    expect(closed.body).toMatchObject({
      code: ErrorCode.DAY_CLOSED,
      context: { correction_path: 'reopen' },
    });
  });

  it('a branch outside the read scope — 404 not_found (an operational read, design D2 reading)', async () => {
    const res = await quote(HTET);
    expect([res.status, res.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
  });
});

describe('GET /v1/customers/lookup (P3.CUS.02)', () => {
  it('finds Ma Su by 09 7712 3456 and by +95977123456, with no upcoming booking', async () => {
    for (const phone of ['09 7712 3456', '+95977123456']) {
      const res = await api.get(MIN, `/customers/lookup?phone=${encodeURIComponent(phone)}`);
      expect(res.status).toBe(200);
      expect(res.body.customer).toMatchObject({
        id: FIXTURE_IDS.customers.MA_SU,
        name: 'Ma Su',
        upcoming_bookings: [],
      });
    }
  });

  it('an unknown phone → { customer: null }; an archived one → { customer: null, archived: true }', async () => {
    const unknown = await api.get(
      MIN,
      `/customers/lookup?phone=${encodeURIComponent('09 4500 7777')}`,
    );
    expect(unknown.body).toStrictEqual({ customer: null });
    const company = await prisma.companies.findFirstOrThrow();
    await prisma.customers.create({
      data: {
        id: randomUUID(),
        company_id: company.id,
        name: 'Ma Win',
        phone: '09 4500 6677',
        phone_normalized: '+95945006677',
        status: CustomerStatus.ACTIVE,
        archived_at: new Date(),
      },
    });
    const archived = await api.get(
      MIN,
      `/customers/lookup?phone=${encodeURIComponent('09 4500 6677')}`,
    );
    expect(archived.body).toStrictEqual({ customer: null, archived: true });
  });

  it('not a phone number → 400 phone_invalid; no phone → 400 validation', async () => {
    const invalid = await api.get(MIN, '/customers/lookup?phone=12');
    expect([invalid.status, invalid.body.code]).toStrictEqual([400, ErrorCode.PHONE_INVALID]);
    const missing = await api.get(MIN, '/customers/lookup');
    expect([missing.status, missing.body.code]).toStrictEqual([400, ErrorCode.VALIDATION]);
  });
});
