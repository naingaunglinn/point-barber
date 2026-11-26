import { randomUUID } from 'node:crypto';

import { LeaveTypeStatus, type StatusCode } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import type { PrismaService } from '../../src/common/database/prisma.service.js';

// add-leave-types — the test builders of design D11; leave rows are written directly, as the leave
// endpoints come with add-leave-requests (#32). Training is made by the tests (spec-fixtures §10.3).

export const LT = FIXTURE_IDS.leaveTypes;
export const TRAINING = { name_mm: 'သင်တန်းခွင့်', name_en: 'Training', is_paid: true } as const;

/** One leave of a fixture employee (spec-fixtures §2 code) of `typeId`, on Myanmar calendar dates. */
export async function leaveRow(
  prisma: PrismaService,
  leave: {
    readonly employee: 'E004' | 'E005';
    readonly typeId: string;
    readonly status: StatusCode<'leaves'>;
    readonly start: string;
    readonly end?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.leaves.create({
    data: {
      id,
      employee_id: FIXTURE_IDS.employees[leave.employee],
      leave_type_id: leave.typeId,
      start_date: new Date(`${leave.start}T00:00:00Z`),
      end_date: new Date(`${leave.end ?? leave.start}T00:00:00Z`),
      status: leave.status,
      requested_by_user_id: FIXTURE_IDS.users[leave.employee],
    },
  });
  return id;
}

/** Back to the three fixture types, ACTIVE and in place; every other type archived. */
export async function resetLeaveTypes(prisma: PrismaService): Promise<void> {
  const fixture = Object.values(LT);
  await prisma.leave_types.updateMany({
    where: { id: { notIn: fixture }, archived_at: null },
    data: { archived_at: new Date('2026-10-01T00:00:00Z') },
  });
  await prisma.leave_types.updateMany({
    where: { id: { in: fixture } },
    data: { archived_at: null, status: LeaveTypeStatus.ACTIVE },
  });
}
