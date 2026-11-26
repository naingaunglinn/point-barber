import { Injectable } from '@nestjs/common';
import { todayMmt } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import {
  AttendanceRepository,
  type OpenAttendanceRecord,
} from '../repositories/attendance.repository.js';

// The operational read of attendance other modules use (P5-RULE-18 · add-payment-collector-picker
// design D4 / owner CL1): `openRecordsAt(db, branch_id)` is named exactly as `add-attendance-clock`
// (#47) names it. Created here because #47 has not merged; #47 imports it. Until #47 writes records
// there are none, so nobody is clocked in.
@Injectable()
export class Attendance {
  constructor(
    private readonly repository: AttendanceRepository,
    private readonly clock: Clock,
  ) {}

  /** The open records of today (Myanmar date) at the branch, earliest clock-in first, at most 100. */
  openRecordsAt(db: Tx, branchId: string): Promise<OpenAttendanceRecord[]> {
    return this.repository.openAt(db, {
      branch_id: branchId,
      date: todayMmt(this.clock.now()),
    });
  }
}
