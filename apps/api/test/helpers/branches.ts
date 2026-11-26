import { randomUUID } from 'node:crypto';

import { SaleStatus, type StatusCode, businessDateOf } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import type { PrismaService } from '../../src/common/database/prisma.service.js';

// add-branch-management — the test builders of design D11: a seed role given one more code (as the
// admin may tick it in the role matrix), branch assignments, and sales at a branch written directly,
// because the walk-in endpoints never leave an OPEN sale at a new branch; bookings come from
// builders/bookings.ts. Test data only (spec-fixtures §1: B4 is created by each test that needs it).

const { users } = FIXTURE_IDS;

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
