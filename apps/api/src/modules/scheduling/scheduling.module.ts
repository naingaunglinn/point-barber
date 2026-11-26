import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { PlatformModule } from '../platform/index.js';
import { LeaveTypesController } from './leave-types/leave-types.controller.js';
import { LeaveTypes } from './leave-types/leave-types.js';
import { Attendance } from './attendance/attendance.js';
import { PatternValidator } from './patterns/pattern-validator.js';
import { AttendanceRepository } from './repositories/attendance.repository.js';
import { LeaveTypesRepository } from './repositories/leave-types.repository.js';

// Bounded context `scheduling` (ADR-001 · docs/engineering/module-map.md): Part 2 patterns, shifts,
// availability, leave · Part 5 attendance. add-schedule-patterns creates it (design D1, "Shared pieces")
// and is the first writer of `schedule_patterns` and `schedule_shifts`; its services, the lock
// `ScheduleLock` and the job `shifts.generate` join it part by part (design D11).
// add-leave-types (design D1): the leave-type master list — LeaveTypes and its repository.
// add-payment-collector-picker (D4): `Attendance.openRecordsAt` — the open records of a branch (CL1).
@Module({
  imports: [PlatformModule, PeopleModule],
  controllers: [LeaveTypesController],
  providers: [PatternValidator, LeaveTypes, LeaveTypesRepository, AttendanceRepository, Attendance],
  exports: [LeaveTypes, Attendance],
})
export class SchedulingModule {}
