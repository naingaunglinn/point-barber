import {
  BookingStatus,
  type Mmk,
  SaleStatus,
  UiLanguage,
  VisitStatus,
  timelineEntrySchema,
} from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { bookingAt } from './builders/bookings.js';
import { type CustomerHistory, addCustomer, customerHistory, mmt } from './builders/customers.js';
import { finishedSale, incompleteVisit } from './builders/sales.js';
import { UNKNOWN_ID } from './helpers/branches.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-customer-management task 2.12 — customers spec "The timeline lists bookings, visits and
// visit-less sales newest first" (P3.CUS.09 · design D10 · R6) on Ma Su's history of spec-fixtures §2:
// at B3 four bookings (10/Sep, 17/Sep, 24/Sep cancelled; 12/Oct BOOKED) and six visits; at B1 the
// 08/Oct booking and the 03/Oct visit. Ma Hnin reads in English.
const { branches, employees, users, customers: fixtureCustomers } = FIXTURE_IDS;
const MA_SU = fixtureCustomers.MA_SU;

const pageSchema = z.object({
  items: z.array(timelineEntrySchema),
  next_cursor: z.string().nullable(),
  total: z.null(),
});

let s: SeededApp;
let history: CustomerHistory;
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T09:00:00+06:30'));
  history = await customerHistory(s.prisma, []);
  for (const person of ['E001', 'E002', 'E006'] as const) {
    cookies.set(person, (await s.signIn(person)).cookie);
    await s.prisma.users.update({
      where: { id: users[person] },
      data: { ui_language: UiLanguage.EN },
    });
  }
});
afterAll(() => s.close());

async function timeline(query = '', person: FixturePerson = 'E002', id = MA_SU) {
  const res = await s.http
    .get(`/api/v1/customers/${id}/timeline${query}`)
    .set('Cookie', cookies.get(person) ?? '');
  expect(res.status).toBe(200);
  return pageSchema.parse(res.body);
}
/** Every entry of the timeline, page after page of `limit`. */
async function allPages(limit: number, person: FixturePerson = 'E002', id = MA_SU) {
  const pages = [];
  let cursor: string | null = null;
  do {
    const next = await timeline(
      `?limit=${limit}${cursor === null ? '' : `&cursor=${cursor}`}`,
      person,
      id,
    );
    pages.push(next.items);
    cursor = next.next_cursor;
  } while (cursor !== null);
  return pages;
}
const ats = (items: readonly { at: string }[]) => items.map((item) => item.at.slice(0, 16));

describe('add-customer-management · customers · The timeline lists bookings, visits and visit-less sales newest first', () => {
  it('Scenario: Ma Su’s history at B3 — 10 entries, the first three in full', async () => {
    const page = await timeline();
    expect([page.items.length, page.next_cursor, page.total]).toStrictEqual([10, null, null]);
    expect(page.items[0]).toStrictEqual({
      type: 'booking',
      id: history.upcoming.B3,
      at: '2026-10-12T14:00:00+06:30',
      branch_id: branches.B3,
      status: BookingStatus.BOOKED,
      employee: { id: employees.E004, display_name: 'Ko Aung' },
      services_label_mm: 'ဆံပင်ညှပ်, မုတ်ဆိတ်ရိတ်',
      services_label_en: 'Haircut, Shave',
      total_amount: 13_000,
      cancel_reason: null,
    });
    expect(page.items[1]).toMatchObject({
      type: 'visit',
      at: '2026-09-28T10:05:00+06:30',
      branch_id: branches.B3,
      status: VisitStatus.FINISHED,
      employee: { id: employees.E004, display_name: 'Ko Aung' },
      receipt_number: 'B3-2026-SEP-00006',
      total_amount: 15_000,
    });
    expect(page.items[2]).toMatchObject({
      type: 'visit',
      at: '2026-09-25T10:05:00+06:30',
      employee: { id: employees.E005, display_name: 'Ko Min' },
      receipt_number: 'B3-2026-SEP-00005',
      total_amount: 8_000,
    });
  });

  it('Scenario: A no-show booking carries its reason — 24/Sep', async () => {
    const entry = (await timeline()).items.find((item) => item.at.startsWith('2026-09-24'));
    expect(entry).toMatchObject({
      type: 'booking',
      status: BookingStatus.CANCELLED,
      cancel_reason: { name_mm: 'Customer မလာ', name_en: 'Customer no-show', system_code: 1 },
    });
  });

  it('Scenario: Pages of four — 4 + 4 + 2, the last without a cursor', async () => {
    expect((await allPages(4)).map(ats)).toStrictEqual([
      ['2026-10-12T14:00', '2026-09-28T10:05', '2026-09-25T10:05', '2026-09-24T14:00'],
      ['2026-09-21T10:05', '2026-09-17T14:00', '2026-09-14T10:05', '2026-09-10T14:00'],
      ['2026-09-07T10:05', '2026-09-01T10:05'],
    ]);
  });

  it('Scenario: Another branch’s caller — Ko Htet reads the B1 booking and the B1 visit', async () => {
    const page = await timeline('', 'E006');
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      type: 'booking',
      id: history.upcoming.B1,
      at: '2026-10-08T11:00:00+06:30',
    });
    expect(page.items[1]).toMatchObject({
      type: 'visit',
      at: '2026-10-03T10:05:00+06:30',
      receipt_number: 'B1-2026-OCT-00001',
      total_amount: 6_000,
    });
  });

  it('Scenario: An incomplete visit and a visit-less sale', async () => {
    await incompleteVisit(s.prisma, {
      branch: branches.B3,
      performer: 'E004',
      startedAt: mmt('2026-10-02', '10:05'),
    });
    const { saleId } = await finishedSale(s.prisma, {
      branch: branches.B3,
      receipt: 'B3-2026-SEP-00007',
      total: 4_000n as Mmk,
      finishedAt: mmt('2026-09-30', '15:00'),
    });
    const items = (await timeline()).items;
    expect(items.find((item) => item.at === '2026-10-02T10:05:00+06:30')).toMatchObject({
      type: 'visit',
      status: VisitStatus.INCOMPLETE,
      receipt_number: null,
      total_amount: null,
    });
    expect(items.find((item) => item.type === 'sale')).toStrictEqual({
      type: 'sale',
      id: saleId,
      at: '2026-09-30T15:00:00+06:30',
      branch_id: branches.B3,
      status: SaleStatus.FINISHED,
      receipt_number: 'B3-2026-SEP-00007',
      total_amount: 4_000,
    });
  });

  it('Scenario: Two entries at the same time — the greater id first, each once with limit=1', async () => {
    await bookingAt(s.prisma, {
      branch: branches.B3,
      status: BookingStatus.COMPLETED,
      startsAt: mmt('2026-09-21', '10:05'),
      employee: 'E005',
    });
    const whole = (await timeline('?limit=100')).items;
    const tied = whole.filter((item) => item.at === '2026-09-21T10:05:00+06:30');
    expect(tied.map((item) => item.type).sort()).toStrictEqual(['booking', 'visit']);
    expect((tied[0]?.id ?? '') > (tied[1]?.id ?? '')).toBe(true);
    const one = (await allPages(1)).flat();
    expect(one.map((item) => item.id)).toStrictEqual(whole.map((item) => item.id));
  });

  it('60 entries paged at 25 come back exactly once, ties included (R6)', async () => {
    const koPhyo = await addCustomer(s.prisma, 'KO_PHYO');
    const customer = { id: koPhyo, name: 'Ko Phyo' };
    for (let n = 0; n < 40; n += 1) {
      await bookingAt(s.prisma, {
        branch: branches.B2,
        status: BookingStatus.COMPLETED,
        startsAt: new Date(mmt('2026-08-01', '10:00').getTime() + n * 3_600_000),
        employee: 'E007',
        customer,
      });
    }
    for (let n = 0; n < 20; n += 1) {
      // Every second sale finishes at the start of a booking: a tie on `at`.
      await finishedSale(s.prisma, {
        branch: branches.B2,
        customer: koPhyo,
        receipt: `B2-2026-AUG-${String(n + 1).padStart(5, '0')}`,
        total: 2_000n as Mmk,
        finishedAt: new Date(
          mmt('2026-08-01', '10:00').getTime() + n * 2 * 3_600_000 + (n % 2) * 1_800_000,
        ),
      });
    }
    const pages = await allPages(25, 'E001', koPhyo);
    expect(pages.map((items) => items.length)).toStrictEqual([25, 25, 10]);
    const ids = pages.flat().map((item) => item.id);
    expect(new Set(ids).size).toBe(60);
    expect(ids).toStrictEqual(
      (await timeline('?limit=100', 'E001', koPhyo)).items.map((item) => item.id),
    );
  });

  it('an unknown customer — 404 not_found', async () => {
    const res = await s.http
      .get(`/api/v1/customers/${UNKNOWN_ID}/timeline`)
      .set('Cookie', cookies.get('E002') ?? '');
    expect([res.status, res.body.code]).toStrictEqual([404, 'not_found']);
  });
});
