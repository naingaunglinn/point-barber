import { Module, type OnModuleInit } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { Jobs, PlatformModule } from '../platform/index.js';
import { BookingsOutsideShift } from './bookings/bookings-outside-shift.js';
import { LeaveTypesController } from './leave-types/leave-types.controller.js';
import { LeaveTypes } from './leave-types/leave-types.js';
import { PatternSets } from './patterns/pattern-sets.js';
import { PatternValidator } from './patterns/pattern-validator.js';
import { PatternWriter } from './patterns/pattern-writer.js';
import { PatternsController } from './patterns/patterns.controller.js';
import { ScheduleLock } from './patterns/schedule-lock.js';
import { LeaveTypesRepository } from './repositories/leave-types.repository.js';
import { PatternsRepository } from './repositories/patterns.repository.js';
import { ShiftsRepository } from './repositories/shifts.repository.js';
import { GenerateNow } from './shifts/generate-now.js';
import { ScheduleEvents } from './shifts/schedule-events.js';
import { ShiftGenerator } from './shifts/shift-generator.js';
import { ShiftPlanner } from './shifts/shift-planner.js';
import {
  SHIFTS_GENERATE,
  SHIFTS_GENERATE_CRON,
  ShiftsGenerateJob,
} from './shifts/shifts-generate.job.js';
import { ShiftsController } from './shifts/shifts.controller.js';

// Bounded context `scheduling` (ADR-001 · docs/engineering/module-map.md): Part 2 patterns, shifts,
// availability, leave · Part 5 attendance. add-schedule-patterns creates it (design D1, "Shared pieces")
// and is the first writer of `schedule_patterns` and `schedule_shifts`; its services, the lock
// `ScheduleLock` and the job `shifts.generate` join it part by part (design D11). It reads `people` and
// `platform` through their index only and never imports `booking` (design D1).
// add-leave-types (design D1): the leave-type master list — LeaveTypes and its repository.
@Module({
  imports: [PlatformModule, PeopleModule],
  controllers: [LeaveTypesController, PatternsController, ShiftsController],
  providers: [
    PatternsRepository,
    ShiftsRepository,
    PatternValidator,
    PatternSets,
    ScheduleLock,
    ShiftPlanner,
    ShiftGenerator,
    PatternWriter,
    BookingsOutsideShift,
    ScheduleEvents,
    ShiftsGenerateJob,
    GenerateNow,
    LeaveTypes,
    LeaveTypesRepository,
  ],
  exports: [LeaveTypes, BookingsOutsideShift],
})
export class SchedulingModule implements OnModuleInit {
  constructor(
    private readonly jobs: Jobs,
    private readonly job: ShiftsGenerateJob,
  ) {}

  /** ADR-002 · design D5: the handler of `shifts.generate` and its nightly cron at 00:30 Myanmar time. */
  onModuleInit(): void {
    this.jobs.register<unknown>(SHIFTS_GENERATE, (data) => this.job.run(data));
    this.jobs.schedule(SHIFTS_GENERATE, SHIFTS_GENERATE_CRON);
  }
}
