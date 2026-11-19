import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { DayLock } from './day-lock/day-lock.js';
import { DailyClosingsRepository } from './repositories/daily-closings.repository.js';

// Bounded context `cash-closing` (ADR-001 · docs/engineering/module-map.md): Part 7 daily closing,
// cash outs and returns. add-walkin-visit-checkout adds only DayLock, the gate other modules call.
@Module({
  imports: [PeopleModule],
  providers: [DailyClosingsRepository, DayLock],
  exports: [DayLock],
})
export class CashClosingModule {}
