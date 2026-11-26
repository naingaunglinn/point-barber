import { Module, type OnModuleInit } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { PlatformModule, WebsiteShifts } from '../platform/index.js';
import { LeaveTypesController } from './leave-types/leave-types.controller.js';
import { LeaveTypes } from './leave-types/leave-types.js';
import { PatternValidator } from './patterns/pattern-validator.js';
import { LeaveTypesRepository } from './repositories/leave-types.repository.js';
import { ShiftsRepository } from './repositories/shifts.repository.js';
import { TodayShifts } from './shifts/today-shifts.js';

// Bounded context `scheduling` (ADR-001 · docs/engineering/module-map.md): Part 2 patterns, shifts,
// availability, leave · Part 5 attendance. add-schedule-patterns creates it (design D1, "Shared pieces")
// and is the first writer of `schedule_patterns` and `schedule_shifts`; its services, the lock
// `ScheduleLock` and the job `shifts.generate` join it part by part (design D11).
// add-leave-types (design D1): the leave-type master list — LeaveTypes and its repository.
@Module({
  imports: [PlatformModule, PeopleModule],
  controllers: [LeaveTypesController],
  providers: [PatternValidator, LeaveTypes, LeaveTypesRepository, ShiftsRepository, TodayShifts],
  exports: [LeaveTypes, TodayShifts],
})
export class SchedulingModule implements OnModuleInit {
  constructor(
    private readonly websiteShifts: WebsiteShifts,
    private readonly todayShifts: TodayShifts,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    // add-website-management design D8: where the team works today (P8.WEB.09).
    this.websiteShifts.use({
      branchesOf: (query) => this.todayShifts.branchesOf(this.prisma, query),
    });
  }
}
