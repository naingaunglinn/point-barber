import { describe, expect, it } from 'vitest';

import {
  businessDateOf,
  formatDate,
  formatMoney,
  moneyToWire,
  normalizePhone,
  NotificationCategory,
  sumMoney,
  type Mmk,
} from '@point/shared';

import {
  BARBER_PRICE,
  BOOKING_CANCEL_REASONS,
  BRANCHES,
  COMPANY,
  CUSTOMERS,
  DATES,
  DEMO_SALES,
  DEMO_SALES_TOTAL,
  DISCOUNT_APPROVAL,
  HAIR_COLOUR_GRID,
  NOTIFICATIONS,
  PAGING_ROWS,
  PAYMENTS,
  PEOPLE,
  RECEIPT,
  REVENUE_BY_BRANCH,
  SERVICES,
} from './fixtures';

// add-shared-ui-components task 4.3 · design D12 · CG-TEST-08: the catalogue fixtures equal
// point-sdd docs/plan/spec-fixtures.md §1–§5 and §8. The values below are copied from that document
// (this repository's CI cannot read point-sdd); a change to either side must change both.

const wire = (amount: Mmk) => moneyToWire(amount);

describe('§1 company and branches', () => {
  it('has the one company and the three branches', () => {
    expect(COMPANY).toEqual({ name_en: 'Point Barbershop', name_mm: 'ပွိုင့် ဘာဘာရှော့' });
    expect(BRANCHES.map((b) => [b.code, b.name_en, b.name_mm])).toEqual([
      ['B1', 'Point 1.0', 'ပွိုင့် ၁.၀'],
      ['B2', 'Point 2.0', 'ပွိုင့် ၂.၀'],
      ['B3', 'Point 3.0', 'ပွိုင့် ၃.၀'],
    ]);
    for (const { code } of BRANCHES) expect(code).toMatch(/^[A-Z0-9]{1,10}$/);
  });
});

describe('§2 people and customers', () => {
  it('has E001–E009 with their names, roles, branches and e-mail addresses', () => {
    expect(
      Object.values(PEOPLE).map((p) => [
        p.code,
        p.name_en,
        p.name_mm,
        p.role,
        p.scope,
        p.branches,
        p.email,
      ]),
    ).toEqual([
      [
        'E001',
        'U Kyaw Zin',
        'ဦးကျော်ဇင်',
        'admin',
        'company',
        ['B1', 'B2', 'B3'],
        'kyawzin@point.test',
      ],
      ['E002', 'Ma Hnin', 'မနှင်း', 'manager', 'branch', ['B3'], 'hnin@point.test'],
      ['E003', 'Ko Zaw', 'ကိုဇော်', 'manager', 'branch', ['B1'], 'zaw@point.test'],
      ['E004', 'Ko Aung', 'ကိုအောင်', 'barber', 'branch', ['B3'], 'aung@point.test'],
      ['E005', 'Ko Min', 'ကိုမင်း', 'barber', 'branch', ['B3'], 'min@point.test'],
      ['E006', 'Ko Htet', 'ကိုထက်', 'barber', 'branch', ['B1'], 'htet@point.test'],
      ['E007', 'Ko Thura', 'ကိုသူရ', 'barber', 'branch', ['B2'], 'thura@point.test'],
      ['E008', 'Ma Thida', 'မသီတာ', null, null, ['B3'], 'thida@point.test'],
      ['E009', 'Ko Naing', 'ကိုနိုင်', 'barber', 'branch', ['B3'], 'naing@point.test'],
    ]);
  });

  it('E008 is invited, E009 disabled with its B3 assignment ended on 30/Sep/2026', () => {
    expect(PEOPLE.thida.user).toBe('INVITED');
    expect(PEOPLE.naing).toMatchObject({
      user: 'DISABLED',
      employee: 'INACTIVE',
      assignmentEnded: '2026-09-30',
    });
    const others = Object.values(PEOPLE).filter((p) => !['E008', 'E009'].includes(p.code));
    for (const p of others) expect([p.user, p.employee]).toEqual(['ACTIVE', 'ACTIVE']);
  });

  it('has Ma Su, Ko Phyo and the anonymous walk-in; the phones normalise as the document says', () => {
    expect(CUSTOMERS.maSu).toEqual({
      name: 'Ma Su',
      phoneTyped: '09 7712 3456',
      phone: '+95977123456',
    });
    expect(CUSTOMERS.koPhyo).toEqual({
      name: 'Ko Phyo',
      phoneTyped: '09 4500 1122',
      phone: '+95945001122',
    });
    expect(CUSTOMERS.anonymous).toEqual({ name: null, phoneTyped: null, phone: null });
    for (const c of [CUSTOMERS.maSu, CUSTOMERS.koPhyo]) {
      expect(normalizePhone(c.phoneTyped)).toBe(c.phone);
    }
  });
});

describe('§3 services and prices', () => {
  it('has the four services with their durations and shop prices per branch', () => {
    const rows = Object.values(SERVICES).map((s) => [
      s.name_en,
      s.name_mm,
      s.minutes,
      Object.fromEntries(Object.entries(s.prices).map(([b, p]) => [b, wire(p)])),
    ]);
    expect(rows).toEqual([
      ['Haircut', 'ဆံပင်ညှပ်', 30, { B1: 6_000, B2: 7_000, B3: 8_000 }],
      ['Shave', 'မုတ်ဆိတ်ရိတ်', 15, { B1: 3_000, B2: 3_000, B3: 3_000 }],
      ['Hair wash', 'ခေါင်းလျှော်', 10, { B1: 2_000, B2: 2_000, B3: 2_000 }],
      ['Hair colour', 'ဆံပင်ဆေးဆိုး', null, {}],
    ]);
  });

  it('Ko Aung has his own Haircut price at B3', () => {
    expect({ ...BARBER_PRICE, price: wire(BARBER_PRICE.price) }).toEqual({
      person: PEOPLE.aung.code,
      service: 'haircut',
      branch: 'B3',
      price: 10_000,
    });
  });

  it('gives the worked totals of the document', () => {
    const { haircut, shave, hairWash } = SERVICES;
    expect(wire(haircut.prices.B3)).toBe(8_000); // Ko Min, Haircut
    expect(wire(sumMoney([haircut.prices.B3, shave.prices.B3]))).toBe(11_000); // Ko Min
    expect(wire(sumMoney([BARBER_PRICE.price, shave.prices.B3, hairWash.prices.B3]))).toBe(15_000); // Ko Aung
  });
});

describe('§4 payments', () => {
  it('cash with change, KBZPay references, over-transfer and split', () => {
    expect(
      [PAYMENTS.cashChange.total, PAYMENTS.cashChange.tendered, PAYMENTS.cashChange.change].map(
        wire,
      ),
    ).toEqual([8_000, 10_000, 2_000]);
    expect(PAYMENTS.kbzPayReferences).toEqual(['KBZ0001234567', 'KBZ0001234568', 'KBZ0001234569']);
    for (const ref of PAYMENTS.kbzPayReferences)
      expect(ref).toMatch(PAYMENTS.kbzPayReferencePattern);
    expect('KBZ123').not.toMatch(PAYMENTS.kbzPayReferencePattern);
    expect(PAYMENTS.kbzPayReferencePattern.source).toBe('^KBZ[0-9]{10}$');
    const over = PAYMENTS.overTransfer;
    expect([over.total, over.kbzPay, over.cashReturned].map(wire)).toEqual([8_000, 10_000, 2_000]);
    expect(over.returnReceipt).toBe('B3-RF-2026-OCT-00001');
    const { total, cash, kbzPay } = PAYMENTS.split;
    expect([total, cash, kbzPay].map(wire)).toEqual([11_000, 5_000, 6_000]);
    expect(sumMoney([cash, kbzPay])).toBe(total);
  });
});

describe('§5 dates, times, numbers', () => {
  it('today is Monday 05/Oct/2026 and yesterday Sunday; FINISH is 10:42 AM on today', () => {
    expect(DATES).toEqual({
      today: '2026-10-05',
      yesterday: '2026-10-04',
      shopOpens: '09:00',
      shopCloses: '21:00',
      start: '10:05',
      complete: '10:40',
      finish: '2026-10-05T10:42:00+06:30',
      firstReceipt: 'B3-2026-OCT-00001',
      firstRefundReceipt: 'B3-RF-2026-OCT-00001',
      lastMinuteOfOctober: '2026-10-31T23:59:00+06:30',
      firstMinuteOfNovember: '2026-11-01T00:00:00+06:30',
      firstNovemberReceipt: 'B3-2026-NOV-00001',
    });
    expect(formatDate(DATES.today, { locale: 'en', weekday: true })).toBe('Mon, 05/Oct/2026');
    expect(formatDate(DATES.yesterday, { locale: 'en', weekday: true })).toBe('Sun, 04/Oct/2026');
    expect(businessDateOf(DATES.finish)).toBe(DATES.today);
    expect(businessDateOf(DATES.lastMinuteOfOctober)).toBe('2026-10-31');
    expect(businessDateOf(DATES.firstMinuteOfNovember)).toBe('2026-11-01');
  });
});

describe('§8 catalogue-only demo rows', () => {
  it('has the four B3 sales of 05/Oct/2026, totalling 44,000', () => {
    expect(
      DEMO_SALES.map((s) => [
        s.receiptNo,
        s.barber.name_en,
        s.services.map((x) => x.name_en),
        wire(s.amount),
      ]),
    ).toEqual([
      ['B3-2026-OCT-00001', 'Ko Min', ['Haircut'], 8_000],
      ['B3-2026-OCT-00002', 'Ko Aung', ['Haircut'], 10_000],
      ['B3-2026-OCT-00003', 'Ko Min', ['Haircut', 'Shave'], 11_000],
      ['B3-2026-OCT-00004', 'Ko Aung', ['Haircut', 'Shave', 'Hair wash'], 15_000],
    ]);
    expect(sumMoney(DEMO_SALES.map((s) => s.amount))).toBe(DEMO_SALES_TOTAL);
    expect(formatMoney(DEMO_SALES_TOTAL, { locale: 'en', profile: 'app' })).toBe('44,000 Ks');
  });

  it('has 56 rows for the paging list', () => {
    expect(PAGING_ROWS).toHaveLength(56);
    expect(PAGING_ROWS.map((r) => r.position)).toEqual(Array.from({ length: 56 }, (_, i) => i + 1));
  });

  it('has the booking cancel reasons of the DB Part 3 seed', () => {
    expect(BOOKING_CANCEL_REASONS).toEqual([
      {
        name_mm: 'Customer ပြောင်းချင်',
        name_en: 'Customer wants to change',
        requiresNote: false,
        systemCode: null,
      },
      { name_mm: 'Barber မအား', name_en: null, requiresNote: false, systemCode: null },
      { name_mm: 'Customer မလာ', name_en: null, requiresNote: false, systemCode: 1 },
      { name_mm: 'Other', name_en: null, requiresNote: true, systemCode: null },
    ]);
  });

  it('has the Hair colour grid at B3: Brown Long not sold, 90 min for every sold cell', () => {
    expect(
      HAIR_COLOUR_GRID.cells.map((c) => [
        c.colour,
        c.length,
        c.price === null ? null : wire(c.price),
        c.minutes,
      ]),
    ).toEqual([
      ['Black', 'Short', 25_000, 90],
      ['Black', 'Medium', 30_000, 90],
      ['Black', 'Long', 35_000, 90],
      ['Brown', 'Short', 28_000, 90],
      ['Brown', 'Medium', 33_000, 90],
      ['Brown', 'Long', null, null],
    ]);
    expect(HAIR_COLOUR_GRID.branch).toBe('B3');
  });

  it('has revenue by branch: 60,000 · 70,000 · 44,000', () => {
    expect(REVENUE_BY_BRANCH.map((r) => [r.branch, wire(r.amount)])).toEqual([
      ['B1', 60_000],
      ['B2', 70_000],
      ['B3', 44_000],
    ]);
  });

  it('has three notifications: MONEY 10:37 AM, BOOKING 8:42 AM on 05/Oct, SECURITY 9:01 AM on 04/Oct', () => {
    expect(NOTIFICATIONS).toEqual([
      { category: NotificationCategory.MONEY, at: '2026-10-05T10:37:00+06:30' },
      { category: NotificationCategory.BOOKING, at: '2026-10-05T08:42:00+06:30' },
      { category: NotificationCategory.SECURITY, at: '2026-10-04T09:01:00+06:30' },
    ]);
  });

  it('has the discount approval of Ko Min at Point 3.0: 11,000 − 1,000 = 10,000', () => {
    const d = DISCOUNT_APPROVAL;
    expect([d.barber.code, d.branch, d.services.map((s) => s.name_en)]).toEqual([
      'E005',
      'B3',
      ['Haircut', 'Shave'],
    ]);
    expect([d.subtotal, d.discount, d.total].map(wire)).toEqual([11_000, 1_000, 10_000]);
  });

  it('has the receipt B3-2026-OCT-00003 of Ma Su: Cash 5,000 + KBZPay 6,000', () => {
    expect(RECEIPT.receiptNo).toBe('B3-2026-OCT-00003');
    expect(RECEIPT.customer).toBe(CUSTOMERS.maSu);
    expect(RECEIPT.maskedPhone).toBe('09•••••456');
    expect(RECEIPT.payments.map((p) => [p.method, wire(p.amount), p.reference])).toEqual([
      ['CASH', 5_000, null],
      ['KBZPAY', 6_000, 'KBZ0001234567'],
    ]);
    const sale = DEMO_SALES.find((s) => s.receiptNo === RECEIPT.receiptNo);
    expect(sumMoney(RECEIPT.payments.map((p) => p.amount))).toBe(sale?.amount);
  });
});
