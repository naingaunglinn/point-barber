import { Module } from '@nestjs/common';

import { PatternValidator } from './patterns/pattern-validator.js';

// Bounded context `scheduling` (ADR-001 · docs/engineering/module-map.md): Part 2 patterns, shifts,
// availability, leave · Part 5 attendance. add-schedule-patterns creates it (design D1, "Shared pieces")
// and is the first writer of `schedule_patterns` and `schedule_shifts`; its services, the lock
// `ScheduleLock` and the job `shifts.generate` join it part by part (design D11).
@Module({
  providers: [PatternValidator],
})
export class SchedulingModule {}
