import { randomUUID } from 'node:crypto';

import {
  ErrorCode,
  LateEntryReason,
  SaleItemLineType,
  SaleStatus,
  UiLanguage,
  receiptListPageSchema,
  receiptLookupSchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { incompleteVisit } from './builders/sales.js';
import type { FixturePerson, SeededApp } from './helpers/seeded.js';
import { seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-receipts-list-lookup tasks 2.1 – 2.5 and 3.1 — GET /v1/receipts (P4.RCP.04) and GET /v1/receipts/lookup
// (P4.RCP.03) over HTTP: any staff member in read scope, no amounts, 7 days back, the exact number (P4-RULE-18 /
// 20 · AD-PERM-05 · API-PERM-03 · D-PLT-15). 05/Oct/2026 at B3: Ko Aung's B3-2026-OCT-00001 with its change
// return B3-RF-2026-OCT-00001 at 10:42 AM, Ko Min's 00002 at 11:20 AM; the other rows of the day are not receipts
// of the morning (a late entry of 04/Oct, a sale of 03/Oct, a cancelled and an open sale).
const { branches, services, employees } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';
const HTET = 'E006';
const ADMIN = 'E001';
const B3 = branches.B3;
const at = (day: string, time: string) => new Date(`2026-10-${day}T${time}:00+06:30`);

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let saleId: string;
let refundId: string;
let lateId: string;
let twoLinesId: string;

beforeAll(async () => {
  s = await seededApp(at('05', '10:42'));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
  await prisma.users.update({
    where: { id: FIXTURE_IDS.users.E005 },
    data: { ui_language: UiLanguage.EN },
  });
  const cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  const kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
  const clock = s.clock;
  if (clock === undefined) throw new Error('the seeded application has no fixed clock');

  // 00001 — Ko Aung, Haircut 10,000 paid by KBZPay 12,000 → the change return RF-00001 at 10:42.
  const a = await api.start(AUNG, [services.HAIRCUT]);
  await api.complete(AUNG, a.id);
  await api.pay(AUNG, a.sale.id, {
    payment_method_id: kbzpay,
    amount: 12_000,
    external_reference: 'KBZ0001234591',
  });
  await api.finish(AUNG, a.sale.id, { expected_total_amount: 10_000 });
  saleId = a.sale.id;
  refundId = (await prisma.refunds.findFirstOrThrow({ where: { sale_id: a.sale.id } })).id;

  // 00002 — Ko Min at 11:20.
  clock.set(at('05', '11:20'));
  const b = await api.start(MIN, [services.HAIRCUT]);
  await api.complete(MIN, b.id);
  await api.pay(MIN, b.sale.id, { payment_method_id: cash, amount: 8_000 });
  await api.finish(MIN, b.sale.id, { expected_total_amount: 8_000 });

  // 00003 — a late entry of Sunday 04/Oct finished at 3:40 PM that day (entered on 05/Oct).
  const late = await api.post(
    MIN,
    '/visits',
    {
      branch_id: B3,
      items: [{ service_id: services.HAIRCUT }],
      late_entry: { reason: LateEntryReason.INTERNET_OUTAGE, started_at: at('04', '15:00') },
    },
    randomUUID(),
  );
  if (late.status !== 201) throw new Error(`late START ${late.status}`);
  const lateVisit = late.body as { id: string; sale: { id: string } };
  lateId = lateVisit.sale.id;
  await api.post(MIN, `/visits/${lateVisit.id}/complete`, { completed_at: at('04', '15:30') });
  await api.post(
    MIN,
    `/sales/${lateId}/payments`,
    { payment_method_id: cash, amount: 8_000, received_at: at('04', '15:35') },
    randomUUID(),
  );
  const lateFinish = await api.post(MIN, `/sales/${lateId}/finish`, {
    expected_total_amount: 8_000,
    finished_at: at('04', '15:40'),
  });
  if (lateFinish.status !== 200) throw new Error(`late FINISH ${lateFinish.status}`);

  // 00004 — Sat 03/Oct: Haircut and Shave by Ko Aung and a removed Hair wash by Ko Min.
  clock.set(at('03', '14:00'));
  const c = await api.start(AUNG, [services.HAIRCUT, services.SHAVE]);
  twoLinesId = c.sale.id;
  await prisma.sale_items.create({
    data: {
      id: randomUUID(),
      sale_id: twoLinesId,
      sort_order: 9,
      line_type: SaleItemLineType.SERVICE,
      service_id: services.HAIR_WASH,
      performed_by_employee_id: employees.E005,
      description_mm: 'Hair wash',
      quantity: 1,
      list_price_amount: 3_000,
      unit_price_amount: 3_000,
      removed_at: at('03', '14:01'),
      removed_by_user_id: FIXTURE_IDS.users.E004,
      removed_reason: 'Not wanted',
    },
  });
  await api.complete(AUNG, c.id);
  await api.pay(AUNG, twoLinesId, { payment_method_id: cash, amount: c.sale.total_amount });
  await api.finish(AUNG, twoLinesId, { expected_total_amount: c.sale.total_amount });

  // 05/Oct again: a CANCELLED sale at B3 and an OPEN one; the morning is 11:30.
  clock.set(at('05', '11:25'));
  await incompleteVisit(prisma, { branch: B3, performer: AUNG, startedAt: at('05', '11:00') });
  await api.start(MIN, [services.SHAVE]);
  clock.set(at('05', '11:30'));
}, 120_000);
afterAll(() => s.close());

const list = (who: FixturePerson, query: string) => api.get(who, `/receipts${query}`);
const lookup = (who: FixturePerson, number: string) =>
  api.get(who, `/receipts/lookup?number=${encodeURIComponent(number)}`);
const numbers = (body: unknown): string[] =>
  receiptListPageSchema.parse(body).items.map((item) => item.number);

describe('GET /v1/receipts — the receipts of a day, without amounts (task 2.1)', () => {
  it('Scenario: The B3 receipts of the morning — in order, with barbers, no amount', async () => {
    const res = await list(MIN, `?branch_id=${B3}`);
    expect(res.status).toBe(200);
    const page = receiptListPageSchema.parse(res.body);
    expect(page.items).toStrictEqual([
      {
        kind: 'sale',
        number: 'B3-2026-OCT-00002',
        sale_id: expect.any(String),
        refund_id: null,
        issued_at: '2026-10-05T11:20:00+06:30',
        barbers: ['Ko Min'],
      },
      {
        kind: 'sale',
        number: 'B3-2026-OCT-00001',
        sale_id: saleId,
        refund_id: null,
        issued_at: '2026-10-05T10:42:00+06:30',
        barbers: ['Ko Aung'],
      },
      {
        kind: 'refund',
        number: 'B3-RF-2026-OCT-00001',
        sale_id: saleId,
        refund_id: refundId,
        issued_at: '2026-10-05T10:42:00+06:30',
        barbers: ['Ko Aung'],
      },
    ]);
    expect(page).toMatchObject({ next_cursor: null, total: null });
    for (const item of page.items) {
      expect(Object.keys(item).filter((key) => key.endsWith('_amount'))).toStrictEqual([]);
      expect(Object.keys(item).sort()).toStrictEqual(
        ['barbers', 'issued_at', 'kind', 'number', 'refund_id', 'sale_id'].sort(),
      );
    }
  });

  it('Scenario: Open and cancelled sales are not receipts', async () => {
    // The day holds one OPEN and one CANCELLED sale at B3 (beforeAll) and neither is listed.
    expect(
      await prisma.sales.count({
        where: { branch_id: B3, status: { in: [SaleStatus.OPEN, SaleStatus.CANCELLED] } },
      }),
    ).toBe(2);
    expect(numbers((await list(MIN, `?branch_id=${B3}`)).body)).toHaveLength(3);
  });

  it('Scenario: Two performers on one sale — a performer once, a removed line left out', async () => {
    const res = await list(MIN, `?branch_id=${B3}&date=2026-10-03`);
    expect(receiptListPageSchema.parse(res.body).items).toMatchObject([
      { sale_id: twoLinesId, barbers: ['Ko Aung'] },
    ]);
  });

  it('Scenario: A branch outside the read scope — Ko Htet lists B3 and gets nothing', async () => {
    const res = await list(HTET, `?branch_id=${B3}`);
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ items: [], next_cursor: null, total: null });
  });

  it('Scenario: Pages — limit=2, then the cursor', async () => {
    const first = receiptListPageSchema.parse((await list(MIN, `?branch_id=${B3}&limit=2`)).body);
    expect(first.items.map((item) => item.number)).toStrictEqual([
      'B3-2026-OCT-00002',
      'B3-2026-OCT-00001',
    ]);
    expect(first.next_cursor).not.toBeNull();
    const second = receiptListPageSchema.parse(
      (
        await list(
          MIN,
          `?branch_id=${B3}&limit=2&cursor=${encodeURIComponent(first.next_cursor ?? '')}`,
        )
      ).body,
    );
    expect(second.items.map((item) => item.number)).toStrictEqual(['B3-RF-2026-OCT-00001']);
    expect(second.next_cursor).toBeNull();
  });

  it('pages of one across the 10:42 AM tie lose and repeat nothing', async () => {
    const seen: string[] = [];
    let cursor = '';
    for (let i = 0; i < 5; i += 1) {
      const res = await list(MIN, `?branch_id=${B3}&limit=1${cursor}`);
      const page = receiptListPageSchema.parse(res.body);
      seen.push(...page.items.map((item) => item.number));
      if (page.next_cursor === null) break;
      cursor = `&cursor=${encodeURIComponent(page.next_cursor)}`;
    }
    expect(seen).toStrictEqual(['B3-2026-OCT-00002', 'B3-2026-OCT-00001', 'B3-RF-2026-OCT-00001']);
  });

  it('a cursor that does not decode is 400 on cursor', async () => {
    const res = await list(MIN, `?branch_id=${B3}&cursor=not-a-cursor`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: ErrorCode.VALIDATION, errors: [{ field: 'cursor' }] });
  });

  it('Scenario: A late entry is listed on its service day', async () => {
    const sunday = receiptListPageSchema.parse(
      (await list(MIN, `?branch_id=${B3}&date=2026-10-04`)).body,
    );
    expect(sunday.items).toMatchObject([
      { sale_id: lateId, issued_at: '2026-10-04T15:40:00+06:30' },
    ]);
    expect(numbers((await list(MIN, `?branch_id=${B3}`)).body)).not.toContain(
      sunday.items[0]?.number,
    );
  });

  it('Scenario: No branch — 400 validation naming branch_id', async () => {
    const res = await list(MIN, '');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: ErrorCode.VALIDATION });
    expect((res.body as { errors: { field: string }[] }).errors[0]?.field).toBe('branch_id');
  });

  it('a branch_id that is not a UUID is 400 validation', async () => {
    expect((await list(MIN, '?branch_id=B3')).status).toBe(400);
  });

  it('a day with no sale answers an empty page (a day without receipts)', async () => {
    const res = await list(MIN, `?branch_id=${B3}&date=2026-10-02`);
    expect(res.body).toStrictEqual({ items: [], next_cursor: null, total: null });
  });
});

describe('GET /v1/receipts — seven days back and no further (task 2.4 · owner RL3)', () => {
  const status = async (who: FixturePerson, date: string) =>
    (await list(who, `?branch_id=${B3}&date=${date}`)).status;

  it('Scenario: Seven days back is the limit', async () => {
    expect(await status(MIN, '2026-09-28')).toBe(200);
    const res = await list(MIN, `?branch_id=${B3}&date=2026-09-27`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: ErrorCode.VALIDATION, errors: [{ field: 'date' }] });
  });

  it('Scenario: Not tomorrow — and a date that is not YYYY-MM-DD', async () => {
    const res = await list(MIN, `?branch_id=${B3}&date=2026-10-06`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ errors: [{ field: 'date' }] });
    expect(await status(MIN, '2026-10-5')).toBe(400);
  });

  it('Scenario: The limit holds for an admin', async () => {
    expect(await status(ADMIN, '2026-09-27')).toBe(400);
    expect(await status(ADMIN, '2026-09-28')).toBe(200);
  });

  it('Scenario: Midnight in Myanmar time — the default is the new day', async () => {
    s.clock?.set(new Date('2026-10-05T17:30:00Z'));
    try {
      // Without `date` the list is 06/Oct (empty: nothing was sold) and 29/Sep is the earliest day.
      expect((await list(MIN, `?branch_id=${B3}`)).status).toBe(200);
      expect(await status(MIN, '2026-10-06')).toBe(200);
      expect(await status(MIN, '2026-10-07')).toBe(400);
      expect(await status(MIN, '2026-09-29')).toBe(200);
      expect(await status(MIN, '2026-09-28')).toBe(400);
      // The default day is not 05/Oct any more.
      expect(numbers((await list(MIN, `?branch_id=${B3}`)).body)).toStrictEqual([]);
      expect(numbers((await list(MIN, `?branch_id=${B3}&date=2026-10-05`)).body)).toHaveLength(3);
    } finally {
      s.clock?.set(at('05', '11:30'));
    }
  });
});

describe('GET /v1/receipts/lookup — a receipt by its exact number (task 2.5)', () => {
  it('Scenario: A sale receipt typed in small letters', async () => {
    const res = await lookup(MIN, 'b3-2026-oct-00001');
    expect(res.status).toBe(200);
    expect(receiptLookupSchema.parse(res.body)).toStrictEqual({
      kind: 'sale',
      sale_id: saleId,
      refund_id: null,
      number: 'B3-2026-OCT-00001',
      branch_id: B3,
    });
  });

  it('Scenario: A refund receipt', async () => {
    const res = await lookup(MIN, 'B3-RF-2026-OCT-00001');
    expect(res.status).toBe(200);
    expect(receiptLookupSchema.parse(res.body)).toMatchObject({
      kind: 'refund',
      refund_id: refundId,
      sale_id: saleId,
      number: 'B3-RF-2026-OCT-00001',
    });
  });

  it('Scenario: Myanmar digits and spaces', async () => {
    const res = await lookup(MIN, ' B3-၂၀၂၆-OCT-၀၀၀၀၁ ');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ number: 'B3-2026-OCT-00001' });
  });

  it.each(['B3-2026-OCT-0000', 'B3-2026-OCT-00009'])(
    'Scenario: Only the whole number — %s is 404',
    async (number) => {
      const res = await lookup(MIN, number);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: ErrorCode.NOT_FOUND });
    },
  );

  it("Scenario: Another branch's receipt — Ko Htet gets 404, the same as no receipt", async () => {
    const res = await lookup(HTET, 'B3-2026-OCT-00001');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect((await lookup(HTET, 'B3-RF-2026-OCT-00001')).status).toBe(404);
  });

  it.each([
    ['', 'empty'],
    ['A'.repeat(41), '41 characters'],
    ['   ', 'only spaces'],
  ])('Scenario: Nothing typed — %j (%s) is 400 on number', async (number) => {
    const res = await lookup(MIN, number);
    expect(res.status).toBe(400);
    expect((res.body as { errors: { field: string }[] }).errors[0]?.field).toBe('number');
  });

  it('a call without number is 400 on number', async () => {
    const res = await api.get(MIN, '/receipts/lookup');
    expect(res.status).toBe(400);
    expect((res.body as { errors: { field: string }[] }).errors[0]?.field).toBe('number');
  });
});

describe('the routes (task 3.1 · P4-RULE-20 · API-PERM-02)', () => {
  it('401 without a session', async () => {
    expect((await s.http.get(`/api/v1/receipts?branch_id=${B3}`)).status).toBe(401);
    expect((await s.http.get('/api/v1/receipts/lookup?number=B3-2026-OCT-00001')).status).toBe(401);
  });

  it('Ko Min, a Barber with no sale.view, reads both without any code', async () => {
    expect((await list(MIN, `?branch_id=${B3}`)).status).toBe(200);
    expect((await lookup(MIN, 'B3-2026-OCT-00001')).status).toBe(200);
  });
});
