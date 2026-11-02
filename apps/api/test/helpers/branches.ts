import { randomUUID } from 'node:crypto';

import { BookingStatus, SaleStatus, type StatusCode, businessDateOf } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import type { PrismaService } from '../../src/common/database/prisma.service.js';

// add-branch-management — the test builders of design D11: a seed role given one more code (as the
// admin may tick it in the role matrix), branch assignments, and bookings and sales at a branch written
// directly, because no booking endpoint exists yet and the walk-in endpoints never leave an OPEN sale
// at a new branch. Test data only (spec-fixtures §1: B4 is created by each test that needs it).

const { users, employees, customers } = FIXTURE_IDS;

/** An id that is no branch (spec: "the id 0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70, which does not exist"). */
export const UNKNOWN_ID = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70';

/** B4 · Point 4.0 · ပွိုင့် ၄.၀ (spec-fixtures §1 — never seeded). */
export const B4 = { code: 'B4', name_mm: 'ပွိုင့် ၄.၀', name_en: 'Point 4.0' } as const;

/** Adds a permission code to a seed role of the company (`Manager`, `Barber`). */
export async function addCodeToRole(
  prisma: PrismaService,
  roleNameEn: string,
  code: string,
): Promise<void> {
  const role = await prisma.roles.findFirstOrThrow({
    where: { name_en: roleNameEn, archived_at: null },
    select: { id: true },
  });
  const permission = await prisma.permissions.findUniqueOrThrow({
    where: { code },
    select: { id: true },
  });
  await prisma.role_permissions.create({
    data: { id: randomUUID(), role_id: role.id, permission_id: permission.id },
  });
}

/** One employee_branches row; dates are Myanmar calendar dates. */
export async function assignAt(
  prisma: PrismaService,
  options: {
    readonly employeeId: string;
    readonly branchId: string;
    readonly from: string;
    readonly to?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.employee_branches.create({
    data: {
      id,
      employee_id: options.employeeId,
      branch_id: options.branchId,
      effective_from: new Date(`${options.from}T00:00:00Z`),
      effective_to: options.to === undefined ? null : new Date(`${options.to}T00:00:00Z`),
    },
  });
  return id;
}

/** Ends an assignment on `to` (inclusive). */
export async function endAssignment(prisma: PrismaService, id: string, to: string): Promise<void> {
  await prisma.employee_branches.update({
    where: { id },
    data: { effective_to: new Date(`${to}T00:00:00Z`) },
  });
}

/**
 * The test cancel reason of the company — a CANCELLED booking must name one
 * (bookings_cancel_fields_chk); its name is unique among active reasons, so it is made once.
 */
async function cancelReason(prisma: PrismaService, branchId: string): Promise<string> {
  const branch = await prisma.branches.findUniqueOrThrow({
    where: { id: branchId },
    select: { company_id: true },
  });
  const name = { name_mm: 'စမ်းသပ်', name_en: 'Test reason' };
  const existing = await prisma.booking_cancel_reasons.findFirst({
    where: { company_id: branch.company_id, name_mm: name.name_mm, archived_at: null },
    select: { id: true },
  });
  if (existing !== null) return existing.id;
  const id = randomUUID();
  await prisma.booking_cancel_reasons.create({
    data: { id, company_id: branch.company_id, ...name },
  });
  return id;
}

/** Booking channel 2 STAFF and cancel actor 2 STAFF (DB Part 3 bookings_channel_chk). */
const STAFF = 2;

/**
 * `bookingAt(branchId, status, startsAt)` (design D11): a 30-minute booking of Ma Su with Ko Aung,
 * entered by U Kyaw Zin; a CANCELLED one carries its cancel fields.
 */
export async function bookingAt(
  prisma: PrismaService,
  branchId: string,
  status: StatusCode<'bookings'>,
  startsAt: Date,
): Promise<string> {
  const id = randomUUID();
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  const cancelled =
    status === BookingStatus.CANCELLED
      ? {
          cancelled_at: startsAt,
          cancel_reason_id: await cancelReason(prisma, branchId),
          cancelled_by_actor: STAFF,
          cancelled_by_user_id: users.E001,
        }
      : {};
  await prisma.bookings.create({
    data: {
      id,
      branch_id: branchId,
      customer_id: customers.MA_SU,
      customer_name: 'Ma Su',
      booked_employee_id: employees.E004,
      channel: STAFF,
      created_by_user_id: users.E001,
      starts_at: startsAt,
      ends_at: endsAt,
      block_starts_at: startsAt,
      block_ends_at: endsAt,
      business_date: new Date(`${businessDateOf(startsAt)}T00:00:00Z`),
      status,
      manage_token_hash: `test-${id}`,
      ...cancelled,
    },
  });
  return id;
}

/** Cancels a booking written by bookingAt (status 0 with its cancel fields). */
export async function cancelBooking(prisma: PrismaService, id: string, at: Date): Promise<void> {
  const booking = await prisma.bookings.findUniqueOrThrow({
    where: { id },
    select: { branch_id: true },
  });
  await prisma.bookings.update({
    where: { id },
    data: {
      status: BookingStatus.CANCELLED,
      cancelled_at: at,
      cancel_reason_id: await cancelReason(prisma, booking.branch_id),
      cancelled_by_actor: STAFF,
      cancelled_by_user_id: users.E001,
    },
  });
}

let receiptSeq = 0;

/**
 * `saleAt(branchId, status)` (design D11): a sale with no lines — OPEN, CANCELLED, or FINISHED with a
 * receipt number of its own (sales_status_fields_chk).
 */
export async function saleAt(
  prisma: PrismaService,
  branchId: string,
  status: StatusCode<'sales'>,
  at: Date,
): Promise<string> {
  const id = randomUUID();
  receiptSeq += 1;
  const fields =
    status === SaleStatus.FINISHED
      ? {
          receipt_number: `T4-2026-OCT-${String(receiptSeq).padStart(5, '0')}`,
          receipt_year: 2026,
          receipt_month: 10,
          receipt_seq: receiptSeq,
          finished_at: at,
          finished_by_user_id: users.E001,
          business_date: new Date(`${businessDateOf(at)}T00:00:00Z`),
        }
      : status === SaleStatus.CANCELLED
        ? { cancelled_at: at }
        : {};
  await prisma.sales.create({
    data: { id, client_request_id: randomUUID(), branch_id: branchId, status, ...fields },
  });
  return id;
}

/** The data of every `site.revalidate` job in the queue, oldest first (no worker runs in test:int). */
export async function revalidateJobs(prisma: PrismaService): Promise<{ tags: string[] }[]> {
  const rows = await prisma.$queryRaw<{ data: { tags: string[] } }[]>`
    SELECT data FROM pgboss.job WHERE name = 'site.revalidate' ORDER BY created_on, id`;
  return rows.map((row) => row.data);
}
