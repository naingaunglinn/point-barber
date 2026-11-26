import { randomUUID } from 'node:crypto';

import { CustomerStatus, type Mmk, customerListItemSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { addCustomer, customerHistory, mmt } from './builders/customers.js';
import { finishedSale, incompleteVisit } from './builders/sales.js';
import { type FixturePerson, type SeededApp, seededApp } from './helpers/seeded.js';

// add-customer-management tasks 2.5 – 2.7 — customers spec "The customer list shows ACTIVE,
// non-archived customers unless filtered" (P3-RULE-02 · owner #7), "The list searches by name or by
// phone" (owner CM1), "The list is sorted and paged with a cursor" (API-DATA-08 · design D3 · R3 / R4)
// and "List items count visits in the caller's read scope" (P3-RULE-03 · ADR-012). The company holds
// Ma Su (her history of spec-fixtures §2), Ko Phyo (added 05/Oct/2026 9:10 AM), Daw Mya (INACTIVE) and
// U Ba (archived); Ma Su was seeded before Ko Phyo was added.
const { branches, customers: fixtureCustomers } = FIXTURE_IDS;

const pageSchema = z.object({
  items: z.array(customerListItemSchema),
  next_cursor: z.string().nullable(),
  total: z.number().int(),
});

let s: SeededApp;
const cookies = new Map<FixturePerson, string>();

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T09:30:00+06:30'));
  await s.prisma.customers.update({
    where: { id: fixtureCustomers.MA_SU },
    data: { created_at: mmt('2026-09-01', '09:00') },
  });
  await customerHistory(s.prisma, ['DAW_MYA', 'U_BA']);
  await addCustomer(s.prisma, 'KO_PHYO', { at: mmt('2026-10-05', '09:10') });
  for (const person of ['E001', 'E002', 'E006'] as const) {
    cookies.set(person, (await s.signIn(person)).cookie);
  }
});
afterAll(() => s.close());

const get = (query: string, person: FixturePerson = 'E002') =>
  s.http.get(`/api/v1/customers${query}`).set('Cookie', cookies.get(person) ?? '');
async function page(query: string, person: FixturePerson = 'E002') {
  const res = await get(query, person);
  expect(res.status).toBe(200);
  return pageSchema.parse(res.body);
}
const names = async (query: string, person?: FixturePerson) =>
  (await page(query, person)).items.map((item) => item.name);
async function refused(query: string) {
  const res = await get(query);
  expect([res.status, res.body.code]).toStrictEqual([400, 'validation']);
  return z.array(z.object({ field: z.string() }).loose()).parse(res.body.errors)[0];
}

describe('add-customer-management · customers · The customer list shows ACTIVE, non-archived customers unless filtered', () => {
  it('Scenario: The default list hides inactive and archived customers — Ma Su and Ko Phyo, total 2', async () => {
    const first = await page('');
    expect([first.items.map((item) => item.name), first.total, first.next_cursor]).toStrictEqual([
      ['Ma Su', 'Ko Phyo'],
      2,
      null,
    ]);
  });

  it('Scenario: The status filter shows inactive customers', async () => {
    expect(await names('?status=0')).toStrictEqual(['Daw Mya']);
    const both = await page('?status=0&status=1');
    expect([both.items.map((item) => item.name), both.total]).toStrictEqual([
      ['Ma Su', 'Daw Mya', 'Ko Phyo'],
      3,
    ]);
  });

  it('Scenario: Archived customers on request — U Ba with archived_at and status 1', async () => {
    const all = await page('?include_archived=true');
    expect(all.items.map((item) => item.name)).toStrictEqual(['Ma Su', 'Ko Phyo', 'U Ba']);
    expect(all.items[2]).toMatchObject({
      archived_at: '2026-10-01T09:00:00+06:30',
      status: CustomerStatus.ACTIVE,
      phone: '09 2600 5566',
      phone_normalized: '+95926005566',
    });
  });

  it('Scenario: An unknown status — 400 on status', async () => {
    expect((await refused('?status=2'))?.field).toBe('status');
  });
});

describe('add-customer-management · customers · List items count visits in the caller’s read scope', () => {
  it('Scenario: Three callers, three counts — 6 / 28 Sep, 1 / 03 Oct, 7 / 03 Oct', async () => {
    const counts = [];
    for (const person of ['E002', 'E006', 'E001'] as const) {
      const [item] = (await page('?q=su', person)).items;
      counts.push([item?.visit_count, item?.last_visit_at]);
    }
    expect(counts).toStrictEqual([
      [6, '2026-09-28T10:42:00+06:30'],
      [1, '2026-10-03T10:42:00+06:30'],
      [7, '2026-10-03T10:42:00+06:30'],
    ]);
  });

  it('Scenario: An incomplete visit is not a visit — Ma Hnin still reads 6', async () => {
    await incompleteVisit(s.prisma, {
      branch: branches.B3,
      performer: 'E004',
      startedAt: mmt('2026-10-02', '10:05'),
    });
    expect((await page('?q=su')).items[0]?.visit_count).toBe(6);
  });
});

describe('add-customer-management · customers · The list is sorted and paged with a cursor', () => {
  it('Scenario: Last visit first, never-seen customers last', async () => {
    const items = (await page('')).items.map((item) => [item.name, item.last_visit_at]);
    expect(items).toStrictEqual([
      ['Ma Su', '2026-09-28T10:42:00+06:30'],
      ['Ko Phyo', null],
    ]);
  });

  it('Scenario: By name and by creation — Ko Phyo, Ma Su both times', async () => {
    expect(await names('?sort=name')).toStrictEqual(['Ko Phyo', 'Ma Su']);
    expect(await names('?sort=-created_at')).toStrictEqual(['Ko Phyo', 'Ma Su']);
  });

  it('Scenario: An unknown sort key — 400 on sort', async () => {
    expect((await refused('?sort=phone'))?.field).toBe('sort');
  });

  it('Scenario: The limit bounds — 100 answers, 101 too_big, 0 too_small', async () => {
    expect((await get('?limit=100')).status).toBe(200);
    expect(await refused('?limit=101')).toStrictEqual({
      field: 'limit',
      code: 'too_big',
      params: { maximum: 100 },
    });
    expect(await refused('?limit=0')).toMatchObject({
      field: 'limit',
      code: 'too_small',
      params: { minimum: 1 },
    });
  });

  it('a cursor that does not decode, or is another sort’s, is 400 on cursor', async () => {
    expect((await refused('?cursor=not-a-cursor'))?.field).toBe('cursor');
    const byName = await page('?sort=name&limit=1');
    expect((await refused(`?sort=-created_at&cursor=${byName.next_cursor ?? ''}`))?.field).toBe(
      'cursor',
    );
  });

  it('R4: the Myanmar ICU collation exists', async () => {
    const rows = await s.prisma.$queryRaw<unknown[]>`
      SELECT 1 FROM pg_collation WHERE collname = 'my-x-icu'`;
    expect(rows).toHaveLength(1);
  });
});

describe('add-customer-management · customers · The list searches by name or by phone', () => {
  it('Scenario: Part of the name — su → Ma Su', async () => {
    expect(await names('?q=su')).toStrictEqual(['Ma Su']);
  });

  it('Scenario: The last digits of the phone — 7712 3456', async () => {
    expect(await names(`?q=${encodeURIComponent('7712 3456')}`)).toStrictEqual(['Ma Su']);
  });

  it('Scenario: The full number in another format — 09-7712-3456', async () => {
    expect(await names('?q=09-7712-3456')).toStrictEqual(['Ma Su']);
  });

  it('Scenario: Six Myanmar digits — ၀၉ ၇၇၁၂', async () => {
    expect(await names(`?q=${encodeURIComponent('၀၉ ၇၇၁၂')}`)).toStrictEqual(['Ma Su']);
  });

  it('Scenario: An ending that starts with 0 — 001122 finds Ko Phyo as typed (owner 16 – 17/Nov/2026)', async () => {
    // `+95945001122` holds `001122`; the 95 form `9501122` is not in it, and the typed form is enough.
    expect(await names('?q=001122')).toStrictEqual(['Ko Phyo']);
  });

  it('Scenario: Five digits are a name search — 77123 finds nobody, total 0', async () => {
    const found = await page('?q=77123');
    expect([found.items, found.total]).toStrictEqual([[], 0]);
  });

  it('Scenario: A Myanmar name — သီရိ → မသီရိ', async () => {
    await addCustomer(s.prisma, 'MA_THIRI');
    expect(await names(`?q=${encodeURIComponent('သီရိ')}`)).toStrictEqual(['မသီရိ']);
  });

  it('Scenario: Letters and digits together are a name search — Ma 0977 finds nobody', async () => {
    expect(await names(`?q=${encodeURIComponent('Ma 0977')}`)).toStrictEqual([]);
  });

  it('LIKE signs are literal — % and _ find nobody; the search keeps the status filter', async () => {
    expect(await names(`?q=${encodeURIComponent('%')}`)).toStrictEqual([]);
    expect(await names('?q=_')).toStrictEqual([]);
    expect(await names('?q=mya')).toStrictEqual([]);
    expect(await names('?q=mya&status=0')).toStrictEqual(['Daw Mya']);
  });
});

describe('add-customer-management · customers · paging 30 customers with 200 sales (R3)', () => {
  beforeAll(async () => {
    // Ma Su, Ko Phyo and မသီရိ + 27 more ACTIVE customers at B2, with 200 visit sales among them.
    const company = await s.prisma.companies.findFirstOrThrow({ select: { id: true } });
    const ids = Array.from({ length: 27 }, () => randomUUID());
    await s.prisma.customers.createMany({
      data: ids.map((id, n) => ({
        id,
        company_id: company.id,
        name: `Customer ${String(n + 1).padStart(2, '0')}`,
        phone: `09 5000 00${String(n + 1).padStart(2, '0')}`,
        phone_normalized: `+959500000${String(n + 1).padStart(2, '0')}`,
        created_at: mmt('2026-09-10', '09:00'),
      })),
    });
    for (let n = 0; n < 200; n += 1) {
      const startedAt = new Date(mmt('2026-08-01', '08:00').getTime() + n * 3 * 3_600_000);
      await finishedSale(s.prisma, {
        branch: branches.B2,
        customer: ids[n % ids.length] ?? null,
        receipt: `B2-2026-AUG-${String(n + 1).padStart(5, '0')}`,
        total: 7_000n as Mmk,
        finishedAt: new Date(startedAt.getTime() + 37 * 60_000),
        visit: { performer: 'E007', startedAt },
      });
    }
  });

  it('Scenario: Pages of 25 — 25 with a cursor and total 30, then 5 and no cursor', async () => {
    const first = await page('', 'E001');
    expect([first.items.length, first.total, first.next_cursor === null]).toStrictEqual([
      25,
      30,
      false,
    ]);
    const second = await page(`?cursor=${first.next_cursor ?? ''}`, 'E001');
    expect([second.items.length, second.total, second.next_cursor]).toStrictEqual([5, 30, null]);
  });

  it('every sort pages through the whole list exactly once, in the unpaged order', async () => {
    for (const sort of ['-last_visit_at', 'name', '-created_at']) {
      const whole = (await page(`?sort=${sort}&limit=100`, 'E001')).items.map((item) => item.id);
      const paged: string[] = [];
      let cursor: string | null = null;
      do {
        const next = await page(
          `?sort=${sort}&limit=7${cursor === null ? '' : `&cursor=${cursor}`}`,
          'E001',
        );
        paged.push(...next.items.map((item) => item.id));
        cursor = next.next_cursor;
      } while (cursor !== null);
      expect([whole.length, paged]).toStrictEqual([30, whole]);
    }
  });
});
