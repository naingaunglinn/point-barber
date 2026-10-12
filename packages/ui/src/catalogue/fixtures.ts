import {
  moneyFromWire,
  NotificationCategory,
  type BusinessDate,
  type E164,
  type Instant,
  type Mmk,
} from '@point/shared';

// The fixture data of the catalogue (AD-IMPL-06 · design D12): point-sdd `docs/plan/spec-fixtures.md`
// §1–§5 (the one story every scenario tells) and §8 (catalogue-only demo rows). Invented names, never
// go-live data. A value here never changes once a change that uses it is proposed — fixtures.test.ts
// holds the values of the document and fails on any drift (CG-TEST-08).

const ks = (amount: number): Mmk => moneyFromWire(amount);

/** Master data in both languages (D-DB-04): the English UI shows `*_en`, else `*_mm`. */
export interface Named {
  readonly name_mm: string;
  readonly name_en: string | null;
}

// §1 — Company and branches. Timezone Asia/Yangon for all three.
export const COMPANY: Named = { name_mm: 'ပွိုင့် ဘာဘာရှော့', name_en: 'Point Barbershop' };

export type BranchCode = 'B1' | 'B2' | 'B3';
export interface Branch extends Named {
  readonly code: BranchCode;
}
export const BRANCHES: readonly Branch[] = [
  { code: 'B1', name_mm: 'ပွိုင့် ၁.၀', name_en: 'Point 1.0' },
  { code: 'B2', name_mm: 'ပွိုင့် ၂.၀', name_en: 'Point 2.0' },
  { code: 'B3', name_mm: 'ပွိုင့် ၃.၀', name_en: 'Point 3.0' },
];

// §2 — People.
export type SeedRole = 'admin' | 'manager' | 'barber';
export interface Person extends Named {
  readonly code: string;
  /** Seed role and scope; `null` for E008, who has no role yet. */
  readonly role: SeedRole | null;
  readonly scope: 'company' | 'branch' | null;
  readonly branches: readonly BranchCode[];
  readonly email: string;
  readonly user: 'ACTIVE' | 'INVITED' | 'DISABLED';
  readonly employee: 'ACTIVE' | 'INACTIVE';
  /** The last day of the branch assignment, when it ended. */
  readonly assignmentEnded?: BusinessDate;
}
const person = (
  code: string,
  name_en: string,
  name_mm: string,
  role: SeedRole | null,
  scope: Person['scope'],
  branches: readonly BranchCode[],
  email: string,
): Person => ({
  code,
  name_en,
  name_mm,
  role,
  scope,
  branches,
  email,
  user: 'ACTIVE',
  employee: 'ACTIVE',
});

export const PEOPLE = {
  kyawZin: person(
    'E001',
    'U Kyaw Zin',
    'ဦးကျော်ဇင်',
    'admin',
    'company',
    ['B1', 'B2', 'B3'],
    'kyawzin@point.test',
  ),
  hnin: person('E002', 'Ma Hnin', 'မနှင်း', 'manager', 'branch', ['B3'], 'hnin@point.test'),
  zaw: person('E003', 'Ko Zaw', 'ကိုဇော်', 'manager', 'branch', ['B1'], 'zaw@point.test'),
  aung: person('E004', 'Ko Aung', 'ကိုအောင်', 'barber', 'branch', ['B3'], 'aung@point.test'),
  min: person('E005', 'Ko Min', 'ကိုမင်း', 'barber', 'branch', ['B3'], 'min@point.test'),
  htet: person('E006', 'Ko Htet', 'ကိုထက်', 'barber', 'branch', ['B1'], 'htet@point.test'),
  thura: person('E007', 'Ko Thura', 'ကိုသူရ', 'barber', 'branch', ['B2'], 'thura@point.test'),
  thida: {
    ...person('E008', 'Ma Thida', 'မသီတာ', null, null, ['B3'], 'thida@point.test'),
    user: 'INVITED',
  },
  naing: {
    ...person('E009', 'Ko Naing', 'ကိုနိုင်', 'barber', 'branch', ['B3'], 'naing@point.test'),
    user: 'DISABLED',
    employee: 'INACTIVE',
    assignmentEnded: '2026-09-30',
  },
} as const satisfies Record<string, Person>;

export interface Customer {
  readonly name: string | null;
  readonly phoneTyped: string | null;
  readonly phone: E164 | null;
}
export const CUSTOMERS = {
  maSu: { name: 'Ma Su', phoneTyped: '09 7712 3456', phone: '+95977123456' },
  koPhyo: { name: 'Ko Phyo', phoneTyped: '09 4500 1122', phone: '+95945001122' },
  anonymous: { name: null, phoneTyped: null, phone: null },
} as const satisfies Record<string, Customer>;

// §3 — Services and prices. Whole MMK; tax and service charge off.
export interface Service extends Named {
  readonly key: 'haircut' | 'shave' | 'hairWash' | 'hairColour';
  /** Minutes; `null` for Hair colour, whose duration is per cell of its option grid. */
  readonly minutes: number | null;
  /** Shop price per branch; a branch that does not sell it is absent. */
  readonly prices: Readonly<Partial<Record<BranchCode, Mmk>>>;
}
export const SERVICES = {
  haircut: {
    key: 'haircut',
    name_en: 'Haircut',
    name_mm: 'ဆံပင်ညှပ်',
    minutes: 30,
    prices: { B1: ks(6_000), B2: ks(7_000), B3: ks(8_000) },
  },
  shave: {
    key: 'shave',
    name_en: 'Shave',
    name_mm: 'မုတ်ဆိတ်ရိတ်',
    minutes: 15,
    prices: { B1: ks(3_000), B2: ks(3_000), B3: ks(3_000) },
  },
  hairWash: {
    key: 'hairWash',
    name_en: 'Hair wash',
    name_mm: 'ခေါင်းလျှော်',
    minutes: 10,
    prices: { B1: ks(2_000), B2: ks(2_000), B3: ks(2_000) },
  },
  hairColour: {
    key: 'hairColour',
    name_en: 'Hair colour',
    name_mm: 'ဆံပင်ဆေးဆိုး',
    minutes: null,
    prices: {},
  },
} as const satisfies Record<string, Service>;

/** Ko Aung's own price for Haircut at B3. */
export const BARBER_PRICE = {
  person: 'E004',
  service: 'haircut',
  branch: 'B3',
  price: ks(10_000),
} as const;

// §4 — Payments.
export const PAYMENTS = {
  cashChange: { total: ks(8_000), tendered: ks(10_000), change: ks(2_000) },
  kbzPayReferences: ['KBZ0001234567', 'KBZ0001234568', 'KBZ0001234569'],
  /** The fixture pattern of the seeded KBZPAY method (`KBZ123` is refused). */
  kbzPayReferencePattern: /^KBZ[0-9]{10}$/,
  overTransfer: {
    total: ks(8_000),
    kbzPay: ks(10_000),
    cashReturned: ks(2_000),
    returnReceipt: 'B3-RF-2026-OCT-00001',
  },
  split: { total: ks(11_000), cash: ks(5_000), kbzPay: ks(6_000) },
} as const;

// §5 — Dates, times, numbers.
export const DATES = {
  /** "Today" in scenarios: Monday 05/Oct/2026. */
  today: '2026-10-05',
  /** Sunday. */
  yesterday: '2026-10-04',
  shopOpens: '09:00',
  shopCloses: '21:00',
  start: '10:05',
  complete: '10:40',
  finish: '2026-10-05T10:42:00+06:30',
  firstReceipt: 'B3-2026-OCT-00001',
  firstRefundReceipt: 'B3-RF-2026-OCT-00001',
  /** Still October. */
  lastMinuteOfOctober: '2026-10-31T23:59:00+06:30',
  /** November — the receipt counter restarts at `B3-2026-NOV-00001`. */
  firstMinuteOfNovember: '2026-11-01T00:00:00+06:30',
  firstNovemberReceipt: 'B3-2026-NOV-00001',
} as const satisfies Record<string, BusinessDate | Instant | string>;

// §8 — Catalogue-only demo rows: never loaded by `pnpm db:seed`, not the sequence of the walk-in
// scenarios.
export interface DemoSale {
  readonly receiptNo: string;
  readonly barber: Person;
  readonly services: readonly Service[];
  readonly amount: Mmk;
}
export const DEMO_SALES: readonly DemoSale[] = [
  {
    receiptNo: 'B3-2026-OCT-00001',
    barber: PEOPLE.min,
    services: [SERVICES.haircut],
    amount: ks(8_000),
  },
  {
    receiptNo: 'B3-2026-OCT-00002',
    barber: PEOPLE.aung,
    services: [SERVICES.haircut],
    amount: ks(10_000),
  },
  {
    receiptNo: 'B3-2026-OCT-00003',
    barber: PEOPLE.min,
    services: [SERVICES.haircut, SERVICES.shave],
    amount: ks(11_000),
  },
  {
    receiptNo: 'B3-2026-OCT-00004',
    barber: PEOPLE.aung,
    services: [SERVICES.haircut, SERVICES.shave, SERVICES.hairWash],
    amount: ks(15_000),
  },
];
/** The B3 sales of 05/Oct/2026 above: 8,000 + 10,000 + 11,000 + 15,000. */
export const DEMO_SALES_TOTAL = ks(44_000);

/** The paging list: 56 generated rows. */
export const PAGING_ROWS: readonly { readonly position: number }[] = Array.from(
  { length: 56 },
  (_, index) => ({ position: index + 1 }),
);

/** The booking cancel reasons of the DB Part 3 seed. */
export interface CancelReason extends Named {
  readonly requiresNote: boolean;
  /** 1 NO_SHOW — the reason the auto-cancel uses; `null` for a reason the admin added. */
  readonly systemCode: 1 | null;
}
export const BOOKING_CANCEL_REASONS: readonly CancelReason[] = [
  {
    name_mm: 'Customer ပြောင်းချင်',
    name_en: 'Customer wants to change',
    requiresNote: false,
    systemCode: null,
  },
  { name_mm: 'Barber မအား', name_en: null, requiresNote: false, systemCode: null },
  { name_mm: 'Customer မလာ', name_en: null, requiresNote: false, systemCode: 1 },
  { name_mm: 'Other', name_en: null, requiresNote: true, systemCode: null },
];

/** Hair colour at B3 (shop): colour × length; `price: null` = not sold; 90 min for every sold cell. */
export const HAIR_COLOUR_GRID = {
  branch: 'B3',
  colours: ['Black', 'Brown'],
  lengths: ['Short', 'Medium', 'Long'],
  cells: [
    { colour: 'Black', length: 'Short', price: ks(25_000), minutes: 90 },
    { colour: 'Black', length: 'Medium', price: ks(30_000), minutes: 90 },
    { colour: 'Black', length: 'Long', price: ks(35_000), minutes: 90 },
    { colour: 'Brown', length: 'Short', price: ks(28_000), minutes: 90 },
    { colour: 'Brown', length: 'Medium', price: ks(33_000), minutes: 90 },
    { colour: 'Brown', length: 'Long', price: null, minutes: null },
  ],
} as const;

export const REVENUE_BY_BRANCH: readonly { readonly branch: BranchCode; readonly amount: Mmk }[] = [
  { branch: 'B1', amount: ks(60_000) },
  { branch: 'B2', amount: ks(70_000) },
  { branch: 'B3', amount: ks(44_000) },
];

export const NOTIFICATIONS: readonly {
  readonly category: NotificationCategory;
  readonly at: Instant;
}[] = [
  { category: NotificationCategory.MONEY, at: '2026-10-05T10:37:00+06:30' },
  { category: NotificationCategory.BOOKING, at: '2026-10-05T08:42:00+06:30' },
  { category: NotificationCategory.SECURITY, at: '2026-10-04T09:01:00+06:30' },
];

export const DISCOUNT_APPROVAL = {
  barber: PEOPLE.min,
  branch: 'B3',
  services: [SERVICES.haircut, SERVICES.shave],
  subtotal: ks(11_000),
  discount: ks(1_000),
  total: ks(10_000),
} as const;

export const RECEIPT = {
  receiptNo: 'B3-2026-OCT-00003',
  customer: CUSTOMERS.maSu,
  /** The phone as the receipt masks it. */
  maskedPhone: '09•••••456',
  payments: [
    { method: 'CASH', amount: ks(5_000), reference: null },
    { method: 'KBZPAY', amount: ks(6_000), reference: 'KBZ0001234567' },
  ],
} as const;
