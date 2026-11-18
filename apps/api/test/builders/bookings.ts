import { randomUUID } from 'node:crypto';

import { BookingStatus, type Mmk, type StatusCode, businessDateOf } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import type { PrismaService } from '../../src/common/database/prisma.service.js';
import type { FixturePerson } from '../helpers/seeded.js';

// Bookings written directly, because no booking endpoint exists yet (add-branch-management design D11;
// add-customer-management task 2.1 · design D13). Test data only.

const { users, employees, customers } = FIXTURE_IDS;

/** Booking channel 2 STAFF (DB Part 3 bookings_channel_chk). */
const STAFF_CHANNEL = 2;

/** `cancelled_by_actor` (DB Part 3 bookings_cancel_actor_chk): the link, staff, the no-show timer. */
export const CancelActor = { CUSTOMER: 1, STAFF: 2, SYSTEM: 3 } as const;
export type CancelActor = (typeof CancelActor)[keyof typeof CancelActor];

/** The four reasons of the base seed (DB Part 3 F-BK-17), keyed by their part in the scenarios. */
export interface CancelReasons {
  readonly CHANGE: string;
  readonly BARBER: string;
  readonly NO_SHOW: string;
  readonly OTHER: string;
}

const PRESETS = [
  ['CHANGE', 'Customer ပြောင်းချင်', 'Customer wants to change', 1, null, false],
  ['BARBER', 'Barber မအား', 'Barber not available', 2, null, false],
  ['NO_SHOW', 'Customer မလာ', 'Customer no-show', 3, 1, false],
  ['OTHER', 'Other', 'Other', 4, null, true],
] as const;

/**
 * The company's seed cancel reasons: the rows of DB Part 3 §8 inserted when missing — until
 * add-booking-cancel-reasons (#35) seeds them, after which this only finds them.
 */
export async function seedCancelReasons(prisma: PrismaService): Promise<CancelReasons> {
  const company = await prisma.companies.findFirstOrThrow({ select: { id: true } });
  const ids = new Map<string, string>();
  for (const [key, name_mm, name_en, sort_order, system_code, requires_note] of PRESETS) {
    const found = await prisma.booking_cancel_reasons.findFirst({
      where: { company_id: company.id, name_mm, archived_at: null },
      select: { id: true },
    });
    const id = found?.id ?? randomUUID();
    if (found === null) {
      await prisma.booking_cancel_reasons.create({
        data: { id, company_id: company.id, name_mm, name_en, sort_order, system_code, requires_note },
      });
    }
    ids.set(key, id);
  }
  const of = (key: keyof CancelReasons): string => ids.get(key) ?? '';
  return { CHANGE: of('CHANGE'), BARBER: of('BARBER'), NO_SHOW: of('NO_SHOW'), OTHER: of('OTHER') };
}

export interface BookingSpec {
  readonly branch: string;
  readonly status: StatusCode<'bookings'>;
  readonly startsAt: Date;
  /** Ko Aung unless given. */
  readonly employee?: FixturePerson;
  /** Ma Su unless given. */
  readonly customer?: { readonly id: string; readonly name: string };
  /** The booked services in `sort_order`; none = a 30-minute booking without items. */
  readonly items?: readonly { readonly service: string; readonly price: Mmk; readonly minutes: number }[];
  /** A CANCELLED booking's reason and actor; the CHANGE reason by U Kyaw Zin unless given. */
  readonly cancel?: { readonly reason: string; readonly actor: CancelActor; readonly by?: FixturePerson };
}

/** One booking (with its items), entered by U Kyaw Zin; a CANCELLED one carries its cancel fields. */
export async function bookingAt(prisma: PrismaService, spec: BookingSpec): Promise<string> {
  const id = randomUUID();
  const minutes = (spec.items ?? []).reduce((sum, item) => sum + item.minutes, 0);
  const endsAt = new Date(spec.startsAt.getTime() + (minutes === 0 ? 30 : minutes) * 60_000);
  const customer = spec.customer ?? { id: customers.MA_SU, name: 'Ma Su' };
  const cancel =
    spec.status === BookingStatus.CANCELLED
      ? (spec.cancel ?? {
          reason: (await seedCancelReasons(prisma)).CHANGE,
          actor: CancelActor.STAFF,
          by: 'E001',
        })
      : undefined;
  await prisma.bookings.create({
    data: {
      id,
      branch_id: spec.branch,
      customer_id: customer.id,
      customer_name: customer.name,
      booked_employee_id: employees[spec.employee ?? 'E004'],
      channel: STAFF_CHANNEL,
      created_by_user_id: users.E001,
      starts_at: spec.startsAt,
      ends_at: endsAt,
      block_starts_at: spec.startsAt,
      block_ends_at: endsAt,
      business_date: new Date(`${businessDateOf(spec.startsAt)}T00:00:00Z`),
      status: spec.status,
      manage_token_hash: `test-${id}`,
      ...(cancel === undefined
        ? {}
        : {
            cancelled_at: spec.startsAt,
            cancel_reason_id: cancel.reason,
            cancelled_by_actor: cancel.actor,
            cancelled_by_user_id: cancel.by === undefined ? null : users[cancel.by],
          }),
      booking_items: {
        create: (spec.items ?? []).map((item, index) => ({
          id: randomUUID(),
          sort_order: index + 1,
          service_id: item.service,
          unit_price_amount: item.price,
          duration_minutes: item.minutes,
        })),
      },
    },
  });
  return id;
}

/** Cancels a booking (status 0 with its cancel fields — the CHANGE reason, by U Kyaw Zin). */
export async function cancelBooking(prisma: PrismaService, id: string, at: Date): Promise<void> {
  await prisma.bookings.update({
    where: { id },
    data: {
      status: BookingStatus.CANCELLED,
      cancelled_at: at,
      cancel_reason_id: (await seedCancelReasons(prisma)).CHANGE,
      cancelled_by_actor: CancelActor.STAFF,
      cancelled_by_user_id: users.E001,
    },
  });
}
