import { Module } from '@nestjs/common';

import { PeopleModule } from '../people/index.js';
import { PayrollLock } from './payroll-lock/payroll-lock.js';
import { PayrollRunsRepository } from './repositories/payroll-runs.repository.js';

// Bounded context `payroll` (ADR-001 · docs/engineering/module-map.md): Part 5 salaries, payroll runs,
// payslips, receivables. add-walkin-visit-checkout adds only PayrollLock, the gate other modules call.
@Module({
  imports: [PeopleModule],
  providers: [PayrollRunsRepository, PayrollLock],
  exports: [PayrollLock],
})
export class PayrollModule {}
