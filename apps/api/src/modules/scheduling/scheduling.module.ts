import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { PlatformModule } from '../platform/index.js';
import { PatternSets } from './patterns/pattern-sets.js';
import { PatternValidator } from './patterns/pattern-validator.js';
import { PatternWriter } from './patterns/pattern-writer.js';
import { PatternsController } from './patterns/patterns.controller.js';
import { ScheduleLock } from './patterns/schedule-lock.js';
import { PatternsRepository } from './repositories/patterns.repository.js';

// Bounded context `scheduling` (ADR-001 · docs/engineering/module-map.md): Part 2 patterns, shifts,
// availability, leave · Part 5 attendance. add-schedule-patterns creates it (design D1, "Shared pieces")
// and is the first writer of `schedule_patterns` and `schedule_shifts`; its services, the lock
// `ScheduleLock` and the job `shifts.generate` join it part by part (design D11). It reads `people` and
// `platform` through their index only and never imports `booking` (design D1).
@Module({
  imports: [PlatformModule, PeopleModule],
  controllers: [PatternsController],
  providers: [PatternsRepository, PatternValidator, PatternSets, ScheduleLock, PatternWriter],
})
export class SchedulingModule {}
