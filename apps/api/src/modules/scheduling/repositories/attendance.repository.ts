import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The attendance records (Part 5 — the scheduling module owns `attendance_records`). This change only
// reads them; `add-attendance-clock` (#47) adds the writes.

/** An open record: someone clocked in at a branch and not yet clocked out (P5-RULE-18). */
export interface OpenAttendanceRecord {
  readonly employee_id: string;
  readonly clock_in_at: Date;
}

/** "At most 100" open records of a branch (add-attendance-clock design D1 — the same read). */
const OPEN_RECORDS_LIMIT = 100;

@Injectable()
export class AttendanceRepository {
  /** Not voided, not clocked out, of the Myanmar date `date`, earliest clock-in first (ties by id). */
  openAt(db: Tx, key: { branch_id: string; date: string }): Promise<OpenAttendanceRecord[]> {
    return db.attendance_records.findMany({
      where: {
        branch_id: key.branch_id,
        business_date: new Date(`${key.date}T00:00:00Z`),
        clock_out_at: null,
        voided_at: null,
      },
      orderBy: [{ clock_in_at: 'asc' }, { id: 'asc' }],
      select: { employee_id: true, clock_in_at: true },
      take: OPEN_RECORDS_LIMIT,
    });
  }
}
