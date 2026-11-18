import { randomUUID } from 'node:crypto';

import { BookingStatus, CustomerStatus, type Mmk, RefundKind } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import type { PrismaService } from '../../src/common/database/prisma.service.js';
import type { FixturePerson } from '../helpers/seeded.js';
import { CancelActor, type CancelReasons, bookingAt, seedCancelReasons } from './bookings.js';
import { type FinishedSaleSpec, finishedSale } from './sales.js';

// add-customer-management task 2.1 (design D13 · spec-fixtures §2 "Customer scenario values") — the
// scenario customers and Ma Su's history, made by each test that needs them, never seeded.

const { branches, services } = FIXTURE_IDS;

/** The scenario customers of spec-fixtures §2 (Ko Phyo is added by the tests that add him). */
export const SCENARIO_CUSTOMERS = {
  DAW_MYA: { name: 'Daw Mya', phone: '09 2500 3344', phone_normalized: '+95925003344' },
  U_BA: { name: 'U Ba', phone: '09 2600 5566', phone_normalized: '+95926005566' },
  MA_THIRI: { name: 'မသီရိ', phone: '09 2700 7788', phone_normalized: '+95927007788' },
  KO_PHYO: { name: 'Ko Phyo', phone: '09 4500 1122', phone_normalized: '+95945001122' },
} as const;
export type ScenarioCustomer = keyof typeof SCENARIO_CUSTOMERS;

/** U Ba's archive (spec-fixtures §2). */
export const U_BA_ARCHIVED_AT = new Date('2026-10-01T09:00:00+06:30');

/** One customer row of the company; ACTIVE and not archived unless given. */
export async function addCustomer(
  prisma: PrismaService,
  key: ScenarioCustomer,
  over: { readonly status?: CustomerStatus; readonly archivedAt?: Date; readonly at?: Date } = {},
): Promise<string> {
  const company = await prisma.companies.findFirstOrThrow({ select: { id: true } });
  const id = randomUUID();
  await prisma.customers.create({
    data: {
      id,
      company_id: company.id,
      ...SCENARIO_CUSTOMERS[key],
      status: over.status ?? CustomerStatus.ACTIVE,
      archived_at: over.archivedAt ?? null,
      ...(over.at === undefined ? {} : { created_at: over.at, updated_at: over.at }),
    },
  });
  return id;
}

/** An instant in Myanmar time: `mmt('2026-09-28', '10:42')`. */
export const mmt = (day: string, time: string): Date => new Date(`${day}T${time}:00+06:30`);

/** Ma Su's visits (START 10:05 AM, FINISH 10:42 AM): branch, day, barber, total, receipt. */
const VISITS: readonly (readonly [string, string, FixturePerson, Mmk, string])[] = [
  [branches.B3, '2026-09-01', 'E005', 8_000n as Mmk, 'B3-2026-SEP-00001'],
  [branches.B3, '2026-09-07', 'E004', 10_000n as Mmk, 'B3-2026-SEP-00002'],
  [branches.B3, '2026-09-14', 'E005', 11_000n as Mmk, 'B3-2026-SEP-00003'],
  [branches.B3, '2026-09-21', 'E004', 10_000n as Mmk, 'B3-2026-SEP-00004'],
  [branches.B3, '2026-09-25', 'E005', 8_000n as Mmk, 'B3-2026-SEP-00005'],
  [branches.B3, '2026-09-28', 'E004', 15_000n as Mmk, 'B3-2026-SEP-00006'],
  [branches.B1, '2026-10-03', 'E006', 6_000n as Mmk, 'B1-2026-OCT-00001'],
];

/** The refunds of those visits: the 25/Sep KBZPay change and the 28/Sep Shave refunded on 29/Sep. */
const REFUNDS: Readonly<Record<string, FinishedSaleSpec['refunds']>> = {
  'B3-2026-SEP-00005': [
    {
      kind: RefundKind.OVERPAYMENT_RETURN,
      amount: 2_000n as Mmk,
      receipt: 'B3-RF-2026-SEP-00001',
      at: mmt('2026-09-25', '10:42'),
    },
  ],
  'B3-2026-SEP-00006': [
    {
      kind: RefundKind.SALE_REFUND,
      amount: 3_000n as Mmk,
      receipt: 'B3-RF-2026-SEP-00002',
      at: mmt('2026-09-29', '10:00'),
    },
  ],
};

const haircut = (price: bigint) => ({ service: services.HAIRCUT, price: price as Mmk, minutes: 30 });
const SHAVE = { service: services.SHAVE, price: 3_000n as Mmk, minutes: 15 };

export interface CustomerHistory {
  readonly customers: Readonly<Partial<Record<ScenarioCustomer, string>>>;
  readonly reasons: CancelReasons;
  /** The two BOOKED bookings: B3 12/Oct 2:00 PM (Ko Aung) and B1 08/Oct 11:00 AM (Ko Htet). */
  readonly upcoming: { readonly B3: string; readonly B1: string };
}

/**
 * Daw Mya (INACTIVE), U Ba (archived 01/Oct/2026 9:00 AM) and မသီရိ — or only the ones named — and Ma
 * Su's history: six FINISHED visits at B3 and one at B1 with their refunds, the three cancelled B3
 * bookings (one by the link, two no-shows) and the two BOOKED ones.
 */
export async function customerHistory(
  prisma: PrismaService,
  only: readonly ScenarioCustomer[] = ['DAW_MYA', 'U_BA', 'MA_THIRI'],
): Promise<CustomerHistory> {
  const customers: Partial<Record<ScenarioCustomer, string>> = {};
  for (const key of only) {
    customers[key] = await addCustomer(prisma, key, {
      ...(key === 'DAW_MYA' ? { status: CustomerStatus.INACTIVE } : {}),
      ...(key === 'U_BA' ? { archivedAt: U_BA_ARCHIVED_AT } : {}),
    });
  }
  for (const [branch, day, performer, total, receipt] of VISITS) {
    await finishedSale(prisma, {
      branch,
      receipt,
      total,
      finishedAt: mmt(day, '10:42'),
      visit: { performer, startedAt: mmt(day, '10:05') },
      refunds: REFUNDS[receipt] ?? [],
    });
  }
  const reasons = await seedCancelReasons(prisma);
  const b3 = { branch: branches.B3, status: BookingStatus.CANCELLED } as const;
  await bookingAt(prisma, {
    ...b3,
    startsAt: mmt('2026-09-10', '14:00'),
    items: [haircut(10_000n)],
    cancel: { reason: reasons.CHANGE, actor: CancelActor.CUSTOMER },
  });
  await bookingAt(prisma, {
    ...b3,
    startsAt: mmt('2026-09-17', '14:00'),
    employee: 'E005',
    items: [haircut(8_000n)],
    cancel: { reason: reasons.NO_SHOW, actor: CancelActor.SYSTEM },
  });
  await bookingAt(prisma, {
    ...b3,
    startsAt: mmt('2026-09-24', '14:00'),
    items: [haircut(10_000n)],
    cancel: { reason: reasons.NO_SHOW, actor: CancelActor.STAFF, by: 'E002' },
  });
  const upcomingB3 = await bookingAt(prisma, {
    branch: branches.B3,
    status: BookingStatus.BOOKED,
    startsAt: mmt('2026-10-12', '14:00'),
    items: [haircut(10_000n), SHAVE],
  });
  const upcomingB1 = await bookingAt(prisma, {
    branch: branches.B1,
    status: BookingStatus.BOOKED,
    startsAt: mmt('2026-10-08', '11:00'),
    employee: 'E006',
    items: [haircut(6_000n)],
  });
  return { customers, reasons, upcoming: { B3: upcomingB3, B1: upcomingB1 } };
}
