import { randomUUID } from 'node:crypto';

import { businessDateOf } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import type { PrismaService } from '../../src/common/database/prisma.service.js';
import type { FixturePerson } from '../helpers/seeded.js';

// add-payment-collector-picker task 1.3 — an attendance record written directly (the clock-in endpoints
// arrive with add-attendance-clock, #47): a MANUAL record (reason 1 — forgot to clock in) entered by
// Ma Hnin, which meets attendance_records_method_fields_chk, with its MMT business date. `out` makes it
// a closed record, `voided` a voided one — neither is "clocked in here now".

const { branches, users } = FIXTURE_IDS;

export interface RecordSpec {
  readonly who: FixturePerson;
  readonly branch: string;
  /** An ISO time with the +06:30 offset. */
  readonly in: string;
  readonly out?: string;
  readonly voided?: boolean;
}

export async function attendanceRecord(prisma: PrismaService, spec: RecordSpec): Promise<void> {
  const clockIn = new Date(spec.in);
  await prisma.attendance_records.create({
    data: {
      id: randomUUID(),
      employee_id: FIXTURE_IDS.employees[spec.who],
      branch_id: spec.branch,
      business_date: new Date(`${businessDateOf(clockIn)}T00:00:00Z`),
      clock_in_at: clockIn,
      clock_out_at: spec.out === undefined ? null : new Date(spec.out),
      clock_out_source: spec.out === undefined ? null : 1,
      method: 2,
      manual_reason: 1,
      entered_by_user_id: users.E002,
      voided_at: spec.voided === true ? clockIn : null,
      voided_by_user_id: spec.voided === true ? users.E002 : null,
      void_reason: spec.voided === true ? 'Entered by mistake' : null,
    },
  });
}

/** The 05/Oct/2026 morning of the collector scenarios: Ko Aung 8:55 AM and Ko Min 10:12 AM at B3, U Kyaw Zin at B1. */
export async function morningAtB3(prisma: PrismaService): Promise<void> {
  await attendanceRecord(prisma, { who: 'E004', branch: branches.B3, in: '2026-10-05T08:55:00+06:30' });
  await attendanceRecord(prisma, { who: 'E005', branch: branches.B3, in: '2026-10-05T10:12:00+06:30' });
  await attendanceRecord(prisma, { who: 'E001', branch: branches.B1, in: '2026-10-05T08:30:00+06:30' });
}
